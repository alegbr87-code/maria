#!/usr/bin/env node
/* Smoke test della logica applicativa di Maria (senza browser).
 * Esegue i moduli in un contesto VM con shim minimi di window/document/localStorage.
 * Uso:  node tools/smoke-test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const files = ['js/utils.js', 'js/store.js', 'js/charts.js', 'js/advice.js', 'js/alerts.js', 'js/live.js'];

const sandbox = {};
sandbox.window = sandbox;
sandbox.console = console;
sandbox.setTimeout = setTimeout;
sandbox.clearTimeout = clearTimeout;
sandbox.setInterval = () => 0;
sandbox.clearInterval = () => {};
sandbox.WebSocket = function () { throw new Error('ws non disponibile nel test'); };
sandbox.navigator = {};
sandbox.URL = URL;
sandbox.WebSocket = sandbox.WebSocket;
const mem = {};
sandbox.localStorage = {
  getItem: (k) => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v); },
  removeItem: (k) => { delete mem[k]; }
};
const fakeEl = () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, remove() {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], dataset: {} });
sandbox.document = {
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: fakeEl,
  addEventListener() {},
  body: { appendChild() {} }
};
vm.createContext(sandbox);

for (const f of files) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), sandbox, { filename: f });

const { U, Store, Advice, Alerts, Charts, Live } = sandbox;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name, extra != null ? '→ ' + extra : ''); }
}
function approx(a, b, eps) { return Math.abs(a - b) <= (eps == null ? 0.05 : eps); }

console.log('\n[utils]');
const v = U.vpd(25, 60, 2);
ok('VPD(25°C,60%,Δfoglia 2°C) ≈ 1.12 kPa', approx(v, 1.12, 0.03), v);
const v0 = U.vpd(25, 60, 0);
ok('VPD(25°C,60%,Δ0) ≈ 1.27 kPa', approx(v0, 1.27, 0.03), v0);
ok('DLI(450µmol,18h) ≈ 29.2', approx(U.dli(450, 18), 29.2, 0.1), U.dli(450, 18));
ok('EC→PPM 1.4 → 700', U.ecToPpm(1.4) === 700);
ok('dayNumber su 10 giorni', U.dayNumber('2025-01-01', '2025-01-10') === 10);
ok('addDays salta i mesi', U.addDays('2025-01-31', 1) === '2025-02-01');

console.log('\n[store]');
Store.init();
ok('stato iniziale vuoto', Store.state.grows.length === 0);
const g = Store.seedDemo();
ok('seedDemo crea 1 grow', Store.state.grows.length === 1);
ok('seedDemo crea 12 letture (giorno + notte)', Store.state.readings.length === 12);
ok('seedDemo crea interventi', Store.state.interventions.length === 3);
ok('activeGrow torna il grow', Store.activeGrow().id === g.id);
const r = Store.addReading({ temp: 27.5, rh: 42 });
ok('addReading calcola VPD', r.vpd != null && r.vpd > 0, r.vpd);
ok('latestReading aggiornato', Store.latestReading(g.id).id === r.id);
ok('seedDemo imposta area 80x80 cm', g.areaW === 80 && g.areaD === 80);
ok('seedDemo imposta numero piante', g.plants === 2);
ok('seedDemo imposta tipo lampada', !!g.lampType);

console.log('\n[consumi & costi]');
const cons = Store.consumption(Store.activeGrow());
ok('consumption calcola kWh luce > 0', cons.kWh > 0, cons.kWh);
ok('consumption somma i litri acqua (2 L)', cons.liters === 2, cons.liters);
ok('consumption somma le spese extra (52,50 €)', cons.extraCost === 52.5, cons.extraCost);
ok('consumption totale ≥ spese extra', cons.total >= cons.extraCost);
Store.addExpense({ label: 'Test', amount: 10, date: U.todayISO() });
ok('addExpense aggiunge una spesa', Store.activeGrow().expenses.length === 4);
Store.removeExpense(Store.activeGrow().expenses[3].id);
ok('removeExpense rimuove la spesa', Store.activeGrow().expenses.length === 3);
ok('lightStats misura le ore luce (≈11 h)', Store.lightStats(Store.activeGrow()).hours > 10, Store.lightStats(Store.activeGrow()).hours);
ok('consumption usa le ore misurate', Store.consumption(Store.activeGrow()).lightMeasured === true);
const lightH0 = Store.lightStats().hours;
Store.lightToggle();
ok('lightToggle accende la luce (ON)', Store.activeGrow().light.on === true);
Store.lightToggle();
ok('lightToggle spegne la luce (OFF)', Store.activeGrow().light.on === false);
ok('le ore luce non diminuiscono', Store.lightStats().hours >= lightH0);

console.log('\n[ambiente & calendario]');
ok('stageForDate prima dell’inizio = null', Store.stageForDate(g, U.addDays(g.startDate, -1)) === null);
ok('stageForDate alla data di inizio', Store.stageForDate(g, g.startDate) === 'germinazione');
ok('stageForDate dopo la transizione', Store.stageForDate(g, U.addDays(U.todayISO(), -10)) === 'vegetativa');
Store.setStage(g.id, 'fioritura');
ok('setStage registra lo stadio nello stageLog', g.stageLog[g.stageLog.length - 1].stage === 'fioritura');
const la = Advice.lightAdvice(Store.activeGrow());
ok('lightAdvice calcola area (0,64 m²) e potenza', !!la && la.areaM2 === 0.64 && la.recommended[0] > 0, JSON.stringify(la));
ok('lightAdvice confronta i watt di fase', !!la && la.current != null);

console.log('\n[advice]');
ok('targetFor(fioritura) = 12h luce', Advice.targetFor('fioritura').lightHours === 12);
const tips = Advice.fromReading(g, { temp: 34, rh: 72, vpd: 2.2, ph: 6.2, ec: 2.0 });
ok('avvisi su temp/UR/VPD alti', tips.some(t => t.title.includes('Temperatura')) && tips.some(t => t.title.includes('Umidità')) && tips.some(t => t.title.includes('VPD')));
const ns = Advice.nutrientSchedule(g, 3);
ok('schema nutrienti per settimana', !!ns.base && !!ns.note);
ok('dailyTip esiste', !!Advice.dailyTip(g).text);

console.log('\n[alerts]');
Store.setStage(g.id, 'fioritura');
Store.addReading({ temp: 24, rh: 68, ph: 6.2, ec: 1.6 }); // UR alta in fioritura → rischio muffa
const alerts = Alerts.compute(Store.activeGrow());
ok('alerts è un array non vuoto', Array.isArray(alerts) && alerts.length > 0);
ok('rileva rischio muffa in fioritura', alerts.some(a => a.title.includes('muffa')), JSON.stringify(alerts.map(a => a.title)));
const c = Alerts.count(Store.activeGrow());
ok('count è un numero ≥ 0', typeof c === 'number' && c >= 0, c);

console.log('\n[charts]');
const svg = Charts.line([{ name: 't', color: '#f00', points: [{ x: 0, y: 1 }, { x: 1, y: 3 }, { x: 2, y: 2 }] }], { height: 120, xLabels: ['a', 'b'] });
ok('Charts.line produce <svg>', typeof svg === 'string' && svg.includes('<svg'));
ok('Charts.line con dati vuoti gestisce il caso', Charts.line([], {}).includes('Nessun dato'));

console.log('\n[live]');
Live.init();
ok('modalità iniziale off', Live.mode === 'off');
Live.startSim();
ok('startSim attiva sim', Live.mode === 'sim' && Live.connected === true);
Live.tick(true);
ok('tick produce un campione', Live.value && typeof Live.value.temp === 'number', JSON.stringify(Live.value));
ok('history raccoglie campioni', Live.history.length >= 1);
const liveReadings = Store.readingsFor();
ok('readingsFor ordina i campioni live (ts = stringa)', Array.isArray(liveReadings) && liveReadings.every(x => typeof x.ts === 'string'));
ok('latestReading funziona dopo un campione live', !!Store.latestReading());
Live.toggleDevice('heater', true);
ok('toggleDevice accende il riscaldatore', Live.devices.heater === true);
Live.setTargets({ temp: 22 });
ok('setTargets aggiorna i target', Live.targets.temp === 22);
Live.stop();
ok('stop riporta a off', Live.mode === 'off' && Live.connected === false);

console.log(`\nRisultato: ${pass} ok, ${fail} falliti\n`);
process.exit(fail === 0 ? 0 : 1);
