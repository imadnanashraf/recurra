/* =====================================================================
   SMALL CHARTS for the Progress tab (plain SVG, no library)
   Drawn at the real width of their box, redrawn when the window resizes.
   Every mark shows its exact numbers on hover (mouse) or tap (phone).
   ===================================================================== */
const ChartTip = {
  el: null,
  show(e, html) {
    if (!this.el) { this.el = document.createElement('div'); this.el.className = 'chart-tip'; this.el.setAttribute('role', 'status'); document.body.appendChild(this.el); }
    this.el.innerHTML = html; this.el.hidden = false;
    const r = this.el.getBoundingClientRect(), pad = 12;
    let x = e.clientX - r.width / 2, y = e.clientY - r.height - 14;
    x = Math.max(pad, Math.min(x, innerWidth - r.width - pad));
    if (y < pad) y = e.clientY + 18;
    this.el.style.left = x + 'px'; this.el.style.top = y + 'px';
  },
  hide() { if (this.el) this.el.hidden = true; },
};
addEventListener('scroll', () => ChartTip.hide(), { passive: true });

// hover / tap on any element with data-tip inside a chart
function wireTips(box) {
  const at = e => e.target.closest && e.target.closest('[data-tip]');
  box.onpointermove = e => { const t = at(e); if (t) { ChartTip.show(e, t.dataset.tip); box.querySelectorAll('.hot').forEach(x => x !== t && x.classList.remove('hot')); t.classList.add('hot'); } else { ChartTip.hide(); box.querySelectorAll('.hot').forEach(x => x.classList.remove('hot')); } };
  box.onpointerdown = box.onpointermove;
  box.onpointerleave = () => { ChartTip.hide(); box.querySelectorAll('.hot').forEach(x => x.classList.remove('hot')); };
}
const niceMax = v => { if (v <= 5) return 5; const p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; };
const chartWidth = box => Math.max(260, Math.floor(box.getBoundingClientRect().width) || 320);
function chartHead(title, sub) { return `<div class="chart-head"><h3>${esc(title)}</h3>${sub ? `<p>${sub}</p>` : ''}</div>`; }

// Columns: one value per day. data = [{ label, value, tip, muted }]
function columnChart(box, { title, sub, data, every = 7 }) {
  const W = chartWidth(box), H = 168, L = 30, R = 6, T = 10, B = 24;
  const max = niceMax(Math.max(1, ...data.map(d => d.value || 0)));
  const band = (W - L - R) / data.length, bw = Math.max(3, Math.min(22, band - 2)), y = v => T + (H - T - B) * (1 - v / max);
  let g = '';
  for (const t of [0, max / 2, max]) g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="tick" x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${Math.round(t)}</text>`;
  data.forEach((d, i) => {
    const cx = L + band * i + band / 2, x = cx - bw / 2, top = y(d.value || 0), h = H - B - top, r = Math.min(4, bw / 2, h);
    if (d.value) g += `<path class="col${d.muted ? ' muted' : ''}" d="M${x} ${H - B}V${top + r}q0 -${r} ${r} -${r}h${bw - 2 * r}q${r} 0 ${r} ${r}V${H - B}z"/>`;
    if (i % every === (data.length - 1) % every) g += `<text class="tick" x="${cx}" y="${H - 6}" text-anchor="middle">${esc(d.label)}</text>`;
    g += `<rect class="hit" x="${L + band * i}" y="${T}" width="${band}" height="${H - T - B}" data-tip="${esc(d.tip)}"/>`;
  });
  box.innerHTML = chartHead(title, sub) + `<svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">${g}<line class="axis" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/></svg>`;
  wireTips(box);
}

// Line 0–100 %, gaps where there is no value. data = [{ label, value|null, tip }]
function lineChart(box, { title, sub, data, every = 7 }) {
  const W = chartWidth(box), H = 168, L = 36, R = 14, T = 12, B = 24;
  const step = (W - L - R) / Math.max(1, data.length - 1), x = i => L + step * i, y = v => T + (H - T - B) * (1 - v / 100);
  let g = '';
  for (const t of [0, 50, 100]) g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="tick" x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${t}%</text>`;
  const runs = []; let cur = [];
  data.forEach((d, i) => { if (d.value === null) { if (cur.length) runs.push(cur); cur = []; } else cur.push([x(i), y(d.value)]); });
  if (cur.length) runs.push(cur);
  // a soft wash under each run, then the 2px line
  runs.forEach(r => { if (r.length > 1) g += `<path class="wash" d="M${r[0][0]} ${H - B}L${r.map(p => p.join(' ')).join('L')}L${r[r.length - 1][0]} ${H - B}z"/>`; });
  runs.forEach(r => { g += r.length > 1 ? `<path class="line" d="M${r.map(p => p.join(' ')).join('L')}"/>` : ''; });
  data.forEach((d, i) => {
    if (i % every === (data.length - 1) % every) g += `<text class="tick" x="${x(i)}" y="${H - 6}" text-anchor="middle">${esc(d.label)}</text>`;
    if (d.value !== null) g += `<circle class="dot" cx="${x(i)}" cy="${y(d.value)}" r="4"/>`;
    g += `<rect class="hit" x="${x(i) - step / 2}" y="${T}" width="${step}" height="${H - T - B}" data-tip="${esc(d.tip)}"/>`;
  });
  const last = [...data].reverse().find(d => d.value !== null);
  if (last) { const i = data.lastIndexOf(last); g += `<text class="end" x="${Math.min(x(i), W - R)}" y="${y(last.value) - 10}" text-anchor="end">${last.value}%</text>`; }
  box.innerHTML = chartHead(title, sub) + `<svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">${g}<line class="axis" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/></svg>`;
  wireTips(box);
}

// One horizontal bar per row, split into ordered parts. keys = [{ name, cls }]; rows = [{ name, parts: [n...] }]
function stackChart(box, { title, sub, keys, rows }) {
  const W = chartWidth(box), bar = 14, rowH = 46, T = 4, H = T + rows.length * rowH;
  let g = '';
  rows.forEach((r, k) => {
    const tot = r.parts.reduce((a, b) => a + b, 0) || 1, y0 = T + k * rowH;
    g += `<text class="rowname" x="0" y="${y0 + 14}">${esc(r.name)}</text><text class="tick" x="${W}" y="${y0 + 14}" text-anchor="end">${tot} Qs</text>`;
    let x = 0;
    r.parts.forEach((n, i) => {
      if (!n) return;
      const w = W * n / tot, gap = x + w < W - .5 ? 2 : 0;
      g += `<rect class="seg ${keys[i].cls}" x="${x}" y="${y0 + 22}" width="${Math.max(1, w - gap)}" height="${bar}" rx="${x === 0 || x + w >= W - .5 ? 4 : 0}" data-tip="${esc(`<b>${esc(r.name)}</b><br>${keys[i].name}: ${n} of ${tot} (${Math.round(100 * n / tot)}%)`)}"/>`;
      x += w;
    });
  });
  const legend = `<div class="chart-legend">${keys.map(k => `<span><i class="sw ${k.cls}"></i>${esc(k.name)}</span>`).join('')}</div>`;
  box.innerHTML = chartHead(title, sub) + legend + `<svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">${g}</svg>`;
  wireTips(box);
}
