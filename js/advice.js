/* ==========================================================================
   Maria — advice.js : range target per stadio + motore consigli tecnici
   ========================================================================== */
(function (global) {
  'use strict';
  const U = global.U;

  // Range ottimali indicativi per coltivazione indoor.
  // temp day/night in °C, rh in %, vpd in kPa, ph (terra/acqua), ec in mS/cm.
  const TARGETS = {
    germinazione: { tempD: [22, 26], tempN: [20, 24], rh: [70, 85], vpd: [0.4, 0.8], phSoil: [6.0, 6.5], phHydro: [5.5, 6.0], ec: [0.2, 0.6], lightHours: 18, ppfd: [100, 300], dli: [8, 15] },
    piantina:     { tempD: [22, 27], tempN: [20, 24], rh: [65, 75], vpd: [0.6, 1.0], phSoil: [6.0, 6.5], phHydro: [5.6, 6.0], ec: [0.4, 1.0], lightHours: 18, ppfd: [200, 400], dli: [14, 22] },
    vegetativa:   { tempD: [22, 28], tempN: [18, 24], rh: [55, 70], vpd: [0.8, 1.2], phSoil: [6.0, 6.8], phHydro: [5.6, 6.1], ec: [1.0, 1.8], lightHours: 18, ppfd: [400, 700], dli: [25, 40] },
    fioritura:    { tempD: [20, 26], tempN: [18, 22], rh: [40, 55], vpd: [1.0, 1.5], phSoil: [6.0, 6.8], phHydro: [5.6, 6.2], ec: [1.4, 2.4], lightHours: 12, ppfd: [600, 1000], dli: [35, 50] },
    flushing:     { tempD: [20, 26], tempN: [18, 22], rh: [40, 55], vpd: [1.0, 1.5], phSoil: [6.0, 6.8], phHydro: [5.6, 6.0], ec: [0.0, 0.6], lightHours: 12, ppfd: [500, 800], dli: [30, 45] },
    raccolta:     { tempD: [18, 24], tempN: [16, 20], rh: [45, 55], vpd: [0.8, 1.2], phSoil: [0, 14], phHydro: [0, 14], ec: [0, 0], lightHours: 12, ppfd: [0, 200], dli: [0, 10] },
    essiccazione: { tempD: [18, 21], tempN: [16, 20], rh: [45, 55], vpd: null, phSoil: [0, 14], phHydro: [0, 14], ec: [0, 0], lightHours: 0, ppfd: [0, 0], dli: [0, 0] },
    concia:       { tempD: [18, 22], tempN: [16, 20], rh: [58, 62], vpd: null, phSoil: [0, 14], phHydro: [0, 14], ec: [0, 0], lightHours: 0, ppfd: [0, 0], dli: [0, 0] }
  };

  const Advice = {
    TARGETS,

    targetFor(stage) { return TARGETS[stage] || TARGETS.vegetativa; },

    weekOf(grow, dateISO) {
      const day = U.dayNumber(grow.startDate, dateISO);
      return Math.max(1, Math.ceil(day / 7));
    },

    nutrientSchedule(grow, week) {
      const st = grow.stage;
      const table = {
        germinazione: { base: '0,2–0,4 ml/L', boost: '—', note: 'Dosaggi minimi: la piantina vive dei cotiledoni.' },
        piantina:     { base: '0,5–1,0 ml/L', boost: 'Root stimulator 1 ml/L', note: 'Alimenta dolcemente dopo il 2° palco di foglie.' },
        vegetativa:   { base: '1,0–2,0 ml/L (crescita)', boost: 'Cal-Mag 0,5 ml/L', note: 'Aumenta gradualmente ogni settimana. Azoto alto.' },
        fioritura:    { base: '2,0–3,0 ml/L (fioritura) + PK', boost: 'PK 13/14 nelle sett. 4–6', note: 'Abbassa l’azoto, spingi su P-K. Controlla l’EC.' },
        flushing:     { base: '0 ml/L (solo acqua)', boost: '—', note: 'Flush a pH corretto per 7–14 giorni prima della raccolta.' },
        raccolta:     { base: '—', boost: '—', note: 'Nessun nutrimento.' },
        essiccazione: { base: '—', boost: '—', note: 'Dry a 18–21°C e 45–55% UR, al buio.' },
        concia:       { base: '—', boost: '—', note: 'Barattoli con Boveda 62% — burp 2 volte al giorno.' }
      };
      const row = table[st] || table.vegetativa;
      return Object.assign({ week }, row);
    },

    fromReading(grow, r) {
      const out = [];
      if (!grow || !r) return out;
      const t = Advice.targetFor(grow.stage);
      function band(lo, hi, v) { return v < lo ? 'low' : v > hi ? 'high' : 'ok'; }

      if (r.temp != null) {
        const b = band(t.tempD[0], t.tempD[1], r.temp);
        if (b === 'high') out.push({ level: 'warning', icon: '🌡️', title: 'Temperatura alta', text: `Temperatura ${U.fmt(r.temp, 1)}°C sopra il target (${t.tempD[0]}–${t.tempD[1]}°C). Aumenta l’estrazione o allontana la lampada. Sopra i 30°C la fotosintesi cala.` });
        else if (b === 'low') out.push({ level: 'warning', icon: '🌡️', title: 'Temperatura bassa', text: `Temperatura ${U.fmt(r.temp, 1)}°C sotto il target. Riduci l’aspirazione di notte: sotto 18°C la crescita rallenta.` });
      }
      if (r.rh != null) {
        const b = band(t.rh[0], t.rh[1], r.rh);
        if (b === 'high') out.push({ level: grow.stage === 'fioritura' ? 'critical' : 'warning', icon: '💧', title: 'Umidità alta', text: `RH ${U.fmt(r.rh, 0)}% sopra il target (${t.rh[0]}–${t.rh[1]}%). In fioritura >60% rischi botrite: aumenta il ricambio d’aria o usa un deumidificatore.` });
        else if (b === 'low') out.push({ level: 'warning', icon: '🏜️', title: 'Umidità bassa', text: `RH ${U.fmt(r.rh, 0)}% sotto il target. Traspirazione troppo alta: nebulizza o riduci la ventilazione.` });
      }
      if (r.vpd != null && t.vpd) {
        const b = band(t.vpd[0], t.vpd[1], r.vpd);
        if (b === 'high') out.push({ level: 'warning', icon: '⚖️', title: 'VPD alto', text: `VPD ${U.fmt(r.vpd, 2)} kPa: aria troppo “assetata”. Alza l’UR o abbassa la temperatura verso ${t.vpd[0]}–${t.vpd[1]} kPa.` });
        else if (b === 'low') out.push({ level: 'warning', icon: '⚖️', title: 'VPD basso', text: `VPD ${U.fmt(r.vpd, 2)} kPa: poca traspirazione, crescita lenta. Abbassa l’UR o alza la temperatura verso ${t.vpd[0]}–${t.vpd[1]} kPa.` });
      }
      if (r.ph != null && r.ph > 0) {
        const range = grow.medium && /(hidro|dwc|coco)/i.test(grow.medium) ? t.phHydro : t.phSoil;
        if (r.ph < range[0]) out.push({ level: 'warning', icon: '⚗️', title: 'pH basso', text: `pH ${U.fmt(r.ph, 1)} sotto il range (${range[0]}–${range[1]}). Lockout di nutrienti (P/Ca). Usa pH up.` });
        else if (r.ph > range[1]) out.push({ level: 'warning', icon: '⚗️', title: 'pH alto', text: `pH ${U.fmt(r.ph, 1)} sopra il range (${range[0]}–${range[1]}). Rischio lockout (Fe/Mn). Usa pH down.` });
      }
      if (r.ec != null && r.ec > 0) {
        const b = band(t.ec[0], t.ec[1], r.ec);
        if (b === 'high') out.push({ level: 'warning', icon: '📊', title: 'EC alta', text: `EC ${U.fmt(r.ec, 2)} mS/cm sopra il target (${t.ec[0]}–${t.ec[1]}). Rischio sali/bruciature: diluisci o fai un flush leggero.` });
        else if (b === 'low') out.push({ level: 'info', icon: '📊', title: 'EC bassa', text: `EC ${U.fmt(r.ec, 2)} mS/cm sotto il target. Se le foglie schiariscono, aumenta la dose: la pianta ha fame.` });
      }
      if (out.length === 0) out.push({ level: 'ok', icon: '✅', title: 'Parametri in target', text: 'Tutti i parametri sono nei range ottimali per lo stadio corrente. Mantieni la routine.' });
      return out;
    },

    dailyTip(grow) {
      if (!grow) return { icon: '🌱', title: 'Benvenuto', text: 'Crea la tua prima coltivazione per iniziare a registrare giornate, interventi e parametri.' };
      const tips = {
        germinazione: { icon: '🌰', title: 'Germinazione', text: 'Substrato umido ma non bagnato, al buio, 22–26°C. Non “annegare” il seme.' },
        piantina:     { icon: '🌱', title: 'Piantina', text: 'Luce dolce (PPFD ~250), UR 65–75%. Radici fragili: evita stress, non nutrire troppo presto.' },
        vegetativa:   { icon: '🌿', title: 'Vegetativa', text: 'Momento ideale per LST/topping. Fotoperiodo 18/6. Spingi la crescita ma controlla l’EC.' },
        fioritura:    { icon: '🌸', title: 'Fioritura', text: '12/12 continuato, UR bassa (<55%) contro la botrite. Dimezza l’azoto, aumenta P-K. Osserva i tricomi.' },
        flushing:     { icon: '🚿', title: 'Flushing', text: 'Solo acqua a pH corretto per 7–14 giorni per “pulire” i sali e migliorare sapore/aroma.' },
        raccolta:     { icon: '✂️', title: 'Raccolta', text: 'Tricomi: latteo = effetto cerebrale, ambrato 20–30% = rilassante. Taglia e appendi al buio.' },
        essiccazione: { icon: '🌬️', title: 'Essiccazione', text: '18–21°C, 45–55% UR, buio e ricambio d’aria. 7–14 giorni finché gli steli “scricchiolano”.' },
        concia:       { icon: '🫙', title: 'Concia', text: 'Barattoli ermetici 62% UR, burp 2 volte al giorno la prima settimana. Col tempo migliora.' }
      };
      return tips[grow.stage] || tips.vegetativa;
    },

    LAMP_TYPES: ['MH', 'HPS', 'MH + HPS', 'LED', 'CMH / LEC', 'CFL', 'Altro'],

    // Potenza indicativa consigliata (W per m²) e consiglio sull'area/piante
    lightAdvice(grow) {
      if (!grow || !grow.areaW || !grow.areaD) return null;
      const areaM2 = (grow.areaW / 100) * (grow.areaD / 100);
      // Watt per m² realistici (potenza assorbita reale) per coltivazione intensiva indoor
      const perM2 = { 'MH': 300, 'HPS': 400, 'MH + HPS': 350, 'LED': 250, 'CMH / LEC': 300, 'CFL': 130, 'Altro': 250 };
      const base = perM2[grow.lampType] || 250;
      const loW = Math.max(50, Math.round(areaM2 * base * 0.8));
      const hiW = Math.max(70, Math.round(areaM2 * base * 1.25));
      const plants = grow.plants || 1;
      const areaPerPlant = areaM2 / plants;
      const out = {
        areaM2: U.round(areaM2, 2),
        wPerM2: Math.round(base),
        recommended: [loW, hiW],
        plants,
        areaPerPlant: U.round(areaPerPlant, 2)
      };
      // confronto con la potenza di fase dichiarata
      const stage = grow.stage;
      const curW = (stage === 'fioritura' || stage === 'flushing') ? grow.flowerWatts : grow.vegWatts;
      if (curW) {
        out.current = curW;
        out.currentWPerM2 = Math.round(curW / areaM2);
        out.status = curW < loW ? 'low' : curW > hiW ? 'high' : 'ok';
      }
      // densità piante (regola indicativa: 1 pianta ogni 0,25–0,5 m² in SOG)
      out.plantHint = areaPerPlant < 0.15
        ? 'Molte piante per l’area: valuta SOG o vaso più piccolo.'
        : areaPerPlant > 0.6
          ? 'Poche piante per l’area: puoi fare più vegetativa (SCROG/LST).'
          : 'Densità piante equilibrata.';
      return out;
    },

    healthLabel(n) {
      return ['', 'Critica', 'Scarsa', 'Media', 'Buona', 'Ottima'][n] || '—';
    },

    // Consiglio del giorno ampio e contestuale: [{icon,title,text}]
    dailyAdvice(grow, ctx) {
      ctx = ctx || {};
      const out = [];
      const stage = grow.stage;
      const t = this.targetFor(stage);
      const week = ctx.week || this.weekOf(grow, U.todayISO());
      const media = (grow.medium || '').toLowerCase();
      const isHydro = /(hidro|dwc|coco|rwc|nft|aqua)/.test(media);
      const sched = grow.schedule || {};
      const isFlow = ['fioritura', 'flushing'].includes(stage);
      const curOn = isFlow ? sched.flowerOn : sched.vegOn;
      const curOff = isFlow ? sched.flowerOff : sched.vegOff;
      const curH = isFlow ? (sched.flowerHours || 12) : (sched.vegHours || 18);

      const byStage = {
        germinazione: [
          ['🌰', 'Calore & umidità', 'Tieni 22–26 °C e UR 70–85%. Substrato umido ma non bagnato: un seme troppo inzuppato marcisce.'],
          ['⏳', 'Tempi di germinazione', 'In genere 2–7 giorni. Se dopo 7 non esce nulla, controlla la temperatura e prova un ammollo di 12–24h.'],
          ['💡', 'Luce', 'Buio totale finché il germoglio non emerge; poi luce dolce a 18/6.']
        ],
        piantina: [
          ['💡', 'Luce dolce', 'PPFD ~150–300 µmol e lampada a distanza generosa: le piantine sono delicate. Fotoperiodo 18/6.'],
          ['💧', 'Irriga in cerchio', `Annaffia a cerchio attorno allo stelo, non sopra, per stimolare le radici${isHydro ? ' (in idro tieni la soluzione ossigenata)' : ''}.`],
          ['🧪', 'Pochi nutrienti', 'EC 0,4–1,0. Aspetta il 2°–3° palco di foglie vere prima di spingere coi fertilizzanti.']
        ],
        vegetativa: [
          ['🪢', week >= 3 ? 'È il momento di piegare (LST)' : 'Preparati al LST', 'Dal 3°–4° internodo inizia il Low Stress Training: piega la punta per mandare luce ai rami bassi e riempire la chioma.'],
          ['✂️', 'Topping / FIM', week >= 5 ? 'Dalla 5ª settimana circa, tagliando sopra il 5°–6° nodo ottieni 2 cime principali.' : 'Al 5°–6° nodo potrai fare topping per moltiplicare le cime.'],
          ['🕸️', 'SCROG per aree piccole', `Con ${grow.plants || 1} piante su poco spazio, una rete SCROG distribuisce i rami e sfrutta tutta la luce.`],
          ['🌿', 'Leggere le foglie', 'Verde chiaro/giallastro = fame di azoto; verde molto scuro e foglie gocciolanti = troppo azoto.'],
          ['🔆', 'Fotoperiodo stabile', 'Tieni 18/6 costante: irregolarità nella luce rallentano la crescita.']
        ],
        fioritura: [
          ['📈', 'Stretch (sett. 1–3)', 'In fioritura la pianta può raddoppiare: regola la distanza della lampada e piega la punta se si avvicina troppo.'],
          ['🌫️', 'UR bassa', 'Tieni l’umidità sotto il 55% e aria sempre in movimento: difesa n.1 contro la muffa (botrite).'],
          ['🧪', 'Più P-K, meno N', 'Riduci l’azoto e spingi fosforo/potassio; nelle sett. 4–6 un booster PK aiuta le cime.'],
          ['🍃', 'Defogliazione mirata', 'Sett. 3–4: togli solo le foglie che coprono i siti di fioritura, per far arrivare luce e aria.'],
          ['🔬', 'Controlla i tricomi', week >= 8 ? 'Col microscopio: lattei = più cerebrale, ambrati 20–30% = più rilassante.' : 'Dalla fine fioritura osserva i tricomi per capire il momento di raccolta.'],
          ['🚿', 'Prepara il flush', week >= 8 ? 'Interrompi i nutrienti e fai 7–14 giorni di sola acqua a pH corretto.' : '7–14 giorni prima della raccolta farai il flush (sola acqua).']
        ],
        flushing: [
          ['🚿', 'Solo acqua', 'Nessun nutriente per 7–14 giorni, a pH corretto. Ultime 24–48h di buio (opzionale) per spingere la resina.'],
          ['👃', 'Senti l’aroma', 'Durante il flush l’odore diventa pungente e complesso: sei vicino alla raccolta.']
        ],
        raccolta: [['✂️', 'Taglio & secca', 'Taglia al buio e appendi i rami a 18–21 °C, UR 45–55%, con ricambio d’aria.']],
        essiccazione: [['🌬️', 'Dry 7–14 gg', '18–21 °C, 45–55% UR, buio. Pronto quando uno stelo si spezza “a scricchiolio”.']],
        concia: [['🫙', 'Curing', 'Barattoli ermetici a 62% UR, “burp” 2 volte al giorno la prima settimana: migliora aroma e sapore.']]
      };

      (byStage[stage] || byStage.vegetativa).forEach(([icon, title, text]) => out.push({ icon, title, text }));

      // timer / orari
      if (['piantina', 'vegetativa', 'fioritura', 'flushing'].includes(stage)) {
        out.push({ icon: '⏱️', title: 'Timer luce', text: `Fase ${stage}: ${curH}h di luce al giorno${curOn ? ' — ON alle ' + curOn : ''}${curOff ? ', OFF alle ' + curOff : ''}. ${isFlow ? 'In fioritura il buio deve essere assoluto: le interruzioni causano ermafroditismo.' : 'Mantieni il fotoperiodo costante.'}` });
      }

      // media (terra / idro)
      if (isHydro) {
        out.push({ icon: '💧', title: 'Idroponica / cocco', text: `pH ${t.phHydro[0]}–${t.phHydro[1]}, EC ${t.ec[0]}–${t.ec[1]}. Nutri più spesso, ossigena la soluzione, attento a calcio/magnesio nel cocco.` });
      } else {
        out.push({ icon: '🪴', title: 'Irrigazione in terra', text: `pH ${t.phSoil[0]}–${t.phSoil[1]}, EC ${t.ec[0]}–${t.ec[1]}. Annaffia quando i primi 2–3 cm sono asciutti (o dal peso del vaso): meglio bagnare a fondo e diradare.` });
      }

      // parametri fuori range
      if (ctx.reading) {
        const rng = (ctx.reading.period === 'notte') ? t.tempN : t.tempD;
        if (ctx.reading.temp != null && (ctx.reading.temp < rng[0] || ctx.reading.temp > rng[1])) {
          out.push({ icon: '🌡️', title: 'Temperatura fuori target', text: `Ultima lettura (${ctx.reading.period === 'notte' ? 'notte' : 'giorno'}): ${U.fmt(ctx.reading.temp, 1)}°C — range ${rng[0]}–${rng[1]}°C. Regola ventilazione/riscaldamento.` });
        }
        if (ctx.reading.rh != null && (ctx.reading.rh < t.rh[0] || ctx.reading.rh > t.rh[1])) {
          out.push({ icon: '💦', title: 'Umidità da correggere', text: `Ultima lettura: ${U.fmt(ctx.reading.rh, 0)}% (range ${t.rh[0]}–${t.rh[1]}%). ${ctx.reading.rh > t.rh[1] ? 'Aumenta il ricambio d’aria.' : 'Nebulizza o riduci l’estrazione.'}` });
        }
      }

      // reminder operativi
      if (ctx.daysSinceWater != null && ctx.daysSinceWater >= 3 && ['piantina', 'vegetativa', 'fioritura', 'flushing'].includes(stage)) {
        out.push({ icon: '💧', title: 'Controlla l’acqua', text: `Sono passati ${ctx.daysSinceWater} giorni dall’ultima irrigazione: verifica l’umidità del substrato.` });
      }
      if (ctx.daysSinceFeed != null && ctx.daysSinceFeed >= 7 && ['piantina', 'vegetativa', 'fioritura'].includes(stage)) {
        out.push({ icon: '🧪', title: 'Nutrizione in arrivo', text: `Ultima concimazione ${ctx.daysSinceFeed} giorni fa: in ${stage} conviene alimentare ogni 5–7 giorni.` });
      }

      return out;
    }
  };

  global.Advice = Advice;
})(window);
