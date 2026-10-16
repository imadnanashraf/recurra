/* =====================================================================
   ROUGH WORK in quizzes and live tests (the ✏️ tab of Tools).
   - Draw with a finger, stylus or mouse. Ink follows your finger closely:
     finished strokes sit on one layer, the line you are drawing on another,
     and Android's "where the finger is going" points fill the tiny gap.
   - Hold still at the end of a line, circle, box or triangle: it straightens.
     "Keep mine" brings your own stroke back.
   - Pen, highlighter, colours, eraser, shapes and arrows, ready-made layouts
     (axes, number line, tables, Venn), paper (plain, grid, dots, lines).
   - Zoom writing: write big in a box at the bottom; it lands small and neat on
     the page and moves along by itself, like writing on a line.
   - Touches that start on the curved edge of a phone are ignored, and in the
     Android app the edge "back" swipe is switched off over the page.
   - Aa: type on the same page, with a symbol row. Lines with "=" are checked.
   - ✨ Neat (your own Google AI key only): handwriting to typed text.
   - Every question starts with a fresh page, like rough paper. Nothing is saved.
   ===================================================================== */
const Rough = {
  strokes: [], undo: [], view: { x: 0, y: 0, s: 1 }, tool: 'pen', thick: false, color: 'ink', paper: 'plain', typing: false,
  ptrs: new Map(), cur: null, pan: null, penSeen: false, built: false, chipTimer: null, neat: null, neatBusy: false,
  zoom: null, menu: false, raf: 0,
};
const R_COLORS = ['ink', 'blue', 'red'];
const R_PAPERS = ['plain', 'grid', 'dots', 'lines'];
const R_PAPER_NAME = { plain: 'Plain paper', grid: 'Grid paper', dots: 'Dotted paper', lines: 'Lined paper' };
const R_SYMBOLS = ['√', 'π', '²', '³', '×', '÷', '±', '≤', '≥', '≠', '≈', '∞', '°', '→', '∴', '∵', '½', '%'];
const roughCss = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const roughColor = c => c === 'blue' ? (roughCss('--accent-2') || '#2f7fe0') : c === 'red' ? (roughCss('--danger') || '#e5484d') : c === 'hl' ? (roughCss('--sun') || '#f5a300') : c === 'tpl' ? (roughCss('--muted') || '#888') : (roughCss('--ink') || '#111');
const rIc = {
  pen: '<svg viewBox="0 0 24 24"><path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z"/><path d="M14.5 6.5l3 3"/></svg>',
  hl: '<svg viewBox="0 0 24 24"><path d="M9 15l-3 3h5l1-1M9 15l7.5-7.5a2 2 0 0 1 2.8 0l.2.2a2 2 0 0 1 0 2.8L12 18z"/><path d="M4 21h16" class="hl-bar"/></svg>',
  eraser: '<svg viewBox="0 0 24 24"><path d="M8.5 20H20M5.6 14.4l7.8-7.8a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L11 19H8.2l-2.6-2.6a1.4 1.4 0 0 1 0-2z"/><path d="M9.5 10.5l5 5"/></svg>',
  shapes: '<svg viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="8" height="8" rx="1.5"/><circle cx="17" cy="7.5" r="4"/><path d="M4 20.5L9.5 14M9.5 14H6M9.5 14v3.5"/><path d="M14 20.5l3-5.5 3 5.5z"/></svg>',
  undo: '<svg viewBox="0 0 24 24"><path d="M9 7L4 12l5 5"/><path d="M4 12h10a6 6 0 0 1 0 12h-2" transform="translate(0 -6)"/></svg>',
  clear: '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/></svg>',
  paper: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 9.3h16M4 14.7h16M9.3 4v16M14.7 4v16"/></svg>',
  zoom: '<svg viewBox="0 0 24 24"><circle cx="10" cy="10" r="6"/><path d="M14.5 14.5L20 20M7.5 11.5l1.6-4 1.6 4M8 10.3h2.3"/></svg>',
  neat: '<svg viewBox="0 0 24 24"><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6zM18.5 14l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8zM5.5 15l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z"/></svg>',
};
const R_SHAPES = [
  ['arrow', 'Arrow', '<svg viewBox="0 0 24 24"><path d="M4 20L19 5M19 5h-7M19 5v7"/></svg>'],
  ['line', 'Line', '<svg viewBox="0 0 24 24"><path d="M4 20L20 4"/></svg>'],
  ['box', 'Box', '<svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="12" rx="1.5"/></svg>'],
  ['circle', 'Circle', '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg>'],
  ['triangle', 'Triangle', '<svg viewBox="0 0 24 24"><path d="M12 4l8.5 15h-17z"/></svg>'],
];
const R_TEMPLATES = [
  ['axes', 'x / y axes', '<svg viewBox="0 0 24 24"><path d="M5 3v16h16M5 3l-2 3M5 3l2 3M21 19l-3-2M21 19l-3 2"/></svg>'],
  ['numline', 'Number line', '<svg viewBox="0 0 24 24"><path d="M2 12h20M5 10v4M9 10v4M13 10v4M17 10v4"/></svg>'],
  ['table2', 'Table, 2 columns', '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="1"/><path d="M12 5v14M3 9.5h18M3 14h18"/></svg>'],
  ['table3', 'Table, 3 columns', '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="1"/><path d="M9 5v14M15 5v14M3 9.5h18M3 14h18"/></svg>'],
  ['table4', 'Table, 4 columns', '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="1"/><path d="M7.5 5v14M12 5v14M16.5 5v14M3 9.5h18M3 14h18"/></svg>'],
  ['venn2', 'Venn, 2 sets', '<svg viewBox="0 0 24 24"><circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6"/></svg>'],
  ['venn3', 'Venn, 3 sets', '<svg viewBox="0 0 24 24"><circle cx="9.5" cy="9.5" r="5.5"/><circle cx="14.5" cy="9.5" r="5.5"/><circle cx="12" cy="14.5" r="5.5"/></svg>'],
];
const roughNeatOK = () => typeof aiMode === 'function' && aiMode() === 'own';

function roughBuild(box) {
  if (!box || Rough.built) return;
  Rough.built = true;
  box.innerHTML = `
    <div class="rough-bar" role="toolbar" aria-label="Rough work tools">
      <button type="button" class="rb" data-rt="pen" aria-label="Pen" title="Pen (tap again: thicker)">${rIc.pen}<i class="rb-dot"></i></button>
      <button type="button" class="rb rb-hl" data-rt="hl" aria-label="Highlighter" title="Highlighter">${rIc.hl}</button>
      <button type="button" class="rb rb-color" data-rt="color" aria-label="Colour" title="Colour"><i></i></button>
      <button type="button" class="rb" data-rt="eraser" aria-label="Eraser" title="Eraser">${rIc.eraser}</button>
      <button type="button" class="rb" data-rt="shapes" aria-label="Shapes and layouts" title="Shapes, arrows and layouts" aria-expanded="false">${rIc.shapes}</button>
      <span class="rb-sep" aria-hidden="true"></span>
      <button type="button" class="rb" data-rt="undo" aria-label="Undo" title="Undo (Z)">${rIc.undo}</button>
      <button type="button" class="rb" data-rt="clear" aria-label="Clear the page" title="Clear the page">${rIc.clear}</button>
      <span class="rb-sep" aria-hidden="true"></span>
      <button type="button" class="rb" data-rt="paper" aria-label="Paper" title="Paper: plain, grid, dots, lines">${rIc.paper}</button>
      <button type="button" class="rb" data-rt="zoom" aria-label="Zoom writing" title="Zoom writing: write big, it lands small">${rIc.zoom}</button>
      <button type="button" class="rb rb-aa" data-rt="type" aria-label="Type" title="Type on the page">Aa</button>
      <button type="button" class="rb rb-neat" data-rt="neat" aria-label="Make neat" title="Make neat: handwriting to typed text">${rIc.neat}<span>Neat</span></button>
    </div>
    <div class="rough-menu" id="roughMenu" hidden>
      <p class="rm-h">Draw a shape</p>
      <div class="rm-grid">${R_SHAPES.map(([k, l, i]) => `<button type="button" class="rm-it" data-shape="${k}">${i}<span>${l}</span></button>`).join('')}</div>
      <p class="rm-h">Add a layout</p>
      <div class="rm-grid">${R_TEMPLATES.map(([k, l, i]) => `<button type="button" class="rm-it" data-tpl="${k}">${i}<span>${l}</span></button>`).join('')}</div>
    </div>
    <div class="rough-syms" id="roughSyms" hidden>${R_SYMBOLS.map(s => `<button type="button" data-sym="${s}">${s}</button>`).join('')}</div>
    <div class="rough-paper" id="roughPaper">
      <canvas id="roughCanvas" aria-label="Rough work page"></canvas>
      <canvas id="roughLive" class="rough-live" aria-hidden="true"></canvas>
      <div class="rough-type" id="roughType">
        <div class="rough-marks" id="roughMarks" aria-hidden="true"></div>
        <textarea id="roughText" spellcheck="false" autocomplete="off" autocapitalize="off" placeholder="Type your working… e.g. 2k × 1.18 =" aria-label="Typed rough work"></textarea>
      </div>
      <div class="rough-empty" id="roughEmpty"><b>Rough work</b><small>Draw here. Hold still at the end of a line or shape to straighten it.</small><small class="re-touch">Two fingers move the page. Small writing? Try zoom writing.</small></div>
      <button type="button" class="rough-chip" id="roughChip" hidden>Keep mine</button>
      <div class="rough-neat" id="roughNeat" hidden></div>
      <div class="rough-zoom" id="roughZoom" hidden>
        <canvas id="roughZoomCv" aria-label="Zoom writing box"></canvas>
        <div class="rz-bar"><button type="button" data-rz="left" aria-label="Move left">‹</button><button type="button" data-rz="right" aria-label="Move right">›</button><button type="button" data-rz="line" aria-label="Next line">↵ Next line</button><button type="button" data-rz="done" class="rz-done">Done</button></div>
      </div>
    </div>`;
  const paper = $('roughPaper'), cv = $('roughCanvas');
  const bar = box.querySelector('.rough-bar');
  bar.addEventListener('click', roughBarClick);
  bar.addEventListener('scroll', roughBarFade, { passive: true });
  $('roughMenu').addEventListener('click', roughMenuClick);
  $('roughSyms').addEventListener('pointerdown', e => e.preventDefault());              // keep the keyboard open
  $('roughSyms').addEventListener('click', e => { const b = e.target.closest('[data-sym]'); if (b) roughInsertText(b.dataset.sym); });
  paper.addEventListener('pointerdown', roughDown);
  paper.addEventListener('pointermove', roughMove);
  ['pointerup', 'pointercancel'].forEach(n => paper.addEventListener(n, roughUp));
  paper.addEventListener('wheel', e => {
    if (Rough.typing || Rough.zoom) return;
    e.preventDefault();
    const v = Rough.view;
    if (e.ctrlKey) { const r = cv.getBoundingClientRect(); roughZoomView(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top); }
    else { v.x -= e.deltaX; v.y -= e.deltaY; roughDraw(); }
  }, { passive: false });
  $('roughChip').addEventListener('click', roughKeepMine);
  const ta = $('roughText');
  ta.addEventListener('input', roughMarks);
  ta.addEventListener('scroll', roughMarks);
  const zc = $('roughZoomCv');
  zc.addEventListener('pointerdown', roughZDown); zc.addEventListener('pointermove', roughZMove);
  ['pointerup', 'pointercancel'].forEach(n => zc.addEventListener(n, roughZUp));
  $('roughZoom').querySelector('.rz-bar').addEventListener('click', roughZBar);
  if ('ResizeObserver' in window) new ResizeObserver(() => roughSize()).observe(paper);
  document.addEventListener('pointerdown', e => { if (Rough.menu && !e.target.closest('#roughMenu, [data-rt="shapes"]')) roughMenuShow(false); }, true);
  roughPaintBar();
}
function roughPaintBar() {
  const box = $('rough'); if (!box || !Rough.built) return;
  const drawing = !Rough.typing;
  box.querySelectorAll('[data-rt]').forEach(b => {
    const t = b.dataset.rt;
    if (t === 'pen' || t === 'eraser' || t === 'hl') b.setAttribute('aria-pressed', String(Rough.tool === t && drawing));
    if (t === 'shapes') { b.setAttribute('aria-pressed', String(/^shape:/.test(Rough.tool) && drawing)); b.setAttribute('aria-expanded', String(Rough.menu)); }
    if (t === 'paper') { b.setAttribute('aria-pressed', String(Rough.paper !== 'plain')); b.title = R_PAPER_NAME[Rough.paper] + ' (tap to change)'; }
    if (t === 'zoom') b.setAttribute('aria-pressed', String(!!Rough.zoom));
    if (t === 'type') b.setAttribute('aria-pressed', String(Rough.typing));
    if (t === 'undo') b.disabled = !Rough.undo.length;
    if (t === 'clear') b.disabled = !Rough.strokes.length && !$('roughText').value;
    if (t === 'neat') { b.hidden = !roughNeatOK(); b.disabled = !Rough.strokes.length || Rough.neatBusy; b.classList.toggle('busy', Rough.neatBusy); }
  });
  box.querySelector('.rb-dot').classList.toggle('thick', Rough.thick);
  box.querySelector('.rb-color i').style.background = roughColor(Rough.color);
  box.querySelector('.rb-color').disabled = Rough.typing;
  const paper = $('roughPaper');
  R_PAPERS.forEach(p => paper.classList.toggle('p-' + p, Rough.paper === p));
  paper.classList.toggle('typing', Rough.typing);
  paper.classList.toggle('erasing', Rough.tool === 'eraser' && drawing);
  paper.classList.toggle('zooming', !!Rough.zoom);
  $('roughSyms').hidden = !Rough.typing;
  const empty = !Rough.strokes.length && !$('roughText').value && !Rough.typing && !Rough.zoom;
  $('roughEmpty').hidden = !empty;
  $('roughEmpty').classList.toggle('nopen', Rough.penSeen);
  roughGridPos(); roughBarFade();
}
// more buttons off to the right: the bar fades out on that side
function roughBarFade() { const b = $('rough') && $('rough').querySelector('.rough-bar'); if (b) b.classList.toggle('more', b.scrollWidth > b.clientWidth + b.scrollLeft + 2); }
function roughBarClick(e) {
  const b = e.target.closest('[data-rt]'); if (!b || b.disabled) return;
  const t = b.dataset.rt;
  if (typeof Native !== 'undefined' && Native.tap) Native.tap();
  if (t !== 'shapes') roughMenuShow(false);
  if (t === 'pen') { if (Rough.tool === 'pen' && !Rough.typing) Rough.thick = !Rough.thick; Rough.tool = 'pen'; roughSetTyping(false); }
  else if (t === 'hl') { Rough.tool = 'hl'; roughSetTyping(false); }
  else if (t === 'eraser') { Rough.tool = 'eraser'; roughSetTyping(false); }
  else if (t === 'color') { Rough.color = R_COLORS[(R_COLORS.indexOf(Rough.color) + 1) % R_COLORS.length]; if (Rough.tool !== 'hl' && !/^shape:/.test(Rough.tool)) Rough.tool = 'pen'; }
  else if (t === 'shapes') { roughMenuShow(!Rough.menu); }
  else if (t === 'undo') roughUndo();
  else if (t === 'clear') roughClear();
  else if (t === 'paper') { Rough.paper = R_PAPERS[(R_PAPERS.indexOf(Rough.paper) + 1) % R_PAPERS.length]; toast(R_PAPER_NAME[Rough.paper]); }
  else if (t === 'zoom') { roughZoomMode(!Rough.zoom); return; }
  else if (t === 'type') roughSetTyping(!Rough.typing);
  else if (t === 'neat') return roughNeat();
  roughPaintBar();
}
function roughMenuShow(on) {
  Rough.menu = on; const m = $('roughMenu'); if (!m) return;
  m.hidden = !on; roughPaintBar();
}
function roughMenuClick(e) {
  const s = e.target.closest('[data-shape]'), t = e.target.closest('[data-tpl]');
  if (s) { Rough.tool = 'shape:' + s.dataset.shape; roughSetTyping(false); roughMenuShow(false); toast(`Drag on the page to draw ${s.querySelector('span').textContent.toLowerCase() === 'arrow' ? 'an arrow' : 'a ' + s.querySelector('span').textContent.toLowerCase()}`); }
  if (t) { roughMenuShow(false); roughTemplate(t.dataset.tpl); }
}
function roughSetTyping(on) {
  Rough.typing = on;
  if (on && Rough.zoom) roughZoomMode(false);
  const ta = $('roughText');
  if (on) { setTimeout(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 30); }
  else ta.blur();
  roughPaintBar(); roughMarks();
}
function roughInsertText(t) {
  const ta = $('roughText'), a = ta.selectionStart ?? ta.value.length, b = ta.selectionEnd ?? a;
  ta.value = ta.value.slice(0, a) + t + ta.value.slice(b);
  ta.setSelectionRange(a + t.length, a + t.length); ta.focus();
  roughMarks();
}

/* ---------- the page: size, view (move and zoom), drawing ---------- */
// Two layers: the finished strokes (redrawn only when something changes) and the line you are drawing.
// Sharp phone screens are drawn at up to 2× (plenty for ink, and much lighter than 3–3.5×).
function roughSize() {
  const cv = $('roughCanvas'), live = $('roughLive'), paper = $('roughPaper'); if (!cv || !paper) return;
  const r = paper.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  if (!r.width || !r.height) return;
  for (const c of [cv, live]) { c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); c.style.width = r.width + 'px'; c.style.height = r.height + 'px'; }
  Rough.liveCtx = null;
  roughDraw();
  if (Rough.zoom) roughZSize();
  roughGuard();
}
function roughShown() { roughSize(); roughPaintBar(); roughMarks(); }
function roughGridPos() {
  const p = $('roughPaper'), v = Rough.view; if (!p) return;
  p.style.setProperty('--gs', (24 * v.s) + 'px');
  p.style.setProperty('--gx', v.x + 'px'); p.style.setProperty('--gy', v.y + 'px');
}
function roughZoomView(f, cx, cy) {
  const v = Rough.view, s = Math.min(3, Math.max(0.5, v.s * f));
  v.x = cx - (cx - v.x) * (s / v.s); v.y = cy - (cy - v.y) * (s / v.s); v.s = s;
  roughDraw();
}
const roughWidth = s => s.hl ? 14 : s.tpl ? 1.4 : (s.thick ? 4.2 : 2.2);
const roughDpr = cv => cv.width / (parseFloat(cv.style.width) || cv.width);
function roughCtx(cv, clear) {
  const ctx = cv.getContext('2d'), dpr = roughDpr(cv), v = Rough.view;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (clear) ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.setTransform(dpr * v.s, 0, 0, dpr * v.s, dpr * v.x, dpr * v.y);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  return ctx;
}
// the live layer asks the browser for low-delay drawing (Chrome: the ink is shown without waiting for the page)
function roughLive(clear) {
  const cv = $('roughLive');
  if (!Rough.liveCtx) { try { Rough.liveCtx = cv.getContext('2d', { desynchronized: true }); } catch (e) { Rough.liveCtx = cv.getContext('2d'); } }
  const ctx = Rough.liveCtx, dpr = roughDpr(cv), v = Rough.view;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (clear) ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.setTransform(dpr * v.s, 0, 0, dpr * v.s, dpr * v.x, dpr * v.y);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  return ctx;
}
// everything again (after undo, erase, a new view …)
function roughDraw() {
  const cv = $('roughCanvas'); if (!cv || !cv.width) return;
  const ctx = roughCtx(cv, true);
  for (const s of Rough.strokes) if (!Rough.cur || Rough.cur.s !== s) roughStroke(ctx, s);
  roughGridPos();
  roughDrawLive();
}
// the stroke being drawn (and the eraser ring, the zoom-writing frame, a shape being dragged)
function roughDrawLive(pred) {
  const cv = $('roughLive'); if (!cv || !cv.width) return;
  const ctx = roughLive(true), v = Rough.view, c = Rough.cur;
  if (c && c.kind === 'draw') {
    roughStroke(ctx, c.s);
    if (pred && pred.length && !c.snapped) {             // where your finger is about to be: drawn, not kept
      const L = c.s.pts[c.s.pts.length - 1];
      ctx.strokeStyle = roughColor(c.s.color); ctx.globalAlpha = c.s.hl ? 0.28 : 1; ctx.lineWidth = roughWidth(c.s);
      ctx.beginPath(); ctx.moveTo(L[0], L[1]); pred.forEach(p => ctx.lineTo(p[0], p[1])); ctx.stroke(); ctx.globalAlpha = 1;
    }
  }
  if (c && c.kind === 'shape') roughStroke(ctx, c.s);
  if (c && c.kind === 'erase' && c.at) { ctx.beginPath(); ctx.arc(c.at[0], c.at[1], 11 / v.s, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(128,128,128,.6)'; ctx.lineWidth = 1 / v.s; ctx.stroke(); }
  const z = Rough.zoom;
  if (z) { ctx.setLineDash([5 / v.s, 4 / v.s]); ctx.strokeStyle = roughCss('--accent') || '#0f9d8a'; ctx.lineWidth = 1.5 / v.s; ctx.strokeRect(z.x, z.y, z.w, z.h); ctx.setLineDash([]); }
}
function roughFrame(pred) { if (Rough.raf) return; Rough.raf = requestAnimationFrame(() => { Rough.raf = 0; roughDrawLive(Rough.pred); }); Rough.pred = pred; }
// a stroke: smooth curves through the midpoints; a stylus gets thicker where you press harder
function roughStroke(ctx, s) {
  const P = s.shape ? roughShapePts(s) : s.pts; if (!P.length) return;
  ctx.strokeStyle = roughColor(s.hl ? 'hl' : s.tpl ? 'tpl' : s.color); ctx.fillStyle = ctx.strokeStyle;
  ctx.globalAlpha = s.hl ? 0.32 : 1;
  const w = roughWidth(s);
  if (P.length === 1) { ctx.beginPath(); ctx.arc(P[0][0], P[0][1], w * 0.6, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; return; }
  if (s.shape || !s.pressure) {
    ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]);
    if (s.shape) for (let i = 1; i < P.length; i++) { if (P[i] === null) { i++; if (P[i]) ctx.moveTo(P[i][0], P[i][1]); continue; } ctx.lineTo(P[i][0], P[i][1]); }
    else {
      for (let i = 1; i < P.length - 1; i++) { const mx = (P[i][0] + P[i + 1][0]) / 2, my = (P[i][1] + P[i + 1][1]) / 2; ctx.quadraticCurveTo(P[i][0], P[i][1], mx, my); }
      ctx.lineTo(P[P.length - 1][0], P[P.length - 1][1]);
    }
    ctx.stroke(); ctx.globalAlpha = 1; return;
  }
  for (let i = 1; i < P.length; i++) {
    ctx.lineWidth = w * (0.55 + 0.9 * ((P[i][2] + P[i - 1][2]) / 2));
    ctx.beginPath(); ctx.moveTo(P[i - 1][0], P[i - 1][1]); ctx.lineTo(P[i][0], P[i][1]); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
// shapes are stored as their corner points; an arrow also gets its head ("null" = lift the pen)
function roughShapePts(s) {
  if (s.shape !== 'arrow' || s.pts.length < 2) return s.pts;
  const [a, b] = [s.pts[0], s.pts[s.pts.length - 1]], ang = Math.atan2(b[1] - a[1], b[0] - a[0]), L = Math.min(16, Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.35);
  return [a, b, null, [b[0] - L * Math.cos(ang - 0.45), b[1] - L * Math.sin(ang - 0.45)], b, [b[0] - L * Math.cos(ang + 0.45), b[1] - L * Math.sin(ang + 0.45)]];
}
// screen → page position
function roughAt(e) {
  const r = $('roughCanvas').getBoundingClientRect(), v = Rough.view;
  return [(e.clientX - r.left - v.x) / v.s, (e.clientY - r.top - v.y) / v.s, e.pressure || 0.5];
}

/* ---------- finger, stylus and mouse ---------- */
const R_EDGE = 14;                    // px at the left and right screen edge where a touch is ignored (curved screens)
function roughDown(e) {
  if (Rough.typing || e.target.closest('.rough-chip, .rough-neat, .rough-zoom')) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (e.pointerType === 'touch' && (e.clientX < R_EDGE || e.clientX > innerWidth - R_EDGE) && !Rough.ptrs.size) return;   // the curved edge
  e.preventDefault();
  $('roughPaper').setPointerCapture(e.pointerId);
  if (e.pointerType === 'pen') Rough.penSeen = true;
  Rough.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
  const touches = [...Rough.ptrs.values()].filter(p => p.type === 'touch');
  // a stylus is drawing, or you rest your hand: touches move the page instead
  const touchMoves = e.pointerType === 'touch' && (Rough.penSeen || touches.length >= 2);
  if (touchMoves) {
    if (Rough.cur && Rough.cur.kind === 'draw' && Rough.cur.ptr !== e.pointerId && (Rough.cur.s.pts.length < 14 || Date.now() - Rough.cur.t0 < 220) && Rough.cur.type === 'touch') {
      Rough.strokes.pop(); clearInterval(Rough.cur.hold);           // the first finger of a two-finger move was not a line
    }
    if (!Rough.cur || Rough.cur.type === 'touch') { Rough.cur = null; roughPanStart(); }
    roughDraw(); return;
  }
  if (Rough.cur || Rough.zoom) return;
  const p = roughAt(e);
  if (Rough.tool === 'eraser') { Rough.cur = { kind: 'erase', ptr: e.pointerId, removed: [], at: p }; roughErase(p); roughDraw(); return; }
  if (/^shape:/.test(Rough.tool)) {
    const s = { pts: [p, p], shape: Rough.tool.slice(6), color: Rough.color, thick: Rough.thick };
    Rough.cur = { kind: 'shape', ptr: e.pointerId, s, a: p }; roughDrawLive(); return;
  }
  const s = { pts: [p], color: Rough.color, thick: Rough.thick, pressure: e.pointerType === 'pen', hl: Rough.tool === 'hl' };
  Rough.strokes.push(s);
  Rough.cur = { kind: 'draw', ptr: e.pointerId, s, type: e.pointerType, t0: Date.now(), still: Date.now(), last: p, raw: [p] };
  if (!s.hl) roughHoldWatch();
  $('roughEmpty').hidden = true;
  roughDrawLive();
}
function roughMove(e) {
  const pt = Rough.ptrs.get(e.pointerId); if (!pt) return;
  pt.x = e.clientX; pt.y = e.clientY;
  if (Rough.pan) return roughPanMove();
  const c = Rough.cur; if (!c || c.ptr !== e.pointerId) return;
  if (c.kind === 'shape') { c.s.pts = roughShapeFrom(c.s.shape, c.a, roughAt(e)); roughFrame(); return; }
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
  for (const ev of evs.length ? evs : [e]) {
    const p = roughAt(ev);
    if (c.kind === 'erase') { c.at = p; roughErase(p); continue; }
    if (c.snapped) continue;
    roughAddPoint(c, p);
  }
  if (c.kind === 'erase') { roughDraw(); return; }
  const pred = !c.snapped && e.getPredictedEvents ? e.getPredictedEvents().slice(0, 2).map(roughAt) : null;
  roughFrame(pred);
}
// smoothing: each point leans a little toward the last one (less for a stylus, so it stays sharp)
function roughAddPoint(c, p) {
  const L = c.s.pts[c.s.pts.length - 1], k = c.type === 'pen' ? 0.85 : 0.7;
  const q = [L[0] + (p[0] - L[0]) * k, L[1] + (p[1] - L[1]) * k, p[2]];
  if (Math.hypot(q[0] - L[0], q[1] - L[1]) * Rough.view.s < 0.5) return;
  c.s.pts.push(q); c.raw.push(p);
  if (Math.hypot(p[0] - c.last[0], p[1] - c.last[1]) * Rough.view.s > 4) { c.still = Date.now(); c.last = p; }
}
function roughUp(e) {
  Rough.ptrs.delete(e.pointerId);
  if (Rough.pan) { if ([...Rough.ptrs.values()].filter(p => p.type === 'touch').length < (Rough.penSeen ? 1 : 2)) Rough.pan = null; else roughPanStart(); return; }
  const c = Rough.cur; if (!c || c.ptr !== e.pointerId) return;
  clearInterval(c.hold);
  Rough.cur = null; Rough.pred = null;
  if (c.kind === 'erase') { if (c.removed.length) Rough.undo.push({ t: 'erase', items: c.removed }); roughDraw(); }
  else if (c.kind === 'shape') {
    const xs = c.s.pts.map(p => p[0]), ys = c.s.pts.map(p => p[1]);
    if (Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * Rough.view.s > 8) { Rough.strokes.push(c.s); Rough.undo.push({ t: 'add', s: c.s }); }   // a tap is not a shape
    roughCommit(c.s);
  } else {
    const last = roughAt(e); if (!c.snapped && Math.hypot(last[0] - c.s.pts[c.s.pts.length - 1][0], last[1] - c.s.pts[c.s.pts.length - 1][1]) > 0.5) c.s.pts.push(last);
    Rough.undo.push({ t: 'add', s: c.s });
    roughCommit(c.s);
    if (c.snapped && typeof tipMark === 'function') tipMark('snap');                // you found it yourself: no tip needed
    else if (!c.s.hl && typeof tipsRoughStroke === 'function') tipsRoughStroke(c.s);
  }
  roughPaintBar();
}
// a finished stroke moves from the live layer onto the page (no full redraw)
function roughCommit(s) {
  const cv = $('roughCanvas');
  if (cv && cv.width && Rough.strokes.includes(s)) roughStroke(roughCtx(cv, false), s);
  roughDrawLive();
}
function roughShapeFrom(type, a, b) {
  if (type === 'arrow' || type === 'line') {
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), snapA = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4), L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (Math.abs(ang - snapA) < 6 * Math.PI / 180) b = [a[0] + L * Math.cos(snapA), a[1] + L * Math.sin(snapA)];
    return [a, b];
  }
  const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
  if (type === 'box') return [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
  if (type === 'triangle') return [[(x0 + x1) / 2, y0], [x1, y1], [x0, y1], [(x0 + x1) / 2, y0]];
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0) / 2, ry = (y1 - y0) / 2, out = [];
  for (let i = 0; i <= 64; i++) { const t = i / 64 * Math.PI * 2; out.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]); }
  return out;
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
  if (!Rough.raf) Rough.raf = requestAnimationFrame(() => { Rough.raf = 0; roughDraw(); });
}
function roughErase(p) {
  const r = 11 / Rough.view.s;
  for (let i = Rough.strokes.length - 1; i >= 0; i--) {
    const s = Rough.strokes[i], P = s.shape ? roughShapePts(s).filter(Boolean) : s.pts;
    if (P.some((q, k) => Math.hypot(q[0] - p[0], q[1] - p[1]) < r + roughWidth(s) / 2 || (k && segDist(p, P[k - 1], q) < r))) {
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
  else if (a.t === 'addMany') Rough.strokes = Rough.strokes.filter(s => !a.list.includes(s));
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

/* ---------- ready-made layouts, placed in the middle of what you see ---------- */
function roughTemplate(kind) {
  const paper = $('roughPaper').getBoundingClientRect(), v = Rough.view;
  const W = Math.min(300, (paper.width - 40) / v.s), H = Math.min(200, (paper.height - 40) / v.s);
  const cx = (paper.width / 2 - v.x) / v.s, cy = (paper.height / 2 - v.y) / v.s;
  const x0 = cx - W / 2, y0 = cy - H / 2, x1 = cx + W / 2, y1 = cy + H / 2, list = [];
  const S = (pts, shape) => list.push({ pts, shape: shape || 'poly', color: 'ink', tpl: true });
  const circle = (x, y, r) => { const o = []; for (let i = 0; i <= 64; i++) { const t = i / 64 * Math.PI * 2; o.push([x + r * Math.cos(t), y + r * Math.sin(t)]); } return o; };
  if (kind === 'axes') { const ox = x0 + 20, oy = y1 - 20; S([[ox, oy], [x1, oy]], 'arrow'); S([[ox, oy], [ox, y0]], 'arrow'); }
  else if (kind === 'numline') { S([[x0, cy], [x1, cy]], 'arrow'); S([[x1, cy], [x0, cy]], 'arrow'); for (let i = 0; i <= 10; i++) { const x = x0 + 18 + i * (W - 36) / 10; S([[x, cy - 6], [x, cy + 6]]); } }
  else if (/^table/.test(kind)) {
    const n = Number(kind.slice(5)), rows = 4;
    S([[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]);
    for (let i = 1; i < n; i++) { const x = x0 + i * W / n; S([[x, y0], [x, y1]]); }
    for (let j = 1; j < rows; j++) { const y = y0 + j * H / rows; S([[x0, y], [x1, y]]); }
  } else if (kind === 'venn2') { const r = Math.min(W / 3.2, H / 2.2); S(circle(cx - r * 0.55, cy, r)); S(circle(cx + r * 0.55, cy, r)); }
  else if (kind === 'venn3') { const r = Math.min(W / 3.4, H / 3.2); S(circle(cx - r * 0.55, cy - r * 0.4, r)); S(circle(cx + r * 0.55, cy - r * 0.4, r)); S(circle(cx, cy + r * 0.5, r)); }
  if (!list.length) return;
  Rough.strokes.push(...list); Rough.undo.push({ t: 'addMany', list });
  if (typeof Native !== 'undefined' && Native.tap) Native.tap();
  roughPaintBar(); roughDraw();
}

/* ---------- zoom writing: write big in the box, it lands small on the page ---------- */
function roughZoomMode(on) {
  const box = $('roughZoom'); if (!box) return;
  if (on) {
    if (Rough.typing) roughSetTyping(false);
    if (typeof featUse === 'function') featUse('zoomw');
    const paper = $('roughPaper').getBoundingClientRect(), v = Rough.view;
    box.hidden = false;
    const bh = box.getBoundingClientRect().height - 40, Z = Math.max(2.4, Math.min(4.5, bh / 34));
    const w = (paper.width - 8) / Z, h = bh / Z;
    Rough.zoom = { Z, w, h, x: (12 - v.x) / v.s, y: (12 - v.y) / v.s, margin: (12 - v.x) / v.s };
    Rough.tool = 'pen';
    roughZSize();
  } else { Rough.zoom = null; box.hidden = true; }
  roughPaintBar(); roughDraw();
}
function roughZSize() {
  const cv = $('roughZoomCv'), r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  if (!r.width) return;
  cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
  const z = Rough.zoom; if (z) { z.Z = r.width / z.w; z.h = r.height / z.Z; }
  roughZDraw();
}
function roughZDraw() {
  const cv = $('roughZoomCv'), z = Rough.zoom; if (!cv || !z || !cv.width) return;
  const ctx = cv.getContext('2d'), dpr = cv.width / cv.getBoundingClientRect().width;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.strokeStyle = roughCss('--line') || '#ddd'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(0, cv.height * 0.72); ctx.lineTo(cv.width, cv.height * 0.72); ctx.stroke(); ctx.setLineDash([]);   // a writing line
  ctx.setTransform(dpr * z.Z, 0, 0, dpr * z.Z, -z.x * dpr * z.Z, -z.y * dpr * z.Z);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const s of Rough.strokes) roughStroke(ctx, s);
}
function roughZAt(e) { const r = $('roughZoomCv').getBoundingClientRect(), z = Rough.zoom; return [z.x + (e.clientX - r.left) / z.Z, z.y + (e.clientY - r.top) / z.Z, e.pressure || 0.5]; }
function roughZDown(e) {
  const z = Rough.zoom; if (!z || Rough.cur || (e.pointerType === 'mouse' && e.button !== 0)) return;
  e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
  if (e.pointerType === 'pen') Rough.penSeen = true;
  const p = roughZAt(e);
  const s = { pts: [p], color: Rough.color, thick: false, pressure: e.pointerType === 'pen', zw: true };
  Rough.strokes.push(s);
  Rough.cur = { kind: 'draw', ptr: e.pointerId, s, type: e.pointerType, t0: Date.now(), still: Date.now(), last: p, raw: [p], zoom: true };
  clearTimeout(z.adv);
}
function roughZMove(e) {
  const c = Rough.cur; if (!c || !c.zoom || c.ptr !== e.pointerId) return;
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
  for (const ev of evs.length ? evs : [e]) roughAddPoint(c, roughZAt(ev));
  if (!Rough.raf) Rough.raf = requestAnimationFrame(() => { Rough.raf = 0; roughZDraw(); roughDrawLive(); });
}
function roughZUp(e) {
  const c = Rough.cur; if (!c || !c.zoom || c.ptr !== e.pointerId) return;
  Rough.cur = null; Rough.undo.push({ t: 'add', s: c.s });
  roughCommit(c.s); roughZDraw(); roughPaintBar();
  // writing reached the right part of the box: move along (after a short pause, so you can keep writing)
  const z = Rough.zoom, maxX = Math.max(...c.s.pts.map(p => p[0]));
  if (maxX > z.x + z.w * 0.68) { clearTimeout(z.adv); z.adv = setTimeout(() => roughZStep(z.w * 0.5), 450); }
}
function roughZStep(dx) {
  const z = Rough.zoom; if (!z) return;
  const paper = $('roughPaper').getBoundingClientRect(), v = Rough.view, right = (paper.width - 12 - v.x) / v.s;
  z.x += dx;
  if (z.x + z.w > right + z.w * 0.3) roughZLine();
  if (z.x < z.margin) z.x = z.margin;
  roughZDraw(); roughDrawLive();
}
function roughZLine() {
  const z = Rough.zoom; if (!z) return;
  z.x = z.margin; z.y += z.h * 0.9;
  const paper = $('roughPaper').getBoundingClientRect(), v = Rough.view;
  if ((z.y + z.h) * v.s + v.y > paper.height * 0.55) { v.y -= z.h * 0.9 * v.s; roughDraw(); }   // keep the line in view above the box
  roughZDraw(); roughDrawLive();
}
function roughZBar(e) {
  const b = e.target.closest('[data-rz]'); if (!b) return;
  const z = Rough.zoom; if (!z) return;
  if (b.dataset.rz === 'left') roughZStep(-z.w * 0.5);
  else if (b.dataset.rz === 'right') roughZStep(z.w * 0.5);
  else if (b.dataset.rz === 'line') roughZLine();
  else if (b.dataset.rz === 'done') roughZoomMode(false);
}

/* ---------- the Android edge swipe ("back") is switched off over the page ---------- */
function roughGuard() {
  if (!NATIVE || !window.capacitorExports) return;
  try {
    Rough.guard = Rough.guard || capacitorExports.registerPlugin('GestureGuard');
    const paper = $('roughPaper'), on = paper && Calc.open && !Calc.min && Calc.tab === 'rough' && !paper.closest('[hidden]');
    // Android lets an app switch off the back swipe on up to 200dp of each edge
    const r = on ? paper.getBoundingClientRect() : null, h = r ? Math.min(r.height, 200) : 0, y = r ? Math.round(r.top + (r.height - h) / 2) : 0;
    const rects = on ? [{ x: 0, y, w: 32, h }, { x: innerWidth - 32, y, w: 32, h }] : [], key = JSON.stringify(rects);
    if (key === Rough.guardKey) return;
    Rough.guardKey = key;
    Rough.guard.set({ rects }).catch(() => {});
  } catch (e) {}
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
    roughDrawLive(); roughChip(c.s, orig);
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
    const prompt = 'This is handwritten rough work from a student solving an exam question. Write it out as clean typed text, line by line, keeping the order and line breaks. Use plain text with symbols like × ÷ − ² ³ √ π ≈ → and write fractions as a/b. Keep the student\'s words and numbers exactly as written, even if they look wrong. For a drawing (a graph, table or diagram) write one short line in square brackets, like [a table with 3 columns]. Reply with only the typed text.';
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
      Rough.strokes = Rough.strokes.filter(s => s.tpl); Rough.view = { x: 0, y: 0, s: 1 };
      roughDraw(); roughMarks();
    }
    card.hidden = true; Rough.neat = null; roughPaintBar();
  };
}
// the drawing as a picture with a white background (only the part you used)
function roughImage() {
  const ink = Rough.strokes.filter(s => !s.hl), all = ink.flatMap(s => (s.shape ? roughShapePts(s) : s.pts).filter(Boolean)), pad = 24;
  const minX = Math.min(...all.map(p => p[0])) - pad, maxX = Math.max(...all.map(p => p[0])) + pad, minY = Math.min(...all.map(p => p[1])) - pad, maxY = Math.max(...all.map(p => p[1])) + pad;
  const k = Math.min(2, 1400 / Math.max(maxX - minX, maxY - minY));
  const c = document.createElement('canvas'); c.width = Math.round((maxX - minX) * k); c.height = Math.round((maxY - minY) * k);
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.setTransform(k, 0, 0, k, -minX * k, -minY * k); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const s of ink) roughStrokePrint(ctx, s);
  return c.toDataURL('image/png').split(',')[1];
}
function roughStrokePrint(ctx, s) {
  ctx.strokeStyle = '#111'; ctx.lineWidth = s.tpl ? 1.4 : roughWidth(s) * 1.4;
  const P = s.shape ? roughShapePts(s) : s.pts; ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]);
  for (let i = 1; i < P.length; i++) { if (!P[i]) { i++; if (P[i]) ctx.moveTo(P[i][0], P[i][1]); continue; } ctx.lineTo(P[i][0], P[i][1]); }
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
    if (Rough.zoom) { const z = Rough.zoom; z.x = z.margin = 12; z.y = 12; }
    roughMenuShow(false);
    roughPaintBar(); roughDraw(); roughMarks(); if (Rough.zoom) roughZDraw();
    paper.classList.remove('wipe');
  };
  if (had && Calc.open && !Calc.min && Calc.tab === 'rough') { paper.classList.add('wipe'); setTimeout(wipe, 260); } else wipe();
}
function roughReset() { if (Rough.zoom) roughZoomMode(false); roughNewPage(); Rough.tool = 'pen'; Rough.thick = false; Rough.color = 'ink'; Rough.paper = 'plain'; if (Rough.built) { roughPaintBar(); roughGuard(); } }
