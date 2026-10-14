/* =====================================================================
   CALCULATOR in quizzes and live tests (the maths is in calcmath.js).
   Phone: a panel that slides up from the bottom; the question moves up and
   stays readable above it. ⌄ shrinks it to a slim bar with the last answer.
   Laptop: a small floating panel you can drag; type with the keyboard.
   History lasts for the quiz, then it is cleared. Settings can turn it off.
   ===================================================================== */
const Calc = { T: [], ans: 0, done: false, deg: true, open: false, min: false, hist: [], showHist: false, err: '', drag: null };
const calcOn = () => prefs().calc !== false;
const CALC_SCI = [
  [['db10', '10·log', 'Decibels of a power ratio: 10·log(P2/P1)'], ['db20', '20·log', 'Decibels of a voltage or current ratio: 20·log(V2/V1)'], ['log', 'log', 'Log base 10'], ['ln', 'ln', 'Natural log'], ['pow10', '10ˣ', '10 to the power'], ['sqrt', '√', 'Square root'], ['²', 'x²', 'Square'], ['^', 'xʸ', 'Power'], ['π', 'π', 'Pi'], ['e', 'e', 'e (2.718…)'], ['ans', 'Ans', 'The last answer']],
  [['sin', 'sin'], ['cos', 'cos'], ['tan', 'tan'], ['deg', ''], ['k', 'k', 'kilo ×10³'], ['M', 'M', 'mega ×10⁶'], ['G', 'G', 'giga ×10⁹'], ['m', 'm', 'milli ×10⁻³'], ['µ', 'µ', 'micro ×10⁻⁶'], ['n', 'n', 'nano ×10⁻⁹'], ['p', 'p', 'pico ×10⁻¹²'], ['%', '%', 'Percent']],
];
const CALC_PAD = ['C', '(', ')', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '0', '.', 'back', '='];
const calcIc = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="3"/><path d="M8.5 7h7"/><circle cx="9" cy="11.5" r=".6"/><circle cx="12" cy="11.5" r=".6"/><circle cx="15" cy="11.5" r=".6"/><circle cx="9" cy="14.5" r=".6"/><circle cx="12" cy="14.5" r=".6"/><circle cx="15" cy="14.5" r=".6"/><circle cx="9" cy="17.5" r=".6"/><circle cx="12" cy="17.5" r=".6"/><path d="M14.4 17.5h1.2"/></svg>';
// the 🧮 button for the quiz header and the live test
const calcBtnHTML = () => calcOn() ? `<button class="btn ghost iconbtn calc-btn" type="button" data-calcopen aria-label="Calculator" title="Calculator (C)">${calcIc}</button>` : '';

function calcBuild() {
  if ($('calc')) return;
  const el = document.createElement('div');
  el.id = 'calc'; el.className = 'calc'; el.hidden = true;
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Calculator');
  el.innerHTML = `
    <div class="calc-head" data-calcdrag>
      <span class="calc-grip" aria-hidden="true"></span>
      <span class="calc-title">${calcIc}<b>Calculator</b><small class="calc-mini" id="calcMini"></small></span>
      <span class="calc-hbtns">
        <button type="button" class="calc-hb" data-calchist aria-label="History" title="History"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4"/><path d="M12 8v4l3 2"/></svg></button>
        <button type="button" class="calc-hb" data-calcmin aria-label="Make smaller" title="Make smaller"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>
        <button type="button" class="calc-hb" data-calcclose aria-label="Close calculator" title="Close (Esc)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      </span>
    </div>
    <div class="calc-body">
      <div class="calc-screen" id="calcScreen" aria-live="polite">
        <div class="calc-expr" id="calcExpr"></div>
        <button type="button" class="calc-res" id="calcRes" title="Tap to copy"></button>
        <div class="calc-sub" id="calcSub"></div>
      </div>
      <div class="calc-hist" id="calcHist" hidden></div>
      <div class="calc-sci" id="calcSci">${CALC_SCI.map(row => `<div class="calc-row">${row.map(([k, l, t]) => k === 'deg'
        ? `<button type="button" class="ck ck-deg" data-ck="deg" aria-label="Angle unit"></button>`
        : `<button type="button" class="ck ck-sci${'kMGmµnp'.includes(k) && k.length === 1 ? ' ck-pre' : ''}" data-ck="${k}"${t ? ` title="${t}"` : ''}>${l}</button>`).join('')}</div>`).join('')}</div>
      <div class="calc-pad">${CALC_PAD.map(k => `<button type="button" class="ck ${/^[0-9.]$/.test(k) ? 'ck-num' : k === '=' ? 'ck-eq' : k === 'C' ? 'ck-clear' : k === 'back' ? 'ck-back' : 'ck-op'}" data-ck="${k}" aria-label="${{ back: 'Delete', C: 'Clear', '−': 'minus', '×': 'times', '÷': 'divide' }[k] || k}">${k === 'back' ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5-6z"/><path d="M12 10l4 4M16 10l-4 4"/></svg>' : k}</button>`).join('')}</div>
    </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', calcClick);
  // keep a key you hold from starting a long-press menu or a double-tap zoom
  el.addEventListener('pointerdown', e => { const k = e.target.closest('.ck'); if (k) k.classList.add('down'); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(n => el.addEventListener(n, () => el.querySelectorAll('.ck.down').forEach(k => k.classList.remove('down')), true));
  calcDragSetup(el);
}
function calcClick(e) {
  const b = e.target.closest('button'); if (!b) return;
  if ('calcclose' in b.dataset) return calcClose();
  if ('calcmin' in b.dataset) return calcMinimize(!Calc.min);
  if ('calchist' in b.dataset) { Calc.showHist = !Calc.showHist; return calcPaint(); }
  if (b.id === 'calcRes') return calcCopy();
  if (b.dataset.hv !== undefined) { calcInsertValue(Number(b.dataset.hv)); return; }
  if (b.closest('.calc-mini-bar')) return calcMinimize(false);
  const k = b.dataset.ck; if (!k) return;
  calcKey(k);
}
// one key
function calcKey(k) {
  if (typeof Native !== 'undefined' && Native.tap) Native.tap();
  Calc.err = '';
  if (k === 'deg') { Calc.deg = !Calc.deg; return calcPaint(); }
  if (k === 'C') { Calc.T = []; Calc.done = false; return calcPaint(); }
  if (k === 'back') { if (Calc.done) { Calc.T = []; Calc.done = false; } else Calc.T = CalcMath.back(Calc.T); return calcPaint(); }
  if (k === '=') return calcEquals();
  if (Calc.done) {                         // after =: a number starts again; a sign carries on from the answer
    Calc.T = /^[+−×÷^²%]$/.test(k) || 'kMGmµnp'.includes(k) && k.length === 1 ? [{ t: 'ans' }] : [];
    Calc.done = false;
  }
  Calc.T = CalcMath.press(Calc.T, k);
  calcPaint();
}
function calcEquals() {
  if (!Calc.T.length) return;
  const r = CalcMath.tryEval(Calc.T, { deg: Calc.deg, ans: Calc.ans });
  if (!r.ok) { Calc.err = r.incomplete ? 'Finish the sum first' : r.msg; calcPaint(true); return; }
  const expr = CalcMath.show(Calc.T) + CalcMath.ghost(Calc.T);
  Calc.hist.unshift({ expr, v: r.v }); Calc.hist = Calc.hist.slice(0, 8);
  Calc.ans = r.v; Calc.done = true; Calc.lastExpr = expr;
  Calc.T = [{ t: 'val', v: r.v }];
  calcPaint();
}
function calcInsertValue(v) {
  if (Calc.done || !Calc.T.length) Calc.T = [];
  const l = Calc.T[Calc.T.length - 1];
  if (l && ['num', 'val', 'rp', 'const', 'ans', 'pre', 'post'].includes(l.t)) Calc.T.push({ t: 'op', v: '×' });
  Calc.T.push({ t: 'val', v }); Calc.done = false; Calc.showHist = false;
  calcPaint();
}
function calcCopy() {
  const v = Calc.done ? Calc.ans : (CalcMath.tryEval(Calc.T, { deg: Calc.deg, ans: Calc.ans }).v);
  if (v === undefined || v === null) return;
  const txt = String(v);
  (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast(`Copied ${txt}`), () => {});
}
function calcPaint(shake) {
  const el = $('calc'); if (!el) return;
  const live = Calc.T.length ? CalcMath.tryEval(Calc.T, { deg: Calc.deg, ans: Calc.ans }) : null;
  const exprTxt = Calc.done ? `${Calc.lastExpr} =` : CalcMath.show(Calc.T);
  $('calcExpr').innerHTML = Calc.done || !Calc.T.length ? esc(exprTxt || ' ') : `${esc(exprTxt)}<span class="calc-ghost">${esc(CalcMath.ghost(Calc.T))}</span><span class="calc-caret" aria-hidden="true"></span>`;
  const ex = $('calcExpr'); ex.scrollLeft = ex.scrollWidth;
  const res = $('calcRes'), sub = $('calcSub');
  let main = '', eng = '', cls = '';
  if (Calc.err) { main = Calc.err; cls = 'err'; }
  else if (Calc.done) { main = CalcMath.fmt(Calc.ans); eng = CalcMath.eng(Calc.ans); cls = 'final'; }
  else if (live && live.ok) { main = CalcMath.fmt(live.v); eng = CalcMath.eng(live.v); cls = 'preview'; }
  else if (!Calc.T.length) { main = '0'; cls = 'preview'; }
  else main = res.dataset.keep || '';
  res.className = 'calc-res ' + cls; res.textContent = main;
  if (cls !== 'err') res.dataset.keep = main;
  res.style.fontSize = main.length > 16 ? '1.25rem' : main.length > 11 ? '1.55rem' : '';
  sub.textContent = eng ? `≈ ${eng}` : Calc.done ? 'Tap the answer to copy it' : '';
  if (shake) { res.classList.remove('shake'); void res.offsetWidth; res.classList.add('shake'); }
  el.querySelector('.ck-deg').textContent = Calc.deg ? 'DEG' : 'RAD';
  el.querySelector('.ck-deg').setAttribute('aria-pressed', String(Calc.deg));
  const h = $('calcHist'); h.hidden = !Calc.showHist;
  el.querySelector('[data-calchist]').setAttribute('aria-pressed', String(Calc.showHist));
  if (Calc.showHist) h.innerHTML = Calc.hist.length ? `<p class="calc-hlabel">Tap an answer to use it</p>${Calc.hist.map(x => `<button type="button" class="calc-hrow" data-hv="${x.v}"><span>${esc(x.expr)}</span><b>= ${esc(CalcMath.fmt(x.v))}</b></button>`).join('')}` : '<p class="calc-hlabel">Your answers in this quiz will be listed here.</p>';
  $('calcMini').textContent = Calc.done || (live && live.ok) ? `= ${CalcMath.fmt(Calc.done ? Calc.ans : live.v)}` : '';
  calcFit();
}
// the panel's height, so the quiz can make room for it on phones
function calcFit() {
  const el = $('calc'), on = !!el && !el.hidden;
  document.body.classList.toggle('calc-open', on);
  document.body.classList.toggle('calc-small', on && Calc.min);
  const h = on ? Math.round(el.getBoundingClientRect().height) : 0;
  document.documentElement.style.setProperty('--calc-h', h + 'px');
  // scrolling to something (an option, an input) stops above the panel on phones, not behind it
  document.documentElement.style.scrollPaddingBottom = on && calcPhone() ? (h + 12) + 'px' : '';
  if (typeof setKeyHint === 'function' && visible('quiz') && App.session) setKeyHint();
}
const calcPhone = () => !(window.matchMedia && matchMedia('(min-width: 760px)').matches);
function calcOpen() {
  if (!calcOn()) return;
  calcBuild();
  const el = $('calc'), was = Calc.open;
  Calc.open = true; Calc.min = false; el.hidden = false; el.classList.remove('min');
  if (!was) { el.classList.remove('in'); void el.offsetWidth; el.classList.add('in'); }
  calcPaint();
  requestAnimationFrame(calcFit);
  document.querySelectorAll('[data-calcopen]').forEach(b => b.setAttribute('aria-pressed', 'true'));
}
function calcMinimize(on) {
  const el = $('calc'); if (!el) return;
  Calc.min = on; el.classList.toggle('min', on);
  if (on) Calc.showHist = false;
  calcPaint();
  requestAnimationFrame(calcFit);
}
function calcClose() {
  const el = $('calc'); if (!el) return;
  Calc.open = false; el.hidden = true; Calc.showHist = false;
  calcFit();
  document.querySelectorAll('[data-calcopen]').forEach(b => b.setAttribute('aria-pressed', 'false'));
}
// the quiz ended (or you left it): close, and forget this quiz's sums
function calcReset() { calcClose(); Object.assign(Calc, { T: [], ans: 0, done: false, hist: [], err: '', deg: true, lastExpr: '' }); }
function calcOnScreen(id) { if (!['quiz', 'break', 'room'].includes(id)) calcReset(); }
document.addEventListener('click', e => { const b = e.target.closest('[data-calcopen]'); if (!b) return; if (Calc.open && !Calc.min) calcMinimize(true); else calcOpen(); });

// laptop: drag the panel by its top
function calcDragSetup(el) {
  const head = el.querySelector('[data-calcdrag]');
  head.addEventListener('pointerdown', e => {
    if (calcPhone() || e.target.closest('button')) return;
    const r = el.getBoundingClientRect();
    Calc.drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    head.setPointerCapture(e.pointerId);
  });
  head.addEventListener('pointermove', e => {
    if (!Calc.drag) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    const x = Math.min(innerWidth - w - 8, Math.max(8, e.clientX - Calc.drag.dx)), y = Math.min(innerHeight - h - 8, Math.max(8, e.clientY - Calc.drag.dy));
    el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.right = 'auto'; el.style.bottom = 'auto';
  });
  head.addEventListener('pointerup', () => { Calc.drag = null; });
  // phone: the slim bar opens it again
  head.addEventListener('click', e => { if (Calc.min && !e.target.closest('[data-calcclose]') && !e.target.closest('[data-calcmin]')) calcMinimize(false); });
  addEventListener('resize', () => { if (calcPhone()) { el.style.left = el.style.top = el.style.right = el.style.bottom = ''; } calcFit(); });
}

// keyboard: while the calculator is open, number and sign keys go to it (C opens it)
const CALC_KEYS = { '*': '×', x: '×', X: '×', '/': '÷', '-': '−', '+': '+', '^': '^', '(': '(', ')': ')', '.': '.', ',': '.', '%': '%', Enter: '=', '=': '=', Backspace: 'back', Delete: 'C' };
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  const inQuiz = visible('quiz') || (visible('room') && LT.view === 'live');
  if (!inQuiz || !calcOn()) return;
  if (!Calc.open || Calc.min) { if (e.key === 'c' || e.key === 'C') { e.preventDefault(); e.stopImmediatePropagation(); calcOpen(); } return; }
  if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); return calcClose(); }
  const k = /^[0-9]$/.test(e.key) ? e.key : CALC_KEYS[e.key];
  if (!k) return;
  e.preventDefault(); e.stopImmediatePropagation();
  calcKey(k);
  const btn = $('calc').querySelector(`[data-ck="${CSS.escape(k)}"]`);
  if (btn) { btn.classList.add('down'); setTimeout(() => btn.classList.remove('down'), 120); }
}, true);
