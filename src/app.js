/* =====================================================================
   PART 4 — SCREENS
   ===================================================================== */
const App = {
  fb: null, user: null, profile: {}, preps: [], prepsLoaded: false, prepId: null, prep: null, wantPrep: null,
  subjects: [], bank: {}, bankDocs: [], notesMap: {}, notesDocs: [], questions: [], notes: [],
  loaded: false, unsubs: [], prepsUnsub: null, session: null, pick: null, imp: null,
};
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rich = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');
const getState = id => Progress.get(id);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const todayKey = () => dayKey(Date.now());
const SCREENS = ['boot', 'login', 'home', 'preps', 'import', 'settings', 'picker', 'quiz', 'break', 'result', 'progress', 'calendar', 'notes'];
const prefs = () => Object.assign({ recall: true, confidence: true }, App.profile.prefs || {});
const visible = id => !$(id).hidden;

function show(id) {
  SCREENS.forEach(s => { $(s).hidden = s !== id; });
  document.body.classList.toggle('focus', id === 'quiz' || id === 'break');   // focus mode: nothing but the question
  const tabs = !!App.prep && !['boot', 'login', 'quiz', 'break'].includes(id);
  $('tabbar').hidden = !tabs; document.body.classList.toggle('has-tabs', tabs);
  const tab = { home: 'home', picker: 'topic', notes: 'notes', progress: 'progress', calendar: 'progress' }[id];
  document.querySelectorAll('#tabbar [data-tab]').forEach(b => { if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  window.scrollTo(0, 0);
  if (id === 'home') renderHome();
}
function goHome() { if (App.prep) show('home'); else showPreps(); }
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
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
const plan = () => todayPlan(App.questions, getState, Date.now(), examMs(), App.subjects.map(s => s.code));

/* ---------- prep loading ---------- */
function rebuild() {
  const byCode = new Map(App.subjects.map(s => [s.code, s]));
  App.questions = Object.values(App.bank).filter(q => q && !q.retired)
    .sort((a, b) => (a.added || '').localeCompare(b.added || '') || a.id.localeCompare(b.id))
    .map((q, i) => ({ ...q, code: q.subject, subject: (byCode.get(q.subject) || { name: q.subject }).name, order: i }));
  App.notes = Object.values(App.notesMap).filter(Boolean).map(n => ({ ...n, code: n.subject }));
}
function refresh() {
  if (visible('home')) renderHome();
  else if (visible('preps')) renderPreps();
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
  if (!list.length) { closePrep(); updatePrepButton(); if (!visible('import')) showPreps(); return; }
  const cur = list.find(p => p.id === App.prepId);
  if (!cur) {
    let want = null;
    try { want = localStorage.getItem('rc-active-' + App.user.uid); } catch (e) {}
    want = list.some(p => p.id === want) ? want : list.some(p => p.id === App.profile.activePrep) ? App.profile.activePrep : list[0].id;
    if (App.prepId) toast('That prep was deleted.');
    return openPrep(want, visible('preps') ? 'preps' : 'home');
  }
  App.prep = cur; App.subjects = cur.subjects || [];
  if ((cur.resetAt || 0) > Progress.resetAt) Progress.wipeTo(cur.resetAt);
  rebuild(); updatePrepButton(); refresh();
}
function updatePrepButton() {
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
function renderHome() {
  if (!App.prep) return;
  $('hello').textContent = `${greeting()}, ${displayName().split(' ')[0]}`;
  renderVerify();
  const p0 = App.prep, ex = examMs();
  if (ex) {
    const days = Math.round((ex - dayStart(Date.now())) / 864e5), m = p0.marking;
    const dateStr = new Date(ex).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    const mark = m && m.totalQuestions ? ` · ${m.totalQuestions} MCQs · +${m.correct} / ${m.wrong}` : '';
    $('countdown').innerHTML = days >= 0
      ? `<span class="days">${days}</span><span class="what">days to exam</span><span class="meta">${esc(dateStr)}${mark}</span>`
      : `<span class="what">Exam date passed</span>`;
  } else $('countdown').innerHTML = `<span class="what">${esc(p0.name)}</span><span class="meta">No exam date set</span>`;

  if (!App.loaded) { $('todayCard').innerHTML = `<div class="empty">Loading your questions…</div>`; return; }
  const p = syncDay(), n = p.due.length + p.fresh.length, d = Progress.today(), pct = dayPct(d);
  let card;
  if (!App.questions.length) {
    card = `<div class="today"><div class="top"><div class="what"><strong>No questions yet</strong>
      <span>Add questions made from your notes. They show up here by themselves.</span></div></div>
      <button class="go" type="button" id="addBtn">Add questions</button></div>`;
  } else if (n && d.paused) {
    card = `<div class="today paused"><div class="top"><span class="big">II</span>
      <div class="what"><strong>Paused for today</strong><span>No reminders today. Your ${plural(n, 'question')} wait for tomorrow, and the pause ends by itself at midnight.</span></div></div>
      <button class="go soft" type="button" id="resumeBtn">Resume now</button></div>`;
  } else if (n) {
    card = `<div class="today"><div class="top"><span class="big">${n}</span>
      <div class="what"><strong>${d.n ? 'Left today' : 'Today’s review'}</strong><span>${timeText(n)}</span></div></div>
      <div class="split"><span>${p.due.length} to revise</span><span>${p.fresh.length} new</span>${d.n ? `<span>${d.n} done today · ${pct}% right</span>` : ''}</div>
      <div class="row2"><button class="go" type="button" id="goBtn">${d.n ? 'Continue' : 'Start'}</button>
      <button class="pausebtn" type="button" id="pauseBtn">Pause today</button></div></div>`;
  } else {
    const nx = Progress.meta.next;
    card = `<div class="today done"><div class="top"><span class="big">${pct === null ? '✓' : pct + '%'}</span>
      <div class="what"><strong>Done for today</strong><span>${plural(d.n || 0, 'question')} answered${pct === null ? '' : `, ${pct}% right first time`}.${nx && nx.count ? ` Tomorrow: about ${plural(nx.count, 'question')}, ${nx.mins} min.` : ''}</span></div></div>
      <button class="go soft" type="button" id="extraBtn">Extra practice (10)</button></div>`;
  }
  $('todayCard').innerHTML = card;
  const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
  on('goBtn', () => startSession('Today’s review', [...p.due, ...p.fresh], true));
  on('extraBtn', startExtra);
  on('addBtn', () => openImport('active', 'mcq'));
  on('pauseBtn', () => { Progress.setToday({ paused: true }); renderHome(); Reminders.refreshSoon(0); toast('Paused for today. It starts again tomorrow.'); });
  on('resumeBtn', () => { Progress.setToday({ paused: false }); renderHome(); Reminders.refreshSoon(0); });
  renderStreak();
  const o = summary(App.questions);
  $('stats').innerHTML = `
    <div class="stat"><b>${o.total}</b><small>Questions in bank</small></div>
    <div class="stat"><b>${o.total ? Math.round(100 * o.seen / o.total) : 0}%</b><small>Seen at least once</small></div>
    <div class="stat"><b>${o.strong}</b><small>Strong in memory</small></div>
    <div class="stat"><b>${o.acc === null ? '–' : o.acc + '%'}</b><small>Accuracy</small></div>`;
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
  return [s.part && `Part ${esc(s.part)}`, s.marks ? `${s.marks} marks` : ''].filter(Boolean).join(' · ');
}
function openSubjectPicker() {
  App.pick = { mode: 'subject' };
  $('pickerTitle').textContent = 'Practice a topic: choose a subject';
  $('pickerList').innerHTML = App.subjects.length ? App.subjects.map(s => {
    const n = App.questions.filter(q => q.code === s.code).length;
    return `<button class="row" type="button" data-code="${esc(s.code)}" ${n ? '' : 'disabled'}>
      <span class="code">${esc(s.code)}</span>
      <span class="name">${esc(s.name)}<small>${subjectMeta(s)}</small></span>
      <span class="n">${n ? n + ' Qs' : 'No Qs yet'}</span></button>`;
  }).join('') : `<div class="empty">No subjects yet. Add a syllabus or questions first.</div>`;
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
  const b = e.target.closest('button.row'); if (!b || b.disabled) return;
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
  $('qOpts').innerHTML = it.opts.map((o, k) => `
    <button class="opt" type="button" data-k="${k}"><span class="key">${'ABCDEFGH'[k]}</span><span>${rich(o)}</span></button>`).join('');
  $('qRecall').hidden = it.phase !== 'recall';
  $('qOpts').hidden = it.phase === 'recall';
  $('qConf').hidden = true;
  $('qFeedback').innerHTML = '';
  $('skipBtn').hidden = false; $('nextBtn').hidden = true;
  setKeyHint();
  if (it.phase === 'recall') $('showOpts').focus({ preventScroll: true });
}
function setKeyHint() {
  const it = App.session.queue[App.session.i];
  $('keyHint').textContent = { recall: 'Space: show options · S: don\'t know', options: 'Keys 1–4: answer · S: don\'t know', conf: 'Keys 1 sure · 2 not sure · 3 guessed', done: 'Enter: next' }[it.result ? 'done' : it.phase] || '';
}
function showOptions() {
  const it = App.session.queue[App.session.i];
  if (it.phase !== 'recall') return;
  it.phase = 'options';
  $('qRecall').hidden = true; $('qOpts').hidden = false; setKeyHint();
}
// k = option index, or null for "Don't know"
function pick(k) {
  const it = App.session.queue[App.session.i];
  if (it.result || it.phase === 'conf') return;
  if (k === null) return finish(null, '');
  if (it.phase === 'recall') showOptions();
  if (!prefs().confidence) return finish(k, '');
  it.picked = k; it.phase = 'conf';
  [...$('qOpts').children].forEach((b, idx) => { b.disabled = true; if (idx === k) b.classList.add('picked'); });
  $('qConf').hidden = false; $('skipBtn').hidden = true; setKeyHint();
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
  let again = false;
  if (it.result !== 'correct' && (z.retries[q.id] || 0) < SCHEDULE.retriesInSession) {
    z.retries[q.id] = (z.retries[q.id] || 0) + 1;
    const last = z.queue.length - 1;
    let at = Math.min(z.queue.length, z.i + 4);
    if (z.closer && z.i < last && at > last) at = last;     // keep the "good note" question at the very end
    z.queue.splice(at, 0, { q, retry: true });
    again = true;
  }
  $('qConf').hidden = true; $('qOpts').hidden = false; $('qRecall').hidden = true;
  [...$('qOpts').children].forEach((b, idx) => {
    b.disabled = true; b.classList.remove('picked');
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
  $('nextBtn').textContent = z.i === z.queue.length - 1 ? 'Finish' : 'Next';
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
$('qConf').addEventListener('click', e => { const b = e.target.closest('[data-conf]'); if (b) finish(App.session.queue[App.session.i].picked, b.dataset.conf); });
$('skipBtn').addEventListener('click', () => pick(null));
$('nextBtn').addEventListener('click', next);
$('quitBtn').addEventListener('click', endSession);
function endSession() {
  const z = App.session, it = z.queue[z.i];
  if (it && it.result && it.shown) Progress.pace((Date.now() - it.shown) / 1000);
  syncDay(); Reminders.refreshSoon();
  if (Object.keys(z.first).length) renderResult(); else show('home');
}
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  if (!$('break').hidden && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); return $('bGo').click(); }
  if ($('quiz').hidden) return;
  const it = App.session.queue[App.session.i];
  if (it.result) { if (e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); next(); } return; }
  if (it.phase === 'recall' && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); return showOptions(); }
  if (it.phase === 'conf') { const c = { 1: 'sure', 2: 'unsure', 3: 'guess' }[e.key]; if (c) { e.preventDefault(); finish(it.picked, c); } return; }
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
  $('bWins').innerHTML = `<h2>Block done: ${right} of ${ids.length} right</h2><p class="muted">${gains || 'Every attempt strengthens memory, right or wrong.'}</p>`;
  show('break');
  Break.timers.forEach(clearInterval); Break.timers = [];
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
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
  const hasMarks = App.subjects.some(s => s.marks);
  let rows = '', part = null;
  App.subjects.forEach(s => {
    if (s.part && s.part !== part) { part = s.part; rows += `<tr class="part"><td colspan="${hasMarks ? 7 : 6}">Part ${esc(part)}</td></tr>`; }
    const o = summary(App.questions.filter(q => q.code === s.code));
    const str_ = o.total ? Math.round(100 * o.strong / o.total) : 0;
    rows += `<tr><td>${esc(s.name)}</td>${hasMarks ? `<td>${s.marks || '–'}</td>` : ''}<td>${o.total || '–'}</td>
      <td>${o.total ? o.seen : '–'}</td>
      <td>${o.total ? `${o.strong}<span class="meter"><i style="width:${str_}%"></i></span>` : '–'}</td>
      <td>${o.acc === null ? '–' : o.acc + '%'}</td><td>${o.due || '–'}</td></tr>`;
  });
  $('pTable').innerHTML = `<thead><tr><th>Subject</th>${hasMarks ? '<th>Marks</th>' : ''}<th>In bank</th><th>Seen</th><th>Strong</th><th>Accuracy</th><th>Due</th></tr></thead><tbody>${rows}</tbody>`;
}

/* ---------- revision notes ---------- */
const NOTE_LABELS = { keyDifference: 'Key difference', points: 'Points', memoryTrick: 'Memory trick', examTrap: 'Exam trap', related: 'Related' };
const NOTE_SKIP = new Set(['id', 'subject', 'code', 'topic', 'title', 'added']);
const labelOf = k => NOTE_LABELS[k] || k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());
function renderNotes() {
  const codes = [...new Set(App.notes.map(n => n.code))];
  const sel = $('notesFilter'), keep = sel.value;
  const name = c => (App.subjects.find(s => s.code === c) || { name: c }).name;
  sel.innerHTML = `<option value="">All subjects (${App.notes.length})</option>` +
    codes.map(c => `<option value="${esc(c)}">${esc(name(c))} (${App.notes.filter(n => n.code === c).length})</option>`).join('');
  sel.value = codes.includes(keep) ? keep : '';
  const list = App.notes.filter(n => !sel.value || n.code === sel.value).sort((a, b) => (a.topic || '').localeCompare(b.topic || ''));
  $('notesList').innerHTML = list.length ? list.map(n => {
    const ordered = [...NOTE_FIELDS, ...Object.keys(n).filter(k => !NOTE_FIELDS.includes(k))];
    const rows = ordered.filter(k => !NOTE_SKIP.has(k) && n[k] && (Array.isArray(n[k]) ? n[k].length : true)).map(k => `
      <div class="${/trap/i.test(k) ? 'trap' : ''}"><dt>${esc(labelOf(k))}</dt><dd>${Array.isArray(n[k]) ? `<ul>${n[k].map(x => `<li>${rich(x)}</li>`).join('')}</ul>` : rich(n[k])}</dd></div>`).join('');
    return `<article class="note"><span class="mono muted">${esc(name(n.code))}${n.topic ? ' · ' + esc(n.topic) : ''}</span><h3>${rich(n.title)}</h3><dl>${rows}</dl></article>`;
  }).join('') : `<div class="empty">No revision notes yet. Add them from Home → Add questions or notes.</div>`;
}
$('notesFilter').addEventListener('change', renderNotes);

/* ---------- preps screen ---------- */
const TEMPLATES = { list: null };
async function loadTemplates() {
  if (TEMPLATES.list) return TEMPLATES.list;
  try { const r = await fetch('templates/index.json', { cache: 'no-store' }); TEMPLATES.list = r.ok ? await r.json() : []; }
  catch (e) { TEMPLATES.list = []; }
  return TEMPLATES.list;
}
function showPreps() { renderPreps(); show('preps'); }
function renderPreps() {
  const none = !App.preps.length;
  $('prepsTitle').textContent = none ? 'Welcome' : 'Your preps';
  $('prepsIntro').hidden = !none;
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
      <div class="btns">
        <button class="btn" type="button" data-act="export">Export (share with a friend)</button>
        <button class="btn" type="button" data-act="reset">Reset progress</button>
        <button class="btn danger" type="button" data-act="delete">Delete prep</button>
      </div><div id="prepConfirm"></div>`;
  }
  loadTemplates().then(list => {
    $('tplBox').hidden = !list.length;
    $('tplList').innerHTML = list.map((t, i) => `<button class="row topic" type="button" data-tpl="${i}">
      <span class="name">${esc(t.name)}<span class="meta">${esc(t.note || '')}</span></span><span class="n">Use</span></button>`).join('');
  });
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
$('tplList').addEventListener('click', async e => {
  const b = e.target.closest('[data-tpl]'); if (!b) return;
  const t = TEMPLATES.list[Number(b.dataset.tpl)];
  b.disabled = true;
  try {
    const r = await fetch('templates/' + t.file, { cache: 'no-store' });
    const parsed = parseImport(await r.text());
    const checked = checkImport(parsed, 'new');
    await createFromChecked(checked);
  } catch (err) { console.warn(err); toast('Could not load that template.'); b.disabled = false; }
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
  for (const code of [...(c.newSubjects || [])]) if (!subjects.some(x => x.code === code)) subjects.push({ code, name: code, marks: 0, part: '' });
  const writes = [{ path: Store.prepPath(pid), data: { name: s.name || 'My prep', examDate: s.examDate || '', marking: s.marking || null, subjects, created: Date.now(), resetAt: 0 } }];
  const qBy = {}, nBy = {};
  (c.questions || []).forEach(q => { (qBy[q.subject] = qBy[q.subject] || {})[q.id] = q; });
  (c.notes || []).forEach(n => { (nBy[n.subject] = nBy[n.subject] || {})[n.id] = n; });
  writes.push(...chunkWrites(`${Store.prepPath(pid)}/bank`, 'q', qBy, []), ...chunkWrites(`${Store.prepPath(pid)}/notes`, 'n', nBy, []));
  App.wantPrep = pid;
  await Store.write(writes);
  if (App.preps.some(p => p.id === pid) && App.prepId !== pid) { App.wantPrep = null; openPrep(pid); }
  toast(`Created "${s.name || 'My prep'}".`);
}
async function resetPrep(pid) {
  const base = Store.prepPath(pid), now = Date.now();
  const ids = await Store.ids(`${base}/progress`);
  Progress.wipeTo(now);
  await Store.write([{ path: base, data: { ...stripId(App.prep), resetAt: now } }, ...ids.map(id => ({ path: `${base}/progress/${id}`, data: null }))]);
  toast('Progress reset.'); show('home');
}
async function deletePrep(pid) {
  const base = Store.prepPath(pid), key = `rc-progress-${App.user.uid}-${pid}`;
  await Progress.discard();                 // finish or cancel any upload first, so nothing comes back
  closePrep();
  try { localStorage.removeItem(key); } catch (e) {}
  const writes = [];
  for (const col of ['bank', 'notes', 'progress']) (await Store.ids(`${base}/${col}`)).forEach(id => writes.push({ path: `${base}/${col}/${id}`, data: null }));
  writes.push({ path: base, data: null });
  await Store.write(writes);
  toast('Prep deleted.');
}
const stripId = p => { const o = { ...p }; delete o.id; return o; };
function exportPrep() {
  const p = App.prep;
  const data = { type: 'prep', name: p.name, examDate: p.examDate || '', marking: p.marking || null, subjects: App.subjects,
    questions: Object.values(App.bank), notes: Object.values(App.notesMap) };
  const slug = (p.name || 'prep').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'prep';
  download(`${slug}.json`, JSON.stringify(data, null, 2));
  toast('Downloaded. Your friend can add it with New prep → From a syllabus or prep file.');
}

/* ---------- import screen ---------- */
const KIND_LABEL = { mcq: 'MCQs', notes: 'Revision notes', syllabus: 'Syllabus', prep: 'Prep file' };
function openImport(target, kind) {
  App.imp = { target, kind, checked: null, back: visible('preps') ? 'preps' : 'home' };
  $('impText').value = ''; $('impFile').value = ''; msg('impMsg', '');
  renderImport(); show('import');
}
function renderImport() {
  const { target, kind } = App.imp;
  const kinds = target === 'new' ? ['syllabus', 'prep'] : ['mcq', 'notes', 'syllabus'];
  $('impTitle').textContent = target === 'new' ? 'New prep from a file' : `Add to ${App.prep ? App.prep.name : ''}`;
  $('impKinds').innerHTML = kinds.map(k => `<button class="chip" type="button" data-kind="${k}" aria-pressed="${k === kind}">${KIND_LABEL[k]}</button>`).join('');
  if (kind === 'prep') {
    $('impHelp').innerHTML = `<strong>Prep file</strong><p class="muted">A prep file is what <em>Export</em> makes on the Preps screen. Use it to copy a whole prep (syllabus, questions and notes) from a friend. Choose the file or paste its text below.</p>`;
  } else {
    const what = kind === 'syllabus' ? 'your syllabus' : 'your study notes';
    $('impHelp').innerHTML = `<strong>How to make this with any AI chat</strong>
      <ol class="steps">
        <li>Tap <strong>Copy AI prompt</strong>.</li>
        <li>Open ChatGPT, Claude or Gemini, paste the prompt, and attach or paste ${what} (PDF, photo or text; English or Hinglish is fine).</li>
        <li>Copy the JSON it replies with and paste it below, then tap <strong>Check</strong>.</li>
      </ol>
      <div class="btns"><button class="btn primary" type="button" id="copyPrompt">Copy AI prompt</button>
      <button class="btn" type="button" id="toggleSample">Show sample format</button></div>
      <pre class="sample" id="sampleBox" hidden>${esc(JSON.stringify(SAMPLES[kind], null, 2))}</pre>`;
    $('copyPrompt').onclick = () => copyText(promptFor(kind, App.prep ? App.prep.name : 'my exam', App.subjects), 'Prompt copied. Paste it into your AI chat.');
    $('toggleSample').onclick = () => { const b = $('sampleBox'); b.hidden = !b.hidden; $('toggleSample').textContent = b.hidden ? 'Show sample format' : 'Hide sample format'; };
  }
  renderPreview();
}
$('impKinds').addEventListener('click', e => {
  const b = e.target.closest('[data-kind]'); if (!b) return;
  App.imp.kind = b.dataset.kind; App.imp.checked = null; renderImport();
});
$('impBack').addEventListener('click', () => { if (App.imp.back === 'preps' || !App.prep) showPreps(); else show('home'); });
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
  const parsed = parseImport($('impText').value);
  if (parsed.error) { App.imp.checked = null; renderPreview(); return msg('impMsg', parsed.error, 'err'); }
  const allowed = App.imp.target === 'new' ? ['syllabus', 'prep'] : ['mcq', 'notes', 'syllabus'];
  if (!allowed.includes(parsed.kind)) {
    App.imp.checked = null; renderPreview();
    return msg('impMsg', App.imp.target === 'new'
      ? `This is a ${KIND_LABEL[parsed.kind]} file. Create the prep first (from a syllabus or an empty prep), then add it from Home → Add questions or notes.`
      : 'This is a whole prep file. Add it from the Preps screen → From a syllabus or prep file.', 'err');
  }
  if (parsed.kind !== App.imp.kind) { App.imp.kind = parsed.kind; renderImport(); }
  App.imp.checked = checkImport(parsed, App.imp.target);
  msg('impMsg', '');
  renderPreview();
}

// Works out what an import would change, without saving anything
function checkImport(parsed, target) {
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
      const old = new Map(App.subjects.map(s => [s.code, s]));
      out.added = sy.syllabus.subjects.filter(s => !old.has(s.code));
      out.changed = sy.syllabus.subjects.filter(s => old.has(s.code) && JSON.stringify(old.get(s.code)) !== JSON.stringify(s));
    }
    return out;
  }
  if (parsed.kind === 'mcq') {
    const r = cleanQuestions(d.questions || [], subjects, today);
    let fresh = 0, updated = 0, same = 0;
    r.questions.forEach(q => {
      const old = App.bank[q.id];
      if (!old) fresh++;
      else if (JSON.stringify({ ...old, added: '' }) === JSON.stringify({ ...q, added: '' })) same++;
      else updated++;
    });
    return { kind: 'mcq', questions: r.questions, problems: r.problems, newSubjects: r.newSubjects, fresh, updated, same };
  }
  const r = cleanNotes(d.notes || [], subjects, today);
  let fresh = 0, updated = 0, same = 0;
  r.notes.forEach(n => { const old = App.notesMap[n.id]; if (!old) fresh++; else if (JSON.stringify({ ...old, added: '' }) === JSON.stringify({ ...n, added: '' })) same++; else updated++; });
  return { kind: 'notes', notes: r.notes, problems: r.problems, newSubjects: r.newSubjects, fresh, updated, same };
}

function renderPreview() {
  const box = $('impPreview'), c = App.imp && App.imp.checked;
  box.hidden = !c;
  if (!c) { box.innerHTML = ''; return; }
  const parts = [];
  let canAdd = false, addLabel = 'Add';
  if (c.kind === 'mcq' || c.kind === 'notes') {
    const word = c.kind === 'mcq' ? 'question' : 'note';
    parts.push(`<strong>${plural(c.fresh, 'new ' + word)}${c.updated ? `, ${c.updated} updated` : ''}${c.same ? `, ${c.same} already in the app` : ''}</strong>`);
    if (c.updated) parts.push(`<span class="muted">Updated ${word}s keep your progress.</span>`);
    canAdd = c.fresh + c.updated > 0; addLabel = `Add ${plural(c.fresh + c.updated, word)}`;
    if (c.kind === 'mcq') parts.push(c.questions.slice(0, 3).map(q => `<div class="qpreview"><span class="mono muted">${esc(q.subject)} · ${esc(q.topic)}</span><span>${esc(q.question)}</span><span class="muted">Answer: ${esc(q.answer)}</span></div>`).join(''));
    else parts.push(c.notes.slice(0, 3).map(n => `<div class="qpreview"><span class="mono muted">${esc(n.subject)}</span><span>${esc(n.title)}</span></div>`).join(''));
  } else {
    const s = c.syllabus;
    parts.push(`<strong>${esc(s.name || (App.imp.target === 'active' && App.prep ? App.prep.name : 'My prep'))}</strong><span class="muted">${s.examDate ? `Exam ${esc(s.examDate)}` : 'No exam date'}${s.marking ? ` · +${s.marking.correct} / ${s.marking.wrong} per question` : ''} · ${plural(s.subjects.length, 'subject')}</span>`);
    if (s.subjects.length) parts.push(`<ul>${s.subjects.map(x => `<li>${esc(x.code)} · ${esc(x.name)}${x.marks ? ` (${x.marks} marks)` : ''}</li>`).join('')}</ul>`);
    if (c.kind === 'prep') parts.push(`<span>${plural(c.questions.length, 'question')} and ${plural(c.notes.length, 'note')} included.</span>`);
    if (App.imp.target === 'new') { canAdd = true; addLabel = 'Create prep'; }
    else {
      canAdd = !!(c.added.length || c.changed.length || (s.examDate && s.examDate !== App.prep.examDate) || s.marking || (s.name && s.name !== App.prep.name));
      parts.push(`<span class="muted">${plural(c.added.length, 'new subject')}, ${c.changed.length} changed. Subjects not in this file are kept.</span>`);
      addLabel = 'Update syllabus';
    }
  }
  if (c.newSubjects && c.newSubjects.length) parts.push(`<span class="muted">New subject codes will be created: ${esc(c.newSubjects.join(', '))}. Import a syllabus later to give them full names.</span>`);
  if (c.problems.length) parts.push(`<strong class="msg err">${plural(c.problems.length, 'item')} will be skipped:</strong><ul class="bad">${c.problems.slice(0, 30).map(p => `<li>${esc(p)}</li>`).join('')}</ul>`);
  parts.push(canAdd ? `<div class="btns"><button class="btn primary" type="button" id="impAdd">${addLabel}</button></div>` : `<span class="muted">Nothing new to add.</span>`);
  box.innerHTML = parts.join('');
  const add = $('impAdd'); if (add) add.onclick = () => applyImport(add);
}

async function applyImport(btn) {
  const c = App.imp.checked;
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    if (App.imp.target === 'new') { await createFromChecked(c); return; }
    const base = Store.prepPath(App.prepId), writes = [];
    let subjects = App.subjects.map(s => ({ ...s }));
    const prepFields = {};
    if (c.kind === 'syllabus') {
      const s = c.syllabus;
      for (const ns of s.subjects) { const i = subjects.findIndex(x => x.code === ns.code); if (i >= 0) subjects[i] = ns; else subjects.push(ns); }
      if (s.name) prepFields.name = s.name;
      if (s.examDate) prepFields.examDate = s.examDate;
      if (s.marking) prepFields.marking = s.marking;
    }
    for (const code of c.newSubjects || []) if (!subjects.some(x => x.code === code)) subjects.push({ code, name: code, marks: 0, part: '' });
    if (JSON.stringify(subjects) !== JSON.stringify(App.subjects) || Object.keys(prepFields).length) {
      writes.push({ path: base, data: { ...stripId(App.prep), ...prepFields, subjects } });
    }
    if (c.kind === 'mcq' || c.kind === 'notes') {
      const isQ = c.kind === 'mcq', current = isQ ? App.bank : App.notesMap, items = isQ ? c.questions : c.notes;
      const by = {};
      items.forEach(it => {
        if (!by[it.subject]) { by[it.subject] = {}; Object.values(current).forEach(o => { if (o.subject === it.subject) by[it.subject][o.id] = o; }); }
        const old = current[it.id];
        by[it.subject][it.id] = old ? { ...it, added: old.added || it.added } : it;
      });
      writes.push(...chunkWrites(`${base}/${isQ ? 'bank' : 'notes'}`, isQ ? 'q' : 'n', by, isQ ? App.bankDocs : App.notesDocs));
    }
    await Store.write(writes);
    toast(c.kind === 'syllabus' ? 'Syllabus updated.' : `Added. ${c.kind === 'mcq' ? 'New questions join your next review.' : 'See them in Revision notes.'}`);
    show('home');
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
  return t;
}
function hourLabel(h) { return h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`; }
function renderSettings() {
  $('accEmail').textContent = App.user ? (App.user.email || 'Google account') : '';
  $('accVerified').innerHTML = !App.user ? '' : (!usesPassword() || App.user.emailVerified) ? '<span class="badge ok">verified</span>' : '<span class="badge warn">not verified yet</span>';
  $('profName').value = displayName();
  $('pwReset').hidden = !usesPassword();
  $('accConfirm').innerHTML = ''; msg('accMsg', ''); msg('profMsg', '');
  paintAvatars();
  const pf = prefs(), rm = Reminders.settings(), theme = applyTheme();
  $('optRecall').checked = pf.recall; $('optConf').checked = pf.confidence;
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
$('optRecall').addEventListener('change', () => savePrefs({ recall: $('optRecall').checked }));
$('optConf').addEventListener('change', () => savePrefs({ confidence: $('optConf').checked }));
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
$('signOut').addEventListener('click', () => App.fb && App.fb.auth.signOut());

/* ---------- navigation ---------- */
const MODES = {
  topic: openSubjectPicker,
  notes: () => { renderNotes(); show('notes'); },
  progress: () => { renderProgress(); show('progress'); },
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
  const u = App.user || {}, photo = App.profile.photo || u.photoURL;
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
function setAuthMode(m) {
  authMode = m;
  const up = m === 'signup';
  $('authTitle').textContent = up ? 'Create your account' : 'Sign in';
  $('loginBtn').textContent = up ? 'Create account' : 'Sign in';
  $('authToggle').textContent = up ? 'Already have an account? Sign in' : 'New here? Create an account';
  $('loginPass').autocomplete = up ? 'new-password' : 'current-password';
  $('nameRow').hidden = !up; $('confirmRow').hidden = !up; $('forgotBtn').hidden = up;
  $('loginName').required = up; $('loginPass2').required = up;
  msg('loginMsg', '');
}
function authError(e) {
  const c = (e && e.code) || '';
  if (/invalid-credential|wrong-password|user-not-found|invalid-login/.test(c)) return 'Wrong email or password.';
  if (/email-already-in-use/.test(c)) return 'This email already has an account. Sign in instead.';
  if (/weak-password/.test(c)) return 'Use a password of at least 6 characters.';
  if (/invalid-email/.test(c)) return 'That email address does not look right.';
  if (/operation-not-allowed|configuration-not-found/.test(c)) return 'This sign-in method is not turned on in Firebase yet.';
  if (/unauthorized-domain/.test(c)) return 'This website is not on the Firebase "Authorized domains" list yet.';
  if (/requires-recent-login/.test(c)) return 'For safety, sign out and sign in again, then try once more.';
  if (/network/.test(c)) return 'No internet connection.';
  if (/popup-closed|cancelled-popup/.test(c)) return '';
  if (/too-many-requests/.test(c)) return 'Too many tries. Wait a few minutes.';
  return 'Something went wrong. Try again.';
}
$('authToggle').addEventListener('click', () => setAuthMode(authMode === 'signin' ? 'signup' : 'signin'));
document.addEventListener('click', e => {
  const b = e.target.closest('.pwtoggle'); if (!b) return;
  const inp = $(b.dataset.pw), show = inp.type === 'password';
  inp.type = show ? 'text' : 'password'; b.textContent = show ? 'Hide' : 'Show';
  b.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
});
$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const email = $('loginEmail').value.trim(), pass = $('loginPass').value;
  msg('loginMsg', '');
  if (authMode === 'signup') {
    const name = $('loginName').value.trim();
    if (!name) return msg('loginMsg', 'Please enter your name.', 'err');
    if (pass.length < 6) return msg('loginMsg', 'Use a password of at least 6 characters.', 'err');
    if (pass !== $('loginPass2').value) return msg('loginMsg', 'The two passwords do not match.', 'err');
    App.pendingName = name;
  }
  $('loginBtn').disabled = true;
  try {
    if (authMode === 'signin') await App.fb.auth.signInWithEmailAndPassword(email, pass);
    else {
      const cred = await App.fb.auth.createUserWithEmailAndPassword(email, pass);
      const u = cred.user || App.fb.auth.currentUser;
      try { await u.updateProfile({ displayName: App.pendingName }); } catch (err) {}
      try { await u.sendEmailVerification(); } catch (err) {}
    }
  } catch (err) { msg('loginMsg', authError(err), 'err'); }
  $('loginBtn').disabled = false;
});
$('forgotBtn').addEventListener('click', async () => {
  const email = $('loginEmail').value.trim();
  if (!email) return msg('loginMsg', 'Type your email above first.', 'err');
  try { await App.fb.auth.sendPasswordResetEmail(email); msg('loginMsg', `If an account exists for ${email}, a reset link is on its way (check spam too). No email after a few minutes? You may not have an account yet. Tap "New here? Create an account".`, 'ok'); }
  catch (err) { msg('loginMsg', authError(err), 'err'); }
});
$('googleBtn').addEventListener('click', async () => {
  const provider = new firebase.auth.GoogleAuthProvider();
  try { await App.fb.auth.signInWithPopup(provider); }
  catch (err) {
    if (/popup-blocked|operation-not-supported/.test(err.code || '')) { try { await App.fb.auth.signInWithRedirect(provider); return; } catch (e2) { err = e2; } }
    const m = authError(err); if (m) msg('loginMsg', m, 'err');
  }
});

// profile: name and photo
$('avatarBtn').addEventListener('click', () => MODES.settings());
$('profSave').addEventListener('click', async () => {
  const name = $('profName').value.trim();
  if (!name) return msg('profMsg', 'Name cannot be empty.', 'err');
  try {
    await Store.setProfile({ name }); App.profile.name = name;
    try { await App.fb.auth.currentUser.updateProfile({ displayName: name }); } catch (e) {}
    paintAvatars(); msg('profMsg', 'Saved.', 'ok');
  } catch (e) { msg('profMsg', 'Could not save. Check your internet.', 'err'); }
});
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
    paintAvatars(); msg('profMsg', 'Photo updated.', 'ok');
  } catch (e) { msg('profMsg', e.message === 'image' ? 'Could not read that photo. Try another one.' : 'Could not save. Check your internet.', 'err'); }
});
$('photoRemove').addEventListener('click', async () => {
  try { await Store.setProfile({ photo: '' }); App.profile.photo = ''; paintAvatars(); msg('profMsg', 'Photo removed.', 'ok'); }
  catch (e) { msg('profMsg', 'Could not save. Check your internet.', 'err'); }
});
$('pwReset').addEventListener('click', async () => {
  try { await App.fb.auth.sendPasswordResetEmail(App.user.email); msg('accMsg', `We emailed a link to ${App.user.email} to set a new password.`, 'ok'); }
  catch (e) { msg('accMsg', authError(e), 'err'); }
});
// delete account: all preps, questions, progress, profile, then the login itself
$('accDelete').addEventListener('click', () => {
  $('accConfirm').innerHTML = `<div class="confirm"><span>Delete your account and <strong>everything</strong> in it: all preps, questions, notes and progress? This cannot be undone.</span>
    <div class="btns"><button class="btn danger" type="button" id="accDeleteYes">Yes, delete everything</button><button class="btn" type="button" id="accDeleteNo">Cancel</button></div></div>`;
  $('accDeleteNo').onclick = () => { $('accConfirm').innerHTML = ''; };
  $('accDeleteYes').onclick = async () => {
    $('accDeleteYes').disabled = true; msg('accMsg', 'Deleting…');
    try {
      await Progress.discard(); closePrep();
      if (App.prepsUnsub) { try { App.prepsUnsub(); } catch (e) {} App.prepsUnsub = null; }
      const writes = [];
      for (const pid of await Store.ids(`${Store.base()}/preps`)) {
        const base = Store.prepPath(pid);
        for (const col of ['bank', 'notes', 'progress']) (await Store.ids(`${base}/${col}`)).forEach(id => writes.push({ path: `${base}/${col}/${id}`, data: null }));
        writes.push({ path: base, data: null });
      }
      (await Store.ids(`${Store.base()}/devices`)).forEach(id => writes.push({ path: `${Store.base()}/devices/${id}`, data: null }));
      writes.push({ path: Store.base(), data: null });
      await Store.write(writes);
      try { Object.keys(localStorage).filter(k => k.startsWith('rc-')).forEach(k => localStorage.removeItem(k)); } catch (e) {}
      await App.fb.auth.currentUser.delete();
      toast('Your account was deleted.');
    } catch (e) {
      console.warn(e);
      msg('accMsg', authError(e), 'err');
      $('accDeleteYes') && ($('accDeleteYes').disabled = false);
    }
  };
});

/* ---------- start ---------- */
(async function init() {
  applyTheme();
  if (NATIVE) { $('googleBtn').hidden = true; $('orLine').hidden = true; }
  else if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  const cfg = window.APP_CONFIG && window.APP_CONFIG.firebase;
  if (!cfg) { $('bootMsg').innerHTML = 'Setup is not finished: <code>config.js</code> has no Firebase settings yet. See README.md, step A5.'; return; }
  try { App.fb = await firebaseStart(cfg); }
  catch (e) { $('bootMsg').textContent = 'Could not start. Check your internet connection and reload the page.'; return; }
  Store.fs = App.fb.fs;
  App.fb.auth.onAuthStateChanged(async user => {
    if (App.prepsUnsub) { try { App.prepsUnsub(); } catch (e) {} App.prepsUnsub = null; }
    closePrep();
    App.user = user; App.preps = []; App.prepsLoaded = false; App.profile = {};
    updatePrepButton(); setSync(); paintAvatars();
    if (!user) { setAuthMode('signin'); show('login'); return; }
    Store.uid = user.uid;
    $('bootMsg').textContent = 'Loading your preps…'; show('boot');
    try { App.profile = await Store.getProfile(); } catch (e) { App.profile = {}; }
    if (!App.profile.email || (App.pendingName && !App.profile.name)) {
      const first = { email: user.email || '', created: App.profile.created || Date.now() };
      if (App.pendingName || user.displayName) first.name = App.profile.name || App.pendingName || user.displayName;
      Object.assign(App.profile, first);
      Store.setProfile(first).catch(() => {});
    }
    App.pendingName = null;
    paintAvatars();
    App.prepsUnsub = Store.watchPreps(onPreps, e => { console.warn(e); setSync('offline'); });
    Reminders.refreshSoon(4000);
  });
})();
