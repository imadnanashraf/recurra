/* =====================================================================
   FINDING NEW THINGS, without nagging:
   1. A one-time tip at the moment it helps (a small bubble pointing at it).
   2. "What's new" on Today once after an update, with "Try it".
   3. Now and then the Today card says "Did you know?" about a feature
      you have not used yet (never one you already use).
   Rules: at most one tip per screen, never in a live test, remembered in
   your account (seen on one device = seen on all), and Settings → Show tips
   turns all of it off.
   ===================================================================== */
const Tips = { screenShown: '', el: null, timer: null, pending: null };
const tipsOn = () => prefs().tips !== false && !App.viewAs && !!App.user;
const tipSeen = id => !!((App.profile.tipsSeen || {})[id]);
function tipMark(id) {
  if (tipSeen(id)) return;
  App.profile.tipsSeen = { ...(App.profile.tipsSeen || {}), [id]: Date.now() };
  Store.setProfile({ tipsSeen: { [id]: Date.now() } }).catch(() => {});
}
// remember that you used a feature (so "Did you know?" never tells you about it)
const featUsed = id => !!((App.profile.used || {})[id]);
function featUse(id) {
  if (!App.user || App.viewAs || featUsed(id)) return;
  App.profile.used = { ...(App.profile.used || {}), [id]: Date.now() };
  Store.setProfile({ used: { [id]: Date.now() } }).catch(() => {});
}

// 1. a one-time bubble, pointing at an element. opts: { pulse, place: 'above' | 'below' }
function tip(id, anchor, html, opts = {}) {
  if (!tipsOn() || tipSeen(id) || !anchor || !anchor.isConnected) return false;
  const screen = SCREENS.find(s => !$(s).hidden) || '';
  if (Tips.screenShown === screen || Tips.el) return false;                  // one tip per screen visit
  if (screen === 'room' || document.body.classList.contains('lt-focus')) return false;   // never in a live test
  const r = anchor.getBoundingClientRect();
  if (!r.width || r.bottom < 0 || r.top > innerHeight) return false;
  Tips.screenShown = screen;
  tipMark(id);
  const el = document.createElement('div');
  el.className = 'tipbub'; el.setAttribute('role', 'status');
  el.innerHTML = `<span class="tip-ic" aria-hidden="true">💡</span><span class="tip-t">${html}</span><button type="button" class="tip-x" aria-label="Got it">Got it</button>`;
  document.body.appendChild(el);
  const w = Math.min(300, innerWidth - 24), place = opts.place || (r.top > innerHeight * 0.45 ? 'above' : 'below');
  el.style.width = w + 'px';
  const left = Math.max(12, Math.min(innerWidth - w - 12, r.left + r.width / 2 - w / 2));
  el.style.left = left + 'px';
  el.style.setProperty('--ax', Math.max(16, Math.min(w - 16, r.left + r.width / 2 - left)) + 'px');
  const h = el.offsetHeight;
  el.style.top = (place === 'inside' ? r.top + 10 : place === 'above' ? Math.max(8, r.top - h - 12) : Math.min(innerHeight - h - 8, r.bottom + 12)) + 'px';
  el.classList.add(place);
  if (opts.pulse) anchor.classList.add('tip-pulse');
  Tips.el = el; Tips.anchor = anchor;
  const close = () => tipClose();
  const y0 = scrollY, onScroll = () => { if (Math.abs(scrollY - y0) > 40) { removeEventListener('scroll', onScroll); close(); } };   // a real scroll, not a small nudge
  Tips.off = () => removeEventListener('scroll', onScroll);
  setTimeout(() => { document.addEventListener('pointerdown', close, { once: true, capture: true }); addEventListener('scroll', onScroll, { passive: true }); }, 50);
  Tips.timer = setTimeout(close, opts.ms || 9000);
  return true;
}
function tipClose() {
  clearTimeout(Tips.timer); if (Tips.off) { Tips.off(); Tips.off = null; }
  if (Tips.anchor) Tips.anchor.classList.remove('tip-pulse');
  if (Tips.el) { const el = Tips.el; el.classList.add('out'); setTimeout(() => el.remove(), 200); }
  Tips.el = null; Tips.anchor = null;
}
function tipsOnScreen(id) { if (Tips.el) tipClose(); Tips.screenShown = ''; }

// the moments
function tipsQuiz() { if (tipSeen('tools')) return tipsQuizHelpers(); setTimeout(() => { const b = document.querySelector('#qCalc [data-calcopen]'); if (b && visible('quiz') && !Calc.open) tip('tools', b, `<b>New: rough work and a calculator.</b> Tap here any time in a quiz.`, { pulse: true, place: 'below' }); }, 700); }
function tipsRoughStroke(s) {
  if (s.shape || tipSeen('snap')) return;
  const P = s.pts; if (P.length < 6) return;
  const len = Math.hypot(P[P.length - 1][0] - P[0][0], P[P.length - 1][1] - P[0][1]);
  if (len < 60 || rdp(P.map(p => [p[0], p[1]]), Math.max(4, len * 0.06)).length !== 2) return;      // it looked like a line
  tip('snap', $('roughPaper'), `<b>Tip:</b> hold still for a moment at the end of a line, circle or box and it straightens.`, { place: 'inside' });
}
function tipsTypedCheck() { const m = document.querySelector('#roughMarks .rm'); if (m) tip('check', m, `Lines with <b>=</b> are checked for you: ✓ when right, ≈ the right value when not.`, { place: 'below' }); }
function tipsQuizHelpers() { setTimeout(() => { const q = $('qText'); if (q && visible('quiz') && !Calc.open) tip('qhl', q, `<b>New:</b> tap a word to highlight it, and long-press an option to strike it out.`, { place: 'below' }); }, 900); }
function tipsCalc() { setTimeout(() => { const k = document.querySelector('#calc [data-ck="db10"]'); if (k && Calc.open && Calc.tab === 'calc') tip('calc', k, `<b>10·log</b> and <b>20·log</b> give decibels. Type 5 then <b>k</b> for 5,000.`, { place: 'above' }); }, 400); }

// 2. what's new (one card per update that brings something worth knowing)
const WHATS_NEW = {
  id: '2026-10-helpers', from: Date.parse('2026-10-16T20:00:00+05:30'),
  items: [
    { key: 'speak', title: 'Read aloud', text: 'Tap Listen on a question or note. With your own Google AI key it uses a natural, human-sounding voice.', art: 'speak' },
    { key: 'helpers', title: 'Highlight, strike out, flag', text: 'Tap a word to highlight it, long-press an option to rule it out, and flag questions to look at later.', art: 'helpers' },
    { key: 'hand', title: 'Move and zoom with one finger', text: 'In rough work, press and hold to move the page; double-tap zooms in, triple-tap zooms out. Plus Redo, and the calculator can write on the page.', art: 'tools' },
  ],
};
const WN_ART = {
  speak: `<svg viewBox="0 0 64 44"><rect x="6" y="8" width="34" height="28" rx="6" class="wn-paper"/><path d="M12 16h22M12 22h16M12 28h19" class="wn-key"/><path d="M46 18v8h4l5 4V14l-5 4z" class="wn-ink"/><path d="M58 17a6 6 0 0 1 0 10" class="wn-ink"/></svg>`,
  helpers: `<svg viewBox="0 0 64 44"><rect x="4" y="6" width="56" height="9" rx="4" class="wn-paper"/><rect x="18" y="8" width="14" height="5" rx="2" class="wn-new"/><rect x="4" y="19" width="56" height="9" rx="4" class="wn-soft"/><path d="M10 23.5h30" class="wn-ink"/><rect x="4" y="32" width="56" height="9" rx="4" class="wn-paper"/><path d="M50 30v12M50 30h7l-2 3 2 3h-7" class="wn-ink"/></svg>`,
  zoom: `<svg viewBox="0 0 64 44"><rect x="4" y="4" width="56" height="16" rx="4" class="wn-paper"/><path d="M10 13h8" class="wn-ink"/><rect x="4" y="24" width="56" height="16" rx="4" class="wn-soft"/><path d="M12 35c3-8 6-8 8 0s5 6 9-3" class="wn-ink"/></svg>`,
  swipe: `<svg viewBox="0 0 64 44"><rect x="14" y="6" width="36" height="32" rx="6" class="wn-paper"/><path d="M20 16h24M20 22h18M20 28h20" class="wn-key"/><path d="M58 22H44M48 18l-4 4 4 4" class="wn-ink"/></svg>`,
  tools: `<svg viewBox="0 0 64 44"><rect x="4" y="4" width="36" height="36" rx="6" class="wn-paper"/><path d="M10 30 L34 14" class="wn-ink"/><circle cx="24" cy="24" r="0" class="wn-dot"/><rect x="44" y="12" width="16" height="28" rx="4" class="wn-soft"/><path d="M47 18h10M47 24h3M52 24h3M47 30h3M52 30h3M47 36h3M52 36h3" class="wn-key"/></svg>`,
  upload: `<svg viewBox="0 0 64 44"><rect x="8" y="4" width="26" height="34" rx="4" class="wn-paper"/><path d="M13 12h16M13 18h16M13 24h10" class="wn-key"/><text x="13" y="34" class="wn-w">W</text><rect x="38" y="12" width="22" height="18" rx="4" class="wn-soft"/><circle cx="49" cy="21" r="5" class="wn-ink"/></svg>`,
  both: `<svg viewBox="0 0 64 44"><rect x="6" y="8" width="24" height="28" rx="5" class="wn-soft"/><path d="M11 16h14M11 22h10M11 28h12" class="wn-key"/><text x="38" y="28" class="wn-plus">+</text><rect x="44" y="8" width="16" height="28" rx="4" class="wn-paper"/><path d="M48 16h8M48 22h8M48 28h5" class="wn-key"/></svg>`,
  newtag: `<svg viewBox="0 0 64 44"><rect x="6" y="8" width="52" height="10" rx="5" class="wn-paper"/><rect x="40" y="10" width="14" height="6" rx="3" class="wn-new"/><rect x="6" y="24" width="52" height="10" rx="5" class="wn-paper"/><path d="M12 13h22M12 29h30" class="wn-key"/></svg>`,
};
function renderWhatsNew() {
  const box = $('whatsNew'); if (!box) return;
  const W = WHATS_NEW, seen = (App.profile.whatsNew || '') === W.id;
  const fresh = (App.profile.created || 0) > W.from;                      // a brand-new account: everything is new, no "what's new"
  const on = tipsOn() && !seen && !fresh && !!App.prep;
  box.hidden = !on; if (!on) { box.innerHTML = ''; return; }
  if (box.dataset.id === W.id && box.innerHTML) return;
  box.dataset.id = W.id;
  box.innerHTML = `<div class="wn-head"><span class="wn-badge">New</span><b>What’s new in Recurra</b><button type="button" class="btn ghost iconbtn wn-x" data-wnclose aria-label="Close">✕</button></div>
    <div class="wn-list">${W.items.map(it => `<div class="wn-item"><span class="wn-art" aria-hidden="true">${WN_ART[it.art]}</span><span class="wn-txt"><b>${esc(it.title)}</b><small>${esc(it.text)}</small></span><button type="button" class="btn small wn-try" data-wntry="${it.key}">Try it</button></div>`).join('')}</div>
    <p class="wn-foot"><button type="button" class="linkbtn" data-mode="help">More in Help</button></p>`;
}
function whatsNewDone() {
  App.profile.whatsNew = WHATS_NEW.id;
  Store.setProfile({ whatsNew: WHATS_NEW.id }).catch(() => {});
  const box = $('whatsNew'); box.classList.add('out'); setTimeout(() => { box.hidden = true; box.classList.remove('out'); }, 220);
}
// "Try it": straight to the feature
function tryFeature(key) {
  if (key === 'tools' || key === 'calc') {
    const pool = shuffle(App.questions.slice()).slice(0, 3);
    if (!pool.length) return openImport('active', 'mcq');
    startSession('Try the tools', pool);
    setTimeout(() => calcOpen(key === 'calc' ? 'calc' : 'rough'), 350);
  } else if (key === 'word') openImport('active', 'mcq');
  else if (key === 'both') openImport('active', 'both');
  else if (key === 'newtag' || key === 'newonly') { MODES.bank(); if (key === 'newonly' && !BankUI.newOnly && !$('bankNew').disabled) $('bankNew').click(); }
  else if (key === 'newq') MODES.topic();
  else if (key === 'readall') { MODES.notes(); }
  else if (key === 'live') MODES.tests();
  else if (key === 'neat' || key === 'rough2') tryFeature('tools');
  else if (key === 'zoomw') { tryFeature('tools'); setTimeout(() => { if (Calc.open && typeof roughZoomMode === 'function' && !Rough.zoom) roughZoomMode(true); }, 650); }
  else if (key === 'swipe') { if (App.notes.length) MODES.notes(); else MODES.bank(); }
  else if (key === 'markread') MODES.notes();
  else if (key === 'speak') { if (App.notes.length) { MODES.notes(); setTimeout(() => { const n = NotesUI.list && NotesUI.list[0]; if (n) openNote(n.id); }, 150); } else MODES.bank(); }
  else if (key === 'helpers') { const pool = shuffle(App.questions.slice()).slice(0, 3); if (pool.length) startSession('Try the quiz helpers', pool); }
  else if (key === 'hand') { tryFeature('tools'); setTimeout(() => { if (Calc.open && Rough.built) { Rough.tool = 'hand'; roughPaintBar(); } }, 650); }
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-wntry]'); if (t) { whatsNewDone(); return tryFeature(t.dataset.wntry); }
  if (e.target.closest('[data-wnclose]')) whatsNewDone();
});

// 3. "Did you know?" on the Today card (only features you have not used)
const DYK = [
  { key: 'tools', text: 'In any quiz, the Tools button gives you rough work and a calculator.', when: () => true },
  { key: 'word', text: 'You can turn a Word file or a photo of your notes into MCQs.', when: () => true },
  { key: 'both', text: 'Pick “MCQs + notes” to make both from one upload.', when: () => true },
  { key: 'newq', text: 'Practice → New questions quizzes you on what you just added.', when: () => App.questions.some(q => { const s = getState(q.id); return !s || !s.t; }) },
  { key: 'newonly', text: 'In the Question bank, “New only” shows questions you have never answered.', when: () => App.questions.length > 10 },
  { key: 'readall', text: 'In Notes, “Read all” lets you read every note like a book.', when: () => App.notes.length > 2 },
  { key: 'neat', text: 'Write in rough work and tap ✨ Neat to turn it into typed text.', when: () => typeof roughNeatOK === 'function' && roughNeatOK() },
  { key: 'zoomw', text: 'Small writing on a phone? In rough work, the magnifier button gives zoom writing: write big, it lands small.', when: () => mq('(pointer: coarse)') },
  { key: 'speak', text: 'Tap Listen on a note or question to hear it read aloud: handy while walking or travelling.', when: () => App.notes.length > 0 || App.questions.length > 0 },
  { key: 'flag', text: 'In a quiz, tap Flag to save a question for later. Question bank → Flagged lists them.', when: () => App.questions.length > 10 },
  { key: 'strike', text: 'In a quiz, long-press an option to strike it out when you have ruled it out.', when: () => App.questions.length > 0 },
  { key: 'live', text: 'Challenge friends to a live test from the Tests tab.', when: () => !!(App.profile && App.profile.username) },
];
function dykPick() {
  if (!tipsOn()) return null;
  const list = DYK.filter(d => !featUsed(d.key) && d.when());
  return list.length ? list[Math.floor(Math.random() * list.length)] : null;
}
