#!/usr/bin/env node
/* Test DOM end-to-end: carica l'app in un DOM jsdom reale, verifica il
 * rendering delle viste, la navigazione, i modali e il salvataggio dati.
 * Uso:  node tools/dom-test.js      (richiede: npm install)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const dom = new JSDOM(html, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'dangerously' });
const { window } = dom;
window.scrollTo = () => {};
if (!window.URL.createObjectURL) window.URL.createObjectURL = () => 'blob:test';
if (!window.URL.revokeObjectURL) window.URL.revokeObjectURL = () => {};

// carica i moduli nell'ordine dei <script> dell'index.html
['js/utils.js', 'js/store.js', 'js/charts.js', 'js/advice.js', 'js/alerts.js', 'js/live.js', 'js/app.js']
  .forEach((f) => window.eval(fs.readFileSync(path.join(root, f), 'utf8')));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name, extra != null ? '→ ' + String(extra).slice(0, 120) : ''); }
}
const app = window.document.querySelector('#app');
const text = () => app.textContent;
function click(sel, screen) {
  const el = window.document.querySelector(sel);
  if (!el) return false;
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  return true;
}

console.log('\n[avvio]');
window.App.init();
ok('#app contiene header e tabbar', app.querySelector('.app-header') && app.querySelector('.tabbar'));
ok('nome app / titolo presente', /GROW FAST/.test(text()));
ok('senza dati mostra onboarding', /Nessuna coltivazione/.test(text()));
ok('onboarding offre "Importa backup"', /Importa backup/.test(text()) && !!window.document.querySelector('[data-action="import"]'));
ok('la tabbar ha 4 schede (Home/Diario/Live/Strumenti)', window.document.querySelectorAll('.tabbar button').length === 4);
ok('header mostra il nome app GROW FAST & GROW BIG', /GROW FAST/.test(window.document.querySelector('.app-header').textContent));

console.log('\n[dati demo + home]');
window.Store.seedDemo();
window.App.go('home');
ok('home mostra il nome strain', /Northern Lights/.test(text()));
ok('home mostra i KPI parametri', app.querySelectorAll('.kpi').length >= 4);
ok('home mostra gli alert', app.querySelectorAll('.alert-item').length >= 1);
ok('home mostra consiglio del giorno', /Consiglio del giorno/i.test(text()));
ok('home mostra il riquadro Luce & timer', /Luce & timer/.test(text()) && !!window.document.querySelector('[data-field="schedule.vegHours"]'));
ok('home mostra il badge di fase (Veg/Fioritura)', !!window.document.querySelector('.phase-badge'));
ok('home mostra i consumi (kWh, L, €)', /kWh/.test(text()) && /Consumi & Costi/.test(text()));
ok('home mostra il pulsante Luce ON/OFF', !!window.document.querySelector('[data-action="light-toggle"]'));
ok('home mostra il pulsante Scarica report', !!window.document.querySelector('[data-action="report"]'));

console.log('\n[navigazione]');
ok('click scheda Diario', click('.tabbar button[data-screen="diary"]'));
ok('screen = diary', window.App.screen === 'diary');
ok('diario mostra timeline', /Timeline/.test(text()) && /Nota giornaliera/.test(text()));
window.App.go('live');
ok('live mostra telemetria', /Telemetria/.test(text()) && /Controllo dispositivi/.test(text()));
window.App.go('tools');
ok('tools mostra calcolatori + VPD calcolato', /Calcolatori/.test(text()) && window.document.querySelector('#out-vpd').textContent.includes('kPa'));
window.App.go('home');
ok('home mostra la data di oggi', !!window.document.querySelector('.dateline'));
ok('home mostra Fase & Lampada (ridotto)', /Fase & Lampada/.test(text()) && !!window.document.querySelector('[data-field="lampType"]'));
ok('home mostra Consumi & Costi con tariffe', /Consumi & Costi/.test(text()) && !!window.document.querySelector('[data-key="energyCost"]'));
window.App.go('live');
ok('live mostra Controllo remoto (spostato)', /Controllo remoto/.test(text()) && !!window.document.querySelector('#rem-url'));
ok('live mostra Preferenze', /Preferenze/.test(text()) && !!window.document.querySelector('#set-leaf'));

console.log('\n[scheda varietà + report + timelapse]');
window.App.go('home');
window.document.querySelector('[data-action="strain-info"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok('la "i" apre la scheda tecnica varietà', /Scheda tecnica/.test(window.document.querySelector('.modal .m-title').textContent) && !!window.document.querySelector('[data-action="edit-strain"]'));
window.App.closeModal();
window.App.report();
ok('il report si apre con calendario e consumi', !!window.document.querySelector('#report-overlay .report .cal-wrap'));
ok('il report contiene il Diario giorno per giorno', /Diario giorno per giorno/.test(window.document.querySelector('#report-overlay').textContent));
ok('il report ha sezioni per giorni (.rday)', window.document.querySelectorAll('#report-overlay .rday').length >= 1);
window.App.reportClose();
ok('il report si chiude', !window.document.querySelector('#report-overlay'));

console.log('\n[luce on/off + report]');
window.App.go('home');
window.document.querySelector('[data-action="light-toggle"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok('la luce si accende (conteggio ore avviato)', window.App.grow().light.on === true);
window.document.querySelector('[data-action="light-toggle"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok('la luce si spegne', window.App.grow().light.on === false);
let reportOk = true; try { window.App.report(); } catch (e) { reportOk = false; }
ok('il report CSV si genera senza errori', reportOk);

console.log('\n[calendario]');
window.App.go('diary');
window.App.diaryMode = 'calendar';
window.App.render();
ok('il calendario è renderizzato', !!window.document.querySelector('.cal-grid'));
ok('ci sono celle giorno', window.document.querySelectorAll('.cal-day[data-date]').length >= 28);
ok('la legenda mostra gli stadi', /Vegetativa/.test(window.document.querySelector('#app').textContent));
const todayIso = window.U.todayISO();
let futureCells = 0, futureColored = 0;
window.document.querySelectorAll('.cal-day[data-date]').forEach(c => {
  if (c.dataset.date > todayIso) { futureCells++; if (/background/.test(c.getAttribute('style') || '')) futureColored++; }
});
ok('i giorni futuri del calendario NON sono colorati (' + futureCells + ' celle)', futureColored === 0);
const dayCell = window.document.querySelector('.cal-day[data-date]');
dayCell.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok('il click su un giorno apre il dettaglio', !!window.document.querySelector('.modal-backdrop'));
window.App.closeModal();
window.App.diaryMode = 'list';

console.log('\n[interazioni]');
window.App.go('live');
const nDev = window.Store.state.settings;
const cb = window.document.querySelector('input[data-action="device"][data-id="heater"]');
cb.checked = true;
cb.dispatchEvent(new window.Event('change', { bubbles: true }));
ok('toggle dispositivo aggiorna lo stato', window.Live.devices.heater === true);

window.App.go('home');
window.App.growForm(window.App.grow());
ok('il form coltivazione ha area, piante e lampada',
  !!window.document.querySelector('[data-field="areaW"]') &&
  !!window.document.querySelector('[data-field="areaD"]') &&
  !!window.document.querySelector('[data-field="plants"]') &&
  !!window.document.querySelector('[data-field="lampType"]') &&
  !!window.document.querySelector('[data-field="vegWatts"]'));
window.App.closeModal();

console.log('\n[spese]');
const beforeExp = window.App.grow().expenses.length;
window.App.addExpenseForm();
const mExp = window.document.querySelector('.modal-backdrop');
ok('il modale spesa si apre con i campi', !!mExp.querySelector('[data-field="amount"]'));
mExp.querySelector('[data-field="label"]').value = 'Semi test';
mExp.querySelector('[data-field="amount"]').value = '30';
mExp.querySelector('[data-action="modal-confirm"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok('la spesa è stata aggiunta', window.App.grow().expenses.length === beforeExp + 1);

console.log('\n[acqua & fertilizzante al volo]');
window.App.go('home');
const beforeI = window.Store.state.interventions.length;
window.App.quickWaterForm();
const mw = window.document.querySelector('.modal-backdrop');
ok('il modale acqua mostra i litri', !!mw.querySelector('[data-field="liters"]'));
mw.querySelector('[data-field="liters"]').value = '5';
mw.querySelector('[data-action="modal-confirm"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok('irrigazione registrata', window.Store.state.interventions.length === beforeI + 1);
const lastW = window.Store.state.interventions[window.Store.state.interventions.length - 1];
ok('litri = 5 nell’intervento', lastW.type === 'irrigazione' && lastW.amount === '5');

window.App.quickFeedForm();
const mf = window.document.querySelector('.modal-backdrop');
mf.querySelector('[data-field="brand"]').value = 'BioBizz';
mf.querySelector('[data-field="type"]').value = 'Bio Grow';
mf.querySelector('[data-field="amount"]').value = '2 ml/L';
mf.querySelector('[data-field="water"]').value = '5';
mf.querySelector('[data-action="modal-confirm"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const lastF = window.Store.state.interventions[window.Store.state.interventions.length - 1];
ok('nutrizione registrata con marca · tipo', lastF.type === 'nutrizione' && /BioBizz/.test(lastF.product) && /Bio Grow/.test(lastF.product));

console.log('\n[salva lettura live]');
window.Live.startSim();
window.App.go('live');
window.Live.tick(true);
window.App.render();
const beforeLive = window.Store.state.readings.length;
window.document.querySelector('[data-action="save-reading"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok('"Salva lettura" salva il campione live', window.Store.state.readings.length > beforeLive);
window.Live.stop();

console.log('\n[modale lettura]');
const beforeReadings = window.Store.state.readings.length;
window.App.readingForm();
const modal = window.document.querySelector('.modal-backdrop');
ok('il modale si apre', !!modal && !!modal.querySelector('#modal-body'));
modal.querySelector('[data-field="temp"]').value = '26.5';
modal.querySelector('[data-field="rh"]').value = '55';
modal.querySelector('[data-action="modal-confirm"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok('il modale si chiude dopo conferma', !window.document.querySelector('.modal-backdrop'));
ok('la lettura è stata salvata', window.Store.state.readings.length === beforeReadings + 1);
const last = window.Store.latestReading();
ok('VPD calcolato e temp registrata', last.temp === 26.5 && last.vpd != null, JSON.stringify(last));

console.log('\n[intervento via modale]');
const beforeInt = window.Store.state.interventions.length;
window.App.interventionForm(null, 'irrigazione');
const m2 = window.document.querySelector('.modal-backdrop');
m2.querySelector('[data-field="amount"]').value = '3';
m2.querySelector('[data-field="ph"]').value = '6.1';
m2.querySelector('[data-action="modal-confirm"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok('intervento registrato', window.Store.state.interventions.length === beforeInt + 1);

console.log('\n[giorno/notte + consiglio esteso]');
window.App.go('home');
ok('la home ha il selettore Giorno/Notte', window.document.querySelectorAll('[data-action="params-period"]').length === 2);
click('[data-action="params-period"][data-period="notte"]');
ok('selezionando Notte cambia il periodo', window.App.paramsPeriod === 'notte');
ok('il KPI temperatura mostra la notte', /Temperatura notte/.test(text()));
click('[data-action="params-period"][data-period="giorno"]');
ok('tornando a Giorno cambia il periodo', window.App.paramsPeriod === 'giorno' && /Temperatura giorno/.test(text()));
ok('il consiglio del giorno è esteso (più schede)', app.querySelectorAll('.adv-item').length >= 4);
ok('la home ha gli orari ON/OFF della luce', !!window.document.querySelector('[data-field="schedule.vegOn"]') && !!window.document.querySelector('[data-field="schedule.flowerOff"]'));

window.App.paramsPeriod = 'notte';
window.App.readingForm(false);
const rModal = window.document.querySelector('.modal-backdrop');
ok('il modale lettura ha i chip Giorno/Notte', rModal.querySelectorAll('[data-set-period]').length === 2);
rModal.querySelector('[data-set-period="notte"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok('il chip Notte imposta il campo periodo', rModal.querySelector('#read-period').value === 'notte');
const beforeR = window.Store.state.readings.length;
rModal.querySelector('[data-field="temp"]').value = '19.5';
rModal.querySelector('[data-action="modal-confirm"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok('la lettura notte è salvata', window.Store.state.readings.length === beforeR + 1);
ok('l’ultima lettura notte ha la temperatura giusta', (window.Store.latestReading(window.App.grow().id, 'notte') || {}).temp === 19.5);
window.App.paramsPeriod = 'giorno';

console.log('\n[report: orari luce + letture giorno/notte]');
window.Store.addReading({ date: window.U.todayISO(), period: 'giorno', temp: 25.2, rh: 55, source: 'manual' });
window.App.report();
const rtxt = window.document.querySelector('#report-overlay').textContent;
ok('il report mostra gli orari di accensione/spegnimento', /Orari accensione\/spegnimento/.test(rtxt));
ok('il report elenca le letture Giorno/Notte', window.document.querySelectorAll('#report-overlay .rday-read').length >= 2);
window.App.reportClose();

console.log('\n[calcolatori]');
window.App.go('tools');
const setVal = (id, v) => { const el = window.document.getElementById(id); el.value = v; el.dispatchEvent(new window.Event('input', { bubbles: true })); };
setVal('calc-dli-p', 600); setVal('calc-dli-h', 12);
ok('DLI aggiornato nel DOM', window.document.getElementById('out-dli').textContent.includes('mol'));
setVal('calc-ec', 1.6);
ok('conversione EC→PPM bidirezionale', window.document.getElementById('calc-ppm').value === '800');
setVal('calc-dil-cur', 2.0); setVal('calc-dil-tgt', 1.5); setVal('calc-dil-vol', 10);
ok('calcolo diluizione mostrato', /Aggiungi/.test(window.document.getElementById('out-dil').innerHTML));

console.log(`\nRisultato: ${pass} ok, ${fail} falliti\n`);
try { dom.window.close(); } catch (e) {}
process.exit(fail === 0 ? 0 : 1);
