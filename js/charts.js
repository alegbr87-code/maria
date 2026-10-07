/* ==========================================================================
   Maria — charts.js : mini-grafici SVG senza dipendenze
   ========================================================================== */
(function (global) {
  'use strict';
  const U = global.U;

  const Charts = {
    // series: [{ name, color, points: [{x:number, y:number}] }]
    line(series, opts) {
      opts = opts || {};
      const W = 340, H = opts.height || 160;
      const pad = { l: 34, r: 10, t: 12, b: 22 };

      const valid = series.filter(s => s.points && s.points.length);
      if (!valid.length) {
        return `<div class="empty" style="padding:18px">Nessun dato da mostrare</div>`;
      }
      const allX = valid.flatMap(s => s.points.map(p => p.x));
      const allY = valid.flatMap(s => s.points.map(p => p.y)).filter(v => v != null && !isNaN(v));
      let minX = Math.min(...allX), maxX = Math.max(...allX);
      let minY = Math.min(...allY), maxY = Math.max(...allY);
      if (opts.minY != null) minY = opts.minY;
      if (opts.maxY != null) maxY = opts.maxY;
      if (maxX === minX) { maxX += 1; minX -= 1; }
      if (maxY === minY) { maxY += 1; minY -= 1; }
      const padY = (maxY - minY) * 0.12;
      minY -= padY; maxY += padY;

      const sx = x => pad.l + ((x - minX) / (maxX - minX)) * (W - pad.l - pad.r);
      const sy = y => pad.t + (1 - (y - minY) / (maxY - minY)) * (H - pad.t - pad.b);

      // griglia + etichette Y
      let grid = '';
      const ticks = 4;
      for (let i = 0; i <= ticks; i++) {
        const yy = pad.t + (i / ticks) * (H - pad.t - pad.b);
        const val = maxY - (i / ticks) * (maxY - minY);
        grid += `<line x1="${pad.l}" y1="${yy.toFixed(1)}" x2="${W - pad.r}" y2="${yy.toFixed(1)}" stroke="#244536" stroke-width="1" opacity="0.5"/>`;
        grid += `<text x="${pad.l - 5}" y="${(yy + 3).toFixed(1)}" fill="#6f8a7d" font-size="9" text-anchor="end">${U.fmt(val, opts.decimals == null ? 0 : opts.decimals)}</text>`;
      }

      // bande target opzionali
      let bands = '';
      if (opts.band) {
        const y1 = sy(opts.band[1]), y2 = sy(opts.band[0]);
        bands = `<rect x="${pad.l}" y="${Math.min(y1, y2).toFixed(1)}" width="${(W - pad.l - pad.r).toFixed(1)}" height="${Math.abs(y2 - y1).toFixed(1)}" fill="#37d67a" opacity="0.08"/>`;
      }

      // linee
      let paths = '';
      valid.forEach(s => {
        const d = s.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
        paths += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`;
        const last = s.points[s.points.length - 1];
        paths += `<circle cx="${sx(last.x).toFixed(1)}" cy="${sy(last.y).toFixed(1)}" r="3.2" fill="${s.color}"/>`;
      });

      // etichette X (prima/ultima)
      const xLabels = `
        <text x="${pad.l}" y="${H - 6}" fill="#6f8a7d" font-size="9" text-anchor="start">${U.esc(opts.xLabels ? opts.xLabels[0] : '')}</text>
        <text x="${W - pad.r}" y="${H - 6}" fill="#6f8a7d" font-size="9" text-anchor="end">${U.esc(opts.xLabels ? opts.xLabels[opts.xLabels.length - 1] : '')}</text>`;

      return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img">${bands}${grid}${paths}${xLabels}</svg>`;
    },

    // barre verticali: items [{label, value, color}]
    bars(items, opts) {
      opts = opts || {};
      const W = 340, H = opts.height || 140, pad = { l: 8, r: 8, t: 10, b: 26 };
      if (!items.length) return `<div class="empty" style="padding:18px">Nessun dato</div>`;
      const max = Math.max(...items.map(i => i.value), opts.max || 1);
      const bw = (W - pad.l - pad.r) / items.length;
      let out = '';
      items.forEach((it, i) => {
        const h = (it.value / max) * (H - pad.t - pad.b);
        const x = pad.l + i * bw + bw * 0.16;
        const y = H - pad.b - h;
        out += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(bw * 0.68).toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" rx="4" fill="${it.color || '#37d67a'}"/>`;
        out += `<text x="${(x + bw * 0.34).toFixed(1)}" y="${H - 8}" fill="#6f8a7d" font-size="9" text-anchor="middle">${U.esc(it.label)}</text>`;
      });
      return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${out}</svg>`;
    }
  };

  global.Charts = Charts;
})(window);
