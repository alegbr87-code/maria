/* ==========================================================================
   Maria — live.js : parametri in tempo reale + controllo remoto
   Modalità:
     - 'off'    : nessuna sorgente live (solo inserimento manuale)
     - 'sim'    : simulatore locale (demo, nessun hardware)
     - 'remote' : WebSocket verso backend (server/server.js o cloud)
   ========================================================================== */
(function (global) {
  'use strict';
  const U = global.U;
  const Store = global.Store;
  const Advice = global.Advice;

  const DEVICES = [
    { id: 'light',        label: 'Lampada',           icon: '💡' },
    { id: 'exhaust',      label: 'Estrazione',        icon: '🌀' },
    { id: 'intake',       label: 'Immissione',        icon: '🌬️' },
    { id: 'fan',          label: 'Ventola interna',   icon: '🎐' },
    { id: 'humidifier',   label: 'Umidificatore',     icon: '💦' },
    { id: 'dehumidifier', label: 'Deumidificatore',   icon: '☀️' },
    { id: 'heater',       label: 'Riscaldatore',      icon: '🔥' },
    { id: 'pump',         label: 'Pompa irrigazione', icon: '🚰' }
  ];

  const Live = {
    DEVICES,
    mode: 'off',
    connected: false,
    timer: null,
    ws: null,
    tickCount: 0,
    history: [],
    value: null,
    devices: {},
    targets: { temp: 24, rh: 60 },
    sampleCb: [],
    statusCb: [],

    init() {
      this.devices = {};
      DEVICES.forEach(d => this.devices[d.id] = (d.id === 'light' || d.id === 'fan' || d.id === 'exhaust'));
      const cfg = Store.state.settings.remote || {};
      if (cfg.enabled && cfg.url) this.startRemote(cfg.url, cfg.room, cfg.token);
    },

    onSample(fn) { this.sampleCb.push(fn); },
    onStatus(fn) { this.statusCb.push(fn); },
    emitSample() { this.sampleCb.forEach(fn => { try { fn(this.value); } catch (e) {} }); },
    emitStatus() { this.statusCb.forEach(fn => { try { fn({ mode: this.mode, connected: this.connected }); } catch (e) {} }); },

    /* ---------- simulatore ---------- */
    startSim() {
      this.stopTimer();
      this.disconnectWS();
      this.mode = 'sim';
      this.connected = true;
      this.emitStatus();
      if (!this.value) {
        this.value = { ts: Date.now(), temp: this.targets.temp, rh: this.targets.rh, ph: 6.1, ec: 1.4, ppfd: 450, co2: 550, waterTemp: 20 };
      }
      this.tick(true);
      const iv = Math.max(1, Number(Store.state.settings.liveInterval) || 5) * 1000;
      this.timer = setInterval(() => this.tick(), iv);
    },

    tick(force) {
      const g = Store.activeGrow();
      const t = g ? Advice.targetFor(g.stage) : Advice.TARGETS.vegetativa;
      const d = this.devices;

      const targetTemp = (t.tempD[0] + t.tempD[1]) / 2;
      const targetRh = (t.rh[0] + t.rh[1]) / 2;
      this.targets = { temp: U.round(targetTemp, 1), rh: Math.round(targetRh) };

      const cur = this.value || { temp: targetTemp, rh: targetRh, ph: 6.1, ec: 1.4, ppfd: 500, co2: 550, waterTemp: 20 };

      let temp = cur.temp + (targetTemp - cur.temp) * 0.1;
      let rh = cur.rh + (targetRh - cur.rh) * 0.1;
      if (d.heater) temp += 0.35;
      if (d.exhaust) { temp -= 0.25; rh -= 0.6; }
      if (d.intake) temp -= 0.12;
      if (d.humidifier) rh += 0.9;
      if (d.dehumidifier) rh -= 0.9;
      if (d.light) temp += 0.15;
      temp += (Math.random() - 0.5) * 0.35;
      rh += (Math.random() - 0.5) * 1.1;
      temp = U.clamp(temp, 12, 35);
      rh = U.clamp(rh, 25, 92);

      const ppfd = d.light ? U.round((t.ppfd[0] + t.ppfd[1]) / 2 + (Math.random() - 0.5) * 40, 0) : 0;
      const co2 = U.round(480 + (d.exhaust ? -40 : 40) + (Math.random() - 0.5) * 30, 0);
      const ph = U.clamp((cur.ph || 6.1) + (Math.random() - 0.5) * 0.05, 5.2, 7.2);
      const ec = U.clamp((cur.ec || 1.4) + (Math.random() - 0.5) * 0.04, 0.2, 2.8);

      this.value = {
        ts: Date.now(),
        temp: U.round(temp, 1),
        rh: U.round(rh, 0),
        vpd: U.vpd(temp, rh, (Store.state.settings.leafOffset || 2)),
        ph: U.round(ph, 2),
        ec: U.round(ec, 2),
        ppfd, co2,
        waterTemp: U.round(18 + Math.random() * 3, 0)
      };

      this.history.push(Object.assign({}, this.value));
      if (this.history.length > 180) this.history.shift();

      this.tickCount++;
      const every = Math.max(1, Math.round(60 / (Number(Store.state.settings.liveInterval) || 5)));
      if (force || this.tickCount % every === 0) {
        Store.addReading(Object.assign({ source: 'live' }, this.value, { date: U.todayISO() }));
      }
      this.emitSample();
    },

    /* ---------- remoto (WebSocket) ---------- */
    startRemote(url, room, token) {
      this.stopTimer();
      this.disconnectWS();
      this.mode = 'remote';
      this.url = url; this.room = room || 'maria'; this.token = token || '';
      this.emitStatus();
      this.connectWS();
    },

    connectWS() {
      try {
        this.ws = new WebSocket(this.url);
      } catch (e) {
        U.toast('URL WebSocket non valido, uso la simulazione');
        this.startSim();
        return;
      }
      this.ws.onopen = () => {
        this.connected = true;
        this.emitStatus();
        this.send({ type: 'join', room: this.room, token: this.token, client: 'maria-pwa' });
        U.toast('🟢 Controllo remoto connesso');
      };
      this.ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch (e) { return; }
        if (msg.type === 'telemetry' && msg.data) {
          const d = msg.data;
          this.value = {
            ts: Date.now(),
            temp: d.temp, rh: d.rh,
            vpd: d.vpd != null ? d.vpd : U.vpd(d.temp, d.rh, (Store.state.settings.leafOffset || 2)),
            ph: d.ph, ec: d.ec, ppfd: d.ppfd, co2: d.co2, waterTemp: d.waterTemp
          };
          if (d.devices) this.devices = Object.assign(this.devices, d.devices);
          if (d.targets) this.targets = d.targets;
          this.history.push(Object.assign({}, this.value));
          if (this.history.length > 180) this.history.shift();
          this.emitSample();
        } else if (msg.type === 'devices' && msg.data) {
          this.devices = Object.assign(this.devices, msg.data);
          this.emitSample();
        } else if (msg.type === 'ack') {
          if (msg.devices) this.devices = Object.assign(this.devices, msg.devices);
          this.emitSample();
        }
      };
      this.ws.onclose = () => {
        this.connected = false;
        this.emitStatus();
        U.toast('🔴 Controllo remoto disconnesso');
      };
      this.ws.onerror = () => { this.connected = false; this.emitStatus(); };
    },

    send(obj) {
      if (this.ws && this.ws.readyState === 1) { this.ws.send(JSON.stringify(obj)); return true; }
      return false;
    },

    /* ---------- comandi ---------- */
    toggleDevice(id, on) {
      const value = (on == null) ? !this.devices[id] : !!on;
      this.devices[id] = value;
      if (this.mode === 'remote') {
        this.send({ type: 'control', room: this.room, device: id, on: value });
      }
      this.emitSample();
      return value;
    },

    setTargets(targets) {
      this.targets = Object.assign(this.targets, targets || {});
      if (this.mode === 'remote') this.send({ type: 'setTarget', room: this.room, targets: this.targets });
      this.emitSample();
    },

    saveCurrent() {
      if (!this.value) { U.toast('Nessun dato live da salvare'); return; }
      Store.addReading(Object.assign({ source: this.mode }, this.value, { date: U.todayISO() }));
      U.toast('✅ Lettura live salvata');
    },

    stop() {
      this.stopTimer();
      this.disconnectWS();
      this.mode = 'off';
      this.connected = false;
      this.emitStatus();
    },

    stopTimer() { if (this.timer) { clearInterval(this.timer); this.timer = null; } },
    disconnectWS() { if (this.ws) { try { this.ws.onclose = null; this.ws.close(); } catch (e) {} this.ws = null; } }
  };

  global.Live = Live;
})(window);
