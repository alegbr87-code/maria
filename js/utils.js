/* ==========================================================================
   Maria — utils.js : helper condivisi
   ========================================================================== */
(function (global) {
  'use strict';

  const MS_DAY = 86400000;

  const U = {
    $: (sel, root) => (root || document).querySelector(sel),
    $$: (sel, root) => Array.from((root || document).querySelectorAll(sel)),

    uid(prefix) {
      return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    },

    clamp(v, min, max) { return Math.max(min, Math.min(max, v)); },

    round(v, d) {
      const f = Math.pow(10, d || 0);
      return Math.round((Number(v) + Number.EPSILON) * f) / f;
    },

    // ---- Date helpers (local time) ----
    todayISO() { return U.dateToISO(new Date()); },

    dateToISO(d) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    },

    isoToDate(iso) {
      const [y, m, d] = String(iso).split('-').map(Number);
      return new Date(y, (m || 1) - 1, d || 1);
    },

    nowTime() {
      const d = new Date();
      return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    },

    daysBetween(aISO, bISO) {
      const a = U.isoToDate(aISO).getTime();
      const b = U.isoToDate(bISO).getTime();
      return Math.round((b - a) / MS_DAY);
    },

    dayNumber(startISO, atISO) {
      return U.daysBetween(startISO, atISO || U.todayISO()) + 1;
    },

    addDays(iso, n) {
      const d = U.isoToDate(iso);
      d.setDate(d.getDate() + n);
      return U.dateToISO(d);
    },

    fmtDate(iso, style) {
      if (!iso) return '—';
      const d = U.isoToDate(iso);
      const opts = style === 'short'
        ? { day: '2-digit', month: '2-digit' }
        : { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };
      return d.toLocaleDateString('it-IT', opts);
    },

    fmtDateTime(iso, time) {
      return U.fmtDate(iso, 'short') + (time ? ' · ' + time : '');
    },

    relDay(iso) {
      if (!iso) return '';
      const diff = U.daysBetween(iso, U.todayISO());
      if (diff === 0) return 'oggi';
      if (diff === 1) return 'ieri';
      if (diff === -1) return 'domani';
      if (diff > 0) return diff + ' gg fa';
      return 'tra ' + (-diff) + ' gg';
    },

    // ---- Agronomia ----
    // VPD (kPa): temperatura fogliare ~ temp aria - leafOffset (default 2°C)
    vpd(tempC, rh, leafOffset) {
      if (tempC == null || rh == null || isNaN(tempC) || isNaN(rh)) return null;
      const off = (leafOffset == null ? 2 : leafOffset);
      const leaf = tempC - off;
      const svp = 0.61078 * Math.exp((17.27 * leaf) / (leaf + 237.3)); // kPa
      return U.round(svp * (1 - rh / 100), 2);
    },

    // DLI (mol/m²/die) = PPFD(µmol/m²/s) * ore luce * 3600 / 1e6
    dli(ppfd, hours) {
      if (!ppfd || !hours) return null;
      return U.round((ppfd * hours * 3600) / 1e6, 1);
    },

    // EC (mS/cm) -> PPM (scala 500)
    ecToPpm(ec) { return ec == null ? null : Math.round(ec * 500); },
    ppmToEc(ppm) { return ppm == null ? null : U.round(ppm / 500, 2); },

    // ---- Numbers / strings ----
    num(v) {
      const n = parseFloat(String(v).replace(',', '.'));
      return isNaN(n) ? null : n;
    },

    fmt(v, d) {
      if (v == null || v === '' || isNaN(v)) return '—';
      return Number(v).toFixed(d == null ? 0 : d).replace('.', ',');
    },

    // Stringa numerica per <input type="number"> (punto decimale, NON virgola)
    numStr(v, d) {
      if (v == null || v === '' || isNaN(Number(v))) return '';
      return d == null ? String(Number(v)) : Number(v).toFixed(d);
    },

    // Escapa HTML per inserimenti sicuri negli innerHTML
    esc(str) {
      return String(str == null ? '' : str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },

    clone(obj) { return JSON.parse(JSON.stringify(obj)); },

    slug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); },

    // ---- Storage ----
    store: {
      get(key, fallback) {
        try {
          const raw = localStorage.getItem(key);
          return raw == null ? fallback : JSON.parse(raw);
        } catch (e) { return fallback; }
      },
      set(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); return true; }
        catch (e) { return false; }
      },
      del(key) { try { localStorage.removeItem(key); } catch (e) {} }
    },

    debounce(fn, wait) {
      let t;
      return function (...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), wait || 250);
      };
    },

    // Toast globale
    toast(msg, ms) {
      let wrap = U.$('.toast-wrap');
      if (!wrap) {
        wrap = document.createElement('div');
        wrap.className = 'toast-wrap';
        document.body.appendChild(wrap);
      }
      const t = document.createElement('div');
      t.className = 'toast';
      t.textContent = msg;
      wrap.appendChild(t);
      setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, (ms || 2200) - 300);
      setTimeout(() => t.remove(), ms || 2200);
    }
  };

  global.U = U;
})(window);
