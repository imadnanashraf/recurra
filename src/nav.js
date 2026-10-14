/* =====================================================================
   BACK: the phone's back button, the browser's back arrow and the Back
   buttons on screen all do the same thing: undo the last step.
   1. close what is open on top (a pop-up, photo, tip, sheet, Select mode)
   2. the Tools panel: full screen → half → closed
   3. reading one note or question → back to the list
   4. in a quiz or a live test: ask first ("Stop for now?")
   5. inner screens → their parent; main tabs → Today
   6. on Today: "Press back again to exit"; a second back within 2 s closes the app
   The Back buttons are named after where they go: ‹ Practice, ‹ Notes …
   ===================================================================== */
const Nav = { cur: null, prev: null, from: {}, rootAt: 0, armed: false, ask: null };
const MAIN_TABS = ['home', 'syllabus', 'notes', 'progress', 'room', 'admin'];
const SCREEN_NAME = { home: 'Today', picker: 'Practice', syllabus: 'Syllabus', notes: 'Notes', room: 'Tests', progress: 'Progress', admin: 'Admin', settings: 'Settings', help: 'Help', preps: 'Preps', chat: 'Friends', bank: 'Question bank', calendar: 'Calendar', import: 'Add' };
function navOnScreen(id) {
  if (id !== Nav.cur) {
    Nav.prev = Nav.cur; Nav.cur = id;
    if (!Nav.backing && ['help', 'settings', 'preps'].includes(id) && Nav.prev && Nav.prev !== id && !['quiz', 'break', 'boot', 'login'].includes(Nav.prev)) Nav.from[id] = Nav.prev;
  }
  if (id !== 'home') Nav.rootAt = 0;
  navBackAsk(null);
  setTimeout(navPaint, 0);
}
// where "back" goes from this screen: { label, go } (null = you are at the start)
function navParent(id) {
  const today = { label: 'Today', go: () => goHome() };
  const from = k => { const f = Nav.from[k]; return f && f !== k && $(f) ? { label: SCREEN_NAME[f] || 'Back', go: () => navOpen(f) } : today; };
  switch (id) {
    case 'home': return App.prep ? null : null;
    case 'login': case 'boot': return null;
    case 'preps': return App.prep ? from('preps') : null;
    case 'settings': return from('settings');
    case 'help': return from('help');
    case 'picker': return App.pick && App.pick.mode === 'topic' ? { label: 'Practice', go: () => openSubjectPicker() } : today;
    case 'bank': return BankUI.open ? { label: 'List', go: () => { BankUI.open = null; renderBank(); } } : { label: 'Practice', go: () => openSubjectPicker() };
    case 'notes': return NotesUI.open || NotesUI.all ? { label: 'Index', go: () => { NotesUI.open = null; NotesUI.all = false; renderNotes(); } } : today;
    case 'calendar': return { label: 'Progress', go: () => MODES.progress() };
    case 'thread': return { label: 'Friends', go: () => $('threadBack').click() };
    case 'adminUser': return { label: 'Admin', go: () => $('auBack').click() };
    case 'import': { const b = App.imp && App.imp.back; return { label: b === 'thread' ? 'Chat' : b === 'preps' || !App.prep ? 'Preps' : b === 'syllabus' ? 'Syllabus' : 'Today', go: () => $('impBack').click() }; }
    case 'room': return LT.view === 'history' || !LT.view ? today : { label: 'Tests', go: () => { const v = LT.view; leaveRoom(); LT.view = null; v === 'history' ? goHome() : MODES.tests(); } };
    default: return today;                                // result, progress, syllabus, chat, admin …
  }
}
function navOpen(id) { if (MODES[id]) MODES[id](); else if (id === 'picker') openSubjectPicker(); else if (id === 'preps') showPreps(); else if (id === 'room') MODES.tests(); else show(id); }

// the Back buttons say where they go
function navPaint() {
  const id = Nav.cur; if (!id) return;
  const sec = $(id); if (!sec) return;
  const p = navParent(id);
  sec.querySelectorAll(':scope > .head-row [data-back], #prepsBack, #impBack, #auBack').forEach(b => {
    if (!p) return;
    b.innerHTML = `${icon('back')}${esc(p.label)}`;
    b.setAttribute('aria-label', `Back to ${p.label}`);
  });
  // one level down: a small label above the title naming the section you are in
  const row = sec.querySelector(':scope > .head-row');
  if (!row) return;
  const up = id === 'bank' ? 'Practice' : id === 'calendar' ? 'Progress' : id === 'picker' && App.pick && App.pick.mode === 'topic' ? 'Practice' : id === 'adminUser' ? 'Admin' : id === 'import' && p ? p.label : id === 'help' && p ? p.label : '';
  let tag = sec.querySelector(':scope > .nav-up');
  if (!up) { if (tag) tag.remove(); return; }
  if (!tag) { tag = document.createElement('small'); tag.className = 'nav-up'; row.before(tag); }
  tag.textContent = up;
}

// one step back. byScreenButton: only the screen step (the on-screen Back button)
function navBack(byScreenButton) {
  if (!byScreenButton) {
    if (!$('updGate').hidden) return 'done';                                      // an update must be installed first
    if ($('callView') && !$('callView').hidden) return 'done';                     // in a call: use the red button
    if (Nav.ask) { navBackAsk(null); return 'done'; }
    if (typeof Tips !== 'undefined' && Tips.el) { tipClose(); return 'done'; }
    if (!$('photoView').hidden) { closePhoto(); return 'done'; }
    if (!$('selSheet').hidden) { const n = $('selSheet').querySelector('[data-shno]'); if (n) n.click(); else $('selSheet').hidden = true; document.body.classList.remove('sheet-open'); return 'done'; }
    if ($('aiGuide') && !$('aiGuide').hidden) { const l = $('agLater'); if (l) l.click(); else { $('aiGuide').hidden = true; document.body.classList.remove('sheet-open'); } return 'done'; }
    if (!$('setupSheet').hidden) { if (!$('setCancel').hidden) { closeSetup(); return 'done'; } return 'done'; }
    if ($('threadActions') && !$('threadActions').hidden) { $('threadActions').hidden = true; return 'done'; }
    if ($('sharePanel') && !$('sharePanel').hidden) { closeSharePanel(); return 'done'; }
    if (typeof Sel !== 'undefined' && Sel.on) { selStop(); return 'done'; }
    if (typeof Calc !== 'undefined' && Calc.open && !Calc.min) { if (Calc.full) toolsFull(false); else calcClose(); return 'done'; }
    if (typeof Calc !== 'undefined' && Calc.open) { calcClose(); return 'done'; }
  }
  const id = Nav.cur;
  // a quiz or a live test in progress: ask first
  if (id === 'quiz' || id === 'break') {
    navBackAsk({ title: 'Stop for now?', text: 'Your answers so far are saved.', yes: 'Stop', no: 'Keep going', go: () => { if (id === 'break') $('bStop').click(); else $('quitBtn').click(); } });
    return 'done';
  }
  if (id === 'room' && ['live', 'countdown', 'room'].includes(LT.view) && LT.rid) {
    const playing = LT.view === 'live' || LT.view === 'countdown';
    navBackAsk({ title: playing ? 'Leave this live test?' : 'Leave the lobby?', text: playing ? 'The others carry on. Your answers so far still count.' : 'You can join again from the Tests tab while it is open.', yes: 'Leave', no: 'Stay', go: () => { leaveRoom(); LT.view = null; MODES.tests(); } });
    return 'done';
  }
  const p = navParent(id);
  if (p) { Nav.backing = true; try { p.go(); } finally { Nav.backing = false; } return 'done'; }
  if (byScreenButton) return 'done';
  // at the start: back twice to exit
  if (Date.now() - Nav.rootAt < 2000) return 'exit';
  Nav.rootAt = Date.now();
  toast('Press back again to exit');
  return 'ask';
}
// "Stop for now?" / "Leave this live test?"
function navBackAsk(a) {
  let box = $('backAsk');
  if (!a) { Nav.ask = null; if (box) { box.hidden = true; document.body.classList.remove('sheet-open'); } return; }
  if (!box) { box = document.createElement('div'); box.id = 'backAsk'; box.className = 'sheet sel-sheet'; box.hidden = true; document.body.appendChild(box); }
  Nav.ask = a;
  box.innerHTML = `<div class="card sheet-card sel-card back-ask" role="alertdialog" aria-labelledby="backAskT"><h3 id="backAskT">${esc(a.title)}</h3><p class="muted">${esc(a.text)}</p>
    <div class="btns"><button class="btn primary" type="button" data-bano>${esc(a.no)}</button><button class="btn" type="button" data-bayes>${esc(a.yes)}</button></div></div>`;
  box.hidden = false; document.body.classList.add('sheet-open');
  box.onclick = e => {
    if (e.target === box || e.target.closest('[data-bano]')) return navBackAsk(null);
    if (e.target.closest('[data-bayes]')) { const go = a.go; navBackAsk(null); go(); }
  };
  setTimeout(() => { const b = box.querySelector('[data-bano]'); if (b) b.focus(); }, 30);
}
function navExit() {
  if (NATIVE && Nav.app) { try { Nav.app.exitApp(); } catch (e) {} return; }
  Nav.leaving = true; history.back();
}

// the phone's back button (Android app)
if (NATIVE && window.capacitorExports) {
  try {
    Nav.app = capacitorExports.registerPlugin('App');
    Nav.app.addListener('backButton', () => { if (navBack(false) === 'exit') navExit(); });
  } catch (e) { console.warn('back button', e); }
}
// the browser's back arrow (website, on a laptop or a phone): one extra history step catches it.
// Browsers only keep that step after you have tapped or typed something, so it is added then.
if (!NATIVE) {
  const arm = () => {
    if (Nav.armed) return;
    Nav.armed = true;
    try { history.replaceState({ rc: 'base' }, ''); history.pushState({ rc: 'app' }, ''); } catch (e) { Nav.armed = false; }
  };
  addEventListener('pointerdown', arm, { capture: true });
  addEventListener('keydown', arm, { capture: true });
  addEventListener('popstate', () => {
    if (Nav.leaving || !Nav.armed) return;
    const r = navBack(false);
    if (r === 'exit') { Nav.leaving = true; history.back(); return; }
    try { history.pushState({ rc: 'app' }, ''); } catch (e) {}
  });
}
// the on-screen Back buttons
document.addEventListener('click', e => { if (e.target.closest('[data-back]')) navBack(true); });
