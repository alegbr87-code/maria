/* =============================================================================
 * Maria — Backend di controllo remoto
 * -----------------------------------------------------------------------------
 * - WebSocket: telemetria in tempo reale + comandi (device on/off, target)
 * - REST:      POST /telemetry per far arrivare dati da sensori reali (ESP32…)
 *              GET  /health   per il monitoraggio
 *
 * Avvio:  npm install && npm start      (default http://localhost:8080)
 * Deploy: qualsiasi host Node (Render, Railway, Fly.io, VPS). Imposta la porta
 *         con la variabile d'ambiente PORT e il token con MARIA_TOKEN.
 * =========================================================================== */
'use strict';

const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const TOKEN = process.env.MARIA_TOKEN || ''; // opzionale: se impostato, i client devono presentarlo
const TICK_MS = 3000;

/* Stato per "stanza" (room). L'app invia il campo room nel messaggio join. */
const rooms = Object.create(null);

function getRoom(name) {
  if (!rooms[name]) {
    rooms[name] = {
      name,
      clients: new Set(),
      telemetry: { temp: 24, rh: 60, ph: 6.1, ec: 1.4, ppfd: 450, co2: 550, waterTemp: 20 },
      targets: { temp: 24, rh: 60 },
      devices: { light: true, fan: true, exhaust: true, intake: false, humidifier: false, dehumidifier: false, heater: false, pump: false },
      lastExternal: 0 // timestamp dell'ultimo dato esterno (sensore reale)
    };
  }
  return rooms[name];
}

function vpd(temp, rh, offset = 2) {
  if (temp == null || rh == null) return null;
  const leaf = temp - offset;
  const svp = 0.61078 * Math.exp((17.27 * leaf) / (leaf + 237.3));
  return Math.round(svp * (1 - rh / 100) * 100) / 100;
}
function round(v, d) { const f = Math.pow(10, d); return Math.round(v * f) / f; }

/* Simulatore interno (demo/test senza hardware). */
setInterval(() => {
  const now = Date.now();
  for (const name in rooms) {
    const room = rooms[name];
    if (now - room.lastExternal < 10000) continue; // dati esterni freschi: lascia i valori reali

    const t = room.telemetry;
    const d = room.devices;
    let temp = t.temp + (room.targets.temp - t.temp) * 0.15;
    let rh = t.rh + (room.targets.rh - t.rh) * 0.15;
    if (d.heater) temp += 0.35;
    if (d.exhaust) { temp -= 0.25; rh -= 0.6; }
    if (d.intake) temp -= 0.12;
    if (d.humidifier) rh += 0.9;
    if (d.dehumidifier) rh -= 0.9;
    if (d.light) temp += 0.15;
    temp += (Math.random() - 0.5) * 0.35;
    rh += (Math.random() - 0.5) * 1.1;
    temp = Math.max(12, Math.min(35, temp));
    rh = Math.max(25, Math.min(92, rh));

    room.telemetry = {
      temp: round(temp, 1),
      rh: Math.round(rh),
      vpd: vpd(temp, rh),
      ph: round(Math.max(5.2, Math.min(7.2, t.ph + (Math.random() - 0.5) * 0.05)), 2),
      ec: round(Math.max(0.2, Math.min(2.8, t.ec + (Math.random() - 0.5) * 0.04)), 2),
      ppfd: d.light ? Math.round(500 + (Math.random() - 0.5) * 60) : 0,
      co2: Math.round(480 + (d.exhaust ? -40 : 40) + (Math.random() - 0.5) * 30),
      waterTemp: Math.round(18 + Math.random() * 3)
    };
    broadcastTelemetry(room);
  }
}, TICK_MS);

const server = http.createServer(handleHttp);
const wss = new WebSocketServer({ server });

function broadcastTelemetry(room) {
  const msg = JSON.stringify({
    type: 'telemetry', room: room.name,
    data: Object.assign({}, room.telemetry, { devices: room.devices, targets: room.targets })
  });
  room.clients.forEach((ws) => { if (ws.readyState === 1) ws.send(msg); });
}
function broadcastDevices(room) {
  const msg = JSON.stringify({ type: 'devices', room: room.name, data: room.devices });
  room.clients.forEach((ws) => { if (ws.readyState === 1) ws.send(msg); });
}

function ingestTelemetry(room, data) {
  const next = Object.assign({}, room.telemetry, data);
  if (data.temp != null && data.rh != null && data.vpd == null) next.vpd = vpd(data.temp, data.rh);
  room.telemetry = next;
  room.lastExternal = Date.now();
  broadcastTelemetry(room);
}

/* --------------------------------------------------------------------------
 * WebSocket: gestione connessioni
 * -------------------------------------------------------------------------- */
wss.on('connection', (ws) => {
  ws.room = null;
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch (e) { return; }

    if (msg.type === 'join') {
      if (TOKEN && msg.token !== TOKEN) { ws.send(JSON.stringify({ type: 'error', error: 'token non valido' })); return; }
      const room = getRoom(msg.room || 'maria');
      if (ws.room && ws.room.clients) ws.room.clients.delete(ws);
      ws.room = room;
      room.clients.add(ws);
      ws.send(JSON.stringify({
        type: 'telemetry', room: room.name,
        data: Object.assign({}, room.telemetry, { devices: room.devices, targets: room.targets })
      }));
      console.log(`[join] room=${room.name} clients=${room.clients.size}`);
      return;
    }

    if (!ws.room) return;
    const room = ws.room;

    if (msg.type === 'control' && msg.device) {
      room.devices[msg.device] = !!msg.on;
      broadcastDevices(room);
      ws.send(JSON.stringify({ type: 'ack', device: msg.device, on: !!msg.on, devices: room.devices }));
      console.log(`[control] room=${room.name} ${msg.device}=${!!msg.on}`);
    } else if (msg.type === 'setTarget' && msg.targets) {
      Object.assign(room.targets, msg.targets);
      ws.send(JSON.stringify({ type: 'ack', targets: room.targets }));
      console.log(`[target] room=${room.name}`, room.targets);
    } else if (msg.type === 'telemetry' && msg.data) {
      ingestTelemetry(room, msg.data); // un gateway può iniettare telemetria reale
    }
  });

  ws.on('close', () => { if (ws.room && ws.room.clients) ws.room.clients.delete(ws); });
});

/* --------------------------------------------------------------------------
 * REST
 * -------------------------------------------------------------------------- */
function sendJSON(res, code, obj) {
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Maria-Token',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  });
  res.end(JSON.stringify(obj));
}

function handleHttp(req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'OPTIONS') return sendJSON(res, 204, {});

  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJSON(res, 200, {
      ok: true,
      rooms: Object.keys(rooms),
      clients: Object.values(rooms).reduce((a, r) => a + r.clients.size, 0),
      uptime: process.uptime()
    });
  }

  if (req.method === 'POST' && url.pathname === '/telemetry') {
    if (TOKEN && req.headers['x-maria-token'] !== TOKEN) return sendJSON(res, 401, { error: 'token non valido' });
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      let data;
      try { data = JSON.parse(body || '{}'); } catch (e) { return sendJSON(res, 400, { error: 'json non valido' }); }
      const room = getRoom(url.searchParams.get('room') || 'maria');
      ingestTelemetry(room, data);
      sendJSON(res, 200, { ok: true, room: room.name });
    });
    return;
  }

  sendJSON(res, 404, { error: 'not found' });
}

server.listen(PORT, () => {
  console.log(`\n🌱 Maria backend in ascolto su http://localhost:${PORT}`);
  console.log(`   WebSocket: ws://localhost:${PORT}`);
  console.log(`   Health:    http://localhost:${PORT}/health`);
  console.log(`   Telemetria esterna: POST http://localhost:${PORT}/telemetry?room=maria`);
  if (TOKEN) console.log('   Token di accesso attivo (MARIA_TOKEN).');
  console.log('');
});
