/* =====================================================================
   PART 4 — SCREENS
   ===================================================================== */
const App = {
  fb: null, user: null, authUser: null, viewAs: null, profileUnsub: null, blockMsg: null, signingIn: false, profile: {}, preps: [], prepsLoaded: false, prepId: null, prep: null, wantPrep: null,
  subjects: [], bank: {}, bankDocs: [], notesMap: {}, notesDocs: [], questions: [], notes: [],
  loaded: false, unsubs: [], prepsUnsub: null, session: null, pick: null, imp: null,
};
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rich = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');
const getState = id => Progress.get(id);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const todayKey = () => dayKey(Date.now());
const SCREENS = ['boot', 'login', 'home', 'preps', 'import', 'settings', 'picker', 'quiz', 'break', 'result', 'progress', 'calendar', 'notes', 'syllabus', 'bank', 'chat', 'thread', 'room', 'help', 'admin', 'adminUser'];
const prefs = () => Object.assign({ recall: true, confidence: true }, App.profile.prefs || {});
const visible = id => !$(id).hidden;

const APP_VERSION = '{{VERSION}}';
// already in an app? (the Android app, the website saved to the home screen, or another app's built-in browser): no download link then
function isStandalone() { try { return matchMedia('(display-mode: standalone)').matches || !!navigator.standalone; } catch (e) { return false; } }
// the website saved to an Android home screen: it should point to the real app (updates, calls, notifications)
const webAppOnAndroid = () => !NATIVE && ON_ANDROID && isStandalone();
function inApp() {
  if (webAppOnAndroid()) return false;
  return NATIVE || isStandalone() || /; wv\)/.test(navigator.userAgent || '');
}
function show(id) {
  if (typeof Sel !== 'undefined' && Sel.on && id !== Sel.kind) selStop();         // leaving the list ends selecting
  if (typeof Focus !== 'undefined') { Focus.wanted = id === 'quiz' || id === 'break' || (id === 'room' && document.body.classList.contains('lt-focus')); if (Focus.wanted) Focus.start(); else Focus.stop(); }
  if (id !== 'room' && typeof leaveRoom === 'function' && LT.rid) leaveRoom();
  SCREENS.forEach(s => { $(s).hidden = s !== id; });
  document.body.classList.toggle('focus', id === 'quiz' || id === 'break');   // focus mode: nothing but the question
  const tabs = (!!App.prep || isAdminUser(App.authUser)) && !['boot', 'login', 'quiz', 'break', 'thread'].includes(id);
  $('tabbar').hidden = !tabs; document.body.classList.toggle('has-tabs', tabs);
  const tab = { home: 'home', picker: 'topic', syllabus: 'syllabus', bank: 'topic', room: 'tests', notes: 'notes', progress: 'progress', calendar: 'progress', admin: 'admin', adminUser: 'admin' }[id];
  document.querySelectorAll('#tabbar [data-tab]').forEach(b => { if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  window.scrollTo(0, 0);
  if (id === 'home' && typeof Spark !== 'undefined') Spark.auto = 0;     // Today again: the scene may change by itself again
  if (typeof calcOnScreen === 'function') calcOnScreen(id);
  if (typeof tipsOnScreen === 'function') tipsOnScreen(id);
  // the Android download: website only, and not for people who already use the Android app
  if (id === 'settings' || id === 'login') document.querySelectorAll(`#${id} [data-getapp]`).forEach(a => {
    a.hidden = inApp() || (id === 'settings' && !webAppOnAndroid() && !!(App.profile && App.profile.usedAndroid));
    const t = a.querySelector('.ga-link > span:last-child');
    if (t) t.textContent = webAppOnAndroid() ? 'You’re using the website version. Get the real Android app' : 'Get the Android app';
  });
  if (id === 'settings') $('appVer').textContent = `Recurra ${APP_VERSION} · ${platformLabel()}${NATIVE ? ` · build ${(window.APP_CONFIG && APP_CONFIG.webBuild) || '–'}` : ''}`;
  if (id === 'home') renderHome();
  if (typeof playIntro === 'function') playIntro(id);
}
function goHome() { if (App.prep) show('home'); else showPreps(); }
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.hidden = true; }, 3000);
}
function setSync(state) {
  const online = state !== 'offline' && navigator.onLine !== false;
  $('sync').className = 'sync' + (App.user && online ? ' cloud' : '');
  $('sync').textContent = !App.user ? '' : online ? 'Synced' : 'Offline · saved here';
}
window.addEventListener('online', () => setSync());
window.addEventListener('offline', () => setSync('offline'));
function msg(id, text, kind) { const el = $(id); el.textContent = text || ''; el.className = 'msg' + (kind ? ' ' + kind : ''); }
function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
async function copyText(text, okMsg) {
  try { await navigator.clipboard.writeText(text); toast(okMsg); }
  catch (e) { toast('Could not copy automatically. Select the text and copy it.'); }
}
const examMs = () => examMsFrom(App.prep && App.prep.examDate);
const plan = () => todayPlan(App.questions, getState, Date.now(), examMs(), App.subjects.map(s => s.code),
  null);

/* ---------- prep loading ---------- */
function rebuild() {
  const byCode = new Map(App.subjects.map(s => [s.code, s]));
  App.questions = Object.values(App.bank).filter(q => q && !q.retired)
    .sort((a, b) => (a.added || '').localeCompare(b.added || '') || (a.at || 0) - (b.at || 0) || a.id.localeCompare(b.id))
    .map((q, i) => ({ ...q, code: q.subject, subject: (byCode.get(q.subject) || { name: q.subject }).name, order: i }));
  App.notes = Object.values(App.notesMap).filter(Boolean).map((n, i) => ({ ...n, code: n.subject, order: i }));
}
function refresh() {
  if (visible('home')) renderHome();
  else if (visible('preps')) renderPreps();
  else if (visible('import') && App.imp && App.imp.target !== 'new' && !$('impSubjects').contains(document.activeElement)) renderSubjectsCard();
  else if (visible('notes')) renderNotes();
  else if (visible('syllabus')) renderSyllabus();
  else if (visible('bank') && typeof renderBank === 'function') renderBank();
  updateTabs();
}
function closePrep() {
  App.unsubs.forEach(u => { try { u(); } catch (e) {} }); App.unsubs = [];
  Progress.close();
  App.prepId = null; App.prep = null; App.subjects = []; App.bank = {}; App.notesMap = {};
  App.bankDocs = []; App.notesDocs = []; App.questions = []; App.notes = []; App.loaded = false;
}
function openPrep(pid, screen) {
  closePrep();
  const p = App.preps.find(x => x.id === pid);
  if (!p) return showPreps();
  App.prepId = pid; App.prep = p; App.subjects = p.subjects || [];
  try { localStorage.setItem('rc-active-' + App.user.uid, pid); } catch (e) {}
  if (App.profile.activePrep !== pid) { App.profile.activePrep = pid; Store.setProfile({ activePrep: pid }).catch(() => {}); }
  Progress.open(`rc-progress-${App.user.uid}-${pid}`, p.resetAt || 0);
  const base = Store.prepPath(pid);
  let gotBank = false, gotNotes = false;
  const done = () => { App.loaded = gotBank && gotNotes; rebuild(); refresh(); };
  App.unsubs.push(Store.watchCol(`${base}/bank`, docs => {
    App.bankDocs = docs.map(d => d.id); App.bank = {};
    docs.forEach(d => Object.assign(App.bank, d.data.q || {}));
    gotBank = true; done();
  }, e => console.warn(e)));
  App.unsubs.push(Store.watchCol(`${base}/notes`, docs => {
    App.notesDocs = docs.map(d => d.id); App.notesMap = {};
    docs.forEach(d => Object.assign(App.notesMap, d.data.n || {}));
    gotNotes = true; done();
  }, e => console.warn(e)));
  Progress.attach({
    subscribe: (onDocs, onErr) => Store.watchCol(`${base}/progress`, onDocs, onErr),
    save: (id, body) => Store.fs.doc(`${base}/progress/${id}`).set(body),
  }, refresh);
  updatePrepButton();
  if (screen === 'preps') showPreps(); else show(screen || 'home');
}
function onPreps(list, fromCache) {
  if (!list.length && fromCache) return;               // wait for the server before showing "no preps"
  list.sort((a, b) => (a.created || 0) - (b.created || 0));
  App.preps = list; App.prepsLoaded = true;
  if (App.wantPrep && list.some(p => p.id === App.wantPrep)) { const w = App.wantPrep; App.wantPrep = null; return openPrep(w); }
  const after = App.afterLoad; App.afterLoad = null;
  if (!list.length) { closePrep(); updatePrepButton(); if (after === 'admin') MODES.admin(); else if (!visible('import')) showPreps(); return; }
  const cur = list.find(p => p.id === App.prepId);
  if (!cur) {
    let want = null;
    try { want = localStorage.getItem('rc-active-' + App.user.uid); } catch (e) {}
    want = list.some(p => p.id === want) ? want : list.some(p => p.id === App.profile.activePrep) ? App.profile.activePrep : list[0].id;
    if (App.prepId) toast('That prep was deleted.');
    openPrep(want, visible('preps') ? 'preps' : 'home');
    if (after === 'admin') MODES.admin();
    return;
  }
  App.prep = cur; App.subjects = cur.subjects || [];
  if ((cur.resetAt || 0) > Progress.resetAt) Progress.wipeTo(cur.resetAt);
  rebuild(); updatePrepButton(); refresh();
}
function updateTabs() {
  $('sylTab').hidden = !hasSyllabus();
  $('tabbar').style.setProperty('--tabs', [...$('tabbar').children].filter(b => !b.hidden).length);
}
function updatePrepButton() {
  updateTabs();
  $('prepBtn').hidden = !App.user || !App.preps.length;
  $('prepName').textContent = App.prep ? App.prep.name : 'Choose prep';
}

/* ---------- home ---------- */
function summary(pool) {
  let seen = 0, strong = 0, c = 0, a = 0, due = 0;
  const tomorrow = addDays(Date.now(), 1);
  pool.forEach(q => {
    const s = getState(q.id);
    if (!s || !s.t) return;
    seen++; c += s.c; a += s.a;
    if (s.lv >= 4) strong++;
    if ((s.due || 0) < tomorrow) due++;
  });
  return { total: pool.length, seen, strong, due, acc: a ? Math.round(100 * c / a) : null };
}
function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
/* A little scene and a study line on Today. It changes by itself, gently:
   - each one stays 12–30 s: long enough for the scene to play and the line to be read (longer lines stay longer)
   - it waits while the card is off screen, the app is in the background, or your finger / mouse is on it
   - after 6 changes it settles on one (starts again next time you open Today)
   - no scene or line from the last 5 comes back; swipe (or tap) to change it yourself
   - with "reduce motion" on in your phone, it only changes when you swipe */
const Spark = { quote: null, scene: null, dyk: null, recent: [], back: [], auto: 0, el: 0, dur: 20000, hold: false, seen: true, tick: null, busy: false };
const SPARK_MAX = 6;
const sparkDur = q => Math.min(30000, Math.max(12000, 8000 + q.split(/\s+/).length * 650));
function sparkPickQuote() {
  const pool = QUOTES.filter(q => !Spark.recent.includes(q) && q !== Spark.quote);
  const q = pool[Math.floor(Math.random() * pool.length)] || pickQuote();
  Spark.recent = [q, ...Spark.recent].slice(0, 5);
  return q;
}
function renderSpark() {
  if (!Spark.quote) { Spark.quote = sparkPickQuote(); Spark.scene = pickScene(); }
  const d = Spark.dyk;
  Spark.dur = sparkDur(d ? d.text : Spark.quote); Spark.el = 0;
  $('spark').innerHTML = d
    ? `<span class="sp-body sp-dyk"><span class="dyk-ic" aria-hidden="true">💡</span><small class="dyk-l">Did you know?</small><q>${esc(d.text)}</q><span class="dyk-go" data-tipgo="${d.key}">Show me ›</span></span><span class="sp-bar" aria-hidden="true"><i></i></span>`
    : `<span class="sp-body">${sceneHtml(Spark.scene)}<q>${esc(Spark.quote)}</q></span><span class="sp-bar" aria-hidden="true"><i></i></span>`;
  sparkBar();
  sparkStart();
}
function sparkBar() {
  const b = $('spark').querySelector('.sp-bar'); if (!b) return;
  const on = sparkAuto();
  b.classList.toggle('off', !on);
  b.firstChild.style.transform = `scaleX(${on ? Math.min(1, Spark.el / Spark.dur) : 0})`;
}
const sparkReduced = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const sparkAuto = () => !sparkReduced() && Spark.auto < SPARK_MAX;
// change it: dir 1 = next (new), -1 = back to the one before
function sparkChange(dir, byHand) {
  if (Spark.busy) return;
  const el = $('spark'), body = el.querySelector('.sp-body'); if (!body) return renderSpark();
  if (dir < 0 && !Spark.back.length) return;
  Spark.busy = true;
  if (!byHand) Spark.auto++;
  body.classList.add(dir < 0 ? 'sp-out-r' : 'sp-out');
  setTimeout(() => {
    if (dir < 0) { const p = Spark.back.pop(); Spark.quote = p.quote; Spark.scene = p.scene; Spark.dyk = p.dyk || null; }
    else {
      Spark.back = [...Spark.back, { quote: Spark.quote, scene: Spark.scene, dyk: Spark.dyk }].slice(-10);
      // now and then (about 1 in 6, never twice in a row): a "Did you know?" about something you haven't tried
      const d = !Spark.dyk && Spark.back.length > 1 && Math.random() < 1 / 6 && typeof dykPick === 'function' ? dykPick() : null;
      Spark.dyk = d;
      if (!d) { Spark.scene = nextScene(Spark.scene); Spark.quote = sparkPickQuote(); }
    }
    renderSpark();
    const nb = $('spark').querySelector('.sp-body'); if (nb) nb.classList.add(dir < 0 ? 'sp-in-r' : 'sp-in');
    Spark.busy = false;
  }, sparkReduced() ? 0 : 380);
}
function sparkStart() {
  if (Spark.tick) return;
  let last = Date.now();
  Spark.tick = setInterval(() => {
    const now = Date.now(), dt = now - last; last = now;
    if (!visible('home') || document.hidden || !Spark.seen || Spark.hold || !sparkAuto()) { sparkBar(); return; }
    Spark.el += Math.min(dt, 1000);
    if (Spark.el >= Spark.dur) sparkChange(1); else sparkBar();
  }, 200);
}
// only counts down while the card is on screen
if ('IntersectionObserver' in window) new IntersectionObserver(es => es.forEach(e => { Spark.seen = e.isIntersecting && e.intersectionRatio >= 0.4; }), { threshold: [0, 0.4, 1] }).observe($('spark'));
{
  const sp = $('spark'); let x0 = null, y0 = 0, moved = false;
  sp.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') Spark.hold = true; });
  sp.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') Spark.hold = false; });
  sp.addEventListener('pointerdown', e => { x0 = e.clientX; y0 = e.clientY; moved = false; Spark.hold = true; });
  sp.addEventListener('pointerup', e => {
    if (x0 === null) return;
    const dx = e.clientX - x0, dy = e.clientY - y0; x0 = null;
    if (e.pointerType !== 'mouse') setTimeout(() => { Spark.hold = false; }, 1500);
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.4) { moved = true; sparkChange(dx < 0 ? 1 : -1, true); }
  });
  sp.addEventListener('pointercancel', () => { x0 = null; setTimeout(() => { Spark.hold = false; }, 1500); });
  sp.addEventListener('click', e => {
    if (moved) { moved = false; return; }
    const go = e.target.closest('[data-tipgo]'); if (go) return tryFeature(go.dataset.tipgo);
    sparkChange(1, true);
  });
}
function renderHome() {
  if (!App.prep) return;
  $('hello').textContent = `${greeting()}, ${displayName().split(' ')[0]}`;
  if (!$('spark').innerHTML) renderSpark();
  if (typeof renderWhatsNew === 'function') renderWhatsNew();
  setTimeout(() => { if (!Sky.timer) startSky(); else renderSky(); }, 0);   // after the page is laid out, so the sky fits it
  renderVerify();
  const p0 = App.prep, ex = examMs();
  if (ex) {
    const days = Math.round((ex - dayStart(Date.now())) / 864e5), m = p0.marking;
    const dateStr = new Date(ex).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    const mark = '';
    $('countdown').innerHTML = days >= 0
      ? `<span class="days">${days}</span><span class="what">days to exam</span><span class="meta">${esc(dateStr)}${mark}</span>`
      : `<span class="what">Exam date passed</span>`;
  } else $('countdown').innerHTML = `<span class="what">${esc(p0.name)}</span><span class="meta">No exam date set</span>`;

  if (!App.loaded) { $('todayCard').innerHTML = `<div class="skeleton" aria-label="Loading"><i class="big"></i><i></i><i style="width:70%"></i><i class="btnph"></i></div>`; return; }
  const p = syncDay(), n = p.due.length + p.fresh.length, d = Progress.today(), pct = dayPct(d);
  let card;
  if (!App.questions.length) {
    card = `<div class="today"><div class="empty-state">${ART.empty}<strong>No questions yet</strong>
      <p>Add questions made from your notes. From then on, they show up here by themselves, right when you need them.</p></div>
      <button class="go" type="button" id="addBtn">${icon('plus')}Add questions</button></div>`;
  } else if (n && d.paused) {
    card = `<div class="today paused"><div class="top"><span class="big">II</span>
      <div class="what"><strong>Paused for today</strong><span>No reminders today. Your ${plural(n, 'question')} wait for tomorrow, and the pause ends by itself at midnight.</span></div></div>
      <button class="go soft" type="button" id="resumeBtn">Resume now</button></div>`;
  } else if (n) {
    card = `<div class="today"><div class="top"><span class="big">${n}</span>
      <div class="what"><strong>${d.n ? 'Left today' : 'Today’s review'}</strong><span>${timeText(n)}</span></div></div>
      <div class="split"><span>${p.due.length} to revise</span><span>${p.fresh.length} new</span>${d.n ? `<span>${d.n} done today · ${pct}% right</span>` : ''}</div>
      <div class="row2"><button class="go" type="button" id="goBtn">${icon('play')}${d.n ? 'Continue' : 'Start'}</button>
      <button class="pausebtn" type="button" id="pauseBtn">${icon('pause')}Pause today</button></div></div>`;
  } else {
    const nx = Progress.meta.next;
    card = `<div class="today done"><div class="top">${ART.done}<span class="big">${pct === null ? '' : pct + '%'}</span>
      <div class="what"><strong>Done for today</strong><span>${plural(d.n || 0, 'question')} answered${pct === null ? '' : `, ${pct}% right first time`}.${nx && nx.count ? ` Tomorrow: about ${plural(nx.count, 'question')}, ${nx.mins} min.` : ''}</span></div></div>
      <button class="go soft" type="button" id="extraBtn">Extra practice (10)</button></div>`;
  }
  $('todayCard').innerHTML = card;
  countUp($('todayCard').querySelector('.big'));
  const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
  on('goBtn', () => startSession('Today’s review', [...p.due, ...p.fresh], true));
  on('extraBtn', startExtra);
  on('addBtn', () => openImport('active', 'mcq'));
  on('pauseBtn', () => { Progress.setToday({ paused: true }); renderHome(); Reminders.refreshSoon(0); toast('Paused for today. It starts again tomorrow.'); Activity.log('day_paused', { paused: true, prep: App.prep.name }); });
  on('resumeBtn', () => { Progress.setToday({ paused: false }); renderHome(); Reminders.refreshSoon(0); Activity.log('day_paused', { paused: false, prep: App.prep.name }); });
  renderStreak();
  const o = summary(App.questions);
  $('stats').innerHTML = `
    <div class="stat"><b>${o.total}</b><small>Questions in bank</small></div>
    <div class="stat"><b>${o.total ? Math.round(100 * o.seen / o.total) : 0}%</b><small>Seen at least once</small></div>
    <div class="stat"><b>${o.strong}</b><small>Strong in memory</small></div>
    <div class="stat"><b>${o.acc === null ? '–' : o.acc + '%'}</b><small>Accuracy</small></div>`;
  $('stats').querySelectorAll('b').forEach(countUp);
}
// numbers count up from where they were (only when they change, so nothing jumps around while you read)
const lastNumbers = new Map();
function countUp(el) {
  if (!el) return;
  const m = el.textContent.match(/^(\d+)(.*)$/); if (!m) return;
  const to = Number(m[1]), suffix = m[2], key = (el.closest('[id]') || {}).id + ':' + [...el.parentNode.children].indexOf(el) + ':' + suffix;
  const from = lastNumbers.has(key) ? lastNumbers.get(key) : 0;
  lastNumbers.set(key, to);
  if (from === to || prefersReduced()) return;
  const t0 = performance.now(), dur = 520;
  el.textContent = from + suffix;
  const step = now => {
    const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    el.textContent = Math.round(from + (to - from) * e) + suffix;
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

const DEFAULT_SPQ = 40;
const minutesFor = n => Math.max(1, Math.ceil(n * (Progress.meta.spq || DEFAULT_SPQ) / 60));
function timeText(n) {
  const m = minutesFor(n), h = Math.floor(m / 60), mm = m % 60;
  const dur = h ? `${h} h ${mm} min` : `${m} min`;
  return `About ${dur}${Progress.meta.spq ? '' : ' (first estimate)'}. You can stop any time and continue later.`;
}
function syncDay() {
  const p = plan(), n = p.due.length + p.fresh.length, d = Progress.today();
  const fields = { left: n, mins: n ? minutesFor(n) : 0 };
  if (!n && d.n) fields.done = true;
  Progress.setToday(fields);
  const count = Math.min(SCHEDULE.dueCapPerDay + p.newPerDay, n + p.dueTomorrow + p.newPerDay);
  Progress.setNext({ day: dayKey(addDays(Date.now(), 1)), count, mins: count ? minutesFor(count) : 0 });
  return p;
}
function startExtra() {
  const list = App.questions.filter(q => getState(q.id)).sort((x, y) => getState(x.id).due - getState(y.id).due).slice(0, 10);
  startSession('Extra practice', shuffle(list));
}

/* ---------- streak and calendar ---------- */
function dayClass(k, e, examKey) {
  if (k === examKey) return 'd-exam';
  if (e && e.paused && !e.done) return 'd-pause';
  if (!e || !e.n) return '';
  if (!e.done) return 'd-part';
  const pct = dayPct(e);
  return pct >= 80 ? 'd-hi' : pct >= 60 ? 'd-mid' : 'd-lo';
}
function renderStreak() {
  const now = Date.now(), st = streaks(Progress.days, now);
  let cells = '';
  for (let i = 6; i >= 0; i--) {
    const ms = addDays(now, -i), k = dayKey(ms), e = Progress.days[k], pct = dayPct(e);
    const label = new Date(ms).toLocaleDateString('en-IN', { weekday: 'narrow' });
    cells += `<span class="d"><i class="${dayClass(k, e)}">${e && e.paused && !e.done ? 'II' : pct === null ? '' : pct}</i>${label}</span>`;
  }
  $('streak').innerHTML = `<span class="s-num"><b>${st.current}</b><span>day streak${st.best > st.current ? ` · best ${st.best}` : ''}</span></span>
    <span class="week" aria-label="Last 7 days">${cells}</span>`;
}
const Cal = { month: null };
function renderCalendar() {
  const now = Date.now(), today = dayKey(now), ex = examMs(), examKey = ex ? dayKey(ex) : '';
  if (!Cal.month) { const d = new Date(now); Cal.month = new Date(d.getFullYear(), d.getMonth(), 1); }
  const y = Cal.month.getFullYear(), m = Cal.month.getMonth();
  $('calTitle').textContent = Cal.month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  let html = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(w => `<span class="wd">${w}</span>`).join('');
  const lead = (new Date(y, m, 1).getDay() + 6) % 7;
  for (let i = 0; i < lead; i++) html += `<span class="c blank"></span>`;
  const dim = new Date(y, m + 1, 0).getDate();
  for (let day = 1; day <= dim; day++) {
    const k = dayKey(new Date(y, m, day).getTime()), e = Progress.days[k], pct = dayPct(e);
    const cls = ['c', dayClass(k, e, examKey), k === today ? 'now' : '', k > today && k !== examKey ? 'future' : ''].join(' ');
    const mid = k === examKey ? 'Exam' : e && e.paused && !e.done ? 'II' : pct === null ? '' : pct + '%';
    const tip = e && e.n ? `${e.n} answered, ${pct}% right first time${e.done ? ', review finished' : ''}` : e && e.paused ? 'Paused' : '';
    html += `<span class="${cls}" title="${esc(tip)}"><span class="dn">${day}</span><span class="pc">${mid}</span></span>`;
  }
  $('calGrid').innerHTML = html;
  const st = streaks(Progress.days, now), studied = Object.values(Progress.days).filter(e => e.n);
  const tn = studied.reduce((t, e) => t + e.n, 0), tc = studied.reduce((t, e) => t + (e.c || 0), 0);
  $('cStats').innerHTML = `
    <div class="stat"><b>${st.current}</b><small>Current streak</small></div>
    <div class="stat"><b>${st.best}</b><small>Best streak</small></div>
    <div class="stat"><b>${studied.length}</b><small>Days studied</small></div>
    <div class="stat"><b>${tn ? Math.round(100 * tc / tn) + '%' : '–'}</b><small>Average score</small></div>`;
}
$('calPrev').addEventListener('click', () => { Cal.month = new Date(Cal.month.getFullYear(), Cal.month.getMonth() - 1, 1); renderCalendar(); });
$('calNext').addEventListener('click', () => { Cal.month = new Date(Cal.month.getFullYear(), Cal.month.getMonth() + 1, 1); renderCalendar(); });

/* ---------- practice a topic ---------- */
function subjectMeta(s) {
  return s.part ? `Part ${esc(s.part)}` : '';
}
function openSubjectPicker() {
  App.pick = { mode: 'subject' };
  $('pickerTitle').textContent = 'Practice a subject';
  const fresh = App.questions.filter(q => { const st = getState(q.id); return !st || !st.t; });
  const newRow = fresh.length ? `<button class="row topic new-row" type="button" data-newq><span class="name"><b>New questions <span class="new-pill">New</span></b><small>Ones you have never answered, the latest added first</small></span><span class="n">${fresh.length} Qs</span></button>` : '';
  $('pickerList').innerHTML = (App.subjects.length ? newRow + sylLinkRow() + bankLinkRow() : '') + (App.subjects.length ? App.subjects.map(s => {
    const pool = App.questions.filter(q => q.code === s.code), n = pool.length, o = summary(pool), pct = n ? Math.round(100 * o.strong / n) : 0;
    return `<button class="row" type="button" data-code="${esc(s.code)}" ${n ? '' : 'disabled'}>
      <span class="code">${esc(s.code)}</span>
      <span class="name">${esc(s.name)}<small>${subjectMeta(s)}</small>${n ? `<span class="meter" aria-hidden="true"><i style="width:${pct}%"></i></span>` : ''}</span>
      <span class="n">${n ? n + ' Qs' : 'No Qs yet'}</span></button>`;
  }).join('') : `<div class="empty-state">${ART.empty}<strong>No subjects yet</strong><p>Add a syllabus or some questions first.</p></div>`);
  show('picker');
}
function openTopicPicker(code) {
  const s = App.subjects.find(x => x.code === code);
  const pool = App.questions.filter(q => q.code === code);
  const topics = [...new Set(pool.map(q => q.topic))].sort();
  App.pick = { mode: 'topic', code };
  $('pickerTitle').textContent = s ? s.name : code;
  $('pickerList').innerHTML = `<button class="row topic" type="button" data-topic="">
      <span class="name"><b>Whole subject</b><small>All topics mixed</small></span><span class="n">${pool.length} Qs</span></button>` +
    topics.map(t => {
      const tq = pool.filter(q => q.topic === t), o = summary(tq);
      const subs = [...new Set(tq.map(q => q.subtopic).filter(Boolean))];
      return `<button class="row topic" type="button" data-topic="${esc(t)}">
        <span class="name">${esc(t)}<small>${esc(subs.slice(0, 4).join(' · '))}${subs.length > 4 ? ' …' : ''}</small></span>
        <span class="n">${tq.length} Qs${o.total - o.seen ? ` · <span class="badge warn">${o.total - o.seen} new</span>` : ''}</span></button>`;
    }).join('');
  show('picker');
}
$('pickerList').addEventListener('click', e => {
  const b = e.target.closest('button.row'); if (!b || b.disabled || b.dataset.mode) return;
  if ('newq' in b.dataset) {
    featUse('newq');                // never answered, the latest added first (up to 30), shown in a mixed order
    const fresh = App.questions.filter(q => { const st = getState(q.id); return !st || !st.t; }).sort(byAdded).reverse().slice(0, 30);
    return startSession('New questions', shuffle(fresh));
  }
  if (App.pick.mode === 'subject') return openTopicPicker(b.dataset.code);
  const t = b.dataset.topic;
  const pool = App.questions.filter(q => q.code === App.pick.code && (!t || q.topic === t));
  const lv = q => { const s = getState(q.id); return s ? s.lv : -1; };
  const list = shuffle(pool).sort((x, y) => lv(x) - lv(y)).slice(0, 30);
  const s = App.subjects.find(x => x.code === App.pick.code);
  startSession(t || (s ? s.name : App.pick.code), shuffle(list));
});

/* ---------- a session of questions ---------- */
// ordered=true: shuffle and put a question you know well last, so the session ends on a good note
function startSession(title, list, ordered) {
  if (!list.length) { toast('Nothing to practise here yet.'); return; }
  const o = ordered ? orderSession(list, getState) : { list, closer: false };
  App.session = { title, i: 0, queue: o.list.map(q => ({ q, retry: false })), closer: o.closer, retries: {}, first: {}, before: {}, firstCount: 0, lastBreak: 0, blockFrom: 0 };
  show('quiz'); renderQuestion();
}
function levelBars(lv) {
  return `<span class="signal" title="Memory level ${lv} of 5">${[1, 2, 3, 4, 5].map(k => `<i class="${k <= lv ? 'on' : ''}" style="height:${4 + k * 2}px"></i>`).join('')}</span>`;
}
function renderQuestion() {
  const z = App.session, it = z.queue[z.i], q = it.q, s = getState(q.id), pf = prefs();
  it.opts = shuffle(q.options);
  it.result = null; it.picked = null;
  it.shown = Date.now();
  it.phase = pf.recall ? 'recall' : 'options';
  const left = z.queue.length - z.i;
  $('qCount').textContent = `${z.title} · ${left === 1 ? 'last one' : left + ' left'}`;
  $('qBar').style.width = (100 * z.i / z.queue.length) + '%';
  $('qCrumb').innerHTML = [q.subject, q.topic, q.subtopic].filter(Boolean).map((x, k, a) => k === a.length - 1 ? `<b>${esc(x)}</b>` : `${esc(x)} ›`).join(' ');
  $('qMeta').innerHTML = [
    it.retry ? `<span class="badge warn">Second look</span>` : !s ? `<span class="badge">New</span>` : '',
    s && `<span class="label" style="display:inline-flex;gap:6px;align-items:center">Memory ${levelBars(s.lv)}</span>`,
  ].filter(Boolean).join('');
  $('qText').innerHTML = rich(q.question);
  $('qCalc').innerHTML = calcBtnHTML();
  if (typeof toolsNewQuestion === 'function') toolsNewQuestion();      // a fresh rough page for every question
  if (typeof tipsQuiz === 'function') tipsQuiz();
  replay($('qText'), 'in'); replay($('qRecall'), 'in');
  $('qOpts').innerHTML = it.opts.map((o, k) => `
    <button class="opt" type="button" data-k="${k}" style="--i:${k}"><span class="key">${'ABCDEFGH'[k]}</span><span>${rich(o)}</span></button>`).join('');
  $('qRecall').hidden = it.phase !== 'recall';
  $('qOpts').hidden = it.phase === 'recall';
  $('qConf').hidden = true; $('qCheck').hidden = true;
  $('qFeedback').innerHTML = '';
  $('skipBtn').hidden = false; $('nextBtn').hidden = true;
  setKeyHint();
  if (it.phase === 'recall') $('showOpts').focus({ preventScroll: true });
}
function replay(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
function setKeyHint() {
  const it = App.session.queue[App.session.i];
  const chosen = prefs().confidence ? 'Enter: sure · N: not sure · G: guessed · 1–4: change' : 'Enter: check · 1–4: change';
  if (typeof Calc !== 'undefined' && Calc.open && !Calc.min && Calc.tab === 'calc' && !it.result) { $('keyHint').textContent = 'Typing goes to the calculator · Esc closes it'; return; }
  $('keyHint').textContent = { recall: 'Space: show options · S: don\'t know', options: 'Keys 1–4: choose · S: don\'t know', chosen, done: 'Enter: next' }[it.result ? 'done' : it.phase] || '';
}
function showOptions() {
  const it = App.session.queue[App.session.i];
  if (it.phase !== 'recall') return;
  it.phase = 'options';
  $('qRecall').hidden = true; $('qOpts').hidden = false; setKeyHint();
  Native.tap();
}
// k = option index, or null for "Don't know".
// Choosing an option only marks it: you can change it as often as you like. The answer is checked
// when you confirm, with "Sure / Not sure / Guessed" (or "Check answer" if that question is turned off).
function pick(k) {
  const it = App.session.queue[App.session.i];
  if (it.result) return;
  if (k === null) return finish(null, '');
  if (it.phase === 'recall') showOptions();
  if (it.picked === k && it.phase === 'chosen') return;
  it.picked = k; it.phase = 'chosen'; Sound.play('tap');
  if (typeof toolsShrink === 'function') toolsShrink();               // the tools step aside so you can confirm
  [...$('qOpts').children].forEach((b, idx) => { b.classList.toggle('picked', idx === k); b.setAttribute('aria-pressed', idx === k ? 'true' : 'false'); });
  const conf = prefs().confidence;
  $('qConf').hidden = !conf; $('qCheck').hidden = conf; setKeyHint();
}
function confirmPick(conf) {
  const it = App.session.queue[App.session.i];
  if (it.result || it.phase !== 'chosen' || it.picked === null) return;
  finish(it.picked, conf);
}
function finish(k, conf) {
  const z = App.session, it = z.queue[z.i], q = it.q;
  if (it.result) return;
  const chosen = k === null ? null : it.opts[k];
  // correctness is decided by the answer TEXT, never by the letter position
  it.result = chosen === null ? 'skip' : chosen === q.answer ? 'correct' : 'wrong';
  it.chosen = chosen; it.conf = conf;
  if (!it.retry) {
    const b = getState(q.id);
    z.before[q.id] = b ? b.lv : -1;
    z.first[q.id] = { q, result: it.result, chosen, conf };
    z.firstCount++;
  }
  Progress.record(q, it.result, it.retry, conf);
  if (typeof toolsShrink === 'function') toolsShrink();
  Native.answer(it.result === 'correct');
  // a soft sound for right or wrong (quieter than live tests); a small sparkle every 5 right in a row
  z.run = it.result === 'correct' ? (z.run || 0) + 1 : 0;
  Sound.play(it.result === 'correct' ? (z.run && z.run % 5 === 0 ? 'streak' : 'softRight') : it.result === 'wrong' ? 'softWrong' : 'tap');
  let again = false;
  if (it.result !== 'correct' && (z.retries[q.id] || 0) < SCHEDULE.retriesInSession) {
    z.retries[q.id] = (z.retries[q.id] || 0) + 1;
    const last = z.queue.length - 1;
    let at = Math.min(z.queue.length, z.i + 4);
    if (z.closer && z.i < last && at > last) at = last;     // keep the "good note" question at the very end
    z.queue.splice(at, 0, { q, retry: true });
    again = true;
  }
  $('qConf').hidden = true; $('qCheck').hidden = true; $('qOpts').hidden = false; $('qRecall').hidden = true;
  [...$('qOpts').children].forEach((b, idx) => {
    b.disabled = true; b.classList.remove('picked'); b.removeAttribute('aria-pressed');
    const o = it.opts[idx];
    if (o === q.answer) b.classList.add('right');
    else if (o === chosen) b.classList.add('wrong');
    else b.classList.add('dim');
  });
  const s = getState(q.id);
  const gap = Math.round((s.due - dayStart(Date.now())) / 864e5);
  const when = again ? 'You will see it again in a few questions.' : `Next review in ${plural(gap, 'day')}.`;
  const cls = { correct: 'ok', wrong: 'no', skip: 'skip' }[it.result];
  let verdict;
  if (it.result === 'correct') verdict = conf === 'guess' ? 'Correct, but a guess' : conf === 'unsure' ? 'Correct' : 'Correct';
  else if (it.result === 'wrong') verdict = conf === 'sure' ? 'Not yet, and you felt sure' : 'Not yet';
  else verdict = 'Not known yet';
  let note = when;
  if (it.result === 'correct' && conf === 'guess') note = 'Guesses come back tomorrow so they become real knowledge.';
  if (it.result === 'correct' && conf === 'unsure') note = `It stays at this level until you feel sure. ${when}`;
  if (it.result === 'wrong' && conf === 'sure') note = `Confident mistakes are the ones most worth fixing. Read the explanation slowly. ${when}`;
  const rows = [
    it.result !== 'correct' && ['Answer', `<strong>${rich(q.answer)}</strong>`],
    q.explanation && ['Why', rich(q.explanation)],
    q.hint && ['Memory hint', rich(q.hint)],
    q.trap && ['Exam trap', rich(q.trap), 'trap'],
  ].filter(Boolean);
  $('qFeedback').innerHTML = `<div class="feedback ${cls}"><div class="verdict">${verdict}<small>${note}</small></div><dl>
    ${rows.map(([t, d, c]) => `<div class="${c || ''}"><dt>${t}</dt><dd>${d}</dd></div>`).join('')}</dl></div>`;
  $('skipBtn').hidden = true; $('nextBtn').hidden = false;
  $('nextBtn').innerHTML = z.i === z.queue.length - 1 ? `${icon('check')}Finish` : `Next${icon('next')}`;
  setKeyHint();
  $('nextBtn').focus({ preventScroll: true });
}
function next() {
  const z = App.session, it = z.queue[z.i];
  if (it.shown) { Progress.pace((Date.now() - it.shown) / 1000); it.shown = 0; }
  syncDay();
  if (z.i >= z.queue.length - 1) return renderResult();
  if (z.firstCount && z.firstCount % SCHEDULE.blockSize === 0 && z.lastBreak !== z.firstCount) { z.lastBreak = z.firstCount; return showBreak(); }
  z.i++; renderQuestion(); window.scrollTo(0, 0);
}
$('showOpts').addEventListener('click', showOptions);
$('qOpts').addEventListener('click', e => { const b = e.target.closest('.opt'); if (b && !b.disabled) pick(Number(b.dataset.k)); });
$('qConf').addEventListener('click', e => { const b = e.target.closest('[data-conf]'); if (b) confirmPick(b.dataset.conf); });
$('qCheck').addEventListener('click', () => confirmPick(''));
$('skipBtn').addEventListener('click', () => pick(null));
$('nextBtn').addEventListener('click', next);
$('quitBtn').addEventListener('click', endSession);
function endSession() {
  const z = App.session, it = z.queue[z.i];
  if (it && it.result && it.shown) Progress.pace((Date.now() - it.shown) / 1000);
  syncDay(); Reminders.refreshSoon();
  const firsts = Object.values(z.first);
  if (firsts.length) Activity.log('session_finished', { prep: App.prep.name, n: firsts.length, right: firsts.filter(f => f.result === 'correct').length });
  if (firsts.length) renderResult(); else show('home');
}
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  if (!$('break').hidden && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); return $('bGo').click(); }
  if ($('quiz').hidden) return;
  const it = App.session.queue[App.session.i];
  if (it.result) { if (e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); next(); } return; }
  if (it.phase === 'recall' && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); return showOptions(); }
  if (it.phase === 'chosen') {
    const conf = prefs().confidence;
    if (e.key === 'Enter') { e.preventDefault(); return confirmPick(conf ? 'sure' : ''); }
    const c = conf && { n: 'unsure', g: 'guess' }[e.key.toLowerCase()]; if (c) { e.preventDefault(); return confirmPick(c); }
  }
  const k = '123456'.indexOf(e.key);
  if (k >= 0 && k < it.opts.length) { e.preventDefault(); pick(k); }
  else if (e.key.toLowerCase() === 's') { e.preventDefault(); pick(null); }
});

/* ---------- short break between blocks ---------- */
const Break = { timers: [] };
function sessionWins(z, ids) {
  let learned = 0, up = 0, strong = 0;
  ids.forEach(id => {
    const b = z.before[id], st = getState(id), f = z.first[id];
    if (!st || !f) return;
    if (b === -1 && f.result === 'correct') learned++;
    else if (b >= 0 && st.lv > b) up++;
    if (st.lv >= 4 && (b < 4)) strong++;
  });
  return { learned, up, strong };
}
function showBreak() {
  const z = App.session, ids = Object.keys(z.first).slice(z.blockFrom);
  z.blockFrom = Object.keys(z.first).length;
  const right = ids.filter(id => z.first[id].result === 'correct').length, w = sessionWins(z, ids);
  const gains = [w.learned && `${w.learned} new learned`, w.up && `${w.up} moved up`, w.strong && `${w.strong} now strong`].filter(Boolean).join(' · ');
  Sound.play('breath');
  $('bWins').innerHTML = `<h2>Block done: ${right} of ${ids.length} right</h2><p class="muted">${gains || 'Every attempt strengthens memory, right or wrong.'}</p>`;
  show('break');
  Break.timers.forEach(clearInterval); Break.timers = [];
  const reduce = prefersReduced();
  const start = Date.now();
  const tick = () => {
    const t = (Date.now() - start) / 1000, c = t % 10, left = Math.max(0, 60 - Math.floor(t));
    $('bCue').textContent = reduce ? 'Rest your eyes for a minute.' : c < 4 ? 'Breathe in…' : c < 5.5 ? 'Hold…' : 'Breathe out…';
    $('bTimer').textContent = left ? `A one-minute rest helps the next block. ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : 'Ready when you are.';
  };
  tick(); Break.timers.push(setInterval(tick, 250));
}
function leaveBreak() { Break.timers.forEach(clearInterval); Break.timers = []; }
$('bGo').addEventListener('click', () => { leaveBreak(); const z = App.session; z.i++; show('quiz'); renderQuestion(); });
$('bStop').addEventListener('click', () => { leaveBreak(); endSession(); });

/* ---------- end of a session: show what improved first ---------- */
function renderResult() {
  const z = App.session, firsts = Object.values(z.first), ids = Object.keys(z.first);
  const c = firsts.filter(f => f.result === 'correct').length;
  const missed = firsts.filter(f => f.result !== 'correct');
  const fixed = missed.filter(f => z.queue.some(it => it.q === f.q && it.retry && it.result === 'correct')).length;
  const w = sessionWins(z, ids);
  $('rTitle').textContent = 'Session complete';
  Sound.play('done');
  const wins = [
    w.learned && [w.learned, w.learned === 1 ? 'new question learned' : 'new questions learned'],
    w.up && [w.up, w.up === 1 ? 'question moved up a memory level' : 'questions moved up a memory level'],
    w.strong && [w.strong, 'now strong in memory'],
    fixed && [fixed, fixed === 1 ? 'mistake fixed on the second look' : 'mistakes fixed on the second look'],
  ].filter(Boolean);
  $('rWins').innerHTML = wins.length
    ? wins.map(([n, t]) => `<div class="win"><b>${n}</b><span>${t}</span></div>`).join('')
    : `<div class="win"><span>You showed up and practised. That is what builds memory.</span></div>`;
  $('rScore').innerHTML = `
    <div class="stat"><b>${firsts.length}</b><small>Questions</small></div>
    <div class="stat"><b>${c}</b><small>Right first time</small></div>
    <div class="stat"><b>${missed.length}</b><small>Not yet</small></div>
    <div class="stat"><b>${firsts.length ? Math.round(100 * c / firsts.length) : 0}%</b><small>Score</small></div>`;
  const p = plan(), left = p.due.length + p.fresh.length;
  $('rNext').textContent = left
    ? `${plural(left, 'question')} left in today's review. Continue from Home whenever you're ready.`
    : `Today's review is complete. Each question will come back just before you would forget it.`;
  $('rReview').innerHTML = missed.length
    ? `<span class="label">Worth one more read</span>` + missed.map(f => `
      <div class="review-item">
        <span class="mono muted">${esc(f.q.topic)}</span>
        <span>${rich(f.q.question)}</span>
        <span class="ans">Answer: <b>${rich(f.q.answer)}</b></span>
        ${f.q.hint ? `<span class="muted small">Hint: ${rich(f.q.hint)}</span>` : ''}
      </div>`).join('') : '';
  Reminders.refreshSoon();
  Native.done();
  show('result');
}

/* ---------- progress table ---------- */
function renderProgress() {
  const all = summary(App.questions), p = plan();
  $('pStats').innerHTML = `
    <div class="stat"><b>${all.seen}/${all.total}</b><small>Seen at least once</small></div>
    <div class="stat"><b>${all.strong}</b><small>Strong in memory</small></div>
    <div class="stat"><b>${all.acc === null ? '–' : all.acc + '%'}</b><small>Accuracy</small></div>
    <div class="stat"><b>${p.dueTomorrow}</b><small>Due tomorrow</small></div>`;
  renderProgressCharts();
  // one card per subject (works as the table view of the memory chart)
  $('pSubjects').innerHTML = App.subjects.map(s => {
    const o = summary(App.questions.filter(q => q.code === s.code)), pct = o.total ? Math.round(100 * o.strong / o.total) : 0;
    return `<div class="subj"><div class="subj-top"><strong>${esc(s.name)}</strong><span class="mono muted">${esc(s.code)}</span></div>
      <div class="meter wide" role="img" aria-label="${pct}% strong"><i style="width:${pct}%"></i></div>
      <dl class="subj-nums"><div><dt>In bank</dt><dd>${o.total || '–'}</dd></div><div><dt>Seen</dt><dd>${o.total ? o.seen : '–'}</dd></div>
      <div><dt>Strong</dt><dd>${o.total ? o.strong : '–'}</dd></div><div><dt>Accuracy</dt><dd>${o.acc === null ? '–' : o.acc + '%'}</dd></div><div><dt>Due</dt><dd>${o.due || '–'}</dd></div></dl></div>`;
  }).join('') || `<div class="empty-state"><strong>No subjects yet</strong><p>Add a syllabus or some questions first.</p></div>`;
}
function renderProgressCharts() {
  if ($('progress').hidden) return;
  const now = Date.now(), days = [];
  for (let i = 29; i >= 0; i--) {
    const ms = addDays(now, -i), k = dayKey(ms), e = Progress.days[k] || {}, d = new Date(ms);
    const label = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), long = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    days.push({ k, label, long, n: e.n || 0, c: e.c || 0, paused: !!e.paused, done: !!e.done });
  }
  const total = days.reduce((a, d) => a + d.n, 0), active = days.filter(d => d.n).length;
  const tipFor = d => d.n ? `<b>${esc(d.long)}</b><br>${d.n} answered · ${Math.round(100 * d.c / d.n)}% right first try${d.done ? '<br>Review finished' : ''}` : `<b>${esc(d.long)}</b><br>${d.paused ? 'Paused' : 'No practice'}`;
  columnChart($('chDaily'), {
    title: 'Questions answered', sub: total ? `${total} in the last 30 days · practised on ${active} ${active === 1 ? 'day' : 'days'}` : 'Your daily practice will show here.',
    data: days.map(d => ({ label: d.label, value: d.n, tip: tipFor(d), muted: !d.done })),
  });
  const pct = d => d.n ? Math.round(100 * d.c / d.n) : null;
  const avg = list => { const n = list.reduce((a, d) => a + d.n, 0); return n ? Math.round(100 * list.reduce((a, d) => a + d.c, 0) / n) : null; };
  const wk = avg(days.slice(-7)), prev = avg(days.slice(-14, -7));
  lineChart($('chAcc'), {
    title: 'Right first try', sub: wk === null ? 'Your accuracy will show here.' : `Last 7 days: <b>${wk}%</b>${prev === null ? '' : wk > prev ? ` · up from ${prev}%` : wk < prev ? ` · ${prev}% the week before` : ' · same as the week before'}`,
    data: days.map(d => ({ label: d.label, value: pct(d), tip: tipFor(d) })),
  });
  const rows = App.subjects.map(s => {
    const parts = [0, 0, 0, 0];
    App.questions.filter(q => q.code === s.code).forEach(q => { const st = getState(q.id); parts[!st || !st.t ? 0 : st.lv >= 4 ? 3 : st.lv >= 2 ? 2 : 1]++; });
    return { name: s.name, parts };
  }).filter(r => r.parts.some(Boolean));
  if (rows.length) stackChart($('chMem'), {
    title: 'Memory strength by subject', sub: 'How firmly each question is remembered right now.',
    keys: [{ name: 'New', cls: 'k0' }, { name: 'Learning', cls: 'k1' }, { name: 'Getting there', cls: 'k2' }, { name: 'Strong', cls: 'k3' }], rows,
  });
  $('chMem').hidden = !rows.length;
}
let chartResize = null;
addEventListener('resize', () => { clearTimeout(chartResize); chartResize = setTimeout(renderProgressCharts, 150); });

/* ---------- revision notes ---------- */
const NOTE_LABELS = { keyDifference: 'Key difference', points: 'Points', memoryTrick: 'Memory trick', examTrap: 'Exam trap', related: 'Related' };
const NOTE_SKIP = new Set(['id', 'subject', 'code', 'topic', 'subtopic', 'title', 'added', 'at', 'order']);
const labelOf = k => NOTE_LABELS[k] || k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());
/* ---------- lists of questions and notes: order, date filter, "New" ----------
   Default every time you open the screen: everything, in the order it was added (oldest first),
   by date and time. Filters and sort are not remembered. */
const listDefaults = () => ({ sort: 'date', date: 'all', day: '', newOnly: false });
const DATE_OPTS = [['all', 'All dates'], ['today', 'Today'], ['yesterday', 'Yesterday'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['pick', 'Pick a date…']];
const daysAgoKey = n => { const d = new Date(); d.setDate(d.getDate() - n); return dayKey(d.getTime()); };
function dateOK(added, f) {
  if (f.date === 'all') return true;
  if (!added) return false;
  if (f.date === 'today') return added === todayKey();
  if (f.date === 'yesterday') return added === daysAgoKey(1);
  if (f.date === '7') return added >= daysAgoKey(6);
  if (f.date === '30') return added >= daysAgoKey(29);
  return !f.day || added === f.day;
}
// order added: day, then time (newer items carry it), then the order they came in
const byAdded = (a, b) => (a.added || '').localeCompare(b.added || '') || (a.at || 0) - (b.at || 0) || (a.order || 0) - (b.order || 0) || String(a.id).localeCompare(String(b.id));
// paint the filter bar (subject, date, sort, New only) from the screen's state
function paintListTools(p, st, sorts, newCount) {
  const d = $(p + 'Date'), so = $(p + 'Sort'), day = $(p + 'Day'), nb = $(p + 'New');
  d.innerHTML = DATE_OPTS.map(([v, t]) => `<option value="${v}">${t}</option>`).join(''); d.value = st.date;
  day.hidden = st.date !== 'pick'; if (!day.hidden) { day.value = st.day || ''; day.max = todayKey(); }
  so.innerHTML = sorts.map(([v, t]) => `<option value="${v}">${t}</option>`).join(''); so.value = st.sort;
  nb.setAttribute('aria-pressed', String(!!st.newOnly)); nb.textContent = newCount ? `New only (${newCount})` : 'New only'; nb.disabled = !newCount && !st.newOnly;
  nb.classList.toggle('has', !!newCount);
}
function wireListTools(p, st, render) {
  $(p + 'Date').addEventListener('change', () => { st.date = $(p + 'Date').value; if (st.date !== 'pick') st.day = ''; st.open = null; st.all = false; render(); if (st.date === 'pick') try { $(p + 'Day').showPicker(); } catch (e) {} });
  $(p + 'Day').addEventListener('change', () => { st.day = $(p + 'Day').value; st.open = null; render(); });
  $(p + 'Sort').addEventListener('change', () => { st.sort = $(p + 'Sort').value; st.open = null; st.all = false; render(); });
  $(p + 'New').addEventListener('click', () => { if (p === 'bank') featUse('newonly'); st.newOnly = !st.newOnly; st.open = null; st.all = false; render(); });
}
// day headings for the date orders
function byDayHTML(list, entry, listCls) {
  let day = null;
  return `<div class="toc book recent">${list.map(x => {
    const k = x.added || '';
    const head = k !== day ? `${day !== null ? '</ol></section>' : ''}<section class="toc-ch"><h3 class="toc-day">${esc(longDate(k))}</h3><ol${listCls ? ` class="${listCls}"` : ''}>` : '';
    day = k; return head + entry(x);
  }).join('')}</ol></section></div>`;
}
const jumpNewBtn = (n, attr) => n ? `<button class="btn ghost jump-new" type="button" ${attr}>New (${n}) ${icon('next')}</button>` : '';
function jumpToNew(box) {
  const el = box.querySelector('.is-new'); if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.remove('flash-new'); void el.offsetWidth; el.classList.add('flash-new');
}

// a note is "new" until you open it (or read it in "Read all"); notes added before this existed are not new
const noteNew = n => !!n.at && !Progress.noteRead(n.id);
function readNote(id) { const n = App.notes.find(x => x.id === id); if (n && n.at && !Progress.noteRead(id)) Progress.markNoteRead(id); }

// Notes are numbered like a book: chapter = subject (in syllabus order), then topic A–Z, then title A–Z → 1.1, 1.2, 2.1 …
const NotesUI = { q: '', open: null, all: false, list: null, ...listDefaults() };
const NOTE_SORTS = [['date', 'Oldest first'], ['newest', 'Newest first'], ['topic', 'By topic'], ['az', 'A–Z']];
const subjName = c => (App.subjects.find(s => s.code === c) || { name: c }).name;
const shortDate = k => { if (!k) return ''; const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); };
const longDate = k => { if (!k) return 'Date unknown'; const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }); };
function notesBook() {
  const order = App.subjects.map(s => s.code);
  const codes = [...new Set(App.notes.map(n => n.code))].sort((a, b) => (order.indexOf(a) + 1 || 999) - (order.indexOf(b) + 1 || 999) || a.localeCompare(b));
  const tps = code => (App.subjects.find(s => s.code === code) || {}).topics || [];
  const chapters = codes.map((code, ci) => {
    const T = tps(code), rank = n => { const i = topicIndex(n, T); return i < 0 ? 9999 : i; };
    const cmp = (a, b) => rank(a) - rank(b) || (a.topic || '').localeCompare(b.topic || '') || (a.title || '').localeCompare(b.title || '');
    const notes = App.notes.filter(n => n.code === code).sort(cmp).map((n, ni) => ({ ...n, num: `${ci + 1}.${ni + 1}` }));
    return { code, name: subjName(code), n: ci + 1, notes };
  });
  // in date order every note gets a running number: 1, 2, 3 … (oldest is 1)
  const dated = [...App.notes].sort(byAdded).map((n, i) => ({ ...n, num: String(i + 1) }));
  return { chapters, flat: chapters.flatMap(c => c.notes), dated };
}
const qRe = q => q ? new RegExp(esc(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi') : null;
const mark = (html, re) => re ? html.replace(/(<[^>]+>)|([^<]+)/g, (m, tag, txt) => tag || txt.replace(re, '<mark>$&</mark>')) : html;
const noteText = n => Object.entries(n).filter(([k]) => !NOTE_SKIP.has(k) && k !== 'num').map(([, v]) => Array.isArray(v) ? v.join(' ') : String(v)).join(' ');
const newPill = on => on ? '<span class="new-pill">New</span>' : '';
function noteHTML(n, re) {
  const ordered = [...NOTE_FIELDS, ...Object.keys(n).filter(k => !NOTE_FIELDS.includes(k) && k !== 'num')];
  const rows = ordered.filter(k => !NOTE_SKIP.has(k) && k !== 'num' && n[k] && (Array.isArray(n[k]) ? n[k].length : true)).map(k => `
    <div class="${/trap/i.test(k) ? 'trap' : /trick/i.test(k) ? 'trick' : ''}"><dt>${esc(labelOf(k))}</dt><dd>${Array.isArray(n[k]) ? `<ul>${n[k].map(x => `<li>${mark(rich(x), re)}</li>`).join('')}</ul>` : mark(rich(n[k]), re)}</dd></div>`).join('');
  return `<article class="note${noteNew(n) ? ' is-new' : ''}" id="note-${esc(n.id)}" data-nid="${esc(n.id)}"><div class="note-meta"><span class="note-num">${esc(n.num || '')}</span><span>${esc(subjName(n.code))}${n.topic ? ' · ' + mark(esc(n.topic), re) : ''}</span>${newPill(noteNew(n))}<span class="note-date">${esc(shortDate(n.added))}</span></div><h3>${mark(rich(n.title), re)}</h3><dl>${rows}</dl></article>`;
}
function tocEntry(n, extra, re) {
  const nw = noteNew(n);
  return `<li${nw ? ' class="is-new"' : ''}><button type="button" class="toc-e" data-note="${esc(n.id)}"><span class="toc-n">${esc(n.num)}</span><span class="toc-main"><span class="toc-line"><span class="toc-t">${mark(esc(n.title), re)}</span><span class="toc-dots" aria-hidden="true"></span><span class="toc-d">${esc(shortDate(n.added))}</span></span>${extra || nw ? `<small class="toc-sub">${newPill(nw)}${extra || ''}</small>` : ''}</span></button></li>`;
}
function renderNotes() {
  const book = notesBook(), filter = $('notesFilter'), keep = filter.value;
  filter.innerHTML = `<option value="">All subjects (${App.notes.length})</option>` + book.chapters.map(c => `<option value="${esc(c.code)}">${esc(c.name)} (${c.notes.length})</option>`).join('');
  filter.value = book.chapters.some(c => c.code === keep) ? keep : '';
  const sub = filter.value, U = NotesUI;
  const pass = n => (!sub || n.code === sub) && dateOK(n.added, U) && (!U.newOnly || noteNew(n));
  $('notesTitle').textContent = 'Revision notes';
  const empty = !App.notes.length;
  $('notesTools').hidden = empty; document.querySelector('#notes .nsearch').hidden = empty;
  paintListTools('notes', U, NOTE_SORTS, App.notes.filter(n => (!sub || n.code === sub) && noteNew(n)).length);
  const byNum = (a, b) => a.num.localeCompare(b.num, undefined, { numeric: true });
  const ordered = U.sort === 'topic' ? book.flat : U.sort === 'az' ? [...book.dated].sort((a, b) => a.title.localeCompare(b.title)) : U.sort === 'newest' ? [...book.dated].reverse() : book.dated;
  const list = ordered.filter(pass);
  const reader = !!U.open && App.notes.some(n => n.id === U.open);
  $('notesReader').hidden = !reader; $('notesIndex').hidden = reader || U.all; $('notesList').hidden = reader || !U.all;
  if (empty) { $('notesIndex').hidden = false; $('notesIndex').innerHTML = `<div class="empty-state">${ART.notes}<strong>No revision notes yet</strong><p>Short notes on the things you mix up will live here. Add them from Today, then “Add questions or notes”.</p></div>`; return; }
  const q = U.q.trim(), re = qRe(q);
  let hits = null;
  if (q) {
    const lq = q.toLowerCase();
    hits = list.map(n => {
      const t = (n.title || '').toLowerCase(), tp = (n.topic || '').toLowerCase(), body = noteText(n).toLowerCase();
      const score = t.includes(lq) ? 3 : tp.includes(lq) || subjName(n.code).toLowerCase().includes(lq) ? 2 : body.includes(lq) ? 1 : 0;
      if (!score) return null;
      const raw = noteText(n), i = raw.toLowerCase().indexOf(lq);
      const snip = i < 0 ? '' : (i > 40 ? '…' : '') + raw.slice(Math.max(0, i - 40), i + lq.length + 70) + (i + lq.length + 70 < raw.length ? '…' : '');
      return { n, score, snip };
    }).filter(Boolean).sort((a, b) => b.score - a.score || list.indexOf(a.n) - list.indexOf(b.n));
  }
  U.list = hits ? hits.map(h => h.n) : list;             // what the reader steps through with ‹ ›
  if (reader) return renderReader();
  if (U.all) {
    $('notesList').innerHTML = `<div class="readall-bar"><button class="btn ghost" type="button" data-nback>${icon('back')}Index</button><span class="muted small">${plural(U.list.length, 'note')}</span></div>` + U.list.map(n => noteHTML(n)).join('');
    watchReadAll();
    return;
  }
  const where = n => `${esc(subjName(n.code))}${n.topic ? ' · ' + esc(n.topic) : ''}`;
  const none = `<div class="empty-state small">${ART.empty}<strong>No notes here</strong><p>Nothing matches these filters. Try All dates, or turn off New only.</p></div>`;
  let html = '';
  if (q) {
    html = `<p class="muted small results-count">${hits.length ? `${plural(hits.length, 'note')} ${hits.length === 1 ? 'matches' : 'match'} “${esc(q)}”` : `Nothing matches “${esc(q)}”. Try a shorter word.`}</p>` +
      (hits.length ? `<ol class="toc toc-flat results">${hits.map(h => tocEntry(h.n, `${where(h.n)}${h.snip ? `<span class="snip">${mark(esc(h.snip), re)}</span>` : ''}`, re)).join('')}</ol>` : '');
  } else if (!list.length) html = none;
  else if (U.sort === 'az') {
    let letter = '';
    html = `<div class="toc book az">${list.map(n => {
      const L = (n.title[0] || '#').toUpperCase(), head = L !== letter ? `${letter ? '</ol></section>' : ''}<section class="toc-ch"><h3 class="toc-letter">${esc(L)}</h3><ol>` : '';
      letter = L; return head + tocEntry(n, where(n));
    }).join('')}</ol></section></div>`;
  } else if (U.sort === 'date' || U.sort === 'newest') {
    html = byDayHTML(list, n => tocEntry(n, where(n)));
  } else {
    html = `<div class="toc book">${book.chapters.map(c => ({ c, notes: c.notes.filter(pass) })).filter(x => x.notes.length).map(({ c, notes }) => `
      <section class="toc-ch"><h3><span class="toc-cn">${c.n}</span><span class="toc-ct">${esc(c.name)}</span><small>${plural(notes.length, 'note')}</small></h3>
      <ol>${notes.map(n => tocEntry(n, n.topic ? esc(n.topic) : '')).join('')}</ol></section>`).join('')}</div>`;
  }
  const nNew = list.filter(noteNew).length, label = { date: 'By date added', newest: 'Newest first', topic: 'Contents', az: 'Index' }[U.sort];
  $('notesIndex').innerHTML = (q ? '' : `<div class="toc-head"><span class="label">${label}</span><span class="toc-acts">${U.sort === 'date' && !U.newOnly && list.length && !noteNew(list[0]) ? jumpNewBtn(nNew, 'data-njump') : ''}${list.length ? `<button class="btn ghost" type="button" data-readall>Read all ${icon('next')}</button>` : ''}</span></div>`) + html;
}
// "Read all": a note counts as read after it has been on screen for about 2 seconds
let readAllObs = null;
function watchReadAll() {
  if (readAllObs) readAllObs.disconnect();
  if (!('IntersectionObserver' in window)) return;
  const timers = new Map();
  readAllObs = new IntersectionObserver(es => es.forEach(e => {
    const id = e.target.dataset.nid;
    if (e.isIntersecting) { if (!timers.has(id)) timers.set(id, setTimeout(() => { readNote(id); e.target.classList.remove('is-new'); const p = e.target.querySelector('.new-pill'); if (p) p.remove(); }, 2000)); }
    else { clearTimeout(timers.get(id)); timers.delete(id); }
  }), { threshold: 0.5 });
  $('notesList').querySelectorAll('article.note.is-new').forEach(a => readAllObs.observe(a));
}
function renderReader() {
  const list = NotesUI.list && NotesUI.list.some(n => n.id === NotesUI.open) ? NotesUI.list : notesBook().dated;
  const i = list.findIndex(n => n.id === NotesUI.open), n = list[i];
  const prev = list[i - 1], next = list[i + 1], re = qRe(NotesUI.q.trim());
  $('notesReader').innerHTML = `<div class="reader-bar">
      <button class="btn ghost" type="button" data-nback>${icon('back')}${NotesUI.q.trim() ? 'Results' : 'Index'}</button>
      <span class="muted small">${i + 1} of ${list.length}</span>
      <span class="reader-nav"><button class="btn" type="button" data-note="${prev ? esc(prev.id) : ''}" ${prev ? '' : 'disabled'} aria-label="Previous note">${icon('back')}</button><button class="btn" type="button" data-note="${next ? esc(next.id) : ''}" ${next ? '' : 'disabled'} aria-label="Next note">${icon('next')}</button></span>
    </div>
    <div class="reader-note">${noteHTML(n, re)}</div>
    <div class="reader-foot">${prev ? `<button type="button" class="reader-link" data-note="${esc(prev.id)}"><small>Previous</small>${esc(prev.num)} ${esc(prev.title)}</button>` : '<span></span>'}${next ? `<button type="button" class="reader-link next" data-note="${esc(next.id)}"><small>Next</small>${esc(next.num)} ${esc(next.title)}</button>` : ''}</div>`;
  readNote(n.id);                                       // opened: no longer new (the tag stays on screen until you leave this note)
}
function openNote(id) { NotesUI.open = id; NotesUI.all = false; renderNotes(); window.scrollTo(0, 0); }
$('notes').addEventListener('click', e => {
  const t = e.target.closest('[data-note]');
  if (t && t.dataset.note) return openNote(t.dataset.note);
  if (e.target.closest('[data-nback]')) { NotesUI.open = null; NotesUI.all = false; renderNotes(); return; }
  if (e.target.closest('[data-readall]')) { featUse('readall'); NotesUI.all = true; NotesUI.open = null; renderNotes(); window.scrollTo(0, 0); return; }
  if (e.target.closest('[data-njump]')) return jumpToNew($('notesIndex'));
});
wireListTools('notes', NotesUI, renderNotes);
$('notesSearch').addEventListener('input', () => { NotesUI.q = $('notesSearch').value; NotesUI.open = null; NotesUI.all = false; renderNotes(); });
$('notesFilter').addEventListener('change', () => { NotesUI.open = null; renderNotes(); });
document.addEventListener('keydown', e => {
  if ($('notes').hidden || $('notesReader').hidden || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  const b = e.key === 'ArrowLeft' ? $('notesReader').querySelector('.reader-nav [data-note]') : e.key === 'ArrowRight' ? $('notesReader').querySelectorAll('.reader-nav [data-note]')[1] : null;
  if (b && b.dataset.note) openNote(b.dataset.note);
});

/* ---------- preps screen ---------- */
function showPreps() { renderPreps(); show('preps'); }
function renderPreps() {
  const none = !App.preps.length;
  $('prepsTitle').textContent = none ? 'Welcome' : 'Your preps';
  $('prepsIntro').hidden = !none;
  if (none && !$('welcomeArt').innerHTML) $('welcomeArt').innerHTML = ART.welcome;
  $('prepsBack').hidden = none || !App.prep;
  $('prepList').hidden = none;
  $('prepList').innerHTML = App.preps.map(p => {
    const ex = examMsFrom(p.examDate), days = ex ? Math.round((ex - dayStart(Date.now())) / 864e5) : null;
    const meta = [(p.subjects || []).length ? plural(p.subjects.length, 'subject') : 'no subjects yet', days !== null ? (days >= 0 ? `${days} days to exam` : 'exam passed') : ''].filter(Boolean).join(' · ');
    return `<button class="row topic" type="button" data-pid="${esc(p.id)}">
      <span class="name">${esc(p.name)}<span class="meta">${esc(meta)}</span></span>
      <span class="n">${p.id === App.prepId ? '<span class="badge good">Open</span>' : 'Switch'}</span></button>`;
  }).join('');
  $('prepActions').hidden = !App.prep;
  if (App.prep) {
    $('prepActions').innerHTML = `<strong>${esc(App.prep.name)}</strong>
      <div class="btns grid">
        <button class="btn" type="button" data-act="export">Export to share</button>
        <button class="btn" type="button" data-act="reset">Reset progress</button>
        <button class="btn danger" type="button" data-act="delete">Delete prep</button>
      </div><div id="prepConfirm"></div>`;
  }
}
$('prepList').addEventListener('click', e => {
  const b = e.target.closest('[data-pid]'); if (!b) return;
  if (b.dataset.pid === App.prepId) show('home'); else openPrep(b.dataset.pid);
});
$('prepActions').addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  const act = b.dataset.act, box = $('prepConfirm');
  if (act === 'export') return exportPrep();
  if (act === 'reset' || act === 'delete') {
    box.innerHTML = `<div class="confirm"><span>${act === 'reset'
      ? `Reset all progress for <strong>${esc(App.prep.name)}</strong>? Streak, calendar and memory levels go back to zero on all your devices. Questions and notes stay.`
      : `Delete <strong>${esc(App.prep.name)}</strong> with all its questions, notes and progress? This cannot be undone. Export it first if you may want it later.`}</span>
      <div class="btns"><button class="btn danger" type="button" data-act="${act}-yes">${act === 'reset' ? 'Yes, reset' : 'Yes, delete'}</button>
      <button class="btn" type="button" data-act="cancel">Cancel</button></div></div>`;
    return;
  }
  if (act === 'cancel') { box.innerHTML = ''; return; }
  b.disabled = true;
  try {
    if (act === 'reset-yes') await resetPrep(App.prepId);
    if (act === 'delete-yes') await deletePrep(App.prepId);
  } catch (err) { console.warn(err); toast('That did not work. Check your internet and try again.'); b.disabled = false; }
});
$('newFromFile').addEventListener('click', () => openImport('new', 'syllabus'));
$('newPrepForm').addEventListener('submit', async e => {
  e.preventDefault();
  const name = $('newPrepName').value.trim(), date = $('newPrepDate').value;
  if (!name) return msg('newPrepMsg', 'Give the prep a name.', 'err');
  await createFromChecked({ kind: 'syllabus', syllabus: { name, examDate: date || '', marking: null, subjects: [] }, questions: [], notes: [] });
  $('newPrepName').value = ''; $('newPrepDate').value = ''; msg('newPrepMsg', '');
});

async function createFromChecked(c) {
  const pid = Store.newId();
  const s = c.syllabus;
  const subjects = [...s.subjects];
  for (const code of [...(c.newSubjects || [])]) if (!subjects.some(x => x.code === code)) subjects.push({ code, name: code, part: '' });
  const writes = [{ path: Store.prepPath(pid), data: { name: s.name || 'My prep', examDate: s.examDate || '', marking: s.marking || null, subjects, created: Date.now(), resetAt: 0 } }];
  const qBy = {}, nBy = {};
  const now = Date.now();                    // the time each one was added (keeps the file's order)
  (c.questions || []).forEach((q, i) => { (qBy[q.subject] = qBy[q.subject] || {})[q.id] = { ...q, at: q.at || now + i }; });
  (c.notes || []).forEach((n, i) => { (nBy[n.subject] = nBy[n.subject] || {})[n.id] = { ...n, at: n.at || now + i }; });
  writes.push(...chunkWrites(`${Store.prepPath(pid)}/bank`, 'q', qBy, []), ...chunkWrites(`${Store.prepPath(pid)}/notes`, 'n', nBy, []));
  App.wantPrep = pid;
  await Store.write(writes);
  if (App.preps.some(p => p.id === pid) && App.prepId !== pid) { App.wantPrep = null; openPrep(pid); }
  toast(`Created "${s.name || 'My prep'}".`);
  Activity.log('prep_created', { prep: s.name || 'My prep', questions: (c.questions || []).length, notes: (c.notes || []).length });
}
async function resetPrep(pid) {
  const base = Store.prepPath(pid), now = Date.now();
  const ids = await Store.ids(`${base}/progress`);
  Progress.wipeTo(now);
  await Store.write([{ path: base, data: { ...stripId(App.prep), resetAt: now } }, ...ids.map(id => ({ path: `${base}/progress/${id}`, data: null }))]);
  toast('Progress reset.'); show('home');
  Activity.log('prep_reset', { prep: App.prep ? App.prep.name : '' });
}
async function deletePrep(pid) {
  const base = Store.prepPath(pid), key = `rc-progress-${App.user.uid}-${pid}`;
  const name = (App.preps.find(x => x.id === pid) || {}).name || '';
  await Progress.discard();                 // finish or cancel any upload first, so nothing comes back
  closePrep();
  try { localStorage.removeItem(key); } catch (e) {}
  const writes = [];
  for (const col of ['bank', 'notes', 'progress']) (await Store.ids(`${base}/${col}`)).forEach(id => writes.push({ path: `${base}/${col}/${id}`, data: null }));
  writes.push({ path: base, data: null });
  await Store.write(writes);
  toast('Prep deleted.');
  Activity.log('prep_deleted', { prep: name });
}
const stripId = p => { const o = { ...p }; delete o.id; return o; };
function exportPrep() {
  const p = App.prep;
  const data = { type: 'prep', name: p.name, examDate: p.examDate || '', marking: p.marking || null, subjects: App.subjects,
    questions: Object.values(App.bank), notes: Object.values(App.notesMap) };
  const slug = (p.name || 'prep').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'prep';
  download(`${slug}.json`, JSON.stringify(data, null, 2));
  toast('Downloaded. Your friend can add it with New prep, then “From a syllabus or prep file”.');
  Activity.log('prep_exported', { prep: p.name });
}

/* ---------- import screen ---------- */
const KIND_LABEL = { mcq: 'MCQs', notes: 'Revision notes', both: 'MCQs + notes', syllabus: 'Syllabus', prep: 'Prep file' };
// opts: { subject: CODE, topic: 'one topic', focus: ['topics to cover'] } (from the Syllabus tab)
function openImport(target, kind, opts = {}) {
  App.imp = { target, kind, checked: null, back: visible('preps') ? 'preps' : visible('syllabus') ? 'syllabus' : 'home',
    subject: opts.subject || (App.subjects.length === 1 && target !== 'new' ? App.subjects[0].code : null), topic: opts.topic || '', focus: opts.focus || null,
    share: opts.share || null, takeTheirs: false, addSimilar: false };
  if (opts.share) App.imp.back = 'thread';
  $('impText').value = opts.share ? opts.share.text : ''; $('impFile').value = ''; msg('impMsg', ''); $('impDone').hidden = true;
  renderImport(); show('import');
  if (opts.share && (kind === 'syllabus' || App.imp.subject)) doCheck();
}
// the prompt "Copy AI prompt" copies right now: for the chosen kind, subject and topic
function currentPrompt() {
  const { kind } = App.imp, sub = perKind(kind) && App.subjects.find(s => s.code === App.imp.subject);
  if (kind === 'both' && !sub) return '';
  return sub ? promptForSubject(kind, App.prep, sub, sub.topics || [], App.imp.topic, App.imp.focus)
    : promptFor(kind, App.prep || 'my exam', App.subjects);
}
// "From Faria: 18 MCQs · Computer Networks" while adding something a friend shared
function renderShareBanner() {
  const sh = App.imp.share, box = $('impShare');
  box.hidden = !sh; if (!sh) return;
  const W = { mcq: ['📝', 'MCQs'], notes: ['📒', 'notes'], syllabus: ['🗂️', 'syllabus'] }[sh.what];
  const what = sh.what === 'syllabus' ? `the syllabus “${esc(sh.title || '')}”` : `${sh.count} ${W[1]}${sh.subjectName ? ` · ${esc(sh.subjectName)}` : ''}${sh.topicName ? ` · ${esc(sh.topicName)}` : ''}`;
  box.innerHTML = `<span class="sb-ic">${W[0]}</span><div><strong>From ${esc(sh.from)}</strong><span>${what}</span>
    <small class="muted">${sh.what === 'syllabus' ? (App.imp.target === 'new' ? 'A new prep will be made from it.' : `It will be merged into <b>${esc(App.prep ? App.prep.name : '')}</b>: subjects you already have keep your names; new topics are added.`)
      : 'Pick the subject in your prep where they belong. Anything you already have is merged, not added twice.'}</small>
    ${sh.what === 'syllabus' && App.imp.target !== 'new' ? '<button class="linkbtn" type="button" data-sharenew>Start a new prep from it instead</button>' : ''}</div>`;
  const nb = box.querySelector('[data-sharenew]');
  if (nb) nb.onclick = () => { App.imp.target = 'new'; App.imp.checked = null; renderImport(); doCheck(); };
}
function renderImport() {
  const { target, kind } = App.imp;
  const kinds = target === 'new' ? ['syllabus', 'prep'] : ['mcq', 'notes', 'both', 'syllabus'];
  $('impTitle').textContent = target === 'new' ? 'New prep from a file' : `Add to ${App.prep ? App.prep.name : ''}`;
  $('impText').placeholder = { mcq: '{ "type": "mcq", "questions": [ ... ] }', notes: '{ "type": "notes", "notes": [ ... ] }', both: '{ "type": "both", "questions": [ ... ], "notes": [ ... ] }', syllabus: '{ "type": "syllabus", "subjects": [ ... ] }', prep: '{ "type": "prep", ... }' }[kind] || '';
  renderShareBanner();
  $('impKinds').hidden = !!App.imp.share;
  $('impKinds').innerHTML = kinds.map(k => `<button class="chip" type="button" data-kind="${k}" aria-pressed="${k === kind}">${KIND_LABEL[k]}</button>`).join('');
  const perSubject = target !== 'new' && perKind(kind), sub = perSubject && App.subjects.find(s => s.code === App.imp.subject);
  if (perSubject && !sub) App.imp.subject = null;
  aiRender();
  $('impHelp').hidden = $('impPaste').hidden = (perSubject && !sub) || !!App.imp.share;
  renderPick();
  if (perSubject && !sub) { $('impPreview').hidden = true; renderSubjectsCard(); return; }
  if (kind === 'prep') {
    $('impHelp').innerHTML = `<strong>Prep file</strong><p class="muted">A prep file is what <em>Export</em> makes on the Preps screen. Use it to copy a whole prep (syllabus, questions and notes) from a friend. Choose the file or paste its text below.</p>`;
  } else {
    const what = kind === 'syllabus' ? 'your syllabus' : `your study notes on ${sub ? sub.name : 'the subject'}`;
    $('impHelp').innerHTML = `<strong>${aiShown() ? '📋 Or use any AI chat (always free)' : sub ? `How to make ${kind === 'mcq' ? 'MCQs' : kind === 'both' ? 'MCQs and notes' : 'notes'} for ${esc(sub.name)}` : 'How to make this with any AI chat'}</strong>
      <ol class="steps">
        <li>Tap <strong>Copy AI prompt</strong>.</li>
        <li>Open ChatGPT, Claude or Gemini, paste the prompt, and attach or paste ${what} (PDF, photo or text; English or Hinglish is fine).</li>
        <li>Copy the JSON it replies with and paste it below, then tap <strong>Check</strong>.</li>
      </ol>
      <div class="btns"><button class="btn primary" type="button" id="copyPrompt">Copy AI prompt</button>
      <button class="btn" type="button" id="togglePrompt">${App.imp.showPrompt ? 'Hide prompt' : 'Show prompt'}</button>
      <button class="btn ghost" type="button" id="toggleSample">Show sample format</button></div>
      <div class="prompt-view" id="promptBox"${App.imp.showPrompt ? '' : ' hidden'}><div class="prompt-bar"><span class="label">The exact prompt that will be copied</span><button class="btn small" type="button" id="copyPrompt2">Copy</button></div><pre class="sample prompt-text">${esc(currentPrompt())}</pre></div>
      <pre class="sample" id="sampleBox" hidden>${esc(JSON.stringify(kind === 'both' ? { type: 'both', questions: SAMPLES.mcq.questions, notes: SAMPLES.notes.notes } : SAMPLES[kind], null, 2))}</pre>`;
    const copied = sub ? `Prompt for ${sub.name} copied. Paste it into your AI chat.` : 'Prompt copied. Paste it into your AI chat.';
    $('copyPrompt').onclick = $('copyPrompt2').onclick = () => copyText(currentPrompt(), copied);
    $('togglePrompt').onclick = () => { const b = $('promptBox'); b.hidden = !b.hidden; App.imp.showPrompt = !b.hidden; $('togglePrompt').textContent = b.hidden ? 'Show prompt' : 'Hide prompt'; if (!b.hidden) $('sampleBox').hidden = true, $('toggleSample').textContent = 'Show sample format'; };
    $('toggleSample').onclick = () => { const b = $('sampleBox'); b.hidden = !b.hidden; $('toggleSample').textContent = b.hidden ? 'Show sample format' : 'Hide sample format'; if (!b.hidden) $('promptBox').hidden = true, App.imp.showPrompt = false, $('togglePrompt').textContent = 'Show prompt'; };
  }
  renderSubjectsCard();
  renderPreview();
}
// Step 1 for MCQs and notes: which subject (and, optionally, which topic) they are for
function renderPick() {
  const box = $('impPick'), { target, kind } = App.imp, on = target !== 'new' && perKind(kind) && !!App.prep;
  box.hidden = !on || !App.subjects.length; if (box.hidden) return;
  const sub = App.subjects.find(s => s.code === App.imp.subject), word = kind === 'mcq' ? 'questions' : kind === 'both' ? 'questions and notes' : 'notes';
  if (!sub) {
    box.classList.remove('chosen');
    box.innerHTML = `<strong class="pick-q">Which subject are these ${word} for?</strong>
      <p class="muted small">Pick one. The AI prompt is made for that subject only, and the app checks that everything you paste belongs to it.</p>
      <div class="pick-grid">${App.subjects.map(s => {
        const nq = App.questions.filter(q => q.code === s.code).length, nn = App.notes.filter(n => n.code === s.code).length;
        return `<button class="pick" type="button" data-pick="${esc(s.code)}"><b>${esc(s.code)}</b><span>${esc(s.name)}</span><small>${plural(nq, 'question')} · ${plural(nn, 'note')}</small></button>`;
      }).join('')}</div>
      <button class="linkbtn" type="button" data-pickmanage>+ New subject</button>`;
    return;
  }
  box.classList.add('chosen');
  const topics = sub.topics || [];
  box.innerHTML = `<div class="pick-chosen"><span class="pick-badge">${esc(sub.code)}</span><div><small class="muted">${KIND_LABEL[kind] === 'Revision notes' ? 'Notes' : KIND_LABEL[kind]} for</small><strong>${esc(sub.name)}</strong></div>
      <button class="btn ghost" type="button" data-pickchange>Change</button></div>
    ${topics.length ? `<label class="pick-topic">Topic
      <select id="impTopic">
        <option value="">Whole subject (any of its ${topics.length} topics)</option>
        ${App.imp.focus ? `<option value="__focus" selected>Only the ${plural(App.imp.focus.length, 'empty topic')}</option>` : ''}
        ${topics.map(t => `<option value="${esc(t)}"${App.imp.topic === t ? ' selected' : ''}>${esc(t)}</option>`).join('')}
      </select></label>` : `<p class="muted small">This subject has no syllabus topics yet, so the AI names the topics itself. Add topics on the Syllabus tab to group questions your way.</p>`}`;
  const sel = $('impTopic');
  if (sel) sel.onchange = () => { const v = sel.value; App.imp.topic = v && v !== '__focus' ? v : ''; if (v !== '__focus') App.imp.focus = null; App.imp.checked = null; renderImport(); if ($('impText').value.trim()) doCheck(); };
}
$('impPick').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.pick) { App.imp.subject = b.dataset.pick; App.imp.topic = ''; App.imp.focus = null; App.imp.checked = null; renderImport(); if ($('impText').value.trim()) doCheck(); }
  if ('pickchange' in b.dataset) { $('impDone').hidden = true; App.imp.subject = null; App.imp.topic = ''; App.imp.focus = null; App.imp.checked = null; msg('impMsg', ''); renderImport(); }
  if ('pickmanage' in b.dataset) { App.imp.manage = true; renderSubjectsCard(); if ($('impSubjects').scrollIntoView) $('impSubjects').scrollIntoView({ block: 'center' }); }
});
/* ---------- subjects of a prep, added and edited by hand ---------- */
function suggestCode(name, taken) {
  const words = name.replace(/&/g, ' ').split(/\s+/).map(w => w.replace(/[^A-Za-z0-9]/g, '')).filter(w => w && !/^(and|of|the|for|in)$/i.test(w));
  let base = (words.length > 1 ? words.map(w => w[0]).join('').slice(0, 5) : (words[0] || 'SUB').slice(0, 4)).toUpperCase() || 'SUB';
  let code = base, i = 2;
  while (taken.includes(code)) code = base.slice(0, 6) + i++;
  return code;
}
function renderSubjectsCard() {
  const perSubject = App.imp && perKind(App.imp.kind);
  const box = $('impSubjects'), active = App.imp && App.imp.target !== 'new' && !!App.prep && (!perSubject || !App.subjects.length || (App.imp.manage && !App.imp.subject));
  box.hidden = !active; if (!active) return;
  const subs = App.subjects, none = !subs.length, needs = perKind(App.imp.kind);
  const used = code => App.questions.some(q => q.code === code) || App.notes.some(n => n.code === code);
  const editing = App.imp.editSubject ? subs.find(s => s.code === App.imp.editSubject) : null;
  box.classList.toggle('needs', none && needs);
  box.innerHTML = `<div class="subj-head"><strong>Subjects in this prep</strong><span class="muted small">${subs.length ? plural(subs.length, 'subject') : 'none yet'}</span></div>
    ${none ? `<p class="small subj-note">${needs ? 'Add at least one subject first. The AI prompt lists your subjects, so every question and note lands in the right subject.' : 'Add subjects here one by one, or import a whole syllabus below.'}</p>`
      : `<ol class="subj-list">${subs.map(s => {
          const nq = App.questions.filter(q => q.code === s.code).length, nt = (s.topics || []).length;
          const meta = [s.part && `Part ${esc(s.part)}`, nt ? plural(nt, 'topic') : '', nq ? plural(nq, 'Q') : ''].filter(Boolean).join(' · ');
          return `<li class="subj-row${editing && editing.code === s.code ? ' on' : ''}"><button type="button" class="sc-main" data-sedit="${esc(s.code)}" title="Edit ${esc(s.name)}"><b class="sc-code">${esc(s.code)}</b><span class="sc-name">${esc(s.name)}<small>${meta || 'Tap to edit'}</small></span></button>${used(s.code) ? '<span class="sc-lock" title="Has questions or notes, so it can\'t be removed" aria-hidden="true"></span>' : `<button type="button" class="sc-x" data-sdel="${esc(s.code)}" aria-label="Remove ${esc(s.name)}">×</button>`}</li>`; }).join('')}</ol>`}
    <details class="subj-add"${none || editing ? ' open' : ''}><summary>${editing ? `Edit ${esc(editing.name)}` : none ? 'Add a subject' : 'Add another subject'}</summary>
      <div class="subj-form">
        <label>Subject name<input id="sName" maxlength="80" placeholder="e.g. Computer Networks" value="${esc(editing ? editing.name : '')}"></label>
        <label>Short code<input id="sCode" maxlength="8" placeholder="CN" autocapitalize="characters" spellcheck="false" value="${esc(editing ? editing.code : '')}"${editing ? ' readonly' : ''}></label>
        <label>Part <span class="muted">optional</span><input id="sPart" maxlength="20" placeholder="e.g. B" value="${esc(editing ? editing.part || '' : '')}"></label>
      </div>
      <div class="btns"><button class="btn primary" type="button" id="sSave">${editing ? 'Save changes' : 'Add subject'}</button>${editing ? '<button class="btn" type="button" id="sCancel">Cancel</button>' : ''}</div>
      <p class="msg" id="sMsg"></p>
    </details>
    ${none ? '' : `<button class="linkbtn subj-syl" type="button" data-mode="syllabus">${hasSyllabus() ? 'Open the syllabus and its topics' : 'Add topics to your subjects (optional) for a syllabus with coverage'}</button>`}`;
  let codeTouched = !!editing;
  $('sCode').oninput = () => { codeTouched = true; $('sCode').value = $('sCode').value.toUpperCase().replace(/[^A-Z0-9]/g, ''); };
  $('sName').oninput = () => { if (!codeTouched) $('sCode').value = $('sName').value.trim() ? suggestCode($('sName').value, subs.map(s => s.code)) : ''; };
  if ($('sCancel')) $('sCancel').onclick = () => { App.imp.editSubject = null; renderSubjectsCard(); };
  $('sSave').onclick = async () => {
    const name = $('sName').value.trim(), code = $('sCode').value.trim().toUpperCase(), part = $('sPart').value.trim();
    if (!name) return msg('sMsg', 'Give the subject a name.', 'err');
    if (!/^[A-Z0-9]{1,8}$/.test(code)) return msg('sMsg', 'The short code is 1 to 8 capital letters or numbers, like CN.', 'err');
    if (!editing && subs.some(s => s.code === code)) return msg('sMsg', `${code} is already used. Pick another short code.`, 'err');
    const next = editing ? subs.map(s => s.code === code ? { ...s, name, part } : s) : [...subs, { code, name, part }];
    $('sSave').disabled = true;
    try {
      await Store.setPrep(App.prepId, { subjects: next });
      App.subjects = next; App.prep.subjects = next; App.imp.editSubject = null; rebuild();
      if (!editing && !App.imp.subject && perKind(App.imp.kind)) { App.imp.subject = code; App.imp.manage = false; }   // a new subject added here is the one you want
      Activity.log('subject_saved', { prep: App.prep.name, subject: name, edit: !!editing });
      renderImport(); toast(editing ? 'Subject saved.' : `Added ${name}.`);
    } catch (e) { $('sSave').disabled = false; msg('sMsg', 'Could not save. Check your internet.', 'err'); }
  };
}
$('impSubjects').addEventListener('click', async e => {
  const ed = e.target.closest('[data-sedit]'), del = e.target.closest('[data-sdel]');
  if (ed) { App.imp.editSubject = App.imp.editSubject === ed.dataset.sedit ? null : ed.dataset.sedit; return renderSubjectsCard(); }
  if (!del) return;
  const s = App.subjects.find(x => x.code === del.dataset.sdel); if (!s) return;
  const next = App.subjects.filter(x => x.code !== s.code);
  try {
    await Store.setPrep(App.prepId, { subjects: next });
    App.subjects = next; App.prep.subjects = next; rebuild();
    Activity.log('subject_removed', { prep: App.prep.name, subject: s.name });
    renderImport(); toast(`Removed ${s.name}.`);
  } catch (err) { toast('Could not save. Check your internet.'); }
});
$('impKinds').addEventListener('click', e => {
  const b = e.target.closest('[data-kind]'); if (!b) return;
  App.imp.kind = b.dataset.kind; App.imp.checked = null; $('impDone').hidden = true; renderImport();
  if (App.imp.kind === 'both') featUse('both');
});
$('impBack').addEventListener('click', () => { if (App.imp.back === 'thread' && App.imp.share && friendship(App.imp.share.fid)) openThread(App.imp.share.fid); else if (App.imp.back === 'preps' || !App.prep) showPreps(); else if (App.imp.back === 'syllabus') MODES.syllabus(); else show('home'); });
$('impFile').addEventListener('change', () => {
  const f = $('impFile').files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => { $('impText').value = String(r.result || ''); doCheck(); };
  r.onerror = () => msg('impMsg', 'Could not read that file.', 'err');
  r.readAsText(f);
});
$('impText').addEventListener('input', () => { if (App.imp.checked) { App.imp.checked = null; renderPreview(); } });
$('impCheck').addEventListener('click', doCheck);

function doCheck() {
  let parsed = parseImport($('impText').value);
  if (parsed.error) { App.imp.checked = null; renderPreview(); return msg('impMsg', parsed.error, 'err'); }
  const allowed = App.imp.target === 'new' ? ['syllabus', 'prep'] : ['mcq', 'notes', 'both', 'syllabus'];
  // MCQs and notes for the same subject go together: "MCQs + notes" takes either, and a combined reply switches to it
  if (App.imp.target !== 'new' && !parsed.error) {
    if (parsed.kind === 'both' && (App.imp.kind === 'mcq' || App.imp.kind === 'notes')) { App.imp.kind = 'both'; renderImport(); }
    else if (App.imp.kind === 'both' && (parsed.kind === 'mcq' || parsed.kind === 'notes')) parsed = { kind: 'both', data: parsed.kind === 'mcq' ? { questions: parsed.data.questions || [], notes: [] } : { questions: [], notes: parsed.data.notes || [] } };
  }
  if (!allowed.includes(parsed.kind)) {
    App.imp.checked = null; renderPreview();
    return msg('impMsg', App.imp.target === 'new'
      ? `This is a ${KIND_LABEL[parsed.kind]} file. Create the prep first (from a syllabus or an empty prep), then add it from Today with “Add questions or notes”.`
      : 'This is a whole prep file. Add it from the preps list (tap the prep name at the top), then “From a syllabus or prep file”.', 'err');
  }
  if (parsed.kind !== App.imp.kind) {
    if (App.imp.target === 'new') { App.imp.kind = parsed.kind; renderImport(); }      // syllabus ⇄ prep file: harmless
    else {                                                                               // never slip MCQs or notes in by the wrong button
      App.imp.checked = null; renderPreview();
      const what = KIND_LABEL[parsed.kind], here = KIND_LABEL[App.imp.kind];
      return msg('impMsg', `Nothing was added. This looks like ${what}, but you are on ${here}. ${parsed.kind === 'syllabus' ? 'Tap Syllabus' : `Tap ${what} and pick the subject`} first, then paste it again.`, 'err');
    }
  }
  App.imp.checked = checkImport(parsed, App.imp.target);
  msg('impMsg', '');
  renderPreview();
}

// Works out what an import would change, without saving anything
function checkImport(parsed, target) {
  if (parsed.kind === 'both') {                     // the two halves are checked like two pastes, and shown and saved together
    const q = checkImport({ kind: 'mcq', data: { questions: parsed.data.questions || [] } }, target);
    const n = checkImport({ kind: 'notes', data: { notes: parsed.data.notes || [] } }, target);
    return { kind: 'both', parts: [q, n], problems: [], newSubjects: [...new Set([...(q.newSubjects || []), ...(n.newSubjects || [])])] };
  }
  const today = todayKey(), d = parsed.data;
  const subjects = target === 'new' ? [] : App.subjects;
  if (parsed.kind === 'syllabus' || parsed.kind === 'prep') {
    const sy = cleanSyllabus(d);
    const out = { kind: parsed.kind, syllabus: sy.syllabus, problems: sy.problems, questions: [], notes: [], newSubjects: [] };
    if (parsed.kind === 'prep') {
      const q = cleanQuestions(d.questions || [], sy.syllabus.subjects, today);
      const n = cleanNotes(d.notes || [], sy.syllabus.subjects, today);
      out.questions = q.questions; out.notes = n.notes;
      out.problems.push(...q.problems, ...n.problems);
      out.newSubjects = [...new Set([...q.newSubjects, ...n.newSubjects])];
    }
    if (target === 'new' && !sy.syllabus.name) out.problems.unshift('The file has no "name". The prep will be called "My prep".');
    if (target === 'active') {
      // a subject with another short code but the same (or a very similar) name is yours: use your code
      sy.syllabus.subjects = sy.syllabus.subjects.map(ns => {
        if (App.subjects.some(x => x.code === ns.code && (normTopic(x.name) === normTopic(ns.name) || matchTopic(ns.name, [x.name]) >= 0 || x.name === x.code))) return ns;
        const i = matchTopic(ns.name, App.subjects.map(x => x.name));
        return i >= 0 ? { ...ns, code: App.subjects[i].code } : App.subjects.some(x => x.code === ns.code) ? { ...ns, code: freeCode(ns.code) } : ns;
      });
      const old = new Map(App.subjects.map(s => [s.code, s]));
      out.added = sy.syllabus.subjects.filter(s => !old.has(s.code));
      out.changed = sy.syllabus.subjects.filter(s => old.has(s.code) && JSON.stringify(old.get(s.code)) !== JSON.stringify(s));
    }
    return out;
  }
  // MCQs and notes belong to the ONE chosen subject; anything for another subject or topic stops the whole paste
  const strict = target !== 'new' && (parsed.kind === 'mcq' || parsed.kind === 'notes') && App.imp && App.imp.subject;
  const sub = strict && App.subjects.find(s => s.code === App.imp.subject);
  const wrongSubjects = {};
  if (sub) {
    const list = (parsed.kind === 'mcq' ? d.questions : d.notes) || [];
    list.forEach(it => {
      if (!it || typeof it !== 'object') return;
      const raw = String(it.subject ?? it.subjectCode ?? it.code ?? '').trim();
      const m = raw && App.subjects.find(s => s.code === raw.toUpperCase() || s.name.toLowerCase() === raw.toLowerCase());
      if (!raw || (m && m.code === sub.code)) { it.subject = sub.code; if (App.imp.topic && !String(it.topic || '').trim()) it.topic = App.imp.topic; return; }
      const key = m ? m.code : raw;
      wrongSubjects[key] = wrongSubjects[key] || { key, code: m ? m.code : null, name: m ? m.name : raw, n: 0 };
      wrongSubjects[key].n++;
    });
  }
  // topics never block: an item goes to the syllabus topic it resembles, else to "Others" (its own name kept as the subtopic)
  const topicSort = items => {
    const topics = sub ? sub.topics || [] : [], others = [];
    if (topics.length) items.forEach(it => {
      if (it.subject !== sub.code) return;     // already reported as another subject
      const i = topicIndex(it, topics);
      if (i >= 0) { it.topic = topics[i]; return; }   // the syllabus spelling, so it matches everywhere
      const own = isCatchAll(it.topic) ? '' : String(it.topic || '').trim();
      if (own && !it.subtopic) it.subtopic = own;
      else if (own && normTopic(it.subtopic) !== normTopic(own)) it.subtopic = `${own} · ${it.subtopic}`;
      it.topic = OTHERS;
      others.push(it.subtopic || 'no topic');
    });
    return others;
  };
  const blockedBy = () => Object.keys(wrongSubjects).length ? { blocked: true, wrongSubjects: Object.values(wrongSubjects), subject: sub } : {};
  if (parsed.kind === 'mcq') {
    const r = cleanQuestions(d.questions || [], subjects, today);
    const block = blockedBy();
    if (block.blocked) return { kind: 'mcq', questions: r.questions, problems: r.problems, newSubjects: [], fresh: 0, updated: 0, same: 0, ...block };
    const others = topicSort(r.questions);
    return { kind: 'mcq', all: r.questions, problems: r.problems, newSubjects: r.newSubjects, others, ...planFor('mcq', r.questions) };
  }
  const r = cleanNotes(d.notes || [], subjects, today);
  { const block = blockedBy(); if (block.blocked) return { kind: 'notes', notes: r.notes, problems: r.problems, newSubjects: [], fresh: 0, updated: 0, same: 0, ...block }; }
  const others = topicSort(r.notes);
  return { kind: 'notes', all: r.notes, problems: r.problems, newSubjects: r.newSubjects, others, ...planFor('notes', r.notes) };
}
// what will be written: new items, plus merged ones (see mergePlan); "similar" ones only if you ask
function freeCode(code) { let n = 2; while (App.subjects.some(x => x.code === code + n)) n++; return (code + n).slice(0, 8); }
function planFor(kind, items) {
  const existing = Object.values(kind === 'mcq' ? App.bank : App.notesMap), share = !!(App.imp && App.imp.share);
  const p = mergePlan(kind, items, existing, share ? 'share' : 'paste', share && App.imp.takeTheirs);
  const write = share && App.imp.addSimilar ? [...p.write, ...p.similar.map(x => x.item)] : p.write;
  return { [kind === 'mcq' ? 'questions' : 'notes']: write, fresh: p.fresh, updated: p.updated, same: p.same, filled: p.filled, conflicts: p.conflicts, similar: p.similar, conflictList: p.conflictList, share };
}

function renderPreview() {
  const box = $('impPreview'), c = App.imp && App.imp.checked;
  box.hidden = !c;
  if (!c) { box.innerHTML = ''; return; }
  const parts = [];
  let canAdd = false, addLabel = 'Add';
  const blockedPart = c.blocked ? c : c.kind === 'both' ? c.parts.find(p => p.blocked) : null;
  if (blockedPart) {
    const word = c.kind === 'both' ? 'item' : blockedPart.kind === 'mcq' ? 'question' : 'note', sub = blockedPart.subject;
    const wrong = c.kind === 'both' ? Object.values(c.parts.filter(p => p.blocked).flatMap(p => p.wrongSubjects).reduce((m, w) => { m[w.key] = m[w.key] ? { ...w, n: m[w.key].n + w.n } : { ...w }; return m; }, {})) : blockedPart.wrongSubjects;
    box.classList.add('blocked');
    parts.push(`<strong class="msg err">Nothing was added</strong><span>Everything you paste here must be for <b>${esc(sub.name)}</b>.</span>`);
    wrong.forEach(w => parts.push(`<div class="block-row"><span>${plural(w.n, word)} ${w.n === 1 ? 'is' : 'are'} meant for <b>${esc(w.name)}</b>${w.code ? '' : ', which is not a subject in this prep'}.</span>
      ${w.code ? `<button class="btn" type="button" data-impswitch="${esc(w.code)}">Switch to ${esc(w.name)}</button>` : ''}</div>`));
    parts.push(`<span class="muted small">Fix the pasted text or ask the AI again with the prompt above, then tap Check.</span>`);
    box.innerHTML = parts.join('');
    return;
  }
  box.classList.remove('blocked');
  // one list (questions or notes): what will happen, choices, a peek at the first three
  const listPreview = (c, titled) => {
    const word = c.kind === 'mcq' ? 'question' : 'note', out = [];
    if (titled) out.push(`<span class="label prev-part">${c.kind === 'mcq' ? 'Questions' : 'Revision notes'}</span>`);
    out.push(`<strong>${plural(c.fresh, 'new ' + word)}${c.updated ? `, ${c.updated} updated` : ''}${c.filled ? `, ${c.filled} merged` : ''}${c.same ? `, ${c.same} already in the app` : ''}${c.conflicts ? `, ${c.conflicts} you already have in another version` : ''}</strong>`);
    if (c.updated) out.push(`<span class="muted">Updated ${word}s keep your progress.</span>`);
    if (c.filled) out.push(`<span class="muted">Merged: you already had ${c.filled === 1 ? 'this one' : 'these'}; only the parts you were missing are added${c.kind === 'notes' ? ' (note points are combined)' : ''}. Your progress stays.</span>`);
    if (c.conflicts) out.push(`<div class="merge-choice"><span>${plural(c.conflicts, word)} ${c.conflicts === 1 ? 'is' : 'are'} different from yours${c.conflictList.some(x => x.field === 'answer') ? ' — <b>including a different answer</b>' : ''}. Which version should stay?</span>
      <div class="seg seg2" role="group"><button type="button" data-imptheirs="0" aria-pressed="${!App.imp.takeTheirs}">Keep mine</button><button type="button" data-imptheirs="1" aria-pressed="${!!App.imp.takeTheirs}">Use theirs</button></div></div>`);
    if (c.similar && c.similar.length) out.push(`<div class="merge-choice"><span>${plural(c.similar.length, word)} ${c.similar.length === 1 ? 'looks' : 'look'} like ${c.similar.length === 1 ? 'one' : 'ones'} you already have (same answer, slightly different words), for example “${esc(c.similar[0].item.question)}” ≈ “${esc(c.similar[0].like.question)}”.</span>
      <div class="seg seg2" role="group"><button type="button" data-impsimilar="0" aria-pressed="${!App.imp.addSimilar}">Skip them</button><button type="button" data-impsimilar="1" aria-pressed="${!!App.imp.addSimilar}">Add anyway</button></div></div>`);
    if (c.others && c.others.length) {
      const names = [...new Set(c.others)];
      out.push(`<div class="others-note"><span>${plural(c.others.length, word)} did not match a syllabus topic, so ${c.others.length === 1 ? 'it goes' : 'they go'} under <b>Others</b>: ${names.slice(0, 6).map(n => `“${esc(n)}”`).join(', ')}${names.length > 6 ? '…' : ''}.</span><small class="muted">If one belongs to another subject, don't add; switch subject instead. You can turn any of these into a syllabus topic later from the Syllabus tab.</small></div>`);
    }
    if (c.kind === 'mcq') out.push((c.all || c.questions).slice(0, 3).map(q => `<div class="qpreview"><span class="mono muted">${esc(q.subject)} · ${esc(q.topic)}</span><span>${esc(q.question)}</span><span class="muted">Answer: ${esc(q.answer)}</span></div>`).join(''));
    else out.push((c.all || c.notes).slice(0, 3).map(n => `<div class="qpreview"><span class="mono muted">${esc(n.subject)}</span><span>${esc(n.title)}</span></div>`).join(''));
    if (c.problems.length) out.push(`<strong class="msg err">${plural(c.problems.length, word)} will be skipped:</strong><ul class="bad">${c.problems.slice(0, 30).map(p => `<li>${esc(p)}</li>`).join('')}</ul>`);
    const n = (c.kind === 'mcq' ? c.questions : c.notes).length;
    return { html: out.join(''), n, word, whole: c.fresh + c.updated === n };
  };
  if (c.kind === 'both') {
    const r = c.parts.map(p => listPreview(p, true)).filter((x, i) => x.n || (c.parts[i].all || []).length || c.parts[i].problems.length);
    r.forEach(x => parts.push(`<div class="prev-sec">${x.html}</div>`));
    const add = r.filter(x => x.n);
    canAdd = add.length > 0;
    addLabel = `Add ${add.map(x => plural(x.n, x.word)).join(' and ')}`;
  } else if (c.kind === 'mcq' || c.kind === 'notes') {
    const x = listPreview(c, false);
    parts.push(x.html);
    canAdd = x.n > 0; addLabel = x.whole ? `Add ${plural(x.n, x.word)}` : `Add and merge (${x.n})`;
  } else {
    const s = c.syllabus;
    parts.push(`<strong>${esc(s.name || (App.imp.target === 'active' && App.prep ? App.prep.name : 'My prep'))}</strong><span class="muted">${s.examDate ? `Exam ${esc(s.examDate)}` : 'No exam date'} · ${plural(s.subjects.length, 'subject')}</span>`);
    if (s.subjects.length) parts.push(`<ul>${s.subjects.map(x => `<li>${esc(x.code)} · ${esc(x.name)}</li>`).join('')}</ul>`);
    if (c.kind === 'prep') parts.push(`<span>${plural(c.questions.length, 'question')} and ${plural(c.notes.length, 'note')} included.</span>`);
    if (App.imp.target === 'new') { canAdd = true; addLabel = 'Create prep'; }
    else {
      canAdd = !!(c.added.length || c.changed.length || (s.examDate && s.examDate !== App.prep.examDate) || s.marking || (s.name && s.name !== App.prep.name));
      parts.push(`<span class="muted">${plural(c.added.length, 'new subject')}, ${c.changed.length} changed. Subjects not in this file are kept.</span>`);
      addLabel = 'Update syllabus';
    }
  }
  if (c.newSubjects && c.newSubjects.length) parts.push(`<span class="muted">New subject codes will be created: ${esc(c.newSubjects.join(', '))}. Import a syllabus later to give them full names.</span>`);
  if (c.problems.length && !perKind(c.kind)) parts.push(`<strong class="msg err">${plural(c.problems.length, 'item')} will be skipped:</strong><ul class="bad">${c.problems.slice(0, 30).map(p => `<li>${esc(p)}</li>`).join('')}</ul>`);
  parts.push(canAdd ? `<div class="btns"><button class="btn primary" type="button" id="impAdd">${addLabel}</button></div>` : `<span class="muted">Nothing new to add.</span>`);
  box.innerHTML = parts.join('');
  const add = $('impAdd'); if (add) add.onclick = () => applyImport(add);
}
$('impPreview').addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.imptheirs !== undefined) { App.imp.takeTheirs = b.dataset.imptheirs === '1'; return doCheck(); }
  if (b.dataset.impsimilar !== undefined) { App.imp.addSimilar = b.dataset.impsimilar === '1'; return doCheck(); }
  if (b.dataset.impswitch) { App.imp.subject = b.dataset.impswitch; App.imp.topic = ''; App.imp.focus = null; renderImport(); doCheck(); }
});

async function applyImport(btn) {
  const c = App.imp.checked;
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    if (App.imp.target === 'new') { const sh = App.imp.share; await createFromChecked(c); if (sh) { App.imp = { share: sh }; await shareAdded(c); } return; }
    const base = Store.prepPath(App.prepId), writes = [];
    let subjects = App.subjects.map(s => ({ ...s }));
    const prepFields = {};
    if (c.kind === 'syllabus') {
      const s = c.syllabus;
      for (const ns of s.subjects) {
        const i = subjects.findIndex(x => x.code === ns.code);
        if (i < 0) { subjects.push(ns); continue; }
        const topics = [...(subjects[i].topics || [])];          // keep your topics, add the new ones
        (ns.topics || []).forEach(t => { if (!topics.some(x => normTopic(x) === normTopic(t) || matchTopic(t, [x]) >= 0)) topics.push(t); });
        const mine = subjects[i], keepMine = !!App.imp.share;     // from a friend: your names stay, only gaps are filled
        subjects[i] = keepMine ? { ...ns, ...Object.fromEntries(Object.entries(mine).filter(([, v]) => !isEmptyVal(v))), ...(topics.length ? { topics } : {}) }
          : { ...mine, ...ns, ...(topics.length ? { topics } : {}) };
      }
      if (App.imp.share) {
        if (s.examDate && !App.prep.examDate) prepFields.examDate = s.examDate;
        if (s.marking && !App.prep.marking) prepFields.marking = s.marking;
      } else {
        if (s.name) prepFields.name = s.name;
        if (s.examDate) prepFields.examDate = s.examDate;
        if (s.marking) prepFields.marking = s.marking;
      }
    }
    for (const code of c.newSubjects || []) if (!subjects.some(x => x.code === code)) subjects.push({ code, name: code, part: '' });
    if (JSON.stringify(subjects) !== JSON.stringify(App.subjects) || Object.keys(prepFields).length) {
      writes.push({ path: base, data: { ...stripId(App.prep), ...prepFields, subjects } });
    }
    for (const part of c.kind === 'both' ? c.parts : [c]) {
      if (part.kind !== 'mcq' && part.kind !== 'notes') continue;
      const isQ = part.kind === 'mcq', current = isQ ? App.bank : App.notesMap, items = isQ ? part.questions : part.notes;
      if (!items || !items.length) continue;
      const by = {}, now = Date.now();
      items.forEach((it, i) => {
        if (!by[it.subject]) { by[it.subject] = {}; Object.values(current).forEach(o => { if (o.subject === it.subject) by[it.subject][o.id] = o; }); }
        const old = current[it.id], clean = { ...it }; delete clean.order;
        // "at": when it was added (date and time), so lists can show it in the order it came in; updates keep the original
        by[it.subject][it.id] = old ? { ...clean, added: old.added || clean.added, ...(old.at ? { at: old.at } : {}) } : { ...clean, at: now + i };
      });
      writes.push(...chunkWrites(`${base}/${isQ ? 'bank' : 'notes'}`, isQ ? 'q' : 'n', by, isQ ? App.bankDocs : App.notesDocs));
    }
    await Store.write(writes);
    Sound.play('done');
    if (await shareAdded(c)) return;
    const lists = c.kind === 'both' ? c.parts : [c];
    const nq = lists.reduce((n, p) => n + (p.kind === 'mcq' ? p.questions.length : 0), 0), nn = lists.reduce((n, p) => n + (p.kind === 'notes' ? p.notes.length : 0), 0);
    const summary = c.kind === 'syllabus' ? 'a syllabus update' : [nq && plural(nq, 'question'), nn && plural(nn, 'note')].filter(Boolean).join(' and ');
    Activity.log('content_added', { prep: App.prep.name, kind: c.kind, summary });
    // stay here, on the same subject, ready for the next file or paste
    const sub = App.subjects.find(s => s.code === App.imp.subject);
    App.imp.checked = null; App.imp.takeTheirs = false; App.imp.addSimilar = false;
    $('impText').value = ''; $('impFile').value = '';
    if (typeof AI !== 'undefined') AI.done = null;
    renderImport();
    msg('impMsg', '');
    const done = $('impDone'); done.hidden = false;
    done.innerHTML = `<span class="imp-done-ic" aria-hidden="true">✓</span><div><b>${c.kind === 'syllabus' ? 'Syllabus updated' : `Added ${esc(summary)}`}</b><small>${sub && c.kind !== 'syllabus' ? `to ${esc(sub.name)}. ` : ''}${nq ? 'New questions join your next review. ' : ''}Add more, or tap Back.</small></div><button class="btn ghost iconbtn" type="button" aria-label="Close" data-donex>✕</button>`;
    done.querySelector('[data-donex]').onclick = () => { done.hidden = true; };
    toast(c.kind === 'syllabus' ? 'Syllabus updated.' : `Added ${summary}.`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (e) {
    console.warn(e);
    btn.disabled = false; btn.textContent = 'Try again';
    msg('impMsg', 'Saving failed. Check your internet and try again.', 'err');
  }
}

/* ---------- settings ---------- */
const THEME_KEY = 'rc-theme';
function applyTheme() {
  let t = 'auto'; try { t = localStorage.getItem(THEME_KEY) || 'auto'; } catch (e) {}
  if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
  Native.statusBar();
  return t;
}
function hourLabel(h) { return h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`; }
function renderSettings() {
  $('accEmail').textContent = App.user ? (App.user.email || 'Google account') : '';
  $('accVerified').innerHTML = !App.user ? '' : (!usesPassword() || App.user.emailVerified) ? '<span class="badge ok">verified</span>' : '<span class="badge warn">not verified yet</span>';
  $('profName').textContent = displayName(); $('profHandle').textContent = App.profile.username ? '@' + App.profile.username : 'No username yet';
  $('pwReset').hidden = !usesPassword();
  $('accConfirm').innerHTML = ''; msg('accMsg', ''); msg('profMsg', '');
  $('installCard').hidden = !Install.prompt || !!App.viewAs || ON_ANDROID;
  $('remCard').hidden = !!App.viewAs; $('accCard').hidden = !!App.viewAs;
  $('adminOpen').hidden = !isAdminUser(App.authUser) || !!App.viewAs;
  if (!$('adminOpen').hidden) renderAdminKey();
  paintAvatars();
  const pf = prefs(), rm = Reminders.settings(), theme = applyTheme();
  $('optRecall').checked = pf.recall; $('optConf').checked = pf.confidence; $('optCalc').checked = pf.calc !== false; $('optTips').checked = pf.tips !== false;
  $('optHaptic').checked = pf.haptics !== false; $('optSound').checked = pf.sounds !== false; $('optFocus').value = pf.focusSound || 'off'; $('optHapticRow').hidden = !NATIVE;
  $('remOn').checked = !!rm.on;
  $('remWhere').textContent = Reminders.where();
  $('remBox').hidden = !rm.on; $('remTest').hidden = !rm.on;
  $('remHours').innerHTML = Array.from({ length: 24 }, (_, h) => `<button class="chip" type="button" data-h="${h}" aria-pressed="${rm.hours.includes(h)}">${hourLabel(h)}</button>`).join('');
  [...$('themeChips').children].forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themeSet === theme)));
  msg('remMsg', '');
}
async function savePrefs(fields) {
  App.profile.prefs = Object.assign(prefs(), fields);
  try { await Store.setProfile({ prefs: App.profile.prefs }); } catch (e) { toast('Saved on this device; it will sync when you are online.'); }
}
$('optFocus').addEventListener('change', () => { savePrefs({ focusSound: $('optFocus').value }); if ($('optFocus').value !== 'off') { Focus.stop(); Focus.start(); setTimeout(() => { if (!Focus.wanted) Focus.stop(); }, 3000); } else Focus.stop(); });
$('optSound').addEventListener('change', () => { savePrefs({ sounds: $('optSound').checked }); if ($('optSound').checked) Sound.play('join'); });
$('optRecall').addEventListener('change', () => savePrefs({ recall: $('optRecall').checked }));
$('optConf').addEventListener('change', () => savePrefs({ confidence: $('optConf').checked }));
$('optCalc').addEventListener('change', () => savePrefs({ calc: $('optCalc').checked }));
$('optTips').addEventListener('change', () => savePrefs({ tips: $('optTips').checked }));
$('themeChips').addEventListener('click', e => {
  const b = e.target.closest('[data-theme-set]'); if (!b) return;
  try { localStorage.setItem(THEME_KEY, b.dataset.themeSet); } catch (err) {}
  renderSettings();
});
const REM_ERRORS = {
  denied: 'Notifications are blocked. Allow them for this app in your phone or browser settings, then try again.',
  unsupported: 'This browser cannot show reminders. On your phone, use the Android app.',
  novapid: 'Browser reminders are not set up yet (the web push key is missing in config.js).',
  notoken: 'The browser did not give a notification token. Try again later.',
};
$('remOn').addEventListener('change', async () => {
  const on = $('remOn').checked;
  msg('remMsg', on ? 'Turning on…' : '');
  try {
    if (on) await Reminders.enable();
    await Reminders.save({ on });
    renderSettings();
    if (on) msg('remMsg', 'Reminders are on.', 'ok');
    Activity.log('reminders_changed', { on });
  } catch (e) {
    console.warn(e);
    $('remOn').checked = false;
    msg('remMsg', REM_ERRORS[e.message] || 'Could not turn on reminders. Check your internet and try again.', 'err');
  }
});
$('remHours').addEventListener('click', async e => {
  const b = e.target.closest('[data-h]'); if (!b) return;
  const h = Number(b.dataset.h), hours = Reminders.settings().hours;
  const nextHours = hours.includes(h) ? hours.filter(x => x !== h) : [...hours, h].sort((a, c) => a - c);
  b.setAttribute('aria-pressed', String(nextHours.includes(h)));
  try { await Reminders.save({ hours: nextHours }); msg('remMsg', nextHours.length ? `Reminders at ${nextHours.map(hourLabel).join(', ')}.` : 'No hours chosen, so no reminders.', 'ok'); }
  catch (err) { msg('remMsg', 'Could not save. Check your internet.', 'err'); }
});
$('remTest').addEventListener('click', async () => {
  try { msg('remMsg', await Reminders.test(), 'ok'); }
  catch (e) { msg('remMsg', REM_ERRORS[e.message] || 'Could not send a test.', 'err'); }
});
$('signOut').addEventListener('click', async () => { if (!App.fb) return; await Activity.log('signed_out'); App.fb.auth.signOut(); const P = nativeAuth(); if (P && googleOK()) P.signOut().catch(() => {}); });   // also forget the Google account choice in the Android app
$('installBtn').addEventListener('click', async () => {
  if (!Install.prompt) return;
  Install.prompt.prompt();
  try { const r = await Install.prompt.userChoice; if (r && r.outcome === 'accepted') toast('Recurra is installed.'); } catch (e) {}
  Install.prompt = null; $('installCard').hidden = true;
});
$('optHaptic').addEventListener('change', () => savePrefs({ haptics: $('optHaptic').checked }));

/* ---------- navigation ---------- */
const MODES = {
  topic: openSubjectPicker,
  notes: () => { Object.assign(NotesUI, listDefaults(), { open: null, all: false, q: '' }); $('notesSearch').value = ''; $('notesFilter').value = ''; renderNotes(); show('notes'); },
  progress: () => { show('progress'); renderProgress(); },
  calendar: () => { Cal.month = null; renderCalendar(); show('calendar'); },
  import: () => openImport('active', 'mcq'),
  settings: () => { renderSettings(); show('settings'); },
};
// any button with data-mode opens that screen (tab bar, home buttons, progress → calendar)
MODES.home = () => show('home');
document.addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (b && MODES[b.dataset.mode]) MODES[b.dataset.mode](); });
document.addEventListener('click', e => { if (e.target.closest('[data-back]')) goHome(); });
$('brand').addEventListener('click', () => { if (App.user) goHome(); });
$('prepBtn').addEventListener('click', showPreps);
document.addEventListener('visibilitychange', () => { if (document.hidden) return; if (visible('home')) renderHome(); Reminders.refreshSoon(); });

/* ---------- account and profile ---------- */
const AVATAR_COLORS = ['#2f6f73', '#5b6f9a', '#7a6a4f', '#4f7a5b', '#8a5a6e', '#5f6f73'];
function displayName() {
  const u = App.user || {};
  return (App.profile.name || u.displayName || (u.email || '').split('@')[0] || 'You').trim();
}
function initials(name) {
  const parts = name.replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  return ((parts[0] || '?')[0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}
// photo you added → Google photo → coloured circle with your initials (the default)
function avatarHTML() {
  const u = App.user || {}, photo = App.profile.photo || u.photoURL || (App.viewAs && (Social.people[u.uid] || {}).photo) || '';
  if (photo) return `<img src="${esc(photo)}" alt="" referrerpolicy="no-referrer">`;
  return esc(initials(displayName()));
}
function avatarColor() {
  const id = (App.user && App.user.uid) || 'x';
  let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function paintAvatars() {
  const html = `<span class="avatar" style="background:${avatarColor()}">${avatarHTML()}</span>`;
  $('avatarBtn').hidden = !App.user; $('avatarBtn').innerHTML = App.user ? html : '';
  $('profAvatar').innerHTML = App.user ? avatarHTML() : ''; $('profAvatar').style.background = avatarColor();
  $('photoRemove').hidden = !App.profile.photo;
}
const usesPassword = () => !!(App.user && (App.user.providerData || []).some(p => p.providerId === 'password'));
function renderVerify() {
  const box = $('verifyBox'), u = App.user;
  box.hidden = !(u && usesPassword() && !u.emailVerified);
  if (box.hidden) return;
  box.innerHTML = `<span>Please verify your email. We sent a link to <strong>${esc(u.email)}</strong> (check spam too).</span>
    <div class="btns"><button class="btn" type="button" id="vResend">Send again</button><button class="btn" type="button" id="vDone">I've verified</button></div>
    <p class="msg" id="vMsg"></p>`;
  $('vResend').onclick = async () => {
    try { await App.fb.auth.currentUser.sendEmailVerification(); msg('vMsg', 'Sent. Check your inbox.', 'ok'); }
    catch (e) { msg('vMsg', authError(e) || 'Could not send. Try again later.', 'err'); }
  };
  $('vDone').onclick = async () => {
    try { await App.fb.auth.currentUser.reload(); App.user = App.fb.auth.currentUser; } catch (e) {}
    if (App.user.emailVerified) { toast('Email verified. Thank you!'); renderVerify(); if (visible('settings')) renderSettings(); }
    else msg('vMsg', 'Not verified yet. Open the link in the email first.', 'err');
  };
}

let authMode = 'signin';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function setAuthMode(m) {
  authMode = m;
  const up = m === 'signup', reset = m === 'reset';
  $('authTitle').textContent = reset ? 'Reset your password' : up ? 'Create your account' : 'Sign in';
  $('loginBtn').textContent = reset ? 'Send reset link' : up ? 'Create account' : 'Sign in';
  $('authToggle').textContent = reset ? 'Back to sign in' : up ? 'Already have an account? Sign in' : 'New here? Create an account';
  $('loginPass').autocomplete = up ? 'new-password' : 'current-password';
  $('nameRow').hidden = !up; $('confirmRow').hidden = !up; $('forgotBtn').hidden = up || reset;
  $('passRow').hidden = reset; $('resetIntro').hidden = !reset;
  $('googleBtn').hidden = reset || !googleOK(); $('orLine').hidden = reset || !googleOK();
  $('loginForm').hidden = false; $('resetDone').hidden = true; $('authTitle').hidden = false;
  msg('loginMsg', '');
}
// clear, specific messages (works best with Firebase "email enumeration protection" turned off)
function authError(e) {
  const c = (e && e.code) || '';
  if (/user-not-found/.test(c)) return 'No account uses this email. Check the spelling, or create an account.';
  if (/wrong-password/.test(c)) return 'Wrong password. Try again, or reset it.';
  if (/invalid-credential|invalid-login/.test(c)) return 'Email or password is wrong.';
  if (/email-already-in-use/.test(c)) return 'This email already has an account. Sign in instead.';
  if (/weak-password/.test(c)) return 'Use a password of at least 6 characters.';
  if (/invalid-email|missing-email/.test(c)) return 'Enter a valid email address, like name@gmail.com.';
  if (/user-disabled/.test(c)) return `This account is turned off or being deleted. If this is a mistake, write to ${ADMIN_EMAIL}.`;
  if (/operation-not-allowed|configuration-not-found/.test(c)) return 'This sign-in method is not turned on in Firebase yet.';
  if (/unauthorized-domain|unauthorized-continue-uri/.test(c)) return 'This website is not on the Firebase "Authorized domains" list yet.';
  if (/requires-recent-login/.test(c)) return 'For safety, sign out and sign in again, then try once more.';
  if (/network/.test(c)) return 'No internet connection. Check it and try again.';
  if (/popup-closed|cancelled-popup/.test(c)) return '';
  if (/too-many-requests/.test(c)) return 'Too many attempts. Please wait a few minutes and try again.';
  return 'Something went wrong. Please try again.';
}
// an error with an action button ("Create an account" / "Reset password")
function authErrorWithAction(e, email) {
  msg('loginMsg', authError(e), 'err');
  const c = (e && e.code) || '', box = $('loginMsg');
  const add = (label, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'linkbtn'; b.textContent = label; b.style.marginLeft = '6px'; b.onclick = fn; box.appendChild(b); };
  if (/user-not-found/.test(c)) add('Create an account', () => { setAuthMode('signup'); $('loginEmail').value = email; $('loginFirst').focus(); });
  if (/wrong-password|invalid-credential/.test(c) && authMode === 'signin') add('Reset password', () => { setAuthMode('reset'); $('loginEmail').value = email; });
}
$('authToggle').addEventListener('click', () => setAuthMode(authMode === 'signin' ? 'signup' : 'signin'));
$('forgotBtn').addEventListener('click', () => { const e = $('loginEmail').value; setAuthMode('reset'); $('loginEmail').value = e; $('loginEmail').focus(); });
document.addEventListener('click', e => {
  const b = e.target.closest('.pwtoggle'); if (!b) return;
  const inp = $(b.dataset.pw), show = inp.type === 'password';
  inp.type = show ? 'text' : 'password'; b.textContent = show ? 'Hide' : 'Show';
  b.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
});

// password reset: link goes to the email, works once, expires in an hour, brings you back to Recurra
const Reset = { email: '', timer: null };
async function sendReset(email) {
  const back = /^https?:/.test(location.href) && !NATIVE ? { url: location.origin + location.pathname, handleCodeInApp: false } : undefined;
  try { await App.fb.auth.sendPasswordResetEmail(email, back); }
  catch (e) { if (back && /unauthorized-continue-uri|invalid-continue-uri|missing-continue-uri/.test(e.code || '')) await App.fb.auth.sendPasswordResetEmail(email); else throw e; }
}
function showResetDone(email) {
  Reset.email = email;
  $('resetEmail').textContent = email;
  $('loginForm').hidden = true; $('authTitle').hidden = true; $('resetDone').hidden = false;
  let left = 60; const btn = $('resetAgain');
  btn.disabled = true; btn.textContent = `Resend in ${left}s`;
  clearInterval(Reset.timer);
  Reset.timer = setInterval(() => {
    left--;
    if (left <= 0) { clearInterval(Reset.timer); btn.disabled = false; btn.textContent = 'Resend'; }
    else btn.textContent = `Resend in ${left}s`;
  }, 1000);
}
$('resetAgain').addEventListener('click', async () => {
  $('resetAgain').disabled = true;
  try { await sendReset(Reset.email); toast('Sent again.'); showResetDone(Reset.email); }
  catch (e) { $('resetAgain').disabled = false; toast(authError(e)); }
});
$('resetBack').addEventListener('click', () => { clearInterval(Reset.timer); setAuthMode('signin'); $('loginEmail').value = Reset.email; $('loginPass').focus(); });

$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const email = $('loginEmail').value.trim(), pass = $('loginPass').value;
  msg('loginMsg', '');
  if (!EMAIL_RE.test(email)) return msg('loginMsg', 'Enter a valid email address, like name@gmail.com.', 'err');
  if (authMode === 'reset') {
    $('loginBtn').disabled = true;
    try { await sendReset(email); showResetDone(email); }
    catch (err) { authErrorWithAction(err, email); }
    $('loginBtn').disabled = false;
    return;
  }
  if (!pass) return msg('loginMsg', 'Enter your password.', 'err');
  if (authMode === 'signup') {
    const first = $('loginFirst').value.replace(/\s+/g, ' ').trim(), last = $('loginLast').value.replace(/\s+/g, ' ').trim(), name = `${first} ${last}`.trim();
    if (!first) return msg('loginMsg', 'Please enter your first name.', 'err');
    if (!last) return msg('loginMsg', 'Please enter your last name.', 'err');
    App.pendingFirst = first; App.pendingLast = last;
    if (pass.length < 6) return msg('loginMsg', 'Use a password of at least 6 characters.', 'err');
    if (pass !== $('loginPass2').value) return msg('loginMsg', 'The two passwords do not match.', 'err');
    App.pendingName = name;
  }
  $('loginBtn').disabled = true;
  App.signingIn = true;
  try {
    if (authMode === 'signin') await App.fb.auth.signInWithEmailAndPassword(email, pass);
    else {
      const cred = await App.fb.auth.createUserWithEmailAndPassword(email, pass);
      const u = cred.user || App.fb.auth.currentUser;
      try { await u.updateProfile({ displayName: App.pendingName }); } catch (err) {}
      try { await u.sendEmailVerification(); } catch (err) {}
    }
  } catch (err) { authErrorWithAction(err, email); }
  $('loginBtn').disabled = false;
});
// "Continue with Google". In the Android app the web pop-up cannot open, so Android's own Google account
// picker is used: it hands back a Google sign-in token, and Firebase signs in with it.
function nativeAuth() { try { return NATIVE && window.capacitorExports ? capacitorExports.registerPlugin('FirebaseAuthentication') : null; } catch (e) { return null; } }
function googleOK() { return !NATIVE || !!(window.APP_CONFIG && APP_CONFIG.androidGoogle && window.capacitorExports); }
async function nativeGoogle() {
  const P = nativeAuth(); if (!P) throw new Error('not available');
  const r = await P.signInWithGoogle({ skipNativeAuth: true });
  const tok = r && r.credential && r.credential.idToken;
  if (!tok) throw new Error('no token');
  await App.fb.auth.signInWithCredential(firebase.auth.GoogleAuthProvider.credential(tok, (r.credential && r.credential.accessToken) || null));
}
$('googleBtn').addEventListener('click', async () => {
  const provider = new firebase.auth.GoogleAuthProvider();
  App.signingIn = true;
  if (NATIVE) {
    const b = $('googleBtn'); b.disabled = true; msg('loginMsg', '');
    try { await nativeGoogle(); }
    catch (err) {
      App.signingIn = false;
      const t = String((err && (err.message || err.code)) || '');
      if (!/cancel/i.test(t)) { console.warn('google', err); const m = err && err.code && err.code.startsWith('auth/') ? authError(err) : ''; msg('loginMsg', m || 'Google sign-in did not work. Try again, or sign in with your email and password.', 'err'); }
    }
    b.disabled = false; return;
  }
  try { await App.fb.auth.signInWithPopup(provider); }
  catch (err) {
    if (/popup-blocked|operation-not-supported/.test(err.code || '')) { try { await App.fb.auth.signInWithRedirect(provider); return; } catch (e2) { err = e2; } }
    const m = authError(err); if (m) msg('loginMsg', m, 'err');
  }
});

// profile: name and photo
$('avatarBtn').addEventListener('click', () => MODES.settings());
$('profAvatar').addEventListener('click', () => { if (App.user && (App.profile.photo || authPhoto())) openPhoto(meUid()); });
$('profEdit').addEventListener('click', () => openSetup(true));
// shrink any photo to a 160×160 JPEG (about 10 KB) so it fits in the free database
function shrinkPhoto(file) {
  return new Promise((ok, fail) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const size = 160, c = document.createElement('canvas'); c.width = c.height = size;
      const s = Math.min(img.naturalWidth, img.naturalHeight);
      c.getContext('2d').drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url); ok(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); fail(new Error('image')); };
    img.src = url;
  });
}
$('photoFile').addEventListener('change', async () => {
  const f = $('photoFile').files[0]; $('photoFile').value = '';
  if (!f) return;
  if (!/^image\//.test(f.type)) return msg('profMsg', 'Please choose a photo (JPG or PNG).', 'err');
  try {
    const photo = await shrinkPhoto(f);
    await Store.setProfile({ photo }); App.profile.photo = photo;
    paintAvatars(); syncPerson(); msg('profMsg', 'Photo updated.', 'ok');
    Activity.log('profile_updated', { what: 'photo' });
  } catch (e) { msg('profMsg', e.message === 'image' ? 'Could not read that photo. Try another one.' : 'Could not save. Check your internet.', 'err'); }
});
$('photoRemove').addEventListener('click', async () => {
  try { await Store.setProfile({ photo: '' }); App.profile.photo = ''; paintAvatars(); syncPerson(); msg('profMsg', 'Photo removed.', 'ok'); }
  catch (e) { msg('profMsg', 'Could not save. Check your internet.', 'err'); }
});
// change your own password: current password + new one, done on the spot (no email)
const pwField = (id, label, ac) => `<label for="${id}">${label}</label><div class="pw"><input id="${id}" type="password" autocomplete="${ac}" minlength="6"><button class="pwtoggle" type="button" data-pw="${id}" aria-label="Show password">Show</button></div>`;
$('pwReset').addEventListener('click', () => {
  msg('accMsg', '');
  $('accConfirm').innerHTML = `<form class="pwform form" id="pwForm" novalidate>
      <strong>Change your password</strong>
      ${pwField('pwCur', 'Current password', 'current-password')}
      ${pwField('pwNew', 'New password', 'new-password')}
      ${pwField('pwNew2', 'Confirm new password', 'new-password')}
      <p class="muted small">At least 6 characters.</p>
      <div class="btns grid"><button class="btn" type="button" id="pwCancel">Cancel</button><button class="btn primary" type="submit">Change password</button></div>
      <button class="linkbtn" type="button" id="pwForgot">Forgot your current password? Email me a reset link</button>
    </form>`;
  $('pwCur').focus();
  $('pwCancel').onclick = () => { $('accConfirm').innerHTML = ''; };
  $('pwForgot').onclick = async () => {
    try { await App.fb.auth.sendPasswordResetEmail(App.user.email); $('accConfirm').innerHTML = ''; msg('accMsg', `We emailed a link to ${App.user.email} to set a new password.`, 'ok'); Activity.log('password_reset_sent'); }
    catch (e) { msg('accMsg', authError(e), 'err'); }
  };
  $('pwForm').onsubmit = async e => {
    e.preventDefault();
    const cur = $('pwCur').value, nw = $('pwNew').value;
    if (!cur) return msg('accMsg', 'Enter your current password.', 'err');
    if (nw.length < 6) return msg('accMsg', 'Use a new password of at least 6 characters.', 'err');
    if (nw !== $('pwNew2').value) return msg('accMsg', 'The two new passwords do not match.', 'err');
    if (nw === cur) return msg('accMsg', 'The new password is the same as the current one.', 'err');
    const btn = $('pwForm').querySelector('[type=submit]'); btn.disabled = true; msg('accMsg', 'Changing…');
    try {
      const u = App.fb.auth.currentUser;
      await u.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(u.email, cur));
      await u.updatePassword(nw);
      Store.setProfile({ pwChangedAt: Date.now(), pwChangedOn: DEVICE }).catch(() => {});   // other devices sign out
      $('accConfirm').innerHTML = '';
      msg('accMsg', 'Password changed. Use the new one next time you sign in.', 'ok');
      Activity.log('password_changed');
    } catch (err) {
      btn.disabled = false;
      msg('accMsg', /wrong-password|invalid-credential|invalid-login/.test(err.code || '') ? 'Your current password is wrong.' : authError(err), 'err');
    }
  };
});
// delete account: locked now, erased for good after 30 days (by the hourly account job)
$('accDelete').addEventListener('click', () => {
  const when = fmtDate(Date.now() + DELETE_WAIT_DAYS * DAY_MS), email = (App.user && App.user.email) || 'this email';
  if (isAdminUser(App.authUser)) { $('accConfirm').innerHTML = '<p class="msg err">The admin account cannot be deleted from here.</p>'; return; }
  $('accConfirm').innerHTML = `<div class="confirm delete-box">
      <strong>What deleting your account does</strong>
      <ul>
        <li>You are signed out straight away, and you <b>won't be able to sign in</b> with ${esc(email)} again.</li>
        <li>Your preps, questions, notes, progress and streak are hidden now and <b>erased for good on ${esc(when)}</b>, 30 days from today.</li>
        <li>Changed your mind? Write to ${esc(ADMIN_EMAIL)} before ${esc(when)} and your account can be restored. After that date, nothing can be brought back.</li>
        <li>Want to keep your questions? Use <b>Export to share</b> on the Preps screen first.</li>
      </ul>
      <label for="accDelType">Type DELETE to confirm</label>
      <input id="accDelType" autocomplete="off" autocapitalize="characters" spellcheck="false">
      <div class="btns grid"><button class="btn" type="button" id="accDeleteNo">Keep my account</button><button class="btn danger" type="button" id="accDeleteYes" disabled>Delete my account</button></div>
    </div>`;
  $('accDelType').oninput = () => { $('accDeleteYes').disabled = $('accDelType').value.trim().toUpperCase() !== 'DELETE'; };
  $('accDeleteNo').onclick = () => { $('accConfirm').innerHTML = ''; };
  $('accDeleteYes').onclick = async () => {
    $('accDeleteYes').disabled = true; msg('accMsg', 'Deleting…');
    try {
      const now = Date.now(), deleteAt = now + DELETE_WAIT_DAYS * DAY_MS;
      await Activity.log('delete_requested', { deleteAt });
      await Store.setProfile({ status: 'deleting', deleteRequestedAt: now, deleteAt });
      await Progress.discard(); closePrep();
      try { Object.keys(localStorage).filter(k => k.startsWith('rc-') && k !== 'rc-theme').forEach(k => localStorage.removeItem(k)); } catch (e) {}
      App.blockMsg = `Your account is being deleted. You have been signed out, and everything in it will be erased on ${fmtDate(deleteAt)}.`;
      await App.fb.auth.signOut();
    } catch (e) {
      console.warn(e);
      msg('accMsg', 'Could not delete the account. Check your internet and try again.', 'err');
      if ($('accDeleteYes')) $('accDeleteYes').disabled = false;
    }
  };
});

/* ---------- account start, locked accounts, "view as" for the admin ---------- */
function blockedText(p) {
  if (p.status === 'deleting') return `This account is being deleted. Everything in it will be erased on ${fmtDate(p.deleteAt)}, and it can't be used until then. If this is a mistake, write to ${ADMIN_EMAIL} before that date.`;
  if (p.status === 'disabled') return `This account has been turned off by the admin. If you think this is a mistake, write to ${ADMIN_EMAIL}.`;
  return 'This account has been deleted.';
}
function stopAccount() {
  if (typeof stopSocial === 'function') { stopSocial(); stopInvites(); }
  if ($('setupSheet')) { $('setupSheet').hidden = true; document.body.classList.remove('sheet-open'); }
  if (App.prepsUnsub) { try { App.prepsUnsub(); } catch (e) {} App.prepsUnsub = null; }
  if (App.profileUnsub) { try { App.profileUnsub(); } catch (e) {} App.profileUnsub = null; }
  closePrep();
}
// user = the account to show (your own, or someone else's when the admin opens it)
async function startAccount(user, screen) {
  stopAccount();
  App.user = user; App.preps = []; App.prepsLoaded = false; App.profile = {};
  updatePrepButton(); setSync(); paintAvatars(); renderViewAs(); updateAdminTab();
  Store.uid = user.uid;
  $('bootMsg').textContent = App.viewAs ? `Opening ${App.viewAs.name || App.viewAs.email}'s account…` : 'Loading your preps…'; show('boot');
  try { App.profile = await Store.getProfile(); } catch (e) { App.profile = {}; }
  if (!App.viewAs) {
    if (isBlocked(App.profile.status)) { App.blockMsg = blockedText(App.profile); Activity.stop(); await App.fb.auth.signOut(); return; }
    let isNew = false;
    if (!App.profile.email || (App.pendingName && !App.profile.name)) {
      isNew = !App.profile.created;
      const first = { email: user.email || '', created: App.profile.created || Date.now() };
      if (App.pendingName || user.displayName) first.name = App.profile.name || App.pendingName || user.displayName;
      if (App.pendingFirst && !App.profile.first) { first.first = App.pendingFirst; first.last = App.pendingLast || ''; }
      Object.assign(App.profile, first);
      Store.setProfile(first).catch(() => {});
    }
    if (isNew) Activity.log('account_created'); else if (App.signingIn) Activity.log('signed_in'); else Activity.opened();
    try { localStorage.setItem('rc-opened-' + user.uid, String(Date.now())); } catch (e) {}
    App.signingIn = false;
    // if the admin turns this account off (or it is being deleted), sign out on every device straight away
    const started = Date.now();
    App.profileUnsub = Store.watchDoc(Store.base(), p => {
      if (App.viewAs || !App.authUser) return;
      if (isBlocked(p.status)) { App.blockMsg = blockedText(p); App.fb.auth.signOut(); }
      else if ((p.signOutAt || 0) > started) { App.blockMsg = 'Your password was changed by the admin. Sign in with the new password.'; App.fb.auth.signOut(); }
      else if ((p.pwChangedAt || 0) > started && p.pwChangedOn !== DEVICE) { App.blockMsg = 'Your password was changed. Sign in with the new password.'; App.fb.auth.signOut(); }
    });
    Activity.start();
    startSocial(); startInvites(); Push.register(); setTimeout(() => Route.go(), 800);
    if (needsSetup()) openSetup(false); else syncPerson();      // also puts you back in friend search after the admin turns you on again
  }
  App.pendingName = null; App.pendingFirst = App.pendingLast = null;
  paintAvatars();
  if (screen) App.afterLoad = screen;
  App.prepsUnsub = Store.watchPreps(onPreps, e => { console.warn(e); setSync('offline'); });
  if (!App.viewAs) Reminders.refreshSoon(4000);
  else { startSocial(); loadPerson(user.uid).then(() => paintAvatars()); }   // the admin can see this person's friends and read their chats
}
function renderViewAs() {
  const bar = $('viewAsBar'), v = App.viewAs;
  bar.hidden = !v; document.body.classList.toggle('viewing', !!v);
  if (!v) return;
  bar.innerHTML = `<span>Viewing <b>${esc(v.name || v.email)}</b>'s account. Anything you change is saved to their account.</span><button class="btn" type="button" id="viewAsExit">Back to admin</button>`;
  $('viewAsExit').onclick = () => exitViewAs();
}
async function openAccountAs(u) {
  await Activity.log('admin_opened_account', {}, u);
  App.viewAs = { uid: u.uid, email: u.email || '', name: u.name || '' };
  startAccount({ uid: u.uid, email: u.email || '', displayName: u.name || '', emailVerified: true, providerData: [] });
}
function exitViewAs() {
  const back = App.viewAs; App.viewAs = null;
  startAccount(App.authUser, back ? 'admin' : null);
}
function updateAdminTab() {
  const on = isAdminUser(App.authUser) && !App.viewAs;
  $('adminTab').hidden = !on; updateTabs();
  $('adminOpen').hidden = !on;
}

/* ---------- start ---------- */
(async function init() {
  document.querySelectorAll('[data-icon]').forEach(el => { el.outerHTML = icon(el.dataset.icon); });
  applyTheme();
  if (!googleOK()) { $('googleBtn').hidden = true; $('orLine').hidden = true; }
  else if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  // the Android app download link (only in a normal browser tab)
  const apk = `https://github.com/${REPO}/releases/download/android/recurra.apk`, onAndroid = /Android/i.test(navigator.userAgent);
  document.querySelectorAll('[data-getapp]').forEach(w => {
    w.querySelectorAll('[data-apklink],[data-apkfile]').forEach(a => { a.href = apk; });
    w.querySelector('[data-apklink]').addEventListener('click', e => {      // on a laptop: show the QR code to scan instead
      if (onAndroid) return;
      e.preventDefault(); w.classList.toggle('open');
    });
  });
  document.addEventListener('click', e => { if (!e.target.closest('[data-getapp]')) document.querySelectorAll('[data-getapp].open').forEach(w => w.classList.remove('open')); });
  const cfg = window.APP_CONFIG && window.APP_CONFIG.firebase;
  if (!cfg) { $('bootMsg').innerHTML = 'Setup is not finished: <code>config.js</code> has no Firebase settings yet. See README.md, step A5.'; return; }
  try { App.fb = await firebaseStart(cfg); }
  catch (e) { $('bootMsg').textContent = 'Could not start. Check your internet connection and reload the page.'; return; }
  Store.fs = App.fb.fs;
  if (typeof updStart === 'function') updStart();           // Android: app updates
  App.fb.auth.onAuthStateChanged(async user => {
    const prev = App.authUser;
    App.authUser = user; App.viewAs = null;
    if (!user) {
      if (!prev && !App.blockMsg && visible('login')) return;      // already signed out: keep the message on screen
      stopAccount(); Activity.stop();
      App.user = null; App.preps = []; App.prepsLoaded = false; App.profile = {};
      updatePrepButton(); setSync(); paintAvatars(); renderViewAs(); updateAdminTab();
      setAuthMode('signin'); show('login');
      if (App.blockMsg) { msg('loginMsg', App.blockMsg, 'err'); App.blockMsg = null; }
      return;
    }
    startAccount(user);
  });
})();
