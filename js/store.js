/* ==========================================================================
   Maria — store.js : stato centrale, persistenza e CRUD
   ========================================================================== */
(function (global) {
  'use strict';
  const U = global.U;

  const KEY = 'maria.state.v1';

  const STAGES = [
    { id: 'germinazione', label: 'Germinazione', days: 5,    color: 'violet' },
    { id: 'piantina',     label: 'Piantina',      days: 10,   color: 'blue' },
    { id: 'vegetativa',   label: 'Vegetativa',    days: 35,   color: 'green' },
    { id: 'fioritura',    label: 'Fioritura',     days: 63,   color: 'lime' },
    { id: 'flushing',     label: 'Flushing',      days: 10,   color: 'blue' },
    { id: 'raccolta',     label: 'Raccolta',      days: 1,    color: 'amber' },
    { id: 'essiccazione', label: 'Essiccazione',  days: 10,   color: 'amber' },
    { id: 'concia',       label: 'Concia (Curing)', days: 30, color: 'violet' }
  ];

  const INTERVENTION_TYPES = [
    { id: 'irrigazione', label: 'Irrigazione', icon: '💧', fields: ['amount', 'ph', 'ec', 'waterTemp'] },
    { id: 'nutrizione',  label: 'Nutrizione',  icon: '🧪', fields: ['product', 'amount', 'ph', 'ec', 'water'] },
    { id: 'ph',          label: 'Regolazione pH', icon: '⚗️', fields: ['ph', 'product', 'amount'] },
    { id: 'ec',          label: 'Regolazione EC', icon: '📊', fields: ['ec', 'product', 'amount'] },
    { id: 'training',    label: 'Training (LST/HST)', icon: '🪢', fields: [] },
    { id: 'topping',     label: 'Topping / FIM', icon: '✂️', fields: ['nodes'] },
    { id: 'defogliazione', label: 'Defogliazione', icon: '🍃', fields: [] },
    { id: 'lollipopping', label: 'Lollipopping', icon: '🌿', fields: [] },
    { id: 'trasloco',    label: 'Trasloco vaso', icon: '🪴', fields: ['potSize'] },
    { id: 'illuminazione', label: 'Illuminazione', icon: '💡', fields: ['hours', 'ppfd'] },
    { id: 'parassiti',   label: 'Trattamento parassiti', icon: '🐛', fields: ['product', 'amount'] },
    { id: 'cambio_acqua', label: 'Cambio acqua/soluzione', icon: '🚰', fields: ['water', 'ph', 'ec'] },
    { id: 'pulizia',     label: 'Pulizia ambiente', icon: '🧹', fields: [] },
    { id: 'note',        label: 'Nota / Osservazione', icon: '📝', fields: [] }
  ];

  const DEFAULT_SETTINGS = {
    growName: 'Il mio box',
    leafOffset: 2,
    notifications: true,
    liveInterval: 5,          // secondi tra aggiornamenti in modalità simulata
    remote: { enabled: false, url: '', room: 'maria', token: '' },
    units: 'metric',
    energyCost: 0.25,         // € per kWh (energia elettrica)
    waterCost: 0.004          // € per litro (acqua + eventuale osmosi)
  };

  function defaultState() {
    return {
      version: 1,
      createdAt: new Date().toISOString(),
      settings: U.clone(DEFAULT_SETTINGS),
      activeGrowId: null,
      grows: [],
      entries: [],
      interventions: [],
      readings: [],   // { id, growId, ts, temp, rh, vpd, ph, ec, ppfd, co2, waterTemp, source }
      live: null      // ultimo campione live in arrivo dal controllo remoto
    };
  }

  const Store = {
    STAGES,
    INTERVENTION_TYPES,
    DEFAULT_SETTINGS,
    state: null,
    listeners: [],

    init() {
      this.state = U.store.get(KEY, null) || defaultState();
      this.state.settings = Object.assign({}, DEFAULT_SETTINGS, this.state.settings || {});
      this.state.settings.remote = Object.assign({}, DEFAULT_SETTINGS.remote, this.state.settings.remote || {});
      ['grows', 'entries', 'interventions', 'readings'].forEach(k => {
        if (!Array.isArray(this.state[k])) this.state[k] = [];
      });
      // migrazione: garantisce stageLog e campi ambiente su grow esistenti
      this.state.grows.forEach(g => {
        if (!Array.isArray(g.stageLog) || !g.stageLog.length) {
          g.stageLog = [{ stage: g.stage, date: g.startDate }];
        }
        if (g.plants == null) g.plants = 1;
        if (!Array.isArray(g.expenses)) g.expenses = [];
        if (!g.light || typeof g.light !== 'object') g.light = { on: false, since: null, log: [] };
        if (!Array.isArray(g.light.log)) g.light.log = [];
      });
      return this.state;
    },

    save() {
      const ok = U.store.set(KEY, this.state);
      this.emit('change');
      return ok;
    },

    on(fn) { this.listeners.push(fn); },
    emit(type, payload) { this.listeners.forEach(fn => { try { fn(type, payload); } catch (e) { console.error(e); } }); },

    /* ---- GROWS ---- */
    activeGrow() {
      return this.state.grows.find(g => g.id === this.state.activeGrowId) || this.state.grows[0] || null;
    },

    addGrow(data) {
      const g = Object.assign({
        id: U.uid('grow'),
        name: 'Nuova coltivazione',
        strain: '',
        genetics: '',
        startDate: U.todayISO(),
        stage: 'germinazione',
        medium: 'Terra',
        potSize: '',
        // ambiente
        areaW: null,   // larghezza area (cm)
        areaD: null,   // profondità/altezza area (cm)
        plants: 1,     // numero di piante
        // illuminazione
        lampType: 'LED',   // MH · HPS · MH+HPS · LED · CMH/LEC · CFL · Altro
        vegWatts: null,    // W in vegetativa
        flowerWatts: null, // W in fioritura
        light: '',         // note libere sulla lampada
        schedule: { vegHours: 18, flowerHours: 12 },
        stageLog: [],
        expenses: [],      // spese extra: { id, date, label, amount }
        light: { on: false, since: null, log: [] }, // registro accensione luce: {start,end,watts}
        archived: false,
        createdAt: new Date().toISOString()
      }, data || {});
      g.schedule = Object.assign({ vegHours: 18, flowerHours: 12 }, g.schedule || {});
      g.stageLog = Array.isArray(g.stageLog) && g.stageLog.length
        ? g.stageLog
        : [{ stage: g.stage, date: g.startDate }];
      this.state.grows.push(g);
      this.state.activeGrowId = g.id;
      this.save();
      return g;
    },

    updateGrow(id, patch) {
      const g = this.state.grows.find(x => x.id === id);
      if (!g) return null;
      Object.assign(g, patch);
      this.save();
      return g;
    },

    removeGrow(id) {
      this.state.grows = this.state.grows.filter(g => g.id !== id);
      this.state.entries = this.state.entries.filter(e => e.growId !== id);
      this.state.interventions = this.state.interventions.filter(i => i.growId !== id);
      this.state.readings = this.state.readings.filter(r => r.growId !== id);
      if (this.state.activeGrowId === id) this.state.activeGrowId = (this.state.grows[0] || {}).id || null;
      this.save();
    },

    setStage(growId, stage) {
      const g = this.state.grows.find(x => x.id === growId);
      if (!g) return null;
      if (g.stage !== stage) {
        g.stageLog = Array.isArray(g.stageLog) && g.stageLog.length
          ? g.stageLog
          : [{ stage: g.stage, date: g.startDate }];
        g.stageLog.push({ stage, date: U.todayISO() });
      }
      g.stage = stage;
      this.save();
      return g;
    },

    /* ---- SPESE EXTRA ---- */
    addExpense(data) {
      const g = this.activeGrow();
      if (!g) return null;
      if (!Array.isArray(g.expenses)) g.expenses = [];
      const e = Object.assign({ id: U.uid('exp'), date: U.todayISO(), label: 'Spesa', amount: 0 }, data || {});
      g.expenses.push(e);
      this.save();
      return e;
    },

    removeExpense(id) {
      const g = this.activeGrow();
      if (!g || !Array.isArray(g.expenses)) return;
      g.expenses = g.expenses.filter(e => e.id !== id);
      this.save();
    },

    /* ---- LUCE: watt di fase + accensione/spegnimento con conteggio ore ---- */
    activeWatts(grow) {
      grow = grow || this.activeGrow();
      if (!grow) return 0;
      return (grow.stage === 'fioritura' || grow.stage === 'flushing') ? (grow.flowerWatts || 0) : (grow.vegWatts || 0);
    },

    lightToggle() {
      const g = this.activeGrow();
      if (!g) return null;
      if (!g.light || typeof g.light !== 'object') g.light = { on: false, since: null, log: [] };
      if (!Array.isArray(g.light.log)) g.light.log = [];
      const now = new Date().toISOString();
      if (g.light.on) {
        const open = g.light.log.filter(s => !s.end).pop();
        if (open) open.end = now;
        g.light.on = false; g.light.since = null;
      } else {
        g.light.log.push({ start: now, end: null, watts: this.activeWatts(g) || 0 });
        g.light.on = true; g.light.since = now;
      }
      this.save();
      return g.light.on;
    },

    lightStats(grow) {
      grow = grow || this.activeGrow();
      if (!grow || !grow.light || !Array.isArray(grow.light.log)) return { hours: 0, kWh: 0, on: false };
      const now = Date.now();
      let hours = 0, kwh = 0;
      grow.light.log.forEach(s => {
        const start = Date.parse(s.start);
        const end = s.end ? Date.parse(s.end) : now;
        const dur = Math.max(0, end - start) / 3600000; // ore
        hours += dur;
        kwh += (s.watts || 0) / 1000 * dur;
      });
      return { hours: U.round(hours, 1), kWh: U.round(kwh, 2), on: !!grow.light.on };
    },

    // Consumi e costi: ore luce (misurate dal pulsante, altrimenti stimate), litri acqua, spese extra
    consumption(grow) {
      grow = grow || this.activeGrow();
      if (!grow) return null;
      const s = this.state.settings;
      const Advice = global.Advice;
      const today = U.todayISO();
      const lightStages = ['germinazione', 'piantina', 'vegetativa', 'fioritura', 'flushing'];
      const flowerStages = ['fioritura', 'flushing'];

      // stima da stadi (fallback se non ci sono accensioni registrate)
      const log = (Array.isArray(grow.stageLog) && grow.stageLog.length)
        ? grow.stageLog.slice().sort((a, b) => a.date.localeCompare(b.date))
        : [{ stage: grow.stage, date: grow.startDate }];
      let estKWh = 0, estHours = 0;
      for (let i = 0; i < log.length; i++) {
        const stage = log[i].stage;
        if (!lightStages.includes(stage)) continue;
        const start = log[i].date;
        const next = log[i + 1] ? log[i + 1].date : U.addDays(today, 1);
        const days = U.daysBetween(start, next);
        if (days <= 0) continue;
        const t = Advice ? Advice.targetFor(stage) : { lightHours: flowerStages.includes(stage) ? 12 : 18 };
        const watts = flowerStages.includes(stage) ? (grow.flowerWatts || 0) : (grow.vegWatts || 0);
        estKWh += (watts / 1000) * (t.lightHours || 0) * days;
        estHours += (t.lightHours || 0) * days;
      }

      const ls = this.lightStats(grow);
      const measured = ls.hours > 0;
      const kWh = measured ? ls.kWh : U.round(estKWh, 2);
      const lightHours = measured ? ls.hours : U.round(estHours, 0);

      let liters = 0;
      this.interventionsFor(grow.id).forEach(i => {
        if (i.type === 'nutrizione') {
          const v = U.num(i.water);           // volume soluzione (L), non la dose ml/L
          if (v) liters += v;
        } else if (i.type === 'irrigazione' || i.type === 'cambio_acqua') {
          const v = U.num(i.water != null ? i.water : i.amount); // volume acqua (L)
          if (v) liters += v;
        }
      });

      const energyCost = U.round(kWh * (s.energyCost || 0), 2);
      const waterCost = U.round(liters * (s.waterCost || 0), 2);
      const extraCost = U.round((grow.expenses || []).reduce((a, e) => a + (U.num(e.amount) || 0), 0), 2);
      return {
        kWh: U.round(kWh, 1),
        lightHours: U.round(lightHours, 1),
        lightMeasured: measured,
        lightOn: ls.on,
        liters: U.round(liters, 1),
        energyCost, waterCost, extraCost,
        total: U.round(energyCost + waterCost + extraCost, 2)
      };
    },

    // Stadio attivo in una certa data (per il calendario)
    stageForDate(grow, iso) {
      if (!grow) return null;
      const log = (Array.isArray(grow.stageLog) && grow.stageLog.length)
        ? grow.stageLog.slice().sort((a, b) => a.date.localeCompare(b.date))
        : [{ stage: grow.stage, date: grow.startDate }];
      let cur = null;
      for (const e of log) { if (U.daysBetween(e.date, iso) >= 0) cur = e.stage; }
      return cur; // null = prima dell'inizio
    },

    /* ---- DIARY ENTRIES ---- */
    addEntry(data) {
      const g = this.activeGrow();
      const e = Object.assign({
        id: U.uid('entry'),
        growId: g ? g.id : null,
        date: U.todayISO(),
        time: U.nowTime(),
        stage: g ? g.stage : null,
        health: 3,
        notes: '',
        tags: [],
        photos: [],
        createdAt: new Date().toISOString()
      }, data || {});
      this.state.entries.push(e);
      this.save();
      return e;
    },

    updateEntry(id, patch) {
      const e = this.state.entries.find(x => x.id === id);
      if (!e) return null;
      Object.assign(e, patch);
      this.save();
      return e;
    },

    removeEntry(id) {
      this.state.entries = this.state.entries.filter(e => e.id !== id);
      this.save();
    },

    entriesFor(growId) {
      return this.state.entries
        .filter(e => e.growId === (growId || (this.activeGrow() || {}).id))
        .sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));
    },

    /* ---- INTERVENTIONS ---- */
    addIntervention(data) {
      const g = this.activeGrow();
      const it = Object.assign({
        id: U.uid('int'),
        growId: g ? g.id : null,
        date: U.todayISO(),
        time: U.nowTime(),
        type: 'irrigazione',
        notes: '',
        createdAt: new Date().toISOString()
      }, data || {});
      this.state.interventions.push(it);
      this.save();
      return it;
    },

    updateIntervention(id, patch) {
      const it = this.state.interventions.find(x => x.id === id);
      if (!it) return null;
      Object.assign(it, patch);
      this.save();
      return it;
    },

    removeIntervention(id) {
      this.state.interventions = this.state.interventions.filter(i => i.id !== id);
      this.save();
    },

    interventionsFor(growId) {
      return this.state.interventions
        .filter(i => i.growId === (growId || (this.activeGrow() || {}).id))
        .sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));
    },

    lastInterventionDate(type) {
      const list = this.interventionsFor().filter(i => !type || i.type === type);
      return list.length ? list[0].date : null;
    },

    /* ---- READINGS (parametri) ---- */
    addReading(data) {
      const g = this.activeGrow();
      const r = Object.assign({
        id: U.uid('read'),
        growId: g ? g.id : null,
        ts: new Date().toISOString(),
        source: 'manual'
      }, data || {});
      if (r.temp != null && r.rh != null && r.vpd == null) {
        r.vpd = U.vpd(r.temp, r.rh, (this.state.settings || {}).leafOffset);
      }
      // normalizza ts: deve essere una stringa ISO (le sorgenti live passano un timestamp numerico)
      if (typeof r.ts !== 'string') r.ts = new Date().toISOString();
      if (!r.date) r.date = r.ts.slice(0, 10);
      this.state.readings.push(r);
      const gid = r.growId;
      const mine = this.state.readings.filter(x => x.growId === gid);
      if (mine.length > 2000) {
        const drop = new Set(mine.sort((a, b) => a.ts.localeCompare(b.ts)).slice(0, mine.length - 2000).map(x => x.id));
        this.state.readings = this.state.readings.filter(x => !drop.has(x.id));
      }
      this.save();
      return r;
    },

    readingsFor(growId) {
      return this.state.readings
        .filter(r => r.growId === (growId || (this.activeGrow() || {}).id))
        .sort((a, b) => a.ts.localeCompare(b.ts));
    },

    latestReading(growId) {
      const list = this.readingsFor(growId);
      return list.length ? list[list.length - 1] : null;
    },

    removeReading(id) {
      this.state.readings = this.state.readings.filter(r => r.id !== id);
      this.save();
    },

    setSetting(path, value) {
      const parts = path.split('.');
      let obj = this.state.settings;
      for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]] = obj[parts[i]] || {};
      obj[parts[parts.length - 1]] = value;
      this.save();
    },

    /* ---- IMPORT / EXPORT ---- */
    exportJSON() {
      return JSON.stringify(this.state, null, 2);
    },

    importJSON(text) {
      const data = JSON.parse(text);
      if (!data || typeof data !== 'object') throw new Error('File non valido');
      this.state = Object.assign(defaultState(), data);
      this.save();
      this.emit('import');
    },

    reset() {
      this.state = defaultState();
      this.save();
    },

    /* ---- DATI DEMO ---- */
    seedDemo() {
      this.state = defaultState();
      const g = this.addGrow({
        name: 'Run #1 — Box 80x80',
        strain: 'Northern Lights Auto',
        genetics: 'Indica dominante · Autofiorente',
        startDate: U.addDays(U.todayISO(), -28),
        stage: 'vegetativa',
        medium: 'Terra (Light Mix) + Perlite',
        potSize: '11 L',
        areaW: 80, areaD: 80, plants: 2,
        lampType: 'LED', vegWatts: 120, flowerWatts: 240,
        light: 'LED Quantum Board 240W dimmerabile',
        schedule: { vegHours: 18, flowerHours: 12 },
        stageLog: [
          { stage: 'germinazione', date: U.addDays(U.todayISO(), -28) },
          { stage: 'piantina', date: U.addDays(U.todayISO(), -24) },
          { stage: 'vegetativa', date: U.addDays(U.todayISO(), -18) }
        ]
      });
      const base = U.addDays(U.todayISO(), -6);
      for (let i = 0; i < 6; i++) {
        const d = U.addDays(base, i);
        const t = 24.5 + Math.sin(i) * 1.2;
        const rh = 58 - i * 1.5;
        this.state.readings.push({
          id: U.uid('read'), growId: g.id,
          ts: new Date(d + 'T09:00:00').toISOString(), date: d,
          temp: U.round(t, 1), rh: U.round(rh, 0), vpd: U.vpd(t, rh, 2),
          ph: U.round(6.1 + (i % 3) * 0.05, 2), ec: U.round(1.3 + i * 0.03, 2),
          ppfd: 420, co2: 500, source: 'demo'
        });
      }
      this.state.interventions.push(
        { id: U.uid('int'), growId: g.id, date: U.addDays(U.todayISO(), -2), time: '18:30', type: 'irrigazione', amount: '2', ph: 6.2, ec: 1.4, waterTemp: 20, notes: 'Acqua decantata 24h.' },
        { id: U.uid('int'), growId: g.id, date: U.addDays(U.todayISO(), -2), time: '18:35', type: 'nutrizione', product: 'BioBizz Bio Grow', amount: '1 ml/L', ph: 6.2, ec: 1.4, notes: 'Prima settimana a meta dose.' },
        { id: U.uid('int'), growId: g.id, date: U.addDays(U.todayISO(), -1), time: '09:00', type: 'training', notes: 'LST: legati 4 rami principali per aprire la chioma.' }
      );
      this.state.entries.push(
        { id: U.uid('entry'), growId: g.id, date: U.todayISO(), time: '09:10', stage: 'vegetativa', health: 4, notes: 'Crescita vigorosa, internodi corti. Foglie di un bel verde, nessun segno di carenza. Pulizia foglie basse.', tags: ['salute ok'], photos: [] },
        { id: U.uid('entry'), growId: g.id, date: U.addDays(U.todayISO(), -3), time: '08:45', stage: 'vegetativa', health: 4, notes: 'Prima applicazione di LST. Recuperata bene in 24h.', tags: ['training'], photos: [] }
      );
      g.expenses = [
        { id: U.uid('exp'), date: U.addDays(U.todayISO(), -28), label: 'Semi (2x autofiorente)', amount: 22 },
        { id: U.uid('exp'), date: U.addDays(U.todayISO(), -14), label: 'Fertilizzanti BioBizz', amount: 18.5 },
        { id: U.uid('exp'), date: U.addDays(U.todayISO(), -10), label: 'Terriccio + perlite', amount: 12 }
      ];
      const nowMs = Date.now();
      g.light = {
        on: false, since: null,
        log: [
          { start: new Date(nowMs - 20 * 3600000).toISOString(), end: new Date(nowMs - 14 * 3600000).toISOString(), watts: 120 },
          { start: new Date(nowMs - 6 * 3600000).toISOString(), end: new Date(nowMs - 1 * 3600000).toISOString(), watts: 120 }
        ]
      };
      this.save();
      return g;
    }
  };

  global.Store = Store;
})(window);
