/* ==========================================================================
   Maria — app.js : controller UI (router, viste, eventi)
   ========================================================================== */
(function (global) {
  'use strict';
  const U = global.U, Store = global.Store, Advice = global.Advice,
        Alerts = global.Alerts, Live = global.Live, Charts = global.Charts;

  const ICONS = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 21v-7"/><path d="M12 14c0-4.2 3.4-7 8-7 0 5-4.2 7.2-8 7.2z"/><path d="M12 14c0-4.2-3.4-7-8-7 0 5 4.2 7.2 8 7.2z"/></svg>',
    diary: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z"/><path d="M6 3v18"/><path d="M10 8h5M10 12h5M10 16h3"/></svg>',
    live: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M3 12h3l2.5-7 4 14 2.5-7H21"/></svg>',
    tools: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M8 7.5h8"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 16h.01M12 16h.01M15.5 16h.01"/></svg>',
    water: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M15 5l-7 7 7 7"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M12 20V6M6 12l6-6 6 6"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>'
  };

  const TABS = [
    { id: 'home',   label: 'Home',      icon: ICONS.home },
    { id: 'diary',  label: 'Diario',    icon: ICONS.diary },
    { id: 'live',   label: 'Live',      icon: ICONS.live },
    { id: 'tools',  label: 'Strumenti', icon: ICONS.tools }
  ];

  const App = {
    screen: 'home',
    ICONS,
    diaryMode: 'list',   // 'list' | 'calendar'
    paramsPeriod: 'giorno', // 'giorno' | 'notte'
    calY: null,          // anno del calendario mostrato (null = mese corrente)
    calM: null,          // mese del calendario (0-11)

    init() {
      Store.init();
      if (!Store.state.grows.length) {
        // primo avvio: nessuna grow -> mostra onboarding
      }
      Live.init();
      Live.onSample(() => { if (this.screen === 'live' || this.screen === 'home') this.refreshLiveDom(); });
      Live.onStatus(() => { this.render(); });

      this.bindEvents();
      this.render();

      // aggiorna il cronometro della luce ogni minuto
      try { setInterval(() => { if (this.screen === 'home') this.updateLightClock(); }, 60000); } catch (e) {}

      // registra il service worker
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./service-worker.js').catch(() => {});
      }
    },

    grow() { return Store.activeGrow(); },
    target() { const g = this.grow(); return Advice.targetFor(g ? g.stage : 'vegetativa'); },
    wattsNow(g) {
      g = g || this.grow();
      if (!g) return null;
      return (g.stage === 'fioritura' || g.stage === 'flushing') ? (g.flowerWatts || null) : (g.vegWatts || null);
    },

    phaseInfo(g, iso) {
      const stage = Store.stageForDate(g, iso || U.todayISO());
      const st = Store.STAGES.find(s => s.id === stage);
      const veg = ['germinazione', 'piantina', 'vegetativa'];
      const flow = ['fioritura', 'flushing'];
      const cls = flow.includes(stage) ? 'flower' : veg.includes(stage) ? 'veg' : 'dry';
      const phase = flow.includes(stage) ? 'Fioritura' : veg.includes(stage) ? 'Vegetativa' : (st ? st.label : '—');
      return { stage, label: st ? st.label : '—', phase, cls };
    },

    // stima settimane dal seme alla raccolta
    totalWeeks() {
      const idx = Store.STAGES.findIndex(s => s.id === 'raccolta');
      const days = Store.STAGES.slice(0, idx + 1).reduce((a, s) => a + s.days, 0);
      return Math.ceil(days / 7);
    },

    weeksHTML(g) {
      const idx = Store.STAGES.findIndex(s => s.id === 'raccolta');
      const plan = Store.STAGES.slice(0, idx + 1);
      let acc = 0;
      const cum = plan.map(s => { acc += s.days; return { stage: s.id, end: acc }; });
      const plannedStage = (dayNo) => { for (const c of cum) { if (dayNo <= c.end) return c.stage; } return plan[plan.length - 1].id; };

      const totalWeeks = this.totalWeeks();
      const curWeek = Math.max(1, Advice.weekOf(g));
      const today = U.todayISO();
      let cells = '';
      for (let w = 1; w <= totalWeeks; w++) {
        const midIso = U.addDays(g.startDate, (w - 1) * 7 + 3);
        const isPast = U.daysBetween(midIso, today) >= 0;
        const stage = isPast ? Store.stageForDate(g, midIso) : plannedStage((w - 1) * 7 + 4);
        const isFlow = ['fioritura', 'flushing'].includes(stage);
        const isNow = w === curWeek;
        const isFuture = w > curWeek;
        const color = this.colorFor(stage);
        const style = (!isFuture && stage) ? `style="background:${color}22;border-color:${color}66"` : '';
        cells += `<div class="wk ${isFuture ? 'future' : 'done'}${isNow ? ' now' : ''}" ${style}><span class="n">${w}</span><span class="f">${stage ? (isFlow ? 'Flow' : 'Veg') : '·'}</span></div>`;
      }
      return `<div class="weeks">${cells}</div>`;
    },

    go(screen) { this.screen = screen; this.render(); window.scrollTo(0, 0); },

    render() {
      const g = this.grow();
      const el = U.$('#app');
      el.innerHTML = this.headerHTML(g) + `<main id="screen">${this.screenHTML()}</main>` + this.tabbarHTML() + `<div class="toast-wrap"></div>`;
      if (this.screen === 'live') this.refreshLiveDom();
      if (this.screen === 'tools') this.runCalc();
      if (this.screen === 'home') this.updateLightClock();
    },

    screenHTML() {
      switch (this.screen) {
        case 'home':  return this.viewHome();
        case 'diary': return this.viewDiary();
        case 'live':  return this.viewLive();
        case 'tools': return this.viewTools();
        default:      return this.viewHome();
      }
    },

    headerHTML(g) {
      const nAlerts = g ? Alerts.count(g) : 0;
      const bell = `<button class="icon-btn" data-action="go" data-screen="home" style="position:relative" aria-label="Vai alla home">${ICONS.bell}${nAlerts ? `<span style="position:absolute;top:-4px;right:-4px;background:var(--red);color:#fff;font-size:10px;font-weight:800;border-radius:999px;min-width:17px;height:17px;display:grid;place-items:center;padding:0 4px">${nAlerts}</span>` : ''}</button>`;
      // Il nome dell'app resta SEMPRE fisso; la scheda corrente va nel sottotitolo
      const sec = { home: '', diary: 'Diario', live: 'Live', tools: 'Strumenti' }[this.screen] || '';
      const sub = [sec, U.fmtDate(U.todayISO())].filter(Boolean).join(' · ');
      return `<header class="app-header">
        <div class="brand-dot">${ICONS.arrow}</div>
        <div class="app-name" style="flex:1">GROW FAST <span style="color:var(--green)">&amp;</span> GROW BIG !!<small>${U.esc(sub)}</small></div>
        ${bell}
      </header>`;
    },

    tabbarHTML() {
      return `<nav class="tabbar">${TABS.map(tb => `
        <button class="${this.screen === tb.id ? 'active' : ''}" data-action="go" data-screen="${tb.id}">
          ${tb.icon}<span>${tb.label}</span>
        </button>`).join('')}</nav>`;
    },

    /* ---------- header dinamico dello schermo vuoto ---------- */
    emptyGrow() {
      return `<div class="screen"><div class="empty">
        <div class="big">🌱</div>
        <p>Nessuna coltivazione presente.<br>Crea la tua prima coltivazione, <b>importa un backup</b> per ripartire da dove eri, o carica la demo.</p>
        <div class="row-btns" style="justify-content:center;margin-top:14px">
          <button class="btn primary" data-action="new-grow">+ Nuova coltivazione</button>
          <button class="btn" data-action="import">⬆️ Importa backup</button>
          <button class="btn" data-action="demo">🎬 Carica demo</button>
        </div>
        <p class="mute2" style="font-size:12px;margin-top:12px">Hai già un file di backup (growfast-backup-*.json)? Importalo e ritrovi diario, interventi, parametri, spese e tariffe.</p>
      </div></div>`;
    },

    /* ================= HOME ================= */
    viewHome() {
      const g = this.grow();
      if (!g) return this.emptyGrow();
      const t = Advice.targetFor(g.stage);
      const stage = Store.STAGES.find(s => s.id === g.stage) || Store.STAGES[2];
      const stages = Store.STAGES;
      const idx = stages.findIndex(s => s.id === g.stage);
      const day = U.dayNumber(g.startDate);
      const alerts = Alerts.compute(g);
      const ph = this.phaseInfo(g);
      const curWeek = Math.max(1, Advice.weekOf(g));
      const totalWeeks = this.totalWeeks();
      const cons = Store.consumption(g);
      const la = Advice.lightAdvice(g);
      const lt = this.lightToday(g);

      const rail = stages.map((s, i) =>
        `<div class="st ${i < idx ? 'done' : i === idx ? 'now' : ''}"></div>`).join('');

      return `<div class="screen">
        <div class="dateline">
          <span class="d">📅 ${U.fmtDate(U.todayISO())}</span>
          <span class="h">${U.esc(ph.phase)} · sett. ${curWeek}/${totalWeeks}</span>
        </div>

        <div class="hero">
          <div class="h-top">
            <div>
              <div class="flex gap8 aic"><span class="phase-badge ${ph.cls}">${U.esc(ph.phase)}</span><span class="muted" style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.6px">${U.esc(stage.label)}</span></div>
              <div class="flex gap8 aic">
                <span class="h-name" style="margin:0">${U.esc(g.strain || g.name)}</span>
                <button class="info-btn" data-action="strain-info" aria-label="Info varietà">i</button>
              </div>
              <div class="h-sub">${U.esc(g.genetics || g.medium || '')}</div>
            </div>
            <div class="h-day"><div class="n">${day}</div><div class="l">giorno</div></div>
          </div>
          <div class="stage-rail">${rail}</div>
          <div class="progress"><i style="width:${Math.min(100, (idx + 0.5) / stages.length * 100).toFixed(0)}%"></i></div>
          <div class="flex between mt12">
            <span class="muted" style="font-size:12px">Inizio ${U.fmtDate(g.startDate, 'short')}</span>
            <span class="muted" style="font-size:12px">Settimana ${curWeek} di ~${totalWeeks}</span>
          </div>
          <div class="chip-group mt12" style="gap:6px">
            ${(g.areaW && g.areaD) ? `<span class="pill blue">📐 ${g.areaW}×${g.areaD} cm</span>` : ''}
            ${g.plants ? `<span class="pill green">🌿 ${g.plants} ${g.plants === 1 ? 'pianta' : 'piante'}</span>` : ''}
            ${g.lampType ? `<span class="pill amber">💡 ${U.esc(g.lampType)}${this.wattsNow(g) ? ' ' + this.wattsNow(g) + 'W' : ''}</span>` : ''}
          </div>
        </div>

        <div class="section-title">⚡ Azioni rapide</div>
        <div class="quick">
          <button class="qbtn water" data-action="quick-water"><span class="qi">💧</span><span>Acqua<br><small class="mute2">litri irrigati</small></span></button>
          <button class="qbtn feed" data-action="quick-feed"><span class="qi">🧪</span><span>Fertilizzante<br><small class="mute2">marca · tipo · dose</small></span></button>
          <button class="qbtn" data-action="quick-photo"><span class="qi">📷</span><span>Foto<br><small class="mute2">con data</small></span></button>
          <button class="qbtn" data-action="timelapse"><span class="qi">🎞️</span><span>Time-lapse<br><small class="mute2">tutte le foto</small></span></button>
          <button class="qbtn" data-action="add-entry"><span class="qi">📝</span><span>Nota giorno</span></button>
          <button class="qbtn" data-action="add-intervention"><span class="qi">🔧</span><span>Intervento</span></button>
        </div>

        <div class="section-title">💡 Consiglio del giorno</div>
        <div class="card">${this.adviceList(g)}</div>

        <div class="section-title">🕘 Ultime attività</div>
        ${this.recentActivity(g)}

        <div class="section-title">Parametri <span class="badge-live ${Live.mode === 'off' ? 'off' : ''}"><span class="dot"></span>${Live.mode === 'off' ? 'offline' : Live.mode}</span></div>
        <div class="seg" style="margin-bottom:10px">
          <button class="${this.paramsPeriod === 'giorno' ? 'active' : ''}" data-action="params-period" data-period="giorno">☀️ Giorno</button>
          <button class="${this.paramsPeriod === 'notte' ? 'active' : ''}" data-action="params-period" data-period="notte">🌙 Notte</button>
        </div>
        <div class="grid grid-2 wide" id="home-kpis">${this.homeKpisHTML(g)}</div>
        <div class="hint mt8">Scegli ☀️ Giorno o 🌙 Notte: ogni lettura è salvata nel suo momento e la ritrovi nel report.</div>
        <div class="row-btns mt12">
          <button class="btn primary sm" data-action="quick-reading">＋ Lettura ${this.paramsPeriod === 'notte' ? 'notte' : 'giorno'}</button>
          <button class="btn sm" data-action="go" data-screen="live">📡 Live</button>
        </div>

        <div class="section-title">Fase & Lampada</div>
        <div class="card">
          <div class="field" style="margin-bottom:10px"><label>Fase attuale (toccane una)</label>
            <div class="chip-group">${stages.map(s => `<button class="chip ${g.stage === s.id ? 'active' : ''}" data-action="set-stage" data-stage="${s.id}">${s.label}</button>`).join('')}</div>
          </div>
          <div class="field"><label>Tipo lampada</label>
            <select class="select" data-action="grow-field" data-field="lampType">${Advice.LAMP_TYPES.map(x => `<option value="${U.esc(x)}" ${g.lampType === x ? 'selected' : ''}>${U.esc(x)}</option>`).join('')}</select>
          </div>
          <div class="field-row">
            <div class="field"><label>Watt in vegetativa</label><input class="input" type="number" inputmode="numeric" data-action="grow-field" data-field="vegWatts" value="${U.numStr(g.vegWatts)}" placeholder="es. 250"></div>
            <div class="field"><label>Watt in fioritura</label><input class="input" type="number" inputmode="numeric" data-action="grow-field" data-field="flowerWatts" value="${U.numStr(g.flowerWatts)}" placeholder="es. 400"></div>
          </div>
          ${la ? `<div class="hint mt8">💡 Consiglio potenza: per ${U.fmt(la.areaM2, 2)} m² con ${U.esc(g.lampType)} → <b>${la.recommended[0]}–${la.recommended[1]} W</b>${la.current ? ` (ora ${la.current} W · ${la.currentWPerM2} W/m² → ${la.status === 'ok' ? 'ok ✅' : la.status === 'low' ? 'un po’ bassa' : 'alta'})` : ''}.</div>` : ''}
        </div>

        <div class="section-title">🔆 Luce & timer <span class="mute2">${cons.lightMeasured ? 'misurata' : 'da timer'}</span></div>
        <div class="card">
          <div class="field-row">
            <div class="field"><label>Timer vegetativa (h/giorno)</label><input class="input" type="number" inputmode="numeric" data-action="grow-field" data-field="schedule.vegHours" value="${U.numStr(g.schedule.vegHours)}"></div>
            <div class="field"><label>Timer fioritura (h/giorno)</label><input class="input" type="number" inputmode="numeric" data-action="grow-field" data-field="schedule.flowerHours" value="${U.numStr(g.schedule.flowerHours)}"></div>
          </div>
          <div class="field-row">
            <div class="field"><label>Veg · ON</label><input class="input" type="time" data-action="grow-field" data-field="schedule.vegOn" value="${U.esc(g.schedule.vegOn || '')}"></div>
            <div class="field"><label>Veg · OFF</label><input class="input" type="time" data-action="grow-field" data-field="schedule.vegOff" value="${U.esc(g.schedule.vegOff || '')}"></div>
          </div>
          <div class="field-row">
            <div class="field"><label>Fioritura · ON</label><input class="input" type="time" data-action="grow-field" data-field="schedule.flowerOn" value="${U.esc(g.schedule.flowerOn || '')}"></div>
            <div class="field"><label>Fioritura · OFF</label><input class="input" type="time" data-action="grow-field" data-field="schedule.flowerOff" value="${U.esc(g.schedule.flowerOff || '')}"></div>
          </div>
          <div class="hint">Orari accensione/spegnimento: vengono salvati nel report e usati nei consigli del giorno. Se li lasci vuoti il timer conta solo le ore/giorno.</div>
          <div class="toggle-row" style="padding-top:10px">
            <div>
              <div class="t-title">${cons.lightOn ? '💡 Luce ACCESA' : '🌑 Luce spenta'}</div>
              <div class="t-sub" id="light-elapsed">—</div>
            </div>
            <button class="btn ${cons.lightOn ? 'danger' : 'primary'} sm" data-action="light-toggle">${cons.lightOn ? '⏻ Spegni' : '⏻ Accendi'}</button>
          </div>
          <div class="cons mt12">
            <div class="box"><div class="l">Oggi ${lt.measured ? '(reale)' : '(timer)'}</div><div class="v mono">${U.fmt(lt.on, 1)}<span class="unit">h ON</span></div><div class="l" style="margin-top:5px;text-transform:none">${U.fmt(24 - lt.on, 1)} h OFF</div></div>
            <div class="box"><div class="l">Totale ore</div><div class="v mono">${U.fmt(cons.lightHours, 0)}<span class="unit">h</span></div><div class="l" style="margin-top:5px;text-transform:none">${day} giorni</div></div>
            <div class="box span2"><div class="l">Energia · ${cons.kWh} kWh</div><div class="v mono">${U.fmt(cons.energyCost, 2)}<span class="unit">€</span></div><div class="l" style="margin-top:5px;text-transform:none">${cons.lightMeasured ? 'misurata con accendi/spegni' : 'conteggio automatico dal timer'}</div></div>
          </div>
          <div class="hint mt8">Il contatore somma ogni giorno le ore ON/OFF in base al timer, dall'inizio fino ad oggi. Il pulsante ⏻ registra le ore reali (più precise).</div>
        </div>

        <div class="section-title">Consumi & Costi</div>
        <div class="card">
          <div class="cons">
            <div class="box"><div class="l">Luce · ${U.fmt(cons.lightHours, 0)} h</div><div class="v mono">${cons.kWh}<span class="unit">kWh</span></div><div class="l" style="margin-top:5px;text-transform:none">≈ ${U.fmt(cons.energyCost, 2)} €${cons.lightMeasured ? '' : ' · stima'}</div></div>
            <div class="box"><div class="l">Acqua</div><div class="v mono">${cons.liters}<span class="unit">L</span></div><div class="l" style="margin-top:5px;text-transform:none">≈ ${U.fmt(cons.waterCost, 2)} €</div></div>
            <div class="box span2"><div class="l">Costo totale stimato</div><div class="v mono">${U.fmt(cons.total, 2)}<span class="unit">€</span></div><div class="l" style="margin-top:5px;text-transform:none">energia ${U.fmt(cons.energyCost, 2)} € · acqua ${U.fmt(cons.waterCost, 2)} € · spese ${U.fmt(cons.extraCost, 2)} €</div></div>
          </div>
          <div class="field-row mt12">
            <div class="field"><label>Energia (€/kWh)</label><input class="input" type="number" step="0.01" inputmode="decimal" value="${U.numStr(Store.state.settings.energyCost, 3)}" data-action="setting" data-key="energyCost"></div>
            <div class="field"><label>Acqua (€/L)</label><input class="input" type="number" step="0.001" inputmode="decimal" value="${U.numStr(Store.state.settings.waterCost, 4)}" data-action="setting" data-key="waterCost"></div>
          </div>
          ${(g.expenses || []).length ? `<div class="mt12">${g.expenses.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(e => `<div class="exp-row"><div class="lab"><div>${U.esc(e.label)}</div><div class="d">${U.fmtDate(e.date, 'short')}</div></div><span class="amt mono">${U.fmt(e.amount, 2)} €</span><button class="btn sm ghost" data-action="del-expense" data-id="${e.id}" style="color:var(--red)">🗑️</button></div>`).join('')}</div>` : ''}
          <div class="row-btns mt12">
            <button class="btn sm primary" data-action="add-expense">＋ Aggiungi spesa</button>
            <button class="btn sm" data-action="report">📄 Report / Stampa</button>
          </div>
        </div>

        <div class="section-title">Alert <span class="mute2">${alerts.filter(a => a.level !== 'ok').length}</span></div>
        ${alerts.slice(0, 4).map(a => this.alertHTML(a)).join('')}

        ${this.configHTML(g)}
      </div>`;
    },

    kpiHTML(label, value, unit, range, dec) {
      const has = value != null && !isNaN(value);
      let status = 'ok', pct = 50;
      if (has && range) {
        const lo = range[0], hi = range[1];
        if (value < lo) { status = (value < lo - (hi - lo) * 0.5) ? 'bad' : 'warn'; }
        else if (value > hi) { status = (value > hi + (hi - lo) * 0.5) ? 'bad' : 'warn'; }
        pct = U.clamp(((value - lo) / (hi - lo)) * 100, 6, 100);
      }
      const targetTxt = range ? `${U.fmt(range[0], dec)}–${U.fmt(range[1], dec)}` : '';
      return `<div class="kpi ${has ? status : ''}">
        <div class="k-label">${label}</div>
        <div class="k-value mono">${has ? U.fmt(value, dec) : '—'}${has && unit ? `<span class="unit">${unit}</span>` : ''}</div>
        <div class="k-target">target ${targetTxt}${unit ? ' ' + unit : ''}</div>
        <div class="k-bar"><i style="width:${has ? pct : 0}%"></i></div>
      </div>`;
    },

    homeKpisHTML(g) {
      const t = this.target();
      const p = this.paramsPeriod || 'giorno';
      const r = Store.latestReading(g.id, p) || {};
      const tempRange = (p === 'notte') ? t.tempN : t.tempD;
      return this.kpiHTML((p === 'notte' ? '🌙 Temperatura notte' : '☀️ Temperatura giorno'), r.temp, '°C', tempRange, 1) +
        this.kpiHTML('Umidità ' + p, r.rh, '%', t.rh, 0) +
        this.kpiHTML('VPD', r.vpd, 'kPa', t.vpd, 2) +
        this.kpiHTML('pH', r.ph, '', t.phSoil, 1);
    },

    adviceList(g) {
      const wd = Store.lastInterventionDate('irrigazione');
      const fd = Store.lastInterventionDate('nutrizione');
      const ctx = {
        week: Advice.weekOf(g),
        reading: Store.latestReading(g.id, this.paramsPeriod) || Store.latestReading(g.id),
        daysSinceWater: wd ? U.daysBetween(wd, U.todayISO()) : null,
        daysSinceFeed: fd ? U.daysBetween(fd, U.todayISO()) : null
      };
      const list = Advice.dailyAdvice(g, ctx);
      if (!list.length) return '<div class="muted center">Nessun consiglio per oggi.</div>';
      return list.map(a => `<div class="adv-item">
        <div class="adv-ic">${a.icon}</div>
        <div><div class="adv-tt">${U.esc(a.title)}</div><div class="adv-ds">${U.esc(a.text)}</div></div>
      </div>`).join('');
    },

    alertHTML(a) {
      return `<div class="alert-item ${a.level}">
        <div class="a-ic">${a.icon}</div>
        <div><div class="a-tt">${U.esc(a.title)}</div><div class="a-ds">${U.esc(a.text)}</div></div>
      </div>`;
    },

    recentActivity(g) {
      const items = [];
      Store.entriesFor(g.id).slice(0, 3).forEach(e => items.push({
        ts: e.date + (e.time || ''), icon: '📝', title: 'Nota: ' + Advice.healthLabel(e.health),
        sub: (e.notes || '').slice(0, 70)
      }));
      Store.interventionsFor(g.id).slice(0, 3).forEach(i => {
        const type = Store.INTERVENTION_TYPES.find(x => x.id === i.type) || {};
        items.push({ ts: i.date + (i.time || ''), icon: type.icon || '🔧', title: type.label || i.type, sub: i.notes || '' });
      });
      items.sort((a, b) => b.ts.localeCompare(a.ts));
      if (!items.length) return `<div class="card center muted">Ancora nessuna attività registrata.</div>`;
      return items.slice(0, 5).map(it => `<div class="entry" style="margin-top:10px">
        <div class="e-icon">${it.icon}</div>
        <div class="e-body"><div class="e-title">${U.esc(it.title)}</div>${it.sub ? `<div class="e-sub">${U.esc(it.sub)}</div>` : ''}</div>
        <div class="e-date">${U.relDay(it.ts.slice(0, 10))}</div>
      </div>`).join('');
    },

    /* ================= DIARIO ================= */
    viewDiary() {
      const g = this.grow();
      if (!g) return this.emptyGrow();
      const entries = Store.entriesFor(g.id);
      const interventions = Store.interventionsFor(g.id);

      const timeline = [];
      entries.forEach(e => timeline.push({ kind: 'entry', ts: e.date + (e.time || ''), data: e }));
      interventions.forEach(i => timeline.push({ kind: 'int', ts: i.date + (i.time || ''), data: i }));
      timeline.sort((a, b) => b.ts.localeCompare(a.ts));

      const todayEntry = entries.find(e => e.date === U.todayISO());
      const calendar = this.diaryMode === 'calendar';

      return `<div class="screen">
        <div class="card" style="display:flex;gap:12px;align-items:center">
          <div style="font-size:28px">${todayEntry ? '✅' : '📝'}</div>
          <div class="grow">
            <div style="font-weight:700">${todayEntry ? 'Nota di oggi registrata' : 'Non hai ancora scritto la nota di oggi'}</div>
            <div class="muted" style="font-size:12.5px">${entries.length} note · ${interventions.length} interventi</div>
          </div>
          <button class="btn primary sm" data-action="add-entry">+ Nota</button>
        </div>

        <div class="row-btns mt12">
          <button class="btn sm" data-action="add-intervention">🔧 Intervento</button>
          <button class="btn sm" data-action="quick-reading">📈 Parametri</button>
          <button class="btn sm" data-action="go" data-screen="tools">🧮 Strumenti</button>
        </div>

        <div class="seg mt16">
          <button class="${!calendar ? 'active' : ''}" data-action="diary-mode" data-mode="list">📋 Elenco</button>
          <button class="${calendar ? 'active' : ''}" data-action="diary-mode" data-mode="calendar">🗓️ Calendario</button>
        </div>

        ${calendar
          ? this.calendarHTML(g)
          : `<div class="section-title">Timeline</div>
             ${timeline.length ? timeline.map(it => it.kind === 'entry' ? this.entryCard(it.data) : this.intCard(it.data)).join('')
               : `<div class="empty"><div class="big">📖</div><p>Il diario è vuoto. Inizia ad annotare la tua giornata!</p></div>`}`}
      </div>`;
    },

    entryCard(e) {
      const stars = [1, 2, 3, 4, 5].map(i => `<span style="color:${i <= e.health ? 'var(--lime)' : '#3a5044'}">★</span>`).join('');
      return `<div class="entry">
        <div class="e-icon">📝</div>
        <div class="e-body">
          <div class="flex between aic">
            <div class="e-title">Nota giornaliera</div>
            <div class="e-date">${U.fmtDate(e.date, 'short')}${e.time ? ' · ' + e.time : ''}</div>
          </div>
          <div class="e-sub">Salute: <span class="mono">${stars}</span> · ${Advice.healthLabel(e.health)}</div>
          ${e.notes ? `<div class="e-notes">${U.esc(e.notes)}</div>` : ''}
          ${(e.tags || []).length ? `<div class="mt8">${e.tags.map(t => `<span class="pill green">#${U.esc(t)}</span>`).join(' ')}</div>` : ''}
          ${(e.photos || []).length ? `<div class="photo-grid">${e.photos.map(p => `<img src="${p}" alt="foto">`).join('')}</div>` : ''}
          <div class="e-actions mt8">
            <button class="btn sm ghost" data-action="edit-entry" data-id="${e.id}">✏️</button>
            <button class="btn sm ghost" data-action="del-entry" data-id="${e.id}" style="color:var(--red)">🗑️</button>
          </div>
        </div>
      </div>`;
    },

    intCard(i) {
      const type = Store.INTERVENTION_TYPES.find(x => x.id === i.type) || { icon: '🔧', label: i.type };
      const bits = [];
      if (i.amount) bits.push(`dose ${U.esc(i.amount)}`);
      if (i.product) bits.push(U.esc(i.product));
      if (i.ph != null) bits.push(`pH ${U.fmt(i.ph, 1)}`);
      if (i.ec != null) bits.push(`EC ${U.fmt(i.ec, 2)}`);
      if (i.waterTemp != null) bits.push(`H₂O ${U.fmt(i.waterTemp, 0)}°C`);
      if (i.hours) bits.push(`${U.esc(i.hours)}h luce`);
      if (i.potSize) bits.push(`vaso ${U.esc(i.potSize)}`);
      return `<div class="entry">
        <div class="e-icon">${type.icon}</div>
        <div class="e-body">
          <div class="flex between aic">
            <div class="e-title">${U.esc(type.label)}</div>
            <div class="e-date">${U.fmtDate(i.date, 'short')}${i.time ? ' · ' + i.time : ''}</div>
          </div>
          ${bits.length ? `<div class="e-sub">${bits.join(' · ')}</div>` : ''}
          ${i.notes ? `<div class="e-notes">${U.esc(i.notes)}</div>` : ''}
          <div class="e-actions mt8">
            <button class="btn sm ghost" data-action="edit-intervention" data-id="${i.id}">✏️</button>
            <button class="btn sm ghost" data-action="del-intervention" data-id="${i.id}" style="color:var(--red)">🗑️</button>
          </div>
        </div>
      </div>`;
    },

    /* ================= CALENDARIO ================= */
    colorFor(stageId) {
      const map = { germinazione: '#b48bff', piantina: '#4aa8ff', vegetativa: '#37d67a', fioritura: '#a8e05f', flushing: '#4aa8ff', raccolta: '#ffb020', essiccazione: '#ffb020', concia: '#b48bff' };
      return map[stageId] || '#37d67a';
    },

    shiftMonth(delta) {
      const now = new Date();
      const y = this.calY != null ? this.calY : now.getFullYear();
      const m = this.calM != null ? this.calM : now.getMonth();
      const d = new Date(y, m + delta, 1);
      this.calY = d.getFullYear();
      this.calM = d.getMonth();
      this.render();
    },

    calendarHTML(g) {
      const now = new Date();
      const y = this.calY != null ? this.calY : now.getFullYear();
      const m = this.calM != null ? this.calM : now.getMonth();
      const first = new Date(y, m, 1);
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      const offset = (first.getDay() + 6) % 7; // lunedì = 0
      const monthName = first.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });

      const notesBy = {}, intsBy = {}, readsBy = {};
      Store.entriesFor(g.id).forEach(e => { notesBy[e.date] = (notesBy[e.date] || 0) + 1; });
      Store.interventionsFor(g.id).forEach(i => { intsBy[i.date] = (intsBy[i.date] || 0) + 1; });
      Store.readingsFor(g.id).forEach(r => { const d = r.date || (r.ts || '').slice(0, 10); readsBy[d] = (readsBy[d] || 0) + 1; });

      const wd = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].map(d => `<div class="cal-wd">${d}</div>`).join('');

      let cells = '';
      for (let i = 0; i < offset; i++) cells += `<div class="cal-day empty"></div>`;
      for (let day = 1; day <= daysInMonth; day++) {
        const iso = U.dateToISO(new Date(y, m, day));
        const isFuture = U.daysBetween(iso, U.todayISO()) < 0;
        const stage = isFuture ? null : Store.stageForDate(g, iso);
        const isToday = iso === U.todayISO();
        const color = this.colorFor(stage);
        const dots = (notesBy[iso] ? `<i class="d-note"></i>` : '') +
                     (intsBy[iso] ? `<i class="d-int"></i>` : '') +
                     (readsBy[iso] ? `<i class="d-read"></i>` : '');
        const style = stage ? `style="background:${color}22;border-color:${color}66"` : '';
        const cls = `cal-day${stage ? '' : ' out'}${isToday ? ' today' : ''}`;
        cells += `<button class="${cls}" ${style} data-action="cal-day" data-date="${iso}">${day}${dots ? `<span class="dots">${dots}</span>` : ''}</button>`;
      }

      const usedStages = [...new Set(((g.stageLog && g.stageLog.length) ? g.stageLog : [{ stage: g.stage }]).map(s => s.stage))];
      const legend = usedStages.map(sid => {
        const st = Store.STAGES.find(x => x.id === sid) || {};
        return `<span><i style="background:${this.colorFor(sid)}"></i>${U.esc(st.label || sid)}</span>`;
      }).join('') +
        `<span><i class="d-note" style="border-radius:50%"></i>Nota</span>` +
        `<span><i class="d-int" style="border-radius:50%"></i>Intervento</span>` +
        `<span><i class="d-read" style="border-radius:50%"></i>Parametro</span>`;

      return `<div class="cal-head">
          <button class="icon-btn" data-action="cal-prev">‹</button>
          <div class="cal-month">${U.esc(monthName)}</div>
          <div class="cal-nav">
            <button class="btn sm ghost" data-action="cal-today" style="padding:6px 10px">Oggi</button>
            <button class="icon-btn" data-action="cal-next">›</button>
          </div>
        </div>
        <div class="cal-legend" style="margin:0 0 8px">${legend}</div>
        <div class="cal-grid">${wd}${cells}</div>
        <div class="hint mt8">Colore per stadio fino ad oggi (il futuro resta grigio). Tocca un giorno per i dettagli.</div>`;
    },

    dayDetail(iso) {
      const g = this.grow();
      if (!g) return;
      const entries = Store.entriesFor(g.id).filter(e => e.date === iso);
      const ints = Store.interventionsFor(g.id).filter(i => i.date === iso);
      const stage = Store.stageForDate(g, iso);
      const st = Store.STAGES.find(s => s.id === stage);
      const body = `
        <div class="muted mb12">${U.esc(st ? st.label : 'Prima dell’inizio')} · giorno ${U.dayNumber(g.startDate, iso)}</div>
        ${entries.map(e => this.entryCard(e)).join('')}
        ${ints.map(i => this.intCard(i)).join('')}
        ${(!entries.length && !ints.length) ? '<div class="empty" style="padding:20px">Nessuna nota né intervento in questa data.</div>' : ''}
        <div class="row-btns mt16">
          <button class="btn sm primary" data-action="day-add-note" data-date="${iso}">📝 Nota</button>
          <button class="btn sm" data-action="day-add-int" data-date="${iso}">🔧 Intervento</button>
        </div>`;
      this.openModal(U.fmtDate(iso), body, { confirmLabel: 'Chiudi', onConfirm: () => {} });
    },

    /* ================= LIVE ================= */
    viewLive() {
      const g = this.grow();
      if (!g) return this.emptyGrow();
      const t = Advice.targetFor(g.stage);
      const last = Live.value || Store.latestReading(g.id) || {};
      const active = Live.mode !== 'off';

      return `<div class="screen">
        <div class="card">
          <div class="flex between aic">
            <div>
              <div class="flex gap8 aic"><span class="badge-live ${Live.mode === 'off' ? 'off' : ''}"><span class="dot"></span>${Live.mode === 'off' ? 'OFFLINE' : Live.mode === 'sim' ? 'SIMULAZIONE' : 'REMOTO'}</span></div>
              <div class="muted" style="font-size:12.5px;margin-top:4px">${Live.mode === 'remote' ? (Live.connected ? 'Connesso al controller' : 'Connessione…') : Live.mode === 'sim' ? 'Generatore locale (nessun hardware)' : 'Nessuna sorgente live'}</div>
            </div>
            <div class="row-btns">
              ${active ? `<button class="btn sm" data-action="live-stop">■ Stop</button>` : ''}
              <button class="btn sm ${Live.mode === 'sim' ? 'primary' : ''}" data-action="live-sim">▶ Demo</button>
              <button class="btn sm ${Live.mode === 'remote' ? 'primary' : ''}" data-action="live-remote">📡 Remoto</button>
            </div>
          </div>
        </div>

        <div class="section-title">Telemetria <span class="badge-live ${Live.mode === 'off' ? 'off' : ''}"><span class="dot"></span>${new Date().toLocaleTimeString('it-IT')}</span></div>
        <div class="grid grid-2 wide" id="live-kpis">
          ${this.liveKpis(last, t)}
        </div>
        <div class="row-btns mt12">
          <button class="btn primary sm" data-action="save-reading">💾 Salva lettura</button>
          <button class="btn sm" data-action="quick-reading">＋ Manuale</button>
        </div>

        <div class="section-title">Andamento live</div>
        <div class="card">
          <div class="chart-wrap" id="live-chart">${this.liveChart()}</div>
          <div class="legend">
            <span><i style="background:var(--amber)"></i>Temp °C</span>
            <span><i style="background:var(--blue)"></i>UR %</span>
            <span><i style="background:var(--violet)"></i>VPD ×10</span>
          </div>
        </div>

        <div class="section-title">Controllo dispositivi</div>
        <div class="card" id="live-devices">${this.devicesHTML()}</div>

        <div class="section-title">Target ambiente</div>
        <div class="card">
          <div class="field">
            <label>Temperatura target · <span class="mono" id="tgt-temp-l">${U.fmt(Live.targets.temp, 1)}°C</span></label>
            <input type="range" min="16" max="32" step="0.5" value="${Live.targets.temp}" data-action="target" data-key="temp">
          </div>
          <div class="field">
            <label>Umidità target · <span class="mono" id="tgt-rh-l">${Math.round(Live.targets.rh)}%</span></label>
            <input type="range" min="30" max="85" step="1" value="${Math.round(Live.targets.rh)}" data-action="target" data-key="rh">
          </div>
          <div class="hint">I target guidano i dispositivi in modalità remota (inviati al controller) e la simulazione locale.</div>
        </div>

        <div class="section-title">Storico (dal diario)</div>
        <div class="card">
          <div class="chart-wrap" id="hist-chart">${this.historyChart()}</div>
          <div class="legend">
            <span><i style="background:var(--amber)"></i>Temp °C</span>
            <span><i style="background:var(--blue)"></i>UR %</span>
          </div>
          <div class="row-btns mt12">
            <button class="btn sm" data-action="clear-readings" style="color:var(--red)">🗑️ Svuota storico parametri</button>
          </div>
        </div>

        <div class="section-title">📡 Controllo remoto (tempo reale)</div>
        <div class="card">
          <div class="toggle-row">
            <div><div class="t-title">Backend remoto</div><div class="t-sub">Collega sensori e attuatori via WebSocket</div></div>
            <label class="switch"><input type="checkbox" data-action="toggle-remote" ${Store.state.settings.remote.enabled ? 'checked' : ''}><span class="slider"></span></label>
          </div>
          <div class="field mt12"><label>URL WebSocket</label><input class="input" type="url" id="rem-url" placeholder="wss://tuo-server.esempio" value="${U.esc(Store.state.settings.remote.url)}" data-action="setting" data-key="remote.url"></div>
          <div class="field-row">
            <div class="field"><label>Stanza / Room</label><input class="input" id="rem-room" value="${U.esc(Store.state.settings.remote.room)}" data-action="setting" data-key="remote.room"></div>
            <div class="field"><label>Token (opz.)</label><input class="input" id="rem-token" value="${U.esc(Store.state.settings.remote.token)}" data-action="setting" data-key="remote.token"></div>
          </div>
          <div class="row-btns">
            <button class="btn primary sm" data-action="live-remote">📡 Connetti ora</button>
            <button class="btn sm" data-action="live-sim">▶ Modalità demo</button>
          </div>
          <div class="hint mt8">Senza backend usa la <b>modalità demo</b>. Per il controllo reale vedi la cartella <b>server/</b>.</div>
        </div>

        <div class="section-title">⚙️ Preferenze</div>
        <div class="card">
          <div class="field-row">
            <div class="field"><label>Δ foglia − aria (°C)</label><input class="input" type="number" step="0.5" id="set-leaf" value="${U.numStr(Store.state.settings.leafOffset, 1)}" data-action="setting" data-key="leafOffset"></div>
            <div class="field"><label>Intervallo live (s)</label><input class="input" type="number" inputmode="numeric" id="set-live" value="${Store.state.settings.liveInterval}" data-action="setting" data-key="liveInterval"></div>
          </div>
          <div class="toggle-row">
            <div><div class="t-title">Notifiche alert</div><div class="t-sub">Avvisi su parametri critici e task</div></div>
            <label class="switch"><input type="checkbox" data-action="toggle-setting" data-key="notifications" ${Store.state.settings.notifications ? 'checked' : ''}><span class="slider"></span></label>
          </div>
          <div class="hint">Δ foglia = differenza tra la temperatura della foglia e quella dell’aria: traspirando, le foglie sono di norma 1–3 °C più fredde. Serve a calcolare il VPD corretto (default 2 °C).</div>
        </div>
      </div>`;
    },

    liveKpis(last, t) {
      return this.kpiHTML('Temperatura', last.temp, '°C', t.tempD, 1) +
        this.kpiHTML('Umidità', last.rh, '%', t.rh, 0) +
        this.kpiHTML('VPD', last.vpd, 'kPa', t.vpd, 2) +
        this.kpiHTML('pH', last.ph, '', t.phSoil, 1) +
        this.kpiHTML('EC', last.ec, 'mS', t.ec, 2) +
        this.kpiHTML('PPFD', last.ppfd, 'µmol', t.ppfd, 0) +
        this.kpiHTML('CO₂', last.co2, 'ppm', [-100, 5000], 0) +
        this.kpiHTML('H₂O', last.waterTemp, '°C', [18, 22], 0);
    },

    devicesHTML() {
      return Live.DEVICES.map(d => {
        const on = !!Live.devices[d.id];
        return `<div class="toggle-row">
          <div class="flex gap12 aic"><div style="font-size:22px">${d.icon}</div><div class="t-title">${d.label}</div></div>
          <label class="switch"><input type="checkbox" data-action="device" data-id="${d.id}" ${on ? 'checked' : ''}><span class="slider"></span></label>
        </div>`;
      }).join('');
    },

    liveChart() {
      const h = Live.history.slice(-90);
      if (h.length < 2) return `<div class="empty" style="padding:18px">Avvia la sorgente live (Demo o Remoto) per vedere il grafico in tempo reale.</div>`;
      const series = [
        { name: 'temp', color: '#ffb020', points: h.map((s, i) => ({ x: i, y: s.temp })) },
        { name: 'rh', color: '#4aa8ff', points: h.map((s, i) => ({ x: i, y: s.rh })) },
        { name: 'vpd', color: '#b48bff', points: h.map((s, i) => ({ x: i, y: (s.vpd || 0) * 10 })) }
      ];
      return Charts.line(series, { height: 170, decimals: 0, xLabels: ['', 'ora'] });
    },

    historyChart() {
      const r = Store.readingsFor().slice(-40).filter(x => x.temp != null || x.rh != null);
      if (r.length < 2) return `<div class="empty" style="padding:18px">Registra almeno due letture per vedere lo storico.</div>`;
      const series = [
        { name: 'temp', color: '#ffb020', points: r.map((s, i) => ({ x: i, y: s.temp })).filter(p => p.y != null) },
        { name: 'rh', color: '#4aa8ff', points: r.map((s, i) => ({ x: i, y: s.rh })).filter(p => p.y != null) }
      ];
      const first = r[0].date || r[0].ts.slice(0, 10);
      const lastD = r[r.length - 1].date || r[r.length - 1].ts.slice(0, 10);
      return Charts.line(series, { height: 160, decimals: 0, xLabels: [U.fmtDate(first, 'short'), U.fmtDate(lastD, 'short')] });
    },

    refreshLiveDom() {
      const t = this.target();
      const last = Live.value || {};
      const kpis = U.$('#live-kpis');
      if (kpis) kpis.innerHTML = this.liveKpis(last, t);
      const chart = U.$('#live-chart');
      if (chart) chart.innerHTML = this.liveChart();
      const dev = U.$('#live-devices');
      if (dev) {
        Live.DEVICES.forEach(d => {
          const cb = dev.querySelector(`input[data-id="${d.id}"]`);
          if (cb) cb.checked = !!Live.devices[d.id];
        });
      }
      const homeKpis = U.$('#home-kpis');
      const gh = this.grow();
      if (homeKpis && gh) homeKpis.innerHTML = this.homeKpisHTML(gh);
    },

    liveOrLast() {
      if (Live.value) return Live.value;
      const g = this.grow();
      return (g && Store.latestReading(g.id)) || {};
    },

    /* ================= STRUMENTI ================= */
    viewTools() {
      const g = this.grow();
      const t = this.target();
      const tip = Advice.dailyTip(g);
      const week = g ? Advice.weekOf(g) : 1;
      const ns = g ? Advice.nutrientSchedule(g, week) : null;

      return `<div class="screen">
        <div class="card">
          <div class="flex gap12 aic"><div style="font-size:30px">${tip.icon}</div>
            <div><div style="font-weight:800">${U.esc(tip.title)}</div><div class="muted" style="font-size:13.5px;margin-top:4px">${U.esc(tip.text)}</div></div>
          </div>
        </div>

        ${g ? `<div class="section-title">Schema nutrienti — settimana ${week}</div>
        <div class="card">
          <div class="flex between" style="padding:6px 0"><span class="muted">Base</span><b>${U.esc(ns.base)}</b></div>
          <div class="flex between" style="padding:6px 0;border-top:1px solid var(--line)"><span class="muted">Additivi</span><b>${U.esc(ns.boost)}</b></div>
          <div class="hint mt8">${U.esc(ns.note)}</div>
        </div>` : ''}

        <div class="section-title">Range target per stadio</div>
        <div class="card">
          <table style="width:100%;border-collapse:collapse;font-size:12.5px" class="mono">
            <tr class="mute2" style="text-align:left">
              <th style="padding:6px 4px">Stadio</th><th>T°</th><th>UR%</th><th>VPD</th><th>pH</th><th>EC</th>
            </tr>
            ${Store.STAGES.map(s => {
              const tt = Advice.targetFor(s.id);
              const cur = g && g.stage === s.id ? 'style="background:rgba(55,214,122,.10)"' : '';
              return `<tr ${cur} style="border-top:1px solid var(--line)">
                <td style="padding:7px 4px;font-weight:600">${s.label}</td>
                <td>${tt.tempD[0]}–${tt.tempD[1]}</td>
                <td>${tt.rh[0]}–${tt.rh[1]}</td>
                <td>${tt.vpd ? tt.vpd[0] + '–' + tt.vpd[1] : '—'}</td>
                <td>${tt.phSoil[0]}–${tt.phSoil[1]}</td>
                <td>${tt.ec[0]}–${tt.ec[1]}</td>
              </tr>`;
            }).join('')}
          </table>
        </div>

        <div class="section-title">Fotoperiodo</div>
        <div class="card">
          <div class="flex between" style="padding:6px 0"><span class="muted">Vegetativa</span><b class="mono">${g ? g.schedule.vegHours : 18}/24 h</b></div>
          <div class="flex between" style="padding:6px 0;border-top:1px solid var(--line)"><span class="muted">Fioritura</span><b class="mono">${g ? g.schedule.flowerHours : 12}/24 h</b></div>
          <div class="hint mt8">Lo stadio corrente richiede ~${t.lightHours}h di luce. Mantieni il buio assoluto: interruzioni in fioritura causano ermafroditismo.</div>
        </div>

        <div class="section-title">Calcolatori</div>
        ${this.calcCards()}
      </div>`;
    },

    calcCards() {
      const last = this.liveOrLast();
      const t = this.target();
      return `
        <div class="card">
          <div style="font-weight:700;margin-bottom:10px">🌡️ VPD (deficit di pressione di vapore)</div>
          <div class="field-row">
            <div class="field"><label>Temp aria °C</label><input class="input" type="number" inputmode="decimal" id="calc-vpd-t" value="${U.numStr(last.temp != null ? last.temp : 25, 1)}" data-action="calc"></div>
            <div class="field"><label>UR %</label><input class="input" type="number" inputmode="decimal" id="calc-vpd-rh" value="${U.numStr(last.rh != null ? last.rh : 60, 0)}" data-action="calc"></div>
          </div>
          <div class="field"><label>Δ foglia − aria (°C)</label><input class="input" type="number" inputmode="decimal" id="calc-vpd-off" value="${U.numStr(Store.state.settings.leafOffset, 1)}" data-action="calc"></div>
          <div class="hint" style="margin:-2px 0 12px">Differenza tra la temperatura della foglia e quella dell’aria (le foglie sono ~1–3 °C più fredde per la traspirazione): serve a calcolare il VPD fogliare.</div>
          <div class="card" style="background:var(--surface-2);box-shadow:none">
            <div class="flex between aic"><span class="muted">VPD stimato</span><b class="mono" id="out-vpd" style="font-size:20px">—</b></div>
            <div class="hint mt8" id="out-vpd-hint"></div>
          </div>
        </div>

        <div class="card">
          <div style="font-weight:700;margin-bottom:10px">💡 DLI (luce giornaliera integrata)</div>
          <div class="field-row">
            <div class="field"><label>PPFD (µmol/m²/s)</label><input class="input" type="number" inputmode="decimal" id="calc-dli-p" value="${U.numStr(last.ppfd != null ? last.ppfd : 450)}" data-action="calc"></div>
            <div class="field"><label>Ore di luce</label><input class="input" type="number" inputmode="decimal" id="calc-dli-h" value="${U.numStr(t.lightHours)}" data-action="calc"></div>
          </div>
          <div class="card" style="background:var(--surface-2);box-shadow:none">
            <div class="flex between aic"><span class="muted">DLI</span><b class="mono" id="out-dli" style="font-size:20px">—</b></div>
            <div class="hint mt8" id="out-dli-hint"></div>
          </div>
        </div>

        <div class="card">
          <div style="font-weight:700;margin-bottom:10px">📊 Conversione EC ⇄ PPM</div>
          <div class="field-row">
            <div class="field"><label>EC (mS/cm)</label><input class="input" type="number" inputmode="decimal" id="calc-ec" value="1.4" data-action="calc"></div>
            <div class="field"><label>PPM (scala 500)</label><input class="input" type="number" inputmode="decimal" id="calc-ppm" value="700" data-action="calc"></div>
          </div>
          <div class="hint">PPM = EC × 500 · EC = PPM ÷ 500 (le centraline UK usano scala 700: ×700).</div>
        </div>

        <div class="card">
          <div style="font-weight:700;margin-bottom:10px">🧪 Diluizione soluzione</div>
          <div class="field-row">
            <div class="field"><label>EC attuale</label><input class="input" type="number" inputmode="decimal" id="calc-dil-cur" value="2.2" data-action="calc"></div>
            <div class="field"><label>EC desiderata</label><input class="input" type="number" inputmode="decimal" id="calc-dil-tgt" value="1.4" data-action="calc"></div>
          </div>
          <div class="field"><label>Volume tanica (L)</label><input class="input" type="number" inputmode="decimal" id="calc-dil-vol" value="10" data-action="calc"></div>
          <div class="card" style="background:var(--surface-2);box-shadow:none">
            <div class="hint" id="out-dil">—</div>
          </div>
        </div>`;
    },

    /* ================= CONFIGURAZIONE (in fondo alla home) ================= */
    configHTML(g) {
      g = g || this.grow();

      return `<div class="config-block">
        <div class="section-title">⚙️ Configurazione</div>
        <div class="section-title" style="margin-top:6px">Coltivazioni</div>
        ${g ? `<div class="card">
          <div class="flex between aic">
            <div><div style="font-weight:800">${U.esc(g.name)}</div><div class="muted" style="font-size:12.5px">${U.esc(g.strain || '')} · dal ${U.fmtDate(g.startDate, 'short')}</div></div>
            <button class="btn sm" data-action="edit-grow">✏️ Modifica</button>
          </div>
        </div>` : `<div class="card center muted">Nessuna coltivazione. Creane una.</div>`}

        <div class="row-btns mt12">
          <button class="btn primary sm" data-action="new-grow">+ Nuova</button>
          ${Store.state.grows.length > 1 ? `<button class="btn sm" data-action="switch-grow">🔄 Cambia attiva</button>` : ''}
          ${g ? `<button class="btn sm danger" data-action="del-grow">🗑️ Elimina attiva</button>` : ''}
        </div>

        <div class="section-title">Dati</div>
        <div class="card">
          <div class="row-btns">
            <button class="btn sm" data-action="export">⬇️ Esporta backup</button>
            <button class="btn sm" data-action="import">⬆️ Importa backup</button>
            <button class="btn sm" data-action="demo">🎬 Carica demo</button>
          </div>
          <div class="row-btns mt12">
            <button class="btn sm danger" data-action="reset">♻️ Azzera tutti i dati</button>
          </div>
          <div class="hint mt8">Il backup è un file JSON con tutti i tuoi dati. Conservalo: è il tuo diario personale.</div>
        </div>

        <div class="section-title">Informazioni</div>
        <div class="card">
          <div class="flex between" style="padding:6px 0"><span class="muted">App</span><b>GROW FAST &amp; GROW BIG !!</b></div>
          <div class="flex between" style="padding:6px 0;border-top:1px solid var(--line)"><span class="muted">Versione</span><b class="mono">1.1.0</b></div>
          <div class="flex between" style="padding:6px 0;border-top:1px solid var(--line)"><span class="muted">Modalità live</span><b>${Live.mode}</b></div>
          <div class="hint mt8">I dati restano sul tuo dispositivo (localStorage). Nessun dato inviato senza backend remoto attivo.</div>
        </div>

        <div class="center mute2" style="font-size:11px;margin-top:18px;line-height:1.6">
          ⚠️ Strumento personale di tracciamento. Verifica sempre la normativa del tuo Paese.<br>
          GROW FAST &amp; GROW BIG !! 🌱
        </div>
      </div>`;
    },

    /* ================= EVENTI ================= */
    bindEvents() {
      document.addEventListener('click', (e) => {
        const t = e.target.closest('[data-action]');
        if (!t) return;
        const action = t.dataset.action;
        if (['calc', 'device', 'target', 'setting', 'toggle-setting', 'toggle-remote', 'grow-field'].includes(action)) return; // gestiti su input/change
        e.preventDefault();
        this.onClick(action, t);
      });

      document.addEventListener('change', (e) => {
        const t = e.target.closest('[data-action]');
        if (!t) return;
        const a = t.dataset.action;
        if (a === 'device') { Live.toggleDevice(t.dataset.id, t.checked); if (this.screen === 'live') this.refreshLiveDom(); }
        else if (a === 'setting') Store.setSetting(t.dataset.key, U.num(t.value) != null ? U.num(t.value) : t.value);
        else if (a === 'toggle-setting') Store.setSetting(t.dataset.key, t.checked);
        else if (a === 'toggle-remote') { Store.setSetting('remote.enabled', t.checked); }
        else if (a === 'grow-field') {
          const g = this.grow(); if (!g) return;
          const field = t.dataset.field;
          const value = (t.type === 'number') ? U.num(t.value) : t.value;
          if (field.indexOf('.') > -1) {
            const parts = field.split('.');
            const nested = Object.assign({}, g[parts[0]]);
            nested[parts[1]] = value;
            Store.updateGrow(g.id, { [parts[0]]: nested });
          } else {
            Store.updateGrow(g.id, { [field]: value });
          }
          U.toast('Salvato');
          this.render();
        }
      });

      document.addEventListener('input', (e) => {
        const t = e.target.closest('[data-action]');
        if (!t) return;
        if (t.dataset.action === 'target') {
          const key = t.dataset.key;
          Live.setTargets({ [key]: U.num(t.value) });
          const lbl = U.$('#tgt-' + key + '-l');
          if (lbl) lbl.textContent = key === 'temp' ? U.fmt(t.value, 1) + '°C' : Math.round(t.value) + '%';
        } else if (t.dataset.action === 'calc') {
          this.runCalc();
        }
      });
    },

    onClick(action, el) {
      const g = this.grow();
      switch (action) {
        case 'go': this.go(el.dataset.screen); break;
        case 'new-grow': this.growForm(); break;
        case 'edit-grow': this.growForm(g); break;
        case 'del-grow': this.confirm('Elimina coltivazione', 'Tutti i dati (note, interventi, parametri) di questa coltivazione verranno rimossi.', () => { Store.removeGrow(g.id); this.render(); U.toast('Coltivazione eliminata'); }); break;
        case 'switch-grow': this.switchGrow(); break;
        case 'set-stage': Store.setStage(g.id, el.dataset.stage); this.render(); U.toast('Stadio aggiornato'); break;
        case 'demo': this.confirm('Carica dati demo', 'Verranno sovrascritti i dati attuali con una coltivazione di esempio.', () => { Store.seedDemo(); this.go('home'); U.toast('Demo caricata'); }); break;
        case 'reset': this.confirm('Azzerare tutto?', 'Tutti i dati verranno cancellati definitivamente.', () => { Store.reset(); this.go('home'); U.toast('Dati azzerati'); }); break;
        case 'add-expense': this.addExpenseForm(); break;
        case 'del-expense': Store.removeExpense(el.dataset.id); this.render(); U.toast('Spesa eliminata'); break;
        case 'light-toggle': { const on = Store.lightToggle(); this.render(); U.toast(on ? '💡 Luce ACCESA — conteggio ore avviato' : '🌑 Luce spenta'); break; }
        case 'report': this.report(); break;
        case 'report-print': this.reportPrint(); break;
        case 'report-html': this.reportDownloadHTML(); break;
        case 'report-close': this.reportClose(); break;
        case 'strain-info': this.strainInfoModal(); break;
        case 'edit-strain': this.strainInfoForm(); break;
        case 'quick-photo': this.photoForm(); break;
        case 'timelapse': this.timelapse(); break;
        case 'tl-play': this.toggleTimelapse(); break;
        case 'tl-close': this.stopTimelapse(); break;
        case 'tl-go': this.tlShow(parseInt(el.dataset.tlIdx, 10)); break;
        case 'add-entry': this.entryForm(); break;
        case 'edit-entry': this.entryForm(Store.state.entries.find(x => x.id === el.dataset.id)); break;
        case 'del-entry': this.confirm('Elimina nota', 'Vuoi eliminare questa nota giornaliera?', () => { Store.removeEntry(el.dataset.id); this.render(); }); break;
        case 'quick-water': this.quickWaterForm(); break;
        case 'quick-feed': this.quickFeedForm(); break;
        case 'add-intervention': this.interventionForm(null, 'irrigazione'); break;
        case 'edit-intervention': this.interventionForm(Store.state.interventions.find(x => x.id === el.dataset.id)); break;
        case 'del-intervention': this.confirm('Elimina intervento', 'Vuoi eliminare questo intervento?', () => { Store.removeIntervention(el.dataset.id); this.render(); }); break;
        case 'diary-mode': this.diaryMode = el.dataset.mode; this.render(); break;
        case 'cal-prev': this.shiftMonth(-1); break;
        case 'cal-next': this.shiftMonth(1); break;
        case 'cal-today': this.calY = null; this.calM = null; this.render(); break;
        case 'cal-day': this.dayDetail(el.dataset.date); break;
        case 'day-add-note': this.entryForm(null, false, el.dataset.date); break;
        case 'day-add-int': this.interventionForm(null, 'irrigazione', el.dataset.date); break;
        case 'quick': this.quickAction(el.dataset.kind); break;
        case 'quick-reading': this.readingForm(false); break;
        case 'params-period': this.paramsPeriod = (el.dataset.period === 'notte' ? 'notte' : 'giorno'); this.render(); break;
        case 'save-reading': if (Live.value) { Live.saveCurrent(); this.render(); } else { this.readingForm(false); } break;
        case 'live-sim': if (Live.mode === 'sim') { Live.stop(); } else { Live.startSim(); U.toast('▶ Simulazione attiva'); } this.render(); break;
        case 'live-remote': if (Live.mode === 'remote') { Live.stop(); this.render(); } else { const r = Store.state.settings.remote; if (!r.url) { U.toast('Configura prima l’URL WebSocket nella sezione Controllo remoto (in fondo alla Home)'); this.go('home'); } else { Live.startRemote(r.url, r.room, r.token); this.go('live'); } } break;
        case 'live-stop': Live.stop(); this.render(); break;
        case 'clear-readings': this.confirm('Svuota storico', 'Verranno rimossi tutti i campioni dei parametri.', () => { Store.state.readings = Store.state.readings.filter(r => r.growId !== g.id); Store.save(); this.render(); }); break;
        case 'export': this.exportData(); break;
        case 'import': this.importData(); break;
        case 'modal-close': this.closeModal(); break;
        case 'modal-confirm': this.modalConfirm(); break;
      }
    },

    quickAction(kind) {
      if (kind === 'entry' || kind === 'obs') this.entryForm(null, kind === 'obs');
      else this.interventionForm(null, kind); // 'irrigazione' | 'nutrizione'
    },

    /* ================= MODALE ================= */
    openModal(title, bodyHTML, opts) {
      this.closeModal();
      this.modalOpts = opts || {};
      const wrap = document.createElement('div');
      wrap.className = 'modal-backdrop';
      wrap.innerHTML = `<div class="modal">
        <div class="m-handle"></div>
        <div class="m-title">${U.esc(title)}</div>
        <div id="modal-body">${bodyHTML}</div>
        <div class="m-actions">
          <button class="btn ghost" data-action="modal-close">Annulla</button>
          <button class="btn ${opts && opts.danger ? 'danger' : 'primary'}" data-action="modal-confirm">${U.esc((opts && opts.confirmLabel) || 'Salva')}</button>
        </div>
      </div>`;
      wrap.addEventListener('click', (ev) => { if (ev.target === wrap) this.closeModal(); });
      document.body.appendChild(wrap);
      const first = wrap.querySelector('input, textarea, select');
      setTimeout(() => { if (first) first.focus(); }, 250);
    },

    closeModal() { const m = U.$('.modal-backdrop'); if (m) m.remove(); this.modalOpts = null; },

    modalConfirm() {
      const opts = this.modalOpts || {};
      if (opts.onConfirm) {
        const body = U.$('#modal-body');
        const data = {};
        body.querySelectorAll('[data-field]').forEach(f => { data[f.dataset.field] = f.value; });
        body.querySelectorAll('input[type="checkbox"][data-field]').forEach(f => { data[f.dataset.field] = f.checked; });
        opts.onConfirm(data);
      }
      this.closeModal();
    },

    confirm(title, text, onConfirm, label) {
      this.openModal(title, `<p class="muted">${U.esc(text)}</p>`, { confirmLabel: label || 'Conferma', danger: true, onConfirm });
    },

    switchGrow() {
      const body = `<div class="chip-group">${Store.state.grows.map(g =>
        `<button class="chip ${g.id === Store.state.activeGrowId ? 'active' : ''}" data-field-pick="${g.id}">${U.esc(g.name)}</button>`).join('')}</div>`;
      this.openModal('Coltivazione attiva', body, {
        confirmLabel: 'Imposta', onConfirm: () => {}
      });
      // gestione selezione dedicata
      const modal = U.$('.modal-backdrop');
      modal.querySelectorAll('[data-field-pick]').forEach(b => b.addEventListener('click', () => {
        Store.state.activeGrowId = b.dataset.fieldPick; Store.save(); this.closeModal(); this.render(); U.toast('Coltivazione attiva cambiata');
      }));
    },

    /* ================= BACKUP ================= */
    exportData() {
      const blob = new Blob([Store.exportJSON()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'growfast-backup-' + U.todayISO() + '.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      U.toast('⬇️ Backup esportato');
    },

    importData() {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'application/json,.json';
      input.addEventListener('change', () => {
        const f = input.files[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = () => {
          try { Store.importJSON(r.result); this.go('home'); U.toast('⬆️ Backup importato'); }
          catch (e) { U.toast('❌ File non valido'); }
        };
        r.readAsText(f);
      });
      input.click();
    },

    /* ================= FORM: GROW ================= */
    growForm(g) {
      const isNew = !g;
      g = g || {};
      const stages = Store.STAGES;
      const body = `
        <div class="field"><label>Nome coltivazione</label><input class="input" data-field="name" value="${U.esc(g.name || 'Run #' + (Store.state.grows.length + 1))}"></div>
        <div class="field"><label>Varietà (strain)</label><input class="input" data-field="strain" value="${U.esc(g.strain || '')}" placeholder="es. Northern Lights Auto"></div>
        <div class="field"><label>Genetica / note</label><input class="input" data-field="genetics" value="${U.esc(g.genetics || '')}" placeholder="es. Indica dominante · Fotoperiodica"></div>
        <div class="field-row">
          <div class="field"><label>Data inizio</label><input class="input" type="date" data-field="startDate" value="${g.startDate || U.todayISO()}"></div>
          <div class="field"><label>Stadio</label><select class="select" data-field="stage">${stages.map(s => `<option value="${s.id}" ${g.stage === s.id ? 'selected' : ''}>${s.label}</option>`).join('')}</select></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Substrato</label><input class="input" data-field="medium" value="${U.esc(g.medium || 'Terra')}" placeholder="Terra / Coco / Idroponica"></div>
          <div class="field"><label>Vaso</label><input class="input" data-field="potSize" value="${U.esc(g.potSize || '')}" placeholder="es. 11 L"></div>
        </div>
        <div class="section-title" style="margin:14px 4px 8px">Area di coltivazione</div>
        <div class="field-row">
          <div class="field"><label>Larghezza (cm)</label><input class="input" type="number" inputmode="numeric" data-field="areaW" value="${U.numStr(g.areaW)}" placeholder="es. 100"></div>
          <div class="field"><label>Profondità (cm)</label><input class="input" type="number" inputmode="numeric" data-field="areaD" value="${U.numStr(g.areaD)}" placeholder="es. 50"></div>
        </div>
        <div class="field"><label>Numero di piante</label><input class="input" type="number" inputmode="numeric" data-field="plants" value="${U.numStr(g.plants != null ? g.plants : 1)}"></div>
        <div class="section-title" style="margin:14px 4px 8px">Illuminazione</div>
        <div class="field"><label>Tipo di lampada</label>
          <select class="select" data-field="lampType">${Advice.LAMP_TYPES.map(t => `<option value="${U.esc(t)}" ${g.lampType === t ? 'selected' : ''}>${U.esc(t)}</option>`).join('')}</select>
        </div>
        <div class="field-row">
          <div class="field"><label>Watt in vegetativa</label><input class="input" type="number" inputmode="numeric" data-field="vegWatts" value="${U.numStr(g.vegWatts)}" placeholder="es. 250"></div>
          <div class="field"><label>Watt in fioritura</label><input class="input" type="number" inputmode="numeric" data-field="flowerWatts" value="${U.numStr(g.flowerWatts)}" placeholder="es. 400"></div>
        </div>
        <div class="field"><label>Note lampada (opz.)</label><input class="input" data-field="light" value="${U.esc(g.light || '')}" placeholder="es. 2 bulbi, cooltube, dimmer"></div>
        <div class="field-row">
          <div class="field"><label>Ore luce vegetativa</label><input class="input" type="number" data-field="vegHours" value="${g.schedule ? g.schedule.vegHours : 18}"></div>
          <div class="field"><label>Ore luce fioritura</label><input class="input" type="number" data-field="flowerHours" value="${g.schedule ? g.schedule.flowerHours : 12}"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Veg · ON</label><input class="input" type="time" data-field="vegOn" value="${U.esc((g.schedule && g.schedule.vegOn) || '')}"></div>
          <div class="field"><label>Veg · OFF</label><input class="input" type="time" data-field="vegOff" value="${U.esc((g.schedule && g.schedule.vegOff) || '')}"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Fioritura · ON</label><input class="input" type="time" data-field="flowerOn" value="${U.esc((g.schedule && g.schedule.flowerOn) || '')}"></div>
          <div class="field"><label>Fioritura · OFF</label><input class="input" type="time" data-field="flowerOff" value="${U.esc((g.schedule && g.schedule.flowerOff) || '')}"></div>
        </div>`;
      this.openModal(isNew ? 'Nuova coltivazione' : 'Modifica coltivazione', body, {
        confirmLabel: isNew ? 'Crea' : 'Salva',
        onConfirm: (d) => {
          const patch = {
            name: d.name, strain: d.strain, genetics: d.genetics, startDate: d.startDate,
            stage: d.stage, medium: d.medium, potSize: d.potSize,
            areaW: U.num(d.areaW), areaD: U.num(d.areaD), plants: U.num(d.plants) || 1,
            lampType: d.lampType, vegWatts: U.num(d.vegWatts), flowerWatts: U.num(d.flowerWatts),
            light: d.light,
            schedule: {
              vegHours: U.num(d.vegHours) || 18, flowerHours: U.num(d.flowerHours) || 12,
              vegOn: d.vegOn || '', vegOff: d.vegOff || '',
              flowerOn: d.flowerOn || '', flowerOff: d.flowerOff || ''
            }
          };
          if (isNew) { Store.addGrow(patch); U.toast('🌱 Coltivazione creata'); }
          else { Store.updateGrow(g.id, patch); U.toast('Salvato'); }
          this.render();
        }
      });
    },

    /* ================= FORM: NOTA ================= */
    entryForm(entry, isObs, presetDate) {
      if (!entry && !this.grow()) { U.toast('Crea prima una coltivazione'); return; }
      const e = entry || {};
      if (!e.date) e.date = presetDate || null;
      const placeholder = isObs
        ? 'Osservazione: colore foglie, segni di carenza/eccessi, parassiti, odore, crescita, tricomi…'
        : 'Cosa è successo oggi? Come sta la pianta? Note, sensazioni, osservazioni…';
      const tags = (e.tags || []).join(', ');
      const body = `
        <div class="field-row">
          <div class="field"><label>Data</label><input class="input" type="date" data-field="date" value="${e.date || U.todayISO()}"></div>
          <div class="field"><label>Ora</label><input class="input" type="time" data-field="time" value="${e.time || U.nowTime()}"></div>
        </div>
        <div class="field"><label>Salute pianta</label>
          <input type="range" min="1" max="5" step="1" data-field="health" value="${e.health || 4}" oninput="document.getElementById('health-lbl').textContent=this.value+' ★'">
          <div class="hint" id="health-lbl">${e.health || 4} ★</div>
        </div>
        <div class="field"><label>Note</label><textarea class="textarea" data-field="notes" placeholder="${placeholder}">${U.esc(e.notes || '')}</textarea></div>
        <div class="field"><label>Tag (separati da virgola)</label><input class="input" data-field="tags" value="${U.esc(tags)}" placeholder="training, salute ok, defogliazione"></div>
        <div class="field"><label>Foto (opzionale)</label><input class="input" type="file" accept="image/*" multiple id="entry-photos">
          <div class="hint">Le foto restano solo sul tuo dispositivo (ridimensionate automaticamente).</div></div>`;
      this.openModal(entry ? 'Modifica nota' : (isObs ? 'Osservazione pianta' : 'Nota giornaliera'), body, {
        confirmLabel: entry ? 'Salva' : 'Aggiungi',
        onConfirm: (d) => {
          const photos = (entry && entry.photos) || [];
          const el = document.getElementById('entry-photos');
          this.readPhotos(el, (imgs) => {
            const patch = {
              date: d.date, time: d.time, health: U.num(d.health) || 3,
              notes: d.notes, tags: (d.tags || '').split(',').map(t => t.trim()).filter(Boolean),
              photos: (imgs && imgs.length) ? imgs : photos
            };
            if (entry) Store.updateEntry(entry.id, patch); else Store.addEntry(patch);
            this.go('diary'); U.toast(entry ? 'Nota aggiornata' : '📝 Nota salvata');
          });
        }
      });
    },

    // Legge e ridimensiona le foto selezionate (per non saturare il localStorage)
    readPhotos(inputEl, cb) {
      if (!inputEl || !inputEl.files || !inputEl.files.length) { cb(null); return; }
      const files = Array.from(inputEl.files).slice(0, 3);
      const out = [];
      let pending = files.length;
      files.forEach((file) => {
        const reader = new FileReader();
        reader.onload = () => {
          const img = new Image();
          img.onload = () => {
            const max = 900;
            let w = img.width, h = img.height;
            if (w > max) { h = h * max / w; w = max; }
            const c = document.createElement('canvas');
            c.width = w; c.height = h;
            c.getContext('2d').drawImage(img, 0, 0, w, h);
            out.push(c.toDataURL('image/jpeg', 0.7));
            if (--pending === 0) cb(out);
          };
          img.onerror = () => { if (--pending === 0) cb(out); };
          img.src = reader.result;
        };
        reader.readAsDataURL(file);
      });
    },

    /* ================= FORM: INTERVENTO ================= */
    interventionForm(it, presetType, presetDate) {
      if (!it && !this.grow()) { U.toast('Crea prima una coltivazione'); return; }
      const e = it || {};
      if (!e.date) e.date = presetDate || null;
      const typeId = e.type || presetType || 'irrigazione';
      const body = `
        <div class="field"><label>Tipo intervento</label>
          <select class="select" data-field="type" id="int-type">${Store.INTERVENTION_TYPES.map(t =>
            `<option value="${t.id}" ${t.id === typeId ? 'selected' : ''}>${t.icon} ${t.label}</option>`).join('')}</select>
        </div>
        <div class="field-row">
          <div class="field"><label>Data</label><input class="input" type="date" data-field="date" value="${e.date || U.todayISO()}"></div>
          <div class="field"><label>Ora</label><input class="input" type="time" data-field="time" value="${e.time || U.nowTime()}"></div>
        </div>
        <div id="int-extra">${this.intFieldsHTML(typeId, e)}</div>
        <div class="field"><label>Note</label><textarea class="textarea" data-field="notes">${U.esc(e.notes || '')}</textarea></div>`;
      this.openModal(it ? 'Modifica intervento' : 'Nuovo intervento', body, {
        confirmLabel: it ? 'Salva' : 'Registra',
        onConfirm: (d) => {
          const patch = {
            type: d.type, date: d.date, time: d.time, notes: d.notes,
            amount: d.amount || null, ph: U.num(d.ph), ec: U.num(d.ec),
            product: d.product || null, hours: U.num(d.hours),
            potSize: d.potSize || null, nodes: U.num(d.nodes),
            water: d.water || null, waterTemp: U.num(d.waterTemp)
          };
          if (it) Store.updateIntervention(it.id, patch); else Store.addIntervention(patch);
          if (patch.ph != null || patch.ec != null) {
            Store.addReading({ date: patch.date, ph: patch.ph, ec: patch.ec, source: 'intervento' });
          }
          this.go('diary'); U.toast(it ? 'Intervento aggiornato' : '🔧 Intervento registrato');
        }
      });
      const sel = document.getElementById('int-type');
      sel.addEventListener('change', () => {
        document.getElementById('int-extra').innerHTML = this.intFieldsHTML(sel.value, {});
      });
    },

    intFieldsHTML(typeId, e) {
      e = e || {};
      const map = {
        irrigazione: `
          <div class="field-row">
            <div class="field"><label>Volume acqua (L)</label><input class="input" type="number" inputmode="decimal" data-field="amount" value="${e.amount || ''}" placeholder="es. 2"></div>
            <div class="field"><label>pH</label><input class="input" type="number" inputmode="decimal" data-field="ph" value="${e.ph != null ? e.ph : ''}"></div>
          </div>
          <div class="field-row">
            <div class="field"><label>EC mS/cm</label><input class="input" type="number" inputmode="decimal" data-field="ec" value="${e.ec != null ? e.ec : ''}"></div>
            <div class="field"><label>Temp acqua °C</label><input class="input" type="number" inputmode="decimal" data-field="waterTemp" value="${e.waterTemp != null ? e.waterTemp : ''}"></div>
          </div>`,
        nutrizione: `
          <div class="field"><label>Prodotto / fertilizzante</label><input class="input" data-field="product" value="${U.esc(e.product || '')}" placeholder="es. Bio Grow"></div>
          <div class="field-row">
            <div class="field"><label>Dose</label><input class="input" data-field="amount" value="${U.esc(e.amount || '')}" placeholder="es. 1 ml/L"></div>
            <div class="field"><label>Volume soluzione (L)</label><input class="input" type="number" inputmode="decimal" data-field="water" value="${e.water != null ? e.water : ''}"></div>
          </div>
          <div class="field-row">
            <div class="field"><label>pH</label><input class="input" type="number" inputmode="decimal" data-field="ph" value="${e.ph != null ? e.ph : ''}"></div>
            <div class="field"><label>EC mS/cm</label><input class="input" type="number" inputmode="decimal" data-field="ec" value="${e.ec != null ? e.ec : ''}"></div>
          </div>`,
        ph: `
          <div class="field-row">
            <div class="field"><label>pH</label><input class="input" type="number" inputmode="decimal" data-field="ph" value="${e.ph != null ? e.ph : ''}"></div>
            <div class="field"><label>Prodotto</label><input class="input" data-field="product" value="${U.esc(e.product || '')}" placeholder="pH up / pH down"></div>
          </div>
          <div class="field"><label>Dose</label><input class="input" data-field="amount" value="${U.esc(e.amount || '')}" placeholder="es. 3 ml"></div>`,
        ec: `
          <div class="field-row">
            <div class="field"><label>EC mS/cm</label><input class="input" type="number" inputmode="decimal" data-field="ec" value="${e.ec != null ? e.ec : ''}"></div>
            <div class="field"><label>Prodotto</label><input class="input" data-field="product" value="${U.esc(e.product || '')}"></div>
          </div>`,
        topping: `<div class="field"><label>Nodi tagliati</label><input class="input" type="number" inputmode="numeric" data-field="nodes" value="${e.nodes != null ? e.nodes : ''}"></div>`,
        trasloco: `<div class="field"><label>Nuova dimensione vaso</label><input class="input" data-field="potSize" value="${U.esc(e.potSize || '')}" placeholder="es. 18 L"></div>`,
        illuminazione: `
          <div class="field-row">
            <div class="field"><label>Ore di luce</label><input class="input" type="number" inputmode="decimal" data-field="hours" value="${e.hours != null ? e.hours : ''}" placeholder="18 / 12"></div>
            <div class="field"><label>PPFD</label><input class="input" type="number" inputmode="decimal" data-field="ppfd" value=""></div>
          </div>`,
        parassiti: `
          <div class="field"><label>Prodotto</label><input class="input" data-field="product" value="${U.esc(e.product || '')}" placeholder="es. olio di neem"></div>
          <div class="field"><label>Dose</label><input class="input" data-field="amount" value="${U.esc(e.amount || '')}"></div>`,
        cambio_acqua: `
          <div class="field-row">
            <div class="field"><label>Volume (L)</label><input class="input" type="number" inputmode="decimal" data-field="water" value="${e.water != null ? e.water : ''}"></div>
            <div class="field"><label>pH</label><input class="input" type="number" inputmode="decimal" data-field="ph" value="${e.ph != null ? e.ph : ''}"></div>
          </div>
          <div class="field"><label>EC mS/cm</label><input class="input" type="number" inputmode="decimal" data-field="ec" value="${e.ec != null ? e.ec : ''}"></div>`
      };
      return map[typeId] || '';
    },

    /* ================= FORM: LETTURA PARAMETRI ================= */
    readingForm(fromLive) {
      if (!this.grow()) { U.toast('Crea prima una coltivazione'); return; }
      const g = this.grow();
      const period = this.paramsPeriod || 'giorno';
      const src = (fromLive && Live.value) ? Live.value : ((Store.latestReading(g.id, period)) || this.liveOrLast() || {});
      const body = `
        <div class="field"><label>Momento della giornata</label>
          <div class="chip-group">
            <button type="button" class="chip ${period === 'giorno' ? 'active' : ''}" data-set-period="giorno">☀️ Giorno</button>
            <button type="button" class="chip ${period === 'notte' ? 'active' : ''}" data-set-period="notte">🌙 Notte</button>
          </div>
          <div class="hint mt8">Di giorno e di notte i parametri cambiano: salva due letture separate e le ritrovi nel report.</div>
        </div>
        <div class="field-row">
          <div class="field"><label>Temperatura °C</label><input class="input" type="number" inputmode="decimal" data-field="temp" value="${U.numStr(src.temp, 1)}"></div>
          <div class="field"><label>Umidità %</label><input class="input" type="number" inputmode="decimal" data-field="rh" value="${U.numStr(src.rh, 0)}"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>VPD kPa (auto)</label><input class="input" type="number" inputmode="decimal" data-field="vpd" value="${U.numStr(src.vpd, 2)}"></div>
          <div class="field"><label>pH</label><input class="input" type="number" inputmode="decimal" data-field="ph" value="${U.numStr(src.ph, 2)}"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>EC mS/cm</label><input class="input" type="number" inputmode="decimal" data-field="ec" value="${U.numStr(src.ec, 2)}"></div>
          <div class="field"><label>PPFD</label><input class="input" type="number" inputmode="decimal" data-field="ppfd" value="${U.numStr(src.ppfd, 0)}"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>CO₂ ppm</label><input class="input" type="number" inputmode="decimal" data-field="co2" value="${U.numStr(src.co2, 0)}"></div>
          <div class="field"><label>Temp acqua °C</label><input class="input" type="number" inputmode="decimal" data-field="waterTemp" value="${U.numStr(src.waterTemp, 0)}"></div>
        </div>
        <input type="hidden" data-field="period" id="read-period" value="${period}">
        <div class="hint">Se lasci il VPD vuoto viene calcolato automaticamente da temperatura e umidità.</div>`;
      this.openModal('Lettura parametri', body, {
        confirmLabel: 'Salva lettura',
        onConfirm: (d) => {
          Store.addReading({
            date: U.todayISO(), source: 'manual',
            period: (d.period === 'notte' ? 'notte' : 'giorno'),
            temp: U.num(d.temp), rh: U.num(d.rh), vpd: U.num(d.vpd),
            ph: U.num(d.ph), ec: U.num(d.ec), ppfd: U.num(d.ppfd),
            co2: U.num(d.co2), waterTemp: U.num(d.waterTemp)
          });
          this.render(); U.toast('📈 Lettura salvata');
        }
      });
      const rModal = U.$('.modal-backdrop');
      if (rModal) rModal.querySelectorAll('[data-set-period]').forEach(b => b.addEventListener('click', () => {
        const hid = rModal.querySelector('#read-period');
        if (hid) hid.value = b.dataset.setPeriod;
        rModal.querySelectorAll('[data-set-period]').forEach(x => x.classList.toggle('active', x === b));
        this.paramsPeriod = b.dataset.setPeriod;
      }));
    },

    /* ================= FORM: ACQUA (al volo) ================= */
    quickWaterForm() {
      if (!this.grow()) { U.toast('Crea prima una coltivazione'); return; }
      const body = `
        <div class="hint mb12">📅 ${U.fmtDate(U.todayISO())} · ore ${U.nowTime()}</div>
        <div class="field"><label>Litri d'acqua</label><input class="input" type="number" inputmode="decimal" data-field="liters" placeholder="es. 5"></div>
        <div class="chip-group mb12">${[2, 5, 8, 10].map(l => `<button type="button" class="chip" data-quick-lit="${l}">${l} L</button>`).join('')}</div>
        <div class="field-row">
          <div class="field"><label>pH (opz.)</label><input class="input" type="number" inputmode="decimal" data-field="ph"></div>
          <div class="field"><label>EC mS (opz.)</label><input class="input" type="number" inputmode="decimal" data-field="ec"></div>
        </div>
        <div class="field"><label>Note (opz.)</label><input class="input" data-field="notes" placeholder="es. acqua decantata 24h"></div>`;
      this.openModal('💧 Acqua — irrigazione', body, {
        confirmLabel: 'Registra',
        onConfirm: (d) => {
          const liters = U.num(d.liters);
          Store.addIntervention({ type: 'irrigazione', date: U.todayISO(), time: U.nowTime(), amount: liters != null ? String(liters) : '', ph: U.num(d.ph), ec: U.num(d.ec), notes: d.notes || 'Irrigazione' });
          if (U.num(d.ph) != null || U.num(d.ec) != null) Store.addReading({ date: U.todayISO(), ph: U.num(d.ph), ec: U.num(d.ec), source: 'intervento' });
          this.render(); U.toast(liters != null ? '💧 ' + U.fmt(liters, 1) + ' L registrati' : '💧 Irrigazione registrata');
        }
      });
      const modal = U.$('.modal-backdrop');
      modal.querySelectorAll('[data-quick-lit]').forEach(b => b.addEventListener('click', () => {
        const inp = modal.querySelector('[data-field="liters"]');
        if (inp) inp.value = b.dataset.quickLit;
      }));
    },

    /* ================= FORM: FERTILIZZANTE (al volo) ================= */
    quickFeedForm() {
      if (!this.grow()) { U.toast('Crea prima una coltivazione'); return; }
      const body = `
        <div class="hint mb12">📅 ${U.fmtDate(U.todayISO())} · ore ${U.nowTime()}</div>
        <div class="field-row">
          <div class="field"><label>Marca</label><input class="input" data-field="brand" placeholder="es. BioBizz"></div>
          <div class="field"><label>Tipo / prodotto</label><input class="input" data-field="type" placeholder="es. Bio Grow"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Quantità (dose)</label><input class="input" data-field="amount" placeholder="es. 2 ml/L"></div>
          <div class="field"><label>Volume soluzione (L)</label><input class="input" type="number" inputmode="decimal" data-field="water" placeholder="es. 5"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>pH (opz.)</label><input class="input" type="number" inputmode="decimal" data-field="ph"></div>
          <div class="field"><label>EC mS (opz.)</label><input class="input" type="number" inputmode="decimal" data-field="ec"></div>
        </div>
        <div class="field"><label>Note (opz.)</label><input class="input" data-field="notes"></div>`;
      this.openModal('🧪 Fertilizzante — nutrizione', body, {
        confirmLabel: 'Registra',
        onConfirm: (d) => {
          const product = [d.brand, d.type].filter(Boolean).join(' · ');
          Store.addIntervention({ type: 'nutrizione', date: U.todayISO(), time: U.nowTime(), product: product, amount: d.amount, water: U.num(d.water), ph: U.num(d.ph), ec: U.num(d.ec), notes: d.notes || '' });
          if (U.num(d.ph) != null || U.num(d.ec) != null) Store.addReading({ date: U.todayISO(), ph: U.num(d.ph), ec: U.num(d.ec), source: 'intervento' });
          this.render(); U.toast('🧪 Nutrizione registrata');
        }
      });
    },

    /* ================= ORE LUCE OGGI ================= */
    lightToday(g) {
      const timer = (g.stage === 'fioritura' || g.stage === 'flushing')
        ? ((g.schedule && g.schedule.flowerHours) || 12)
        : ((g.schedule && g.schedule.vegHours) || 18);
      const dayStart = U.isoToDate(U.todayISO()).getTime();
      const dayEnd = dayStart + 86400000;
      let ms = 0, any = false;
      ((g.light && g.light.log) || []).forEach(s => {
        const a = Date.parse(s.start);
        const b = s.end ? Date.parse(s.end) : Date.now();
        const from = Math.max(dayStart, a), to = Math.min(dayEnd, b);
        if (to > from) { ms += (to - from); any = true; }
      });
      return { on: any ? U.round(ms / 3600000, 1) : timer, measured: any, timer };
    },

    /* ================= SCHEDA TECNICA VARIETÀ ================= */
    strainFields() {
      return [
        ['varieties', 'Varietà', 'es. Fotoperiodica'],
        ['thc', 'THC', 'es. Fino al 27%'],
        ['cbd', 'CBD', 'es. Basso'],
        ['yieldIn', 'Rese', 'es. 500 – 550 gr/m²'],
        ['yieldOut', "Rese all'aperto", 'es. 550 – 600 gr/plant'],
        ['height', 'Altezza', 'es. 90 – 160 cm'],
        ['heightOut', "Altezza all'aperto", 'es. 130 – 170 cm'],
        ['flowerTime', 'Tempo di fioritura', 'es. 55 – 65 giorni'],
        ['harvestMonth', 'Mese di raccolta', 'es. Metà ottobre'],
        ['geneticsText', 'Patrimonio genetico', 'es. Sour Dubb x Chem Sis x Chocolate Diesel'],
        ['type', 'Tipo', 'es. Sativa 50% Indica 50%'],
        ['effect', 'Effetto', 'es. Calmante, Lucido'],
        ['climate', 'Clima', 'es. Estati brevi'],
        ['flavor', 'Sapore', 'es. Cioccolato, Diesel, Fruttato, Pino']
      ];
    },

    strainInfoModal() {
      const g = this.grow(); if (!g) return;
      const info = g.strainInfo || {};
      const rows = this.strainFields().map(([k, label]) => {
        const val = info[k];
        return `<div class="kv"><span class="k">${U.esc(label)}</span><b>${val ? U.esc(val) : '<span class="mute2">—</span>'}</b></div>`;
      }).join('');
      const body = `
        <div class="muted mb12">${U.esc(g.strain || g.name)}${g.genetics ? ' · ' + U.esc(g.genetics) : ''}</div>
        <div class="card" style="box-shadow:none">${rows}</div>
        <div class="row-btns mt12"><button class="btn sm primary" data-action="edit-strain">✏️ Modifica scheda</button></div>`;
      this.openModal('📋 Scheda tecnica varietà', body, { confirmLabel: 'Chiudi', onConfirm: () => {} });
    },

    strainInfoForm() {
      const g = this.grow(); if (!g) return;
      const info = g.strainInfo || {};
      const body = this.strainFields().map(([k, label, ph]) =>
        `<div class="field"><label>${U.esc(label)}</label><input class="input" data-field="${k}" value="${U.esc(info[k] || '')}" placeholder="${U.esc(ph)}"></div>`
      ).join('');
      this.openModal('✏️ Scheda tecnica varietà', body, {
        confirmLabel: 'Salva',
        onConfirm: (d) => {
          const next = {};
          this.strainFields().forEach(([k]) => { next[k] = (d[k] || '').trim(); });
          Store.updateGrow(g.id, { strainInfo: next });
          this.render(); U.toast('Scheda salvata');
        }
      });
    },

    /* ================= FOTO & TIME-LAPSE ================= */
    photoForm() {
      if (!this.grow()) { U.toast('Crea prima una coltivazione'); return; }
      const body = `
        <div class="hint mb12">📅 ${U.fmtDate(U.todayISO())} · ore ${U.nowTime()}</div>
        <div class="field"><label>Data</label><input class="input" type="date" data-field="date" value="${U.todayISO()}"></div>
        <div class="field"><label>Foto (una o più)</label><input class="input" type="file" accept="image/*" multiple id="photo-input"></div>
        <div class="field"><label>Nota (opz.)</label><input class="input" data-field="notes" placeholder="es. fioritura giorno 20"></div>`;
      this.openModal('📷 Foto giornaliera', body, {
        confirmLabel: 'Salva foto',
        onConfirm: (d) => {
          const el = document.getElementById('photo-input');
          this.readPhotos(el, (imgs) => {
            if (!imgs || !imgs.length) { U.toast('Seleziona almeno una foto'); return; }
            Store.addEntry({ date: d.date || U.todayISO(), time: U.nowTime(), notes: d.notes || 'Foto', tags: ['foto'], photos: imgs });
            this.render(); U.toast('📷 Foto salvata');
          });
        }
      });
    },

    photoList() {
      const g = this.grow();
      if (!g) return [];
      const out = [];
      Store.entriesFor(g.id).forEach(e => (e.photos || []).forEach(src => out.push({ date: e.date, time: e.time || '', src })));
      out.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
      return out;
    },

    timelapse() {
      const g = this.grow(); if (!g) return;
      const photos = this.photoList();
      if (!photos.length) { U.toast('Nessuna foto: aggiungine con 📷 Foto'); return; }
      this.stopTimelapse();
      const wrap = document.createElement('div');
      wrap.className = 'tl-overlay'; wrap.id = 'tl-overlay';
      wrap.innerHTML = `<div class="tl-bar">
          <div class="tl-title">🎞️ Time-lapse · ${photos.length} foto</div>
          <div class="tl-actions">
            <button class="btn sm primary" data-action="tl-play">▶ Play</button>
            <button class="btn sm" data-action="tl-close">✖ Chiudi</button>
          </div>
        </div>
        <div class="tl-stage"><img id="tl-img" src="${photos[0].src}" alt="time-lapse"></div>
        <div class="tl-cap" id="tl-cap">${U.fmtDate(photos[0].date, 'short')}</div>
        <div class="tl-strip">${photos.map((p, i) => `<img src="${p.src}" data-action="tl-go" data-tl-idx="${i}" class="${i === 0 ? 'active' : ''}" alt="">`).join('')}</div>`;
      document.body.appendChild(wrap);
      this.tlPhotos = photos; this.tlIndex = 0; this.tlTimer = null;
    },

    toggleTimelapse() {
      if (this.tlTimer) { clearInterval(this.tlTimer); this.tlTimer = null; const b = U.$('[data-action="tl-play"]'); if (b) b.textContent = '▶ Play'; return; }
      const b = U.$('[data-action="tl-play"]'); if (b) b.textContent = '⏸ Pausa';
      this.tlTimer = setInterval(() => { this.tlShow(this.tlIndex + 1); }, 900);
    },

    tlShow(idx) {
      if (!this.tlPhotos || !this.tlPhotos.length) return;
      this.tlIndex = (idx + this.tlPhotos.length) % this.tlPhotos.length;
      const p = this.tlPhotos[this.tlIndex];
      const img = U.$('#tl-img'); if (img) img.src = p.src;
      const cap = U.$('#tl-cap'); if (cap) cap.textContent = U.fmtDate(p.date, 'short') + (p.time ? ' · ' + p.time : '');
      U.$$('.tl-strip img').forEach((im, i) => { im.classList.toggle('active', i === this.tlIndex); });
    },

    stopTimelapse() {
      if (this.tlTimer) { clearInterval(this.tlTimer); this.tlTimer = null; }
      const el = U.$('#tl-overlay'); if (el) el.remove();
    },

    /* ================= CRONOMETRO LUCE + REPORT ================= */
    updateLightClock() {
      const el = U.$('#light-elapsed');
      const g = this.grow();
      if (!g || !g.light) { if (el) el.textContent = '—'; return; }
      const ls = Store.lightStats(g);
      let txt;
      if (g.light.on && g.light.since) {
        const mins = Math.max(0, Math.floor((Date.now() - Date.parse(g.light.since)) / 60000));
        txt = `Accesa da ${Math.floor(mins / 60)}h ${mins % 60}m · totale ${U.fmt(ls.hours, 1)} h · ${U.fmt(ls.kWh, 2)} kWh`;
      } else {
        txt = `Spenta · totale ${U.fmt(ls.hours, 1)} h · ${U.fmt(ls.kWh, 2)} kWh`;
      }
      if (el) el.textContent = txt;
    },

    report() {
      const g = this.grow();
      if (!g) { U.toast('Nessuna coltivazione'); return; }
      this.stopTimelapse();
      const old = U.$('#report-overlay'); if (old) old.remove();
      const wrap = document.createElement('div');
      wrap.className = 'report-overlay'; wrap.id = 'report-overlay';
      wrap.innerHTML = `
        <div class="report-actions">
          <button class="btn sm primary" data-action="report-print">🖨️ Stampa / PDF</button>
          <button class="btn sm" data-action="report-html">⬇️ Salva HTML</button>
          <button class="btn sm" data-action="export">💾 Backup JSON</button>
          <button class="btn sm" data-action="report-close">✖ Chiudi</button>
        </div>
        <div class="report report-doc" id="report-body">${this.reportHTML(g)}</div>`;
      document.body.appendChild(wrap);
    },

    reportClose() { const el = U.$('#report-overlay'); if (el) el.remove(); },

    reportPrint() { try { window.print(); } catch (e) { U.toast('Stampa non disponibile su questo dispositivo'); } },

    reportDownloadHTML() {
      const g = this.grow(); if (!g) return;
      const html = '<!DOCTYPE html><html lang="it"><head><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width, initial-scale=1">' +
        '<title>GROW FAST &amp; GROW BIG !! - Report</title><style>' + this.reportStyles() + '</style></head>' +
        '<body class="report-doc">' + this.reportHTML(g) + '</body></html>';
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'growfast-report-' + U.todayISO() + '.html';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      U.toast('📄 Report HTML salvato');
    },

    reportStyles() {
      return `
        *{box-sizing:border-box}
        body.report-doc{background:#fff;margin:0;padding:0}
        .report{background:#fff;color:#111;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:22px;max-width:900px;margin:0 auto;font-size:13px;line-height:1.4;overflow-wrap:anywhere}
        .report *{box-sizing:border-box;min-width:0}
        .report h1{font-size:22px;margin:0 0 2px}
        .report .sub{color:#666;font-size:12px;margin-bottom:8px}
        .report h2{font-size:14px;margin:18px 0 8px;border-bottom:2px solid #37d67a;padding-bottom:4px;color:#0b1410;text-transform:uppercase;letter-spacing:.5px}
        .report .kv2{display:flex;justify-content:space-between;gap:10px;border-bottom:1px solid #eee;padding:5px 0}
        .report .kv2 span{color:#555}
        .report table{width:100%;border-collapse:collapse;font-size:11.5px}
        .report th,.report td{border:1px solid #ddd;padding:5px 6px;text-align:left;vertical-align:top}
        .report th{background:#f2f7f4}
        .report .rgrid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:3px}
        .report .rw{font-size:9px;text-align:center;color:#888;font-weight:700}
        .report .rc{aspect-ratio:1;border:1px solid #e6e6e6;border-radius:4px;font-size:9.5px;display:flex;align-items:center;justify-content:center;color:#111;overflow:hidden}
        .report .rc.empty{border:none}
        .report .rmon{margin:10px 0 4px;min-width:0}
        .report .rmon-t{font-weight:700;font-size:12px;text-transform:capitalize;margin-bottom:4px}
        .report .cal-wrap{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}
        .report .legend{display:flex;flex-wrap:wrap;gap:8px 12px;font-size:10.5px;margin:0 0 8px;color:#444}
        .report .legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:4px;vertical-align:middle}
        .report .rday{border:1px solid #e6e6e6;border-left:4px solid #ccc;border-radius:8px;padding:8px 10px;margin-bottom:8px}
        .report .rday-h{font-weight:700;font-size:12.5px;color:#0b1410;margin-bottom:4px}
        .report .rday-h .rday-n{color:#777;font-weight:600}
        .report .rday-kpis{display:flex;flex-wrap:wrap;gap:10px;font-size:11px;color:#333;margin-bottom:4px}
        .report .rday-kpis b{font-weight:700}
        .report .rday-body{font-size:12px;color:#333;white-space:pre-wrap}
        .report .rday-body .rday-int{display:flex;gap:6px;border-top:1px dashed #eee;padding-top:3px;margin-top:3px}
        .report .rday-body .rday-int .t{color:#666;white-space:nowrap}
        .report .empty-day{color:#aaa;font-style:italic}
        .report .gallery{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
        .report .gallery figure{margin:0}
        .report .gallery img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px;border:1px solid #ddd}
        .report .gallery figcaption{font-size:10px;color:#666;text-align:center;margin-top:2px}
        .report .rnote{border:1px solid #eee;border-radius:8px;padding:8px 10px;margin-bottom:8px}
        .report .rnote-h{font-weight:700;font-size:12px;color:#0b1410;margin-bottom:3px}
        .report .rnote-b{color:#333;white-space:pre-wrap}
        .report .rg{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-top:6px}
        .report .rg img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px}
        @media print{ .report{max-width:none;padding:0} @page{margin:12mm} }
      `;
    },

    reportCalendarHTML(g) {
      const start = U.isoToDate(g.startDate);
      const now = new Date();
      let y = start.getFullYear(), m = start.getMonth();
      let out = '', guard = 0;
      while ((y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth())) && guard++ < 40) {
        out += this.reportMonthHTML(g, y, m);
        m++; if (m > 11) { m = 0; y++; }
      }
      return out;
    },

    reportMonthHTML(g, y, m) {
      const first = new Date(y, m, 1);
      const days = new Date(y, m + 1, 0).getDate();
      const offset = (first.getDay() + 6) % 7;
      const withNote = {};
      Store.entriesFor(g.id).forEach(e => { withNote[e.date] = true; });
      let cells = '';
      for (let i = 0; i < offset; i++) cells += '<div class="rc empty"></div>';
      for (let d = 1; d <= days; d++) {
        const iso = U.dateToISO(new Date(y, m, d));
        const isFuture = U.daysBetween(iso, U.todayISO()) < 0;
        const stage = isFuture ? null : Store.stageForDate(g, iso);
        const bg = stage ? `background:${this.colorFor(stage)}` : 'background:#f4f4f4';
        const dot = withNote[iso] ? '<span style="font-size:8px">●</span>' : '';
        cells += `<div class="rc" style="${bg}" title="${iso} ${stage || ''}">${d}${dot}</div>`;
      }
      const name = first.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
      const wd = ['L', 'M', 'M', 'G', 'V', 'S', 'D'].map(x => `<div class="rw">${x}</div>`).join('');
      return `<div class="rmon"><div class="rmon-t">${U.esc(name)}</div><div class="rgrid">${wd}${cells}</div></div>`;
    },

    lightHoursForDate(g, iso) {
      const t0 = U.isoToDate(iso).getTime();
      const t1 = t0 + 86400000;
      let ms = 0;
      ((g.light && g.light.log) || []).forEach(s => {
        const a = Date.parse(s.start);
        const b = s.end ? Date.parse(s.end) : Date.now();
        const from = Math.max(t0, a), to = Math.min(t1, b);
        if (to > from) ms += (to - from);
      });
      return U.round(ms / 3600000, 1);
    },

    waterLitersForDate(g, iso) {
      let l = 0;
      Store.interventionsFor(g.id).forEach(i => {
        if (i.date !== iso) return;
        if (i.type === 'nutrizione') { const v = U.num(i.water); if (v) l += v; }
        else if (i.type === 'irrigazione' || i.type === 'cambio_acqua') { const v = U.num(i.water != null ? i.water : i.amount); if (v) l += v; }
      });
      return U.round(l, 1);
    },

    reportDayByDay(g) {
      const byE = {}, byI = {}, byR = {};
      Store.entriesFor(g.id).forEach(e => { (byE[e.date] = byE[e.date] || []).push(e); });
      Store.interventionsFor(g.id).forEach(i => { (byI[i.date] = byI[i.date] || []).push(i); });
      Store.readingsFor(g.id).forEach(r => { (byR[r.date] = byR[r.date] || []).push(r); });
      const today = U.todayISO();
      let out = '';
      for (let iso = g.startDate; U.daysBetween(iso, today) >= 0; iso = U.addDays(iso, 1)) {
        const stage = Store.stageForDate(g, iso);
        const st = Store.STAGES.find(s => s.id === stage);
        const color = stage ? this.colorFor(stage) : '#bbb';
        const day = U.dayNumber(g.startDate, iso);
        const lh = this.lightHoursForDate(g, iso);
        const wl = this.waterLitersForDate(g, iso);
        const evs = byE[iso] || [];
        const ivs = byI[iso] || [];
        const rs = byR[iso] || [];
        const imgs = evs.reduce((a, e) => a.concat(e.photos || []), []);
        const notes = evs.filter(e => e.notes).map(e => U.esc(e.notes)).join('<br>');
        const rsHtml = ['giorno', 'notte'].map(p => {
          const r = rs.filter(x => (x.period || 'giorno') === p).slice(-1)[0];
          if (!r) return '';
          const parts = [];
          if (r.temp != null) parts.push('🌡️ ' + U.fmt(r.temp, 1) + ' °C');
          if (r.rh != null) parts.push('💧 ' + U.fmt(r.rh, 0) + ' %');
          if (r.vpd != null) parts.push('VPD ' + U.fmt(r.vpd, 2) + ' kPa');
          if (r.ph != null) parts.push('pH ' + U.fmt(r.ph, 2));
          if (r.ec != null) parts.push('EC ' + U.fmt(r.ec, 2));
          if (r.ppfd != null) parts.push('PPFD ' + U.fmt(r.ppfd, 0));
          return `<div class="rday-read"><span class="t">${p === 'notte' ? '🌙 Notte' : '☀️ Giorno'}</span><span>${U.esc(parts.join(' · '))}</span></div>`;
        }).join('');
        const ivHtml = ivs.map(i => {
          const type = (Store.INTERVENTION_TYPES.find(x => x.id === i.type) || {}).label || i.type;
          const det = [i.product, i.amount, i.ph != null ? 'pH ' + U.fmt(i.ph, 1) : '', i.ec != null ? 'EC ' + U.fmt(i.ec, 2) : '', (i.water != null ? U.fmt(i.water, 1) + ' L' : '')].filter(Boolean).join(' · ');
          return `<div class="rday-int"><span class="t">${i.time || ''}</span><span>🔧 <b>${U.esc(type)}</b>${det ? ' — ' + U.esc(det) : ''}${i.notes ? ' · ' + U.esc(i.notes) : ''}</span></div>`;
        }).join('');
        const hasContent = notes || ivHtml || imgs.length || rsHtml;
        out += `<div class="rday" style="border-left-color:${color}">
            <div class="rday-h">${U.esc(U.fmtDate(iso))}${st ? ' · ' + U.esc(st.label) : ''} <span class="rday-n">· giorno ${day}</span></div>
            <div class="rday-kpis">${lh > 0 ? `<span>💡 <b>${U.fmt(lh, 1)} h</b> luce</span>` : ''}${wl > 0 ? `<span>💧 <b>${U.fmt(wl, 1)} L</b> acqua</span>` : ''}${ivs.length ? `<span>🔧 <b>${ivs.length}</b> interventi</span>` : ''}</div>
            ${rsHtml}
            ${notes ? `<div class="rday-body">${notes}</div>` : ''}
            ${ivHtml}
            ${imgs.length ? `<div class="rg">${imgs.map(p => `<img src="${p}" alt="">`).join('')}</div>` : ''}
            ${!hasContent ? '<div class="rday-body empty-day">— nessuna attività registrata —</div>' : ''}
          </div>`;
      }
      return out;
    },

    reportHTML(g) {
      const cons = Store.consumption(g);
      const lt = this.lightToday(g);
      const ph = this.phaseInfo(g);
      const info = g.strainInfo || {};
      const day = U.dayNumber(g.startDate);
      const usedStages = [...new Set(((g.stageLog && g.stageLog.length) ? g.stageLog : [{ stage: g.stage }]).map(s => s.stage))];
      const legend = usedStages.map(sid => { const st = Store.STAGES.find(x => x.id === sid) || {}; return `<span><i style="background:${this.colorFor(sid)}"></i>${U.esc(st.label || sid)}</span>`; }).join('') + '<span><i style="background:#37d67a;border-radius:50%"></i>nota/foto</span>';

      const setupRows = [
        ['Nome', g.name], ['Varietà', g.strain], ['Genetica', g.genetics], ['Inizio', U.fmtDate(g.startDate)],
        ['Giorno', day + ' · ' + ph.phase], ['Settimana', Advice.weekOf(g) + ' di ~' + this.totalWeeks()],
        ['Substrato', g.medium], ['Vaso', g.potSize],
        ['Area', (g.areaW && g.areaD) ? g.areaW + '×' + g.areaD + ' cm (' + U.fmt(g.areaW * g.areaD / 10000, 2) + ' m²)' : ''],
        ['Piante', g.plants], ['Tipo lampada', g.lampType],
        ['Watt vegetativa', g.vegWatts ? g.vegWatts + ' W' : ''], ['Watt fioritura', g.flowerWatts ? g.flowerWatts + ' W' : ''],
        ['Timer vegetativa', (g.schedule && g.schedule.vegHours ? g.schedule.vegHours : 18) + ' h/giorno' + ((g.schedule && (g.schedule.vegOn || g.schedule.vegOff)) ? ` · ON ${g.schedule.vegOn || '—'}${g.schedule.vegOff ? ' → OFF ' + g.schedule.vegOff : ''}` : '')],
        ['Timer fioritura', (g.schedule && g.schedule.flowerHours ? g.schedule.flowerHours : 12) + ' h/giorno' + ((g.schedule && (g.schedule.flowerOn || g.schedule.flowerOff)) ? ` · ON ${g.schedule.flowerOn || '—'}${g.schedule.flowerOff ? ' → OFF ' + g.schedule.flowerOff : ''}` : '')]
      ].filter(r => r[1] != null && r[1] !== '').map(r => `<div class="kv2"><span>${U.esc(r[0])}</span><b>${U.esc(String(r[1]))}</b></div>`).join('');

      const strain = this.strainFields().filter(([k]) => info[k]).map(([k, label]) => `<div class="kv2"><span>${U.esc(label)}</span><b>${U.esc(info[k])}</b></div>`).join('');

      const ints = Store.interventionsFor(g.id).slice().reverse().map(i => {
        const type = (Store.INTERVENTION_TYPES.find(x => x.id === i.type) || {}).label || i.type;
        const liters = (i.water != null) ? i.water : (/^[0-9]+([.,][0-9]+)?$/.test(String(i.amount || '')) ? i.amount : '');
        return `<tr><td>${U.fmtDate(i.date, 'short')}</td><td>${i.time || ''}</td><td>${U.esc(type)}</td><td>${U.esc(i.product || '')}</td><td>${U.esc(i.amount || '')}</td><td>${i.ph != null ? U.fmt(i.ph, 1) : ''}</td><td>${i.ec != null ? U.fmt(i.ec, 2) : ''}</td><td>${liters !== '' ? U.fmt(liters, 1) + ' L' : ''}</td><td>${U.esc(i.notes || '')}</td></tr>`;
      }).join('');

      const expenses = (g.expenses || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || '')).map(e => `<tr><td>${U.fmtDate(e.date, 'short')}</td><td>${U.esc(e.label)}</td><td>${U.fmt(e.amount, 2)} €</td></tr>`).join('');

      const photos = this.photoList();
      const gallery = photos.map(p => `<figure><img src="${p.src}" alt=""><figcaption>${U.fmtDate(p.date, 'short')}</figcaption></figure>`).join('');

      return `
        <h1>🌿 GROW FAST &amp; GROW BIG !!</h1>
        <div class="sub">Report coltivazione · ${U.esc(g.name)}${g.strain ? ' — ' + U.esc(g.strain) : ''} · dal ${U.fmtDate(g.startDate)} al ${U.fmtDate(U.todayISO())} (giorno ${day})</div>

        <h2>Impostazione coltivazione</h2>
        ${setupRows}

        ${strain ? `<h2>Scheda tecnica varietà</h2>${strain}` : ''}

        <h2>Consumi &amp; Costi</h2>
        <div class="kv2"><span>Ore di luce ON totali ${cons.lightMeasured ? '(misurate)' : '(dal timer)'}</span><b>${U.fmt(cons.lightHours, 1)} h</b></div>
        <div class="kv2"><span>Energia · ${U.fmt(Store.state.settings.energyCost, 3)} €/kWh</span><b>${U.fmt(cons.kWh, 2)} kWh · ${U.fmt(cons.energyCost, 2)} €</b></div>
        <div class="kv2"><span>Timer (oggi ON / OFF)</span><b>${U.fmt(lt.on, 1)} h ON / ${U.fmt(24 - lt.on, 1)} h OFF</b></div>
        ${(g.schedule && (g.schedule.vegOn || g.schedule.vegOff || g.schedule.flowerOn || g.schedule.flowerOff)) ? `<div class="kv2"><span>Orari accensione/spegnimento</span><b>Veg ${g.schedule.vegOn || '—'} → ${g.schedule.vegOff || '—'} · Fior. ${g.schedule.flowerOn || '—'} → ${g.schedule.flowerOff || '—'}</b></div>` : ''}
        <div class="kv2"><span>Acqua · ${U.fmt(Store.state.settings.waterCost, 4)} €/L</span><b>${U.fmt(cons.liters, 1)} L · ${U.fmt(cons.waterCost, 2)} €</b></div>
        <div class="kv2"><span>Spese extra</span><b>${U.fmt(cons.extraCost, 2)} €</b></div>
        <div class="kv2" style="font-size:15px"><span><b>COSTO TOTALE</b></span><b>${U.fmt(cons.total, 2)} €</b></div>

        <h2>Calendario (colore per stadio, solo fino ad oggi)</h2>
        <div class="legend">${legend}</div>
        <div class="cal-wrap">${this.reportCalendarHTML(g)}</div>

        <h2>Diario giorno per giorno (${day} giorni)</h2>
        ${this.reportDayByDay(g)}

        ${gallery ? `<h2>Foto / Time-lapse (${photos.length})</h2><div class="gallery">${gallery}</div>` : ''}

        <h2>Interventi (${Store.interventionsFor(g.id).length})</h2>
        <table><thead><tr><th>Data</th><th>Ora</th><th>Tipo</th><th>Prodotto</th><th>Dose</th><th>pH</th><th>EC</th><th>Litri</th><th>Note</th></tr></thead><tbody>${ints || '<tr><td colspan="9">Nessun intervento</td></tr>'}</tbody></table>

        ${expenses ? `<h2>Spese extra</h2><table><thead><tr><th>Data</th><th>Descrizione</th><th>Importo</th></tr></thead><tbody>${expenses}</tbody></table>` : ''}
      `;
    },

    /* ================= FORM: SPESA ================= */
    addExpenseForm() {
      if (!this.grow()) { U.toast('Crea prima una coltivazione'); return; }
      const body = `
        <div class="field"><label>Descrizione</label><input class="input" data-field="label" placeholder="es. Semi, fertilizzanti, terriccio, lampada…"></div>
        <div class="field-row">
          <div class="field"><label>Importo (€)</label><input class="input" type="number" inputmode="decimal" data-field="amount" placeholder="es. 18.50"></div>
          <div class="field"><label>Data</label><input class="input" type="date" data-field="date" value="${U.todayISO()}"></div>
        </div>`;
      this.openModal('Nuova spesa', body, {
        confirmLabel: 'Aggiungi',
        onConfirm: (d) => {
          Store.addExpense({ label: d.label || 'Spesa', amount: U.num(d.amount) || 0, date: d.date });
          this.render(); U.toast('💸 Spesa aggiunta');
        }
      });
    },

    /* ================= CALCOLATORI ================= */
    runCalc() {
      const n = (id) => { const el = document.getElementById(id); return el ? U.num(el.value) : null; };
      const t = n('calc-vpd-t'), rh = n('calc-vpd-rh'), off = n('calc-vpd-off');
      const outV = U.$('#out-vpd'), outVh = U.$('#out-vpd-hint');
      if (outV) {
        if (t != null && rh != null) {
          const v = U.vpd(t, rh, (off == null ? 2 : off));
          outV.textContent = U.fmt(v, 2) + ' kPa';
          const tg = this.target();
          if (tg.vpd) outVh.textContent = (v < tg.vpd[0]) ? 'Sotto il target: UR troppo alta / aria ferma.'
            : (v > tg.vpd[1]) ? 'Sopra il target: aria troppo secca.' : `In target (${tg.vpd[0]}–${tg.vpd[1]} kPa).`;
        } else { outV.textContent = '—'; outVh.textContent = ''; }
      }
      const p = n('calc-dli-p'), h = n('calc-dli-h');
      const outD = U.$('#out-dli'), outDh = U.$('#out-dli-hint');
      if (outD) {
        if (p != null && h != null) {
          const dli = U.dli(p, h);
          outD.textContent = U.fmt(dli, 1) + ' mol/m²/d';
          const tg = this.target();
          outDh.textContent = (dli < tg.dli[0]) ? 'Sotto il target: luce insufficiente.'
            : (dli > tg.dli[1]) ? 'Sopra il target: attenzione a stress/bleaching.' : `In target (${tg.dli[0]}–${tg.dli[1]} mol).`;
        } else { outD.textContent = '—'; outDh.textContent = ''; }
      }
      const cur = n('calc-dil-cur'), tgt = n('calc-dil-tgt'), vol = n('calc-dil-vol');
      const outDil = U.$('#out-dil');
      if (outDil) {
        if (cur != null && tgt != null && vol != null && cur > 0 && tgt > 0) {
          if (cur <= tgt) outDil.innerHTML = 'La soluzione è già alla concentrazione desiderata (o più bassa): aggiungi nutrienti, non acqua.';
          else {
            const waterToAdd = vol * (cur / tgt - 1);
            outDil.innerHTML = `Aggiungi <b class="mono">${U.fmt(waterToAdd, 1)} L</b> di acqua a pH corretto per portare ${U.fmt(vol, 1)} L da EC ${U.fmt(cur, 2)} a EC ${U.fmt(tgt, 2)}.`;
          }
        } else outDil.textContent = '—';
      }
    }
  };

  // EC ⇄ PPM input bidirezionale (usa il punto decimale: NumStr)
  document.addEventListener('input', (e) => {
    if (e.target.id === 'calc-ec') { const p = document.getElementById('calc-ppm'); if (p) p.value = U.numStr(U.num(e.target.value) * 500, 0); }
    if (e.target.id === 'calc-ppm') { const c = document.getElementById('calc-ec'); if (c) c.value = U.numStr(U.num(e.target.value) / 500, 2); }
  });

  global.App = App;

  // Boot
  document.addEventListener('DOMContentLoaded', () => {
    window.Maria = App;
    App.init();
  });
})(window);
