/* ==========================================================================
   Maria — alerts.js : motore di alert (parametri, task, transizioni)
   ========================================================================== */
(function (global) {
  'use strict';
  const U = global.U;
  const Store = global.Store;
  const Advice = global.Advice;

  const Alerts = {
    // Ritorna array ordinato per severità: critical > warning > info > ok
    compute(grow) {
      grow = grow || Store.activeGrow();
      const out = [];
      if (!grow) return out;

      const order = { critical: 0, warning: 1, info: 2, ok: 3 };
      const push = (a) => out.push(a);

      // 1) Parametri dall'ultima lettura
      const last = Store.latestReading(grow.id);
      if (last) {
        const age = last.date ? U.daysBetween(last.date, U.todayISO()) : 0;
        if (age > 0) {
          push({ level: 'info', icon: '🕓', title: 'Lettura datata', text: `L’ultima lettura dei parametri è di ${age} giorn${age === 1 ? 'o' : 'i'} fa. Registra i valori di oggi.` });
        }
        Advice.fromReading(grow, last).forEach(a => push(a));
      } else {
        push({ level: 'info', icon: '📈', title: 'Nessun parametro registrato', text: 'Aggiungi la prima lettura di temperatura, umidità e pH per attivare i controlli automatici.' });
      }

      // 2) Cadenza irrigazione
      const lastWater = Store.lastInterventionDate('irrigazione');
      const stagesIndoor = ['piantina', 'vegetativa', 'fioritura'];
      if (stagesIndoor.includes(grow.stage)) {
        if (lastWater) {
          const d = U.daysBetween(lastWater, U.todayISO());
          const warnDays = grow.stage === 'fioritura' ? 4 : 4;
          if (d >= warnDays + 2) push({ level: 'critical', icon: '💧', title: 'Irrigazione in ritardo', text: `Ultima irrigazione ${d} giorni fa. Verifica il peso del vaso: potresti essere sotto-annaffiato.` });
          else if (d >= warnDays) push({ level: 'warning', icon: '💧', title: 'Controlla l’irrigazione', text: `Sono passati ${d} giorni dall’ultima irrigazione. Controlla l’umidità del substrato (primo dito a secco?)` });
        } else {
          push({ level: 'info', icon: '💧', title: 'Registra l’irrigazione', text: 'Non hai ancora annotato nessuna irrigazione per questa coltivazione.' });
        }
      }

      // 3) Nutrizione
      if (['piantina', 'vegetativa', 'fioritura'].includes(grow.stage)) {
        const lastFeed = Store.lastInterventionDate('nutrizione');
        if (lastFeed) {
          const d = U.daysBetween(lastFeed, U.todayISO());
          if (d >= 10) push({ level: 'warning', icon: '🧪', title: 'Nutrizione da fare', text: `Ultima concimazione ${d} giorni fa. In ${grow.stage} conviene alimentare ogni 5–7 giorni.` });
        }
      }

      // 4) Transizioni di stadio
      const stages = Store.STAGES;
      const idx = stages.findIndex(s => s.id === grow.stage);
      if (idx >= 0 && idx < stages.length - 1) {
        const day = U.dayNumber(grow.startDate);
        const prevDays = stages.slice(0, idx).reduce((a, s) => a + s.days, 0);
        const intoStage = day - prevDays;
        const expected = stages[idx].days;
        if (intoStage > expected && ['germinazione', 'piantina', 'vegetativa', 'fioritura', 'flushing'].includes(grow.stage)) {
          const next = stages[idx + 1];
          push({ level: 'info', icon: '🔀', title: 'Possibile cambio di stadio', text: `Sei al giorno ${intoStage} di ${stages[idx].label} (durata tipica ~${expected} gg). Valuta il passaggio a ${next.label}.` });
        }
      }

      // 5) Finestra di raccolta in fioritura avanzata
      if (grow.stage === 'fioritura') {
        const day = U.dayNumber(grow.startDate);
        const vegDays = stages.slice(0, 3).reduce((a, s) => a + s.days, 0);
        const flowerDay = day - vegDays;
        if (flowerDay >= 55 && flowerDay <= 75) push({ level: 'info', icon: '🔬', title: 'Finestra raccolta', text: `Giorno ${flowerDay} di fioritura: inizia a controllare i tricomi col microscopio (latteo/ambrato).` });
      }

      // 6) Sicurezza in fioritura avanzata
      if (['fioritura', 'flushing'].includes(grow.stage)) {
        const r = Store.latestReading(grow.id);
        if (r && r.rh != null && r.rh > 60) push({ level: 'critical', icon: '🍄', title: 'Rischio muffa elevato', text: `UR ${U.fmt(r.rh, 0)}% in ${grow.stage}: rischio botrite. Aumenta ricambio d’aria e controlla i grumi dei fiori.` });
      }

      if (!out.length) push({ level: 'ok', icon: '🎉', title: 'Tutto sotto controllo', text: 'Nessun alert attivo. Buon lavoro nell’orto!' });

      return out.sort((a, b) => order[a.level] - order[b.level]);
    },

    count(grow) {
      const a = this.compute(grow);
      return a.filter(x => x.level === 'critical' || x.level === 'warning').length;
    }
  };

  global.Alerts = Alerts;
})(window);
