/* =====================================================================
   ROUGH WORK in quizzes and live tests (the ✏️ tab of Tools).
   - Draw with a finger, stylus or mouse. Lines are smoothed a little as you draw.
   - Hold still for half a second at the end of a line, circle, box or triangle:
     it straightens into a clean shape. "Keep mine" brings your own stroke back.
   - With a stylus, your hand on the screen is ignored. Two fingers move and zoom.
   - Aa: type on the same page. Lines with "=" are checked quietly:
     "2k × 1.18 = 2400" gets "≈ 2,360"; "2k × 1.18 =" shows the answer.
   - ✨ Make neat (only with your own Google AI key): turns handwriting into
     typed text as a suggestion; your drawing stays unless you choose "Use neat".
   - Every question starts with a fresh page, like rough paper. Nothing is saved.
   ===================================================================== */
const Rough = {
  strokes: [], undo: [], view: { x: 0, y: 0, s: 1 }, tool: 'pen', thick: false, color: 'ink', grid: false, typing: false,
  ptrs: new Map(), cur: null, pan: null, penSeen: false, built: false, chipTimer: null, neat: null, neatBusy: false,
};
const R_COLORS = ['ink', 'blue', 'red'];
const roughColor = c => { const cs = getComputedStyle(document.documentElement); return c === 'blue' ? (cs.getPropertyValue('--accent-2').trim() || '#2f7fe0') : c === 'red' ? (cs.getPropertyValue('--danger').trim() || '#e5484d') : (cs.getPropertyValue('--ink').trim() || '#111'); };
const rIc = {
  pen: '<svg viewBox="0 0 24 24"><path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z"/><path d="M14.5 6.5l3 3"/></svg>',
  eraser: '<svg viewBox="0 0 24 24"><path d="M8.5 20H20M5.6 14.4l7.8-7.8a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L11 19H8.2l-2.6-2.6a1.4 1.4 0 0 1 0-2z"/><path d="M9.5 10.5l5 5"/></svg>',
  undo: '<svg viewBox="0 0 24 24"><path d="M9 7L4 12l5 5"/><path d="M4 12h10a6 6 0 0 1 0 12h-2" transform="translate(0 -6)"/></svg>',
  clear: '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/></svg>',
  grid: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 9.3h16M4 14.7h16M9.3 4v16M14.7 4v16"/></svg>',
  neat: '<svg viewBox="0 0 24 24"><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6zM18.5 14l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8zM5.5 15l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z"/></svg>',
};
const roughNeatOK = () => typeof aiMode === 'function' && aiMode() === 'own';

function roughBuild(box) {
  if (!box || Rough.built) return;
  Rough.built = true;
  box.innerHTML = `
    <div class="rough-bar" role="toolbar" aria-label="Rough work tools">
      <button type="button" class="rb" data-rt="pen" aria-label="Pen" title="Pen (tap again: thicker)">${rIc.pen}<i class="rb-dot"></i></button>
      <button type="button" class="rb rb-color" data-rt="color" aria-label="Colour" title="Colour"><i></i></button>
      <button type="button" class="rb" data-rt="eraser" aria-label="Eraser" title="Eraser">${rIc.eraser}</button>
      <span class="rb-sep" aria-hidden="true"></span>
      <button type="button" class="rb" data-rt="undo" aria-label="Undo" title="Undo (Z)">${rIc.undo}</button>
      <button type="button" class="rb" data-rt="clear" aria-label="Clear the page" title="Clear the page">${rIc.clear}</button>
      <span class="rb-sep" aria-hidden="true"></span>
      <button type="button" class="rb" data-rt="grid" aria-label="Grid paper" title="Grid paper">${rIc.grid}</button>
      <button type="button" class="rb rb-aa" data-rt="type" aria-label="Type" title="Type on the page">Aa</button>
      <button type="button" class="rb rb-neat" data-rt="neat" aria-label="Make neat" title="Make neat: handwriting to typed text">${rIc.neat}<span>Neat</span></button>
    </div>
    <div class="rough-paper" id="roughPaper">
      <canvas id="roughCanvas" aria-label="Rough work page"></canvas>
      <div class="rough-type" id="roughType">
        <div class="rough-marks" id="roughMarks" aria-hidden="true"></div>
        <textarea id="roughText" spellcheck="false" autocomplete="off" autocapitalize="off" placeholder="Type your working… e.g. 2k × 1.18 =" aria-label="Typed rough work"></textarea>
      </div>
      <div class="rough-empty" id="roughEmpty"><b>Rough work</b><small>Draw here. Hold still at the end of a line or shape to straighten it.</small><small class="re-touch">Two fingers move the page.</small></div>
      <button type="button" class="rough-chip" id="roughChip" hidden>Keep mine</button>
      <div class="rough-neat" id="roughNeat" hidden></div>
    </div>`;
  const paper = $('roughPaper'), cv = $('roughCanvas');
  box.querySelector('.rough-bar').addEventListener('click', roughBarClick);
  paper.addEventListener('pointerdown', roughDown);
  paper.addEventListener('pointermove', roughMove);
  ['pointerup', 'pointercancel'].forEach(n => paper.addEventListener(n, roughUp));
  paper.addEventListener('wheel', e => {
    if (Rough.typing) return;
    e.preventDefault();
    const v = Rough.view;
    if (e.ctrlKey) { const r = cv.getBoundingClientRect(); roughZoom(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top); }
    else { v.x -= e.deltaX; v.y -= e.deltaY; roughDraw(); }
  }, { passive: false });
  $('roughChip').addEventListener('click', roughKeepMine);
  const ta = $('roughText');
  ta.addEventListener('input', roughMarks);
  ta.addEventListener('scroll', roughMarks);
  if ('ResizeObserver' in window) new ResizeObserver(() => roughSize()).observe(paper);
  roughPaintBar();
}
function roughPaintBar() {
  const box = $('rough'); if (!box) return;
  box.querySelectorAll('[data-rt]').forEach(b => {
    const t = b.dataset.rt;
    if (t === 'pen' || t === 'eraser') b.setAttribute('aria-pressed', String(Rough.tool === t && !Rough.typing));
    if (t === 'grid') b.setAttribute('aria-pressed', String(Rough.grid));
    if (t === 'type') b.setAttribute('aria-pressed', String(Rough.typing));
    if (t === 'undo') b.disabled = !Rough.undo.length;
    if (t === 'clear') b.disabled = !Rough.strokes.length && !$('roughText').value;
    if (t === 'neat') { b.hidden = !roughNeatOK(); b.disabled = !Rough.strokes.length || Rough.neatBusy; b.classList.toggle('busy', Rough.neatBusy); }
  });
  box.querySelector('.rb-dot').classList.toggle('thick', Rough.thick);
  box.querySelector('.rb-color i').style.background = roughColor(Rough.color);
  box.querySelector('.rb-color').disabled = Rough.typing;
  const paper = $('roughPaper');
  paper.classList.toggle('grid', Rough.grid);
  paper.classList.toggle('typing', Rough.typing);
  paper.classList.toggle('erasing', Rough.tool === 'eraser' && !Rough.typing);
  const empty = !Rough.strokes.length && !$('roughText').value && !Rough.typing;
  $('roughEmpty').hidden = !empty;
  $('roughEmpty').classList.toggle('nopen', Rough.penSeen);
  roughGridPos();
}
function roughBarClick(e) {
  const b = e.target.closest('[data-rt]'); if (!b || b.disabled) return;
  const t = b.dataset.rt;
  if (typeof Native !== 'undefined' && Native.tap) Native.tap();
  if (t === 'pen') { if (Rough.tool === 'pen' && !Rough.typing) Rough.thick = !Rough.thick; Rough.tool = 'pen'; roughSetTyping(false); }
  else if (t === 'eraser') { Rough.tool = 'eraser'; roughSetTyping(false); }
  else if (t === 'color') { Rough.color = R_COLORS[(R_COLORS.indexOf(Rough.color) + 1) % R_COLORS.length]; Rough.tool = 'pen'; }
  else if (t === 'undo') roughUndo();
  else if (t === 'clear') roughClear();
  else if (t === 'grid') Rough.grid = !Rough.grid;
  else if (t === 'type') roughSetTyping(!Rough.typing);
  else if (t === 'neat') return roughNeat();
  roughPaintBar();
}
function roughSetTyping(on) {
  Rough.typing = on;
  const ta = $('roughText');
  if (on) { setTimeout(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 30); }
  else ta.blur();
  roughPaintBar(); roughMarks();
}

/* ---------- the page: size, view (move and zoom), drawing ---------- */
function roughSize() {
  const cv = $('roughCanvas'), paper = $('roughPaper'); if (!cv || !paper) return;
  const r = paper.getBoundingClientRect(), dpr = Math.min(3, window.devicePixelRatio || 1);
  if (!r.width || !r.height) return;
  cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
  cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
  roughDraw();
}
function roughShown() { roughSize(); roughPaintBar(); roughMarks(); }
function roughGridPos() {
  const p = $('roughPaper'), v = Rough.view; if (!p) return;
  p.style.setProperty('--gs', (24 * v.s) + 'px');
  p.style.setProperty('--gx', v.x + 'px'); p.style.setProperty('--gy', v.y + 'px');
}
function roughZoom(f, cx, cy) {
  const v = Rough.view, s = Math.min(3, Math.max(0.5, v.s * f));
  v.x = cx - (cx - v.x) * (s / v.s); v.y = cy - (cy - v.y) * (s / v.s); v.s = s;
  roughDraw();
}
const roughWidth = s => (s.thick ? 4.2 : 2.2);
function roughDraw() {
  const cv = $('roughCanvas'); if (!cv || !cv.width) return;
  const ctx = cv.getContext('2d'), dpr = cv.width / (parseFloat(cv.style.width) || cv.width), v = Rough.view;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.setTransform(dpr * v.s, 0, 0, dpr * v.s, dpr * v.x, dpr * v.y);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const s of Rough.strokes) roughStroke(ctx, s);
  if (Rough.cur && Rough.cur.kind === 'erase') {
    const p = Rough.cur.at; if (p) { ctx.beginPath(); ctx.arc(p[0], p[1], 11 / v.s, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(128,128,128,.6)'; ctx.lineWidth = 1 / v.s; ctx.stroke(); }
  }
  roughGridPos();
}
// a stroke: smooth curves through the midpoints; a stylus gets thicker where you press harder
function roughStroke(ctx, s) {
  const P = s.pts; if (!P.length) return;
  ctx.strokeStyle = roughColor(s.color); ctx.fillStyle = ctx.strokeStyle;
  const w = roughWidth(s);
  if (P.length === 1) { ctx.beginPath(); ctx.arc(P[0][0], P[0][1], w * 0.6, 0, Math.PI * 2); ctx.fill(); return; }
  if (s.shape || !s.pressure) {
    ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]);
    if (s.shape) for (let i = 1; i < P.length; i++) ctx.lineTo(P[i][0], P[i][1]);
    else {
      for (let i = 1; i < P.length - 1; i++) { const mx = (P[i][0] + P[i + 1][0]) / 2, my = (P[i][1] + P[i + 1][1]) / 2; ctx.quadraticCurveTo(P[i][0], P[i][1], mx, my); }
      ctx.lineTo(P[P.length - 1][0], P[P.length - 1][1]);
    }
    ctx.stroke(); return;
  }
  for (let i = 1; i < P.length; i++) {
    ctx.lineWidth = w * (0.55 + 0.9 * ((P[i][2] + P[i - 1][2]) / 2));
    ctx.beginPath(); ctx.moveTo(P[i - 1][0], P[i - 1][1]); ctx.lineTo(P[i][0], P[i][1]); ctx.stroke();
  }
}
// screen → page position
function roughAt(e) {
  const r = $('roughCanvas').getBoundingClientRect(), v = Rough.view;
  return [(e.clientX - r.left - v.x) / v.s, (e.clientY - r.top - v.y) / v.s, e.pressure || 0.5];
}

/* ---------- finger, stylus and mouse ---------- */
function roughDown(e) {
  if (Rough.typing || e.target.closest('.rough-chip, .rough-neat')) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  e.preventDefault();
  $('roughPaper').setPointerCapture(e.pointerId);
  if (e.pointerType === 'pen') Rough.penSeen = true;
  Rough.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
  const touches = [...Rough.ptrs.values()].filter(p => p.type === 'touch');
  // a stylus is drawing, or you rest your hand: touches move the page instead
  const touchMoves = e.pointerType === 'touch' && (Rough.penSeen || touches.length >= 2);
  if (touchMoves) {
    if (Rough.cur && Rough.cur.kind === 'draw' && Rough.cur.ptr !== e.pointerId && (Rough.cur.s.pts.length < 14 || Date.now() - Rough.cur.t0 < 220) && Rough.cur.type === 'touch') {
      Rough.strokes.pop(); Rough.cur = null;            // the first finger of a two-finger move was not a line
    }
    if (!Rough.cur || Rough.cur.type === 'touch') { Rough.cur = null; roughPanStart(); }
    roughDraw(); return;
  }
  if (Rough.cur) return;
  const p = roughAt(e);
  if (Rough.tool === 'eraser') { Rough.cur = { kind: 'erase', ptr: e.pointerId, removed: [], at: p }; roughErase(p); roughDraw(); return; }
  const s = { pts: [p], color: Rough.color, thick: Rough.thick, pressure: e.pointerType === 'pen' };
  Rough.strokes.push(s);
  Rough.cur = { kind: 'draw', ptr: e.pointerId, s, type: e.pointerType, t0: Date.now(), still: Date.now(), last: p, raw: [p] };
  roughHoldWatch();
  roughPaintBar(); roughDraw();
}
function roughMove(e) {
  const pt = Rough.ptrs.get(e.pointerId); if (!pt) return;
  pt.x = e.clientX; pt.y = e.clientY;
  if (Rough.pan) return roughPanMove();
  const c = Rough.cur; if (!c || c.ptr !== e.pointerId) return;
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  for (const ev of evs.length ? evs : [e]) {
    const p = roughAt(ev);
    if (c.kind === 'erase') { c.at = p; roughErase(p); continue; }
    if (c.snapped) continue;
    const L = c.s.pts[c.s.pts.length - 1], k = c.type === 'pen' ? 0.75 : 0.5;    // smoothing: each point leans toward the last one
    const q = [L[0] + (p[0] - L[0]) * k, L[1] + (p[1] - L[1]) * k, p[2]];
    if (Math.hypot(q[0] - L[0], q[1] - L[1]) * Rough.view.s < 0.8) continue;
    c.s.pts.push(q); c.raw.push(p);
    if (Math.hypot(p[0] - c.last[0], p[1] - c.last[1]) * Rough.view.s > 4) { c.still = Date.now(); c.last = p; }
  }
  roughDraw();
}
function roughUp(e) {
  Rough.ptrs.delete(e.pointerId);
  if (Rough.pan) { if ([...Rough.ptrs.values()].filter(p => p.type === 'touch').length < (Rough.penSeen ? 1 : 2)) Rough.pan = null; else roughPanStart(); return; }
  const c = Rough.cur; if (!c || c.ptr !== e.pointerId) return;
  clearInterval(c.hold);
  Rough.cur = null;
  if (c.kind === 'erase') { if (c.removed.length) Rough.undo.push({ t: 'erase', items: c.removed }); }
  else {
    const last = roughAt(e); if (!c.snapped && Math.hypot(last[0] - c.s.pts[c.s.pts.length - 1][0], last[1] - c.s.pts[c.s.pts.length - 1][1]) > 0.5) c.s.pts.push(last);
    Rough.undo.push({ t: 'add', s: c.s });
    if (c.snapped && typeof tipMark === 'function') tipMark('snap');                // you found it yourself: no tip needed
    else if (typeof tipsRoughStroke === 'function') tipsRoughStroke(c.s);
  }
  roughPaintBar(); roughDraw();
}
function roughPanStart() {
  const pts = [...Rough.ptrs.values()].filter(p => p.type === 'touch');
  const mid = { x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: pts.reduce((a, p) => a + p.y, 0) / pts.length };
  const d = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
  Rough.pan = { mid, d, v: { ...Rough.view } };
}
function roughPanMove() {
  const pts = [...Rough.ptrs.values()].filter(p => p.type === 'touch'); if (!pts.length) return;
  const P = Rough.pan, mid = { x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: pts.reduce((a, p) => a + p.y, 0) / pts.length };
  const r = $('roughCanvas').getBoundingClientRect(), v = Rough.view;
  let s = P.v.s;
  if (pts.length > 1 && P.d > 10) s = Math.min(3, Math.max(0.5, P.v.s * Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) / P.d));
  const ax = P.mid.x - r.left, ay = P.mid.y - r.top;                    // keep the page point under your fingers
  v.s = s; v.x = mid.x - r.left - (ax - P.v.x) * (s / P.v.s); v.y = mid.y - r.top - (ay - P.v.y) * (s / P.v.s);
  roughDraw();
}
function roughErase(p) {
  const r = 11 / Rough.view.s;
  for (let i = Rough.strokes.length - 1; i >= 0; i--) {
    const s = Rough.strokes[i];
    if (s.pts.some((q, k) => Math.hypot(q[0] - p[0], q[1] - p[1]) < r + roughWidth(s) || (k && segDist(p, s.pts[k - 1], q) < r))) {
      Rough.cur.removed.push({ s, i }); Rough.strokes.splice(i, 1);
    }
  }
}
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function roughUndo() {
  const a = Rough.undo.pop(); if (!a) return;
  if (a.t === 'add') { const i = Rough.strokes.indexOf(a.s); if (i >= 0) Rough.strokes.splice(i, 1); }
  else if (a.t === 'erase') [...a.items].reverse().forEach(({ s, i }) => Rough.strokes.splice(Math.min(i, Rough.strokes.length), 0, s));
  else if (a.t === 'clear') { Rough.strokes = a.strokes; $('roughText').value = a.text; }
  else if (a.t === 'snap') { a.s.pts = a.orig; delete a.s.shape; }
  else if (a.t === 'neat') { Rough.strokes = a.strokes; $('roughText').value = a.text; }
  $('roughChip').hidden = true;
  roughPaintBar(); roughDraw(); roughMarks();
}
function roughClear() {
  if (!Rough.strokes.length && !$('roughText').value) return;
  Rough.undo.push({ t: 'clear', strokes: Rough.strokes, text: $('roughText').value });
  Rough.strokes = []; $('roughText').value = '';
  $('roughChip').hidden = true; $('roughNeat').hidden = true;
  roughPaintBar(); roughDraw(); roughMarks();
}

/* ---------- hold to straighten: line, circle / ellipse, triangle, box ---------- */
function roughHoldWatch() {
  const c = Rough.cur;
  c.hold = setInterval(() => {
    if (Rough.cur !== c || c.snapped) return clearInterval(c.hold);
    if (Date.now() - c.still < 520 || c.raw.length < 6) return;
    clearInterval(c.hold);
    const shape = roughShape(c.raw);
    if (!shape) return;
    c.snapped = true;
    const orig = c.s.pts;
    c.s.pts = shape.pts.map(p => [p[0], p[1], 0.5]); c.s.shape = shape.type;
    Rough.undo.push({ t: 'snap', s: c.s, orig });
    if (typeof Native !== 'undefined' && Native.tap) Native.tap();
    roughDraw(); roughChip(c.s, orig);
  }, 90);
}
function roughChip(s, orig) {
  const chip = $('roughChip'), v = Rough.view;
  const xs = s.pts.map(p => p[0]), ys = s.pts.map(p => p[1]);
  const x = Math.min(...xs) * v.s + v.x, y = Math.max(...ys) * v.s + v.y;
  const paper = $('roughPaper').getBoundingClientRect();
  chip.style.left = Math.max(6, Math.min(paper.width - 110, x)) + 'px';
  chip.style.top = Math.max(6, Math.min(paper.height - 40, y + 10)) + 'px';
  chip.hidden = false; chip.textContent = `Keep mine`;
  chip._s = s; chip._orig = orig;
  chip.classList.remove('in'); void chip.offsetWidth; chip.classList.add('in');
  clearTimeout(Rough.chipTimer); Rough.chipTimer = setTimeout(() => { chip.hidden = true; }, 4500);
}
function roughKeepMine() {
  const chip = $('roughChip'), s = chip._s; if (!s) return;
  s.pts = chip._orig; delete s.shape;
  Rough.undo = Rough.undo.filter(a => !(a.t === 'snap' && a.s === s));
  chip.hidden = true; roughDraw();
}
// Douglas–Peucker: the few points that keep the stroke's shape
function rdp(P, eps) {
  if (P.length < 3) return P.slice();
  let idx = 0, max = 0;
  for (let i = 1; i < P.length - 1; i++) { const d = segDist(P[i], P[0], P[P.length - 1]); if (d > max) { max = d; idx = i; } }
  if (max <= eps) return [P[0], P[P.length - 1]];
  return [...rdp(P.slice(0, idx + 1), eps).slice(0, -1), ...rdp(P.slice(idx), eps)];
}
function roughShape(raw) {
  const P = raw.map(p => [p[0], p[1]]);
  const xs = P.map(p => p[0]), ys = P.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = maxX - minX, h = maxY - minY, diag = Math.hypot(w, h);
  if (diag < 16) return null;
  let len = 0; for (let i = 1; i < P.length; i++) len += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
  const gap = Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1]);
  const closed = gap < Math.max(16, len * 0.17) && len > diag * 1.6;
  if (!closed) {
    const s = rdp(P, Math.max(4, diag * 0.06));
    if (s.length !== 2) return null;
    let [a, b] = [P[0], P[P.length - 1]];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), snapA = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4), L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (Math.abs(ang - snapA) < 7 * Math.PI / 180) b = [a[0] + L * Math.cos(snapA), a[1] + L * Math.sin(snapA)];   // nearly level / upright / 45°: exactly
    return { type: 'line', pts: [a, b] };
  }
  // closed: circle / ellipse, or a shape with corners
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, rx = w / 2 || 1, ry = h / 2 || 1;
  const rr = P.map(p => Math.hypot((p[0] - cx) / rx, (p[1] - cy) / ry)), mean = rr.reduce((a, b) => a + b, 0) / rr.length;
  const sd = Math.sqrt(rr.reduce((a, b) => a + (b - mean) ** 2, 0) / rr.length);
  const loop = [...P, P[0]], corners = rdp(loop, Math.max(6, diag * 0.1));
  const nc = corners.length - 1;
  if (sd < 0.11 && nc > 4 || (sd < 0.07)) {
    let ex = rx * mean, ey = ry * mean;
    if (Math.abs(ex - ey) / Math.max(ex, ey) < 0.16) ex = ey = (ex + ey) / 2;                 // nearly round: a circle
    const pts = []; for (let i = 0; i <= 64; i++) { const t = i / 64 * Math.PI * 2; pts.push([cx + ex * Math.cos(t), cy + ey * Math.sin(t)]); }
    return { type: ex === ey ? 'circle' : 'ellipse', pts };
  }
  if (nc === 3) return { type: 'triangle', pts: [...corners.slice(0, 3), corners[0]] };
  if (nc === 4) {
    const C = corners.slice(0, 4);
    const level = C.every((p, i) => { const q = C[(i + 1) % 4], a = Math.abs(Math.atan2(q[1] - p[1], q[0] - p[0])) % (Math.PI / 2); return Math.min(a, Math.PI / 2 - a) < 13 * Math.PI / 180; });
    if (level) return { type: 'box', pts: [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY], [minX, minY]] };
    return { type: 'quad', pts: [...C, C[0]] };
  }
  return null;
}

/* ---------- typed lines: quiet maths check ---------- */
function roughMarks() {
  const ta = $('roughText'), box = $('roughMarks'); if (!ta || !box) return;
  const cs = getComputedStyle(ta), lines = ta.value.split('\n'), lh = parseFloat(cs.lineHeight) || 26, pt = parseFloat(cs.paddingTop) || 12;
  const deg = typeof Calc === 'undefined' || Calc.deg !== false;
  box.style.transform = `translate(${-ta.scrollLeft}px, ${-ta.scrollTop}px)`;
  box.innerHTML = lines.map((ln, i) => {
    const r = ln.trim() ? CalcMath.checkLine(ln, { deg }) : null; if (!r) return '';
    const v = CalcMath.fmt(r.v);
    const html = r.kind === 'answer' ? `<span class="rm rm-ans">${esc(v)}</span>` : r.kind === 'wrong' ? `<span class="rm rm-bad" title="Check this: it works out to ${esc(v)}">≈ ${esc(v)}</span>` : `<span class="rm rm-ok" title="Correct">✓</span>`;
    return `<div class="rm-line" style="top:${pt + i * lh}px;height:${lh}px"><span class="rm-pad">${esc(ln)}</span>${html}</div>`;
  }).join('');
  roughPaintBar();
  if (box.firstChild && typeof tipsTypedCheck === 'function') tipsTypedCheck();
}

/* ---------- ✨ Make neat (your own Google AI key) ---------- */
async function roughNeat() {
  if (!roughNeatOK() || !Rough.strokes.length || Rough.neatBusy) return;
  Rough.neatBusy = true; roughPaintBar();
  if (typeof featUse === 'function') featUse('neat');
  const card = $('roughNeat');
  card.hidden = false; card.innerHTML = `<p class="rn-busy"><span class="ai-spin"></span>Reading your writing…</p>`;
  try {
    const img = roughImage();
    const model = aiModel(), cfg = { temperature: 0.1 };
    if (/gemini-2\.5-flash/.test(model)) cfg.thinkingConfig = { thinkingBudget: 0 }; else if (/gemini-[3-9]/.test(model)) cfg.thinkingConfig = { thinkingLevel: 'low' };
    const prompt = 'This is handwritten rough work from a student solving an exam question (maths, electronics or telecom). Write it out as clean typed text, line by line, keeping the order and line breaks. Use plain text with symbols like × ÷ − ² ³ √ π µ Ω ≈ → and write fractions as a/b. Keep the student\'s numbers exactly as written, even if they look wrong. For a drawing (a circuit, graph or diagram) write one short line in square brackets, like [graph of a sine wave]. Reply with only the typed text.';
    let r, text = '';
    for (let tries = 0; tries < 2; tries++) {
      r = await fetch(`${GEM}/models/${encodeURIComponent(model)}:generateContent`, { method: 'POST', headers: { 'x-goog-api-key': aiKey(), 'content-type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ inline_data: { mime_type: 'image/png', data: img } }, { text: prompt }] }], generationConfig: cfg }) });
      if (r.ok) { const j = await r.json(); text = (((j.candidates || [])[0] || {}).content || { parts: [] }).parts.map(p => p.text || '').join('').trim(); break; }
      if (r.status === 400 && cfg.thinkingConfig) { delete cfg.thinkingConfig; continue; }
      throw Object.assign(new Error('ai'), { status: r.status, body: await r.text() });
    }
    if (!text) throw Object.assign(new Error('ai'), { status: 200, body: '' });
    Rough.neat = text;
    card.innerHTML = `<div class="rn-head"><b>${rIc.neat} Neat version</b><small>Your drawing stays unless you choose Use neat.</small></div>
      <pre class="rn-text">${esc(text)}</pre>
      <div class="btns"><button type="button" class="btn small primary" data-rn="use">Use neat</button><button type="button" class="btn small" data-rn="keep">Keep original</button></div>`;
  } catch (e) {
    card.innerHTML = `<p class="rn-err">${esc(e.status === 200 ? 'Google could not read this page. Try writing a little bigger.' : aiError(e.status || 0, e.body || '', true))}</p><div class="btns"><button type="button" class="btn small" data-rn="keep">OK</button></div>`;
  }
  Rough.neatBusy = false; roughPaintBar();
  card.onclick = ev => {
    const b = ev.target.closest('[data-rn]'); if (!b) return;
    if (b.dataset.rn === 'use' && Rough.neat) {
      const ta = $('roughText');
      Rough.undo.push({ t: 'neat', strokes: Rough.strokes, text: ta.value });
      ta.value = (ta.value.trim() ? ta.value.replace(/\s+$/, '') + '\n' : '') + Rough.neat;
      Rough.strokes = []; Rough.view = { x: 0, y: 0, s: 1 };
      roughDraw(); roughMarks();
    }
    card.hidden = true; Rough.neat = null; roughPaintBar();
  };
}
// the drawing as a picture with a white background (only the part you used)
function roughImage() {
  const all = Rough.strokes.flatMap(s => s.pts), pad = 24;
  const minX = Math.min(...all.map(p => p[0])) - pad, maxX = Math.max(...all.map(p => p[0])) + pad, minY = Math.min(...all.map(p => p[1])) - pad, maxY = Math.max(...all.map(p => p[1])) + pad;
  const k = Math.min(2, 1400 / Math.max(maxX - minX, maxY - minY));
  const c = document.createElement('canvas'); c.width = Math.round((maxX - minX) * k); c.height = Math.round((maxY - minY) * k);
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.setTransform(k, 0, 0, k, -minX * k, -minY * k); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const s of Rough.strokes) roughStrokePrint(ctx, s);
  return c.toDataURL('image/png').split(',')[1];
}
function roughStrokePrint(ctx, s) {
  ctx.strokeStyle = '#111'; ctx.lineWidth = roughWidth(s) * 1.4;
  const P = s.pts; ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]);
  for (let i = 1; i < P.length; i++) ctx.lineTo(P[i][0], P[i][1]);
  if (P.length === 1) ctx.lineTo(P[0][0] + 0.1, P[0][1]);
  ctx.stroke();
}

/* ---------- each question: a fresh page ---------- */
function roughNewPage() {
  if (!Rough.built) return;
  const paper = $('roughPaper'), had = Rough.strokes.length || $('roughText').value;
  const wipe = () => {
    Rough.strokes = []; Rough.undo = []; Rough.cur = null; Rough.view = { x: 0, y: 0, s: 1 };
    $('roughText').value = ''; $('roughChip').hidden = true; $('roughNeat').hidden = true; Rough.neat = null;
    if (Rough.typing) roughSetTyping(false);
    roughPaintBar(); roughDraw(); roughMarks();
    paper.classList.remove('wipe');
  };
  if (had && Calc.open && !Calc.min && Calc.tab === 'rough') { paper.classList.add('wipe'); setTimeout(wipe, 260); } else wipe();
}
function roughReset() { roughNewPage(); Rough.tool = 'pen'; Rough.thick = false; Rough.color = 'ink'; Rough.grid = false; if (Rough.built) roughPaintBar(); }
