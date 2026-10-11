/* =====================================================================
   LIVE GROUP TEST: up to 5 friends answer the same questions at the same
   time, each in their own order with their own option order. A live race
   bar and small pop-ups make it fun; the results show a podium and the
   "trap" questions most people got wrong. Every test is saved to your
   history (charts, head-to-head, badges). Answers to questions that are
   also in your own prep count toward your revision priority.
   Database:
     rooms/{rid}                 { host, invited:[uids], title, subjectName, topicName, n, secs, status, startAt, endAt, qs:[…] }
     rooms/{rid}/players/{uid}   { joinedAt, answered, correct, streak, best, finishedAt, timeMs, answers:{ i: { p, ok, ms } } }
     users/{uid}/tests/{rid}     your saved result (history)
   ===================================================================== */
const ROOM_MAX = 5, LT_SIZES = [10, 20, 30], LT_MINUTES = [5, 10, 15, 20];
const LT = { rid: null, view: null, room: null, players: {}, unsubs: [], tick: null, k: 0, picked: null, pops: [], popBusy: false, prev: {}, saved: false, setup: null, view: null, adv: null, shownAt: 0 };

/* ---------- seeded shuffles: the same for you on every device, different for each person ---------- */
function seedOf(s) { let h = 1779033703 ^ s.length; for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } return h >>> 0; }
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function seededShuffle(list, seed) { const a = [...list], r = rng(seed); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const myOrder = room => seededShuffle(room.qs.map((_, i) => i), seedOf(LT.rid + '|' + meUid()));
const myOptions = (room, i) => seededShuffle(room.qs[i].options, seedOf(LT.rid + '|' + meUid() + '|' + i));

/* ---------- who is who ---------- */
const ltName = uid => uid === meUid() ? 'You' : (Social.people[uid] ? (Social.people[uid].first || fullName(Social.people[uid])) : 'Someone');
const ltPerson = uid => uid === meUid() ? mePerson() : (Social.people[uid] || { uid, username: '' });
const joined = () => Object.values(LT.players).filter(p => p.joinedAt).sort((a, b) => a.joinedAt - b.joinedAt);
const roomOver = () => { const r = LT.room; if (!r) return false; if (r.status === 'done' || r.status === 'cancelled') return true; if (r.status !== 'live') return false; const J = joined(); return Date.now() >= r.endAt || (J.length && J.every(p => p.finishedAt)); };
function ranking() {
  const r = LT.room;
  return joined().map(p => ({ ...p, timeMs: p.timeMs || (p.finishedAt ? p.finishedAt - r.startAt : (Math.min(Date.now(), r.endAt) - r.startAt)) }))
    .sort((a, b) => (b.correct || 0) - (a.correct || 0) || a.timeMs - b.timeMs);
}
const mmss = ms => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/* ---------- 1. create a test (host) ---------- */
MODES.livetest = (withUid) => openLtSetup(withUid);
function openLtSetup(withUid) {
  if (!App.prep || !App.questions.length) { toast('Add some MCQs to your prep first. The test uses your questions.'); return; }
  const friends = Social.list.filter(f => f.status === 'accepted').map(otherOf);
  LT.setup = { friends: new Set(withUid ? [withUid] : []), subject: '', topic: '', n: 10, min: 10 };
  leaveRoom(); LT.view = 'setup'; renderLtSetup(friends); show('room');
}
function renderLtSetup(friends = Social.list.filter(f => f.status === 'accepted').map(otherOf)) {
  const S = LT.setup, subs = App.subjects.filter(x => App.questions.some(q => q.code === x.code));
  const groups = S.subject ? shareGroups('mcq', S.subject) : [];
  const pool = S.subject ? (groups.find(g => g.key === S.topic) || { items: groups.flatMap(g => g.items) }).items : App.questions;
  $('roomView').innerHTML = `<div class="head-row"><h2>New live test</h2><button class="btn ghost" type="button" data-ltback>${icon('back')}Back</button></div>
    <div class="lt-setup">
      <section class="card form"><h3>1. Who plays? <span class="muted small">up to ${ROOM_MAX - 1} friends</span></h3>
        ${friends.length ? `<div class="lt-friends">${friends.map(u => { const p = Social.people[u] || { uid: u }; const on = S.friends.has(u);
          return `<button type="button" class="lt-friend${on ? ' on' : ''}" data-ltfriend="${esc(u)}" aria-pressed="${on}">${pAvatar(p)}<span>${esc(p.first || fullName(p) || '@' + (p.username || ''))}</span><i>${on ? '✓' : '+'}</i></button>`; }).join('')}</div>`
          : `<p class="muted">Add friends first (chat button at the top). You can still try a solo test.</p>`}
      </section>
      <section class="card form"><h3>2. Which questions?</h3>
        <label for="ltSubject">Subject</label>
        <select id="ltSubject"><option value="">Mixed: all subjects (${App.questions.length})</option>${subs.map(x => `<option value="${esc(x.code)}"${x.code === S.subject ? ' selected' : ''}>${esc(x.name)} (${App.questions.filter(q => q.code === x.code).length})</option>`).join('')}</select>
        ${S.subject ? `<label for="ltTopic">Topic</label><select id="ltTopic"><option value="">All topics</option>${groups.map(g => `<option value="${esc(g.key)}"${g.key === S.topic ? ' selected' : ''}>${esc(g.name)} (${g.items.length})</option>`).join('')}</select>` : ''}
        <label>How many questions</label><div class="seg seg3" role="group">${LT_SIZES.map(n => `<button type="button" data-ltn="${n}" aria-pressed="${S.n === n}"${pool.length < 1 ? ' disabled' : ''}>${n}</button>`).join('')}</div>
        <label>Time for the whole test</label><div class="seg lt-seg4" role="group">${LT_MINUTES.map(m => `<button type="button" data-ltmin="${m}" aria-pressed="${S.min === m}">${m} min</button>`).join('')}</div>
        <p class="muted small">${pool.length < S.n ? `Only ${pool.length} questions here, so the test has ${pool.length}.` : `${S.n} questions picked at random from ${pool.length}.`} Everyone gets the same questions, each in a different order with shuffled options.</p>
      </section>
      <div class="btns"><button class="btn primary big" type="button" data-ltcreate ${pool.length ? '' : 'disabled'}>${S.friends.size ? `Invite ${S.friends.size === 1 ? ltName([...S.friends][0]) : plural(S.friends.size, 'friend')}` : 'Start a solo test'}</button></div>
    </div>`;
  const sel = $('ltSubject'); sel.onchange = () => { S.subject = sel.value; S.topic = ''; renderLtSetup(); };
  const tp = $('ltTopic'); if (tp) tp.onchange = () => { S.topic = tp.value; renderLtSetup(); };
}
async function createRoom() {
  const S = LT.setup, me = meUid();
  const groups = S.subject ? shareGroups('mcq', S.subject) : [], g = groups.find(x => x.key === S.topic);
  const pool = S.subject ? (g ? g.items : groups.flatMap(x => x.items)) : App.questions;
  const picks = shuffle(pool).slice(0, S.n);
  const qs = picks.map(q => ({ id: q.id, question: q.question, options: q.options, answer: q.answer, explanation: q.explanation || '', hint: q.hint || '', trap: q.trap || '', topic: q.topic || '', subtopic: q.subtopic || '' }));
  const sub = App.subjects.find(x => x.code === S.subject);
  const room = { host: me, invited: [me, ...S.friends].slice(0, ROOM_MAX), title: sub ? sub.name : `Mixed: ${App.prep.name}`, subjectName: sub ? sub.name : 'Mixed', topicName: g ? g.name : '',
    n: qs.length, secs: S.min * 60, status: 'lobby', created: Date.now(), startAt: 0, endAt: 0, qs };
  const ref = Store.fs.collection('rooms').doc();
  await ref.set(room);
  await Store.fs.doc(`rooms/${ref.id}/players/${me}`).set(blankPlayer());
  // the invite reaches friends through the Tests tab (live), and as a notification when their app is closed
  for (const u of S.friends) Push.send(u, 'test', { title: '🏁 Live test invite', body: `${displayName()} invites you: ${room.title} · ${room.n} questions`, where: '#room=' + ref.id, tag: 'room-' + ref.id, room: ref.id });
  Activity.log('test_hosted', { title: room.title, n: room.n, with: [...S.friends].map(u => '@' + ((Social.people[u] || {}).username || '')).join(', ') || 'solo' });
  openRoom(ref.id);
}
const blankPlayer = () => ({ uid: meUid(), joinedAt: Date.now(), answered: 0, correct: 0, streak: 0, best: 0, finishedAt: 0, timeMs: 0, answers: {} });

/* ---------- 2. the room: lobby → live → results ---------- */
function openRoom(rid) {
  leaveRoom();
  Object.assign(LT, { rid, room: null, players: {}, k: 0, picked: null, prev: {}, saved: false, pops: [], view: 'room' });
  $('roomView').innerHTML = '<p class="muted center">Opening the test…</p>'; show('room');
  LT.unsubs.push(Store.watchDoc(`rooms/${rid}`, r => {
    if (!r || !r.qs) { $('roomView').innerHTML = '<div class="empty-state"><strong>This test is not available</strong><p>It may have been cancelled.</p></div>'; return; }
    const was = LT.room && LT.room.status; LT.room = r; renderRoom(was !== r.status);
  }));
  LT.unsubs.push(Store.fs.collection(`rooms/${rid}/players`).onSnapshot(s => {
    const next = {}; s.docs.forEach(d => { next[d.id] = { uid: d.id, ...(d.data() || {}) }; });
    if (LT.room && LT.room.status === 'live') popEvents(LT.players, next);
    if (LT.room && LT.room.status === 'lobby' && Object.keys(next).length > Object.keys(LT.players).length && Object.keys(LT.players).length) Sound.play('join');
    LT.players = next; Object.keys(next).forEach(u => { if (u !== meUid()) { watchPerson(u); loadPerson(u); } });
    renderRoom(false);
  }, e => console.warn('players', e)));
  clearInterval(LT.tick); LT.tick = setInterval(onTick, 1000);
}
function leaveRoom() { ltFocus(false); LT.unsubs.forEach(u => { try { u(); } catch (e) {} }); LT.unsubs = []; clearInterval(LT.tick); LT.tick = null; clearTimeout(LT.adv); LT.rid = null; }
function onTick() {
  if (!visible('room') || !LT.room) return;
  const r = LT.room;
  if (r.status === 'lobby') return;
  if (r.status === 'live' && LT.view === 'countdown') {
    const g = $('ltGo'), left = r.startAt - Date.now();
    if (left > 0) { const n = Math.ceil(left / 1000); if (g && g.textContent !== String(n)) { g.textContent = n; Sound.play('tick'); } return; }
    Sound.play('go'); return renderRoom(true);
  }
  if (r.status === 'live') {
    const t = $('ltClock'); if (t) { const left = r.endAt - Date.now(); t.textContent = mmss(left); t.classList.toggle('low', left < 60e3); }
    const me = LT.players[meUid()];
    if (me && !me.finishedAt && Date.now() >= r.endAt) finishMine();                 // time is up
    if (roomOver() && LT.view !== 'results') { if (r.host === meUid()) Store.fs.doc(`rooms/${LT.rid}`).set({ status: 'done' }, { merge: true }).catch(() => {}); renderRoom(true); }
  }
}
// the tab bar hides only while you answer (countdown and questions), like the normal question screen
function ltFocus(on) { document.body.classList.toggle('lt-focus', !!on); Focus.wanted = !!on; if (on) Focus.start(); else Focus.stop(); }
function renderRoom(full) {
  const r = LT.room; if (!r || !visible('room')) return;
  ltFocus(r.status === 'live' && !roomOver() && LT.players[meUid()] && !LT.players[meUid()].finishedAt);
  if (r.status === 'cancelled') { $('roomView').innerHTML = `<div class="empty-state"><strong>This test was cancelled</strong></div><div class="btns"><button class="btn" type="button" data-ltback>Back</button></div>`; return; }
  if (r.status === 'lobby') return renderLobby();
  const me = LT.players[meUid()];
  if (roomOver()) { LT.view = 'results'; return renderResults(); }
  if (!me) { $('roomView').innerHTML = `<div class="empty-state"><strong>This test has already started</strong><p>You can see the results when it ends.</p></div><div class="btns"><button class="btn" type="button" data-ltback>Back</button></div>`; return; }
  if (me.finishedAt) { LT.view = 'wait'; return renderWait(); }
  if (Date.now() < r.startAt) { LT.view = 'countdown'; $('roomView').innerHTML = `<div class="lt-count-big"><p>Get ready…</p><span id="ltGo">${Math.ceil((r.startAt - Date.now()) / 1000)}</span><p class="muted">${plural(r.n, 'question')} · ${Math.round(r.secs / 60)} min · ${joined().length} players</p></div>`; return; }
  const wasLive = LT.view === 'live'; LT.view = 'live';
  if (full || !wasLive || !$('ltQ')) renderLive(); else paintRace();
}
function renderLobby() {
  const r = LT.room, me = meUid(), host = r.host === me, J = new Set(joined().map(p => p.uid));
  $('roomView').innerHTML = `<div class="lt-lobby">
    <div class="lt-hero"><span class="lt-flag">🏁</span><h2>${esc(r.title)}</h2><p>${r.topicName ? esc(r.topicName) + ' · ' : ''}${plural(r.n, 'question')} · ${Math.round(r.secs / 60)} min</p></div>
    <section class="card"><h3>Players <span class="muted small">${J.size} of ${r.invited.length} here</span></h3>
      <div class="lt-players">${r.invited.map(u => `<div class="lt-p${J.has(u) ? ' in' : ''}">${pAvatar(ltPerson(u), 'lt-av')}<b>${esc(ltName(u))}${u === r.host ? ' <small>host</small>' : ''}</b><small>${J.has(u) ? 'Ready ✓' : 'Not here yet…'}</small></div>`).join('')}</div></section>
    ${J.has(me) ? '' : `<div class="btns"><button class="btn primary big" type="button" data-ltjoin>Join the test</button></div>`}
    ${host ? `<div class="btns"><button class="btn primary big" type="button" data-ltstart ${J.size ? '' : 'disabled'}>${J.size > 1 ? `Start for ${J.size} players` : 'Start (just you)'}</button><button class="btn ghost" type="button" data-ltcancel>Cancel test</button></div>
      <p class="muted small center">Start when your friends are here. Everyone gets the same questions in their own order.</p>`
      : J.has(me) ? `<p class="muted center lt-wait"><span class="dots"><i></i><i></i><i></i></span> Waiting for ${esc(ltName(r.host))} to start…</p>` : ''}
    <div class="btns"><button class="btn ghost" type="button" data-ltback>Leave</button></div></div>`;
}
function myQIndex() { const r = LT.room, me = LT.players[meUid()] || {}; const order = myOrder(r); return order.find(i => !(me.answers || {})[i]); }
function renderLive() {
  const r = LT.room, me = LT.players[meUid()], i = myQIndex();
  if (i === undefined) return finishMine();
  const q = r.qs[i], opts = myOptions(r, i), num = (me.answered || 0) + 1;
  LT.picked = null; LT.shownAt = Date.now();
  $('roomView').innerHTML = `<div class="lt-live">
    <div class="lt-top"><span class="lt-count">${num} / ${r.n}</span><span class="lt-clock" id="ltClock">${mmss(r.endAt - Date.now())}</span></div>
    <div class="lt-race" id="ltRace"></div>
    <article class="card lt-q" id="ltQ">
      <p class="lt-meta">${esc(q.topic || r.subjectName)}</p>
      <h3>${rich(q.question)}</h3>
      <div class="lt-opts">${opts.map((o, k) => `<button type="button" class="lt-opt" data-ltpick="${k}"><span class="lt-key">${'ABCDEF'[k]}</span><span>${rich(o)}</span></button>`).join('')}</div>
      <div class="lt-fb" id="ltFb"></div>
    </article></div>`;
  LT.opts = opts; LT.qi = i;
  paintRace();
}
function paintRace() {
  const box = $('ltRace'); if (!box || !LT.room) return;
  const r = LT.room, R = ranking(), lead = R[0];
  box.innerHTML = joined().map(p => {
    const pct = Math.round(100 * (p.answered || 0) / r.n), isMe = p.uid === meUid();
    return `<div class="lt-lane${isMe ? ' me' : ''}"><span class="lt-who">${esc(ltName(p.uid))}${lead && lead.uid === p.uid && (p.correct || 0) > 0 ? ' 👑' : ''}</span>
      <span class="lt-track"><i style="width:${pct}%"></i><span class="lt-runner" style="left:${pct}%">${pAvatar(ltPerson(p.uid), 'lt-mini')}</span></span>
      <span class="lt-score">${p.correct || 0}${p.finishedAt ? ' 🏁' : ''}</span></div>`;
  }).join('');
}
async function pickAnswer(k) {
  if (LT.picked !== null || !LT.room) return;
  const r = LT.room, i = LT.qi, q = r.qs[i], pick = LT.opts[k], ok = pick === q.answer, me = { ...LT.players[meUid()] };
  LT.picked = k;
  document.querySelectorAll('#ltQ .lt-opt').forEach((b, j) => { b.disabled = true; if (LT.opts[j] === q.answer) b.classList.add('right'); else if (j === k) b.classList.add('wrong'); });
  const streak = ok ? (me.streak || 0) + 1 : 0;
  $('ltFb').innerHTML = ok ? `<b class="good">✓ Right!</b>${streak >= 3 ? ` <span>🔥 ${streak} in a row</span>` : ''}` : `<b class="bad">✗ It's “${esc(q.answer)}”.</b>${q.explanation ? ` <span>${rich(q.explanation)}</span>` : ''}`;
  Sound.play(ok ? (streak >= 3 && streak % 1 === 0 && [3, 5, 8].includes(streak) ? 'streak' : 'right') : 'wrong');
  if (navigator.vibrate && prefs().haptics !== false) try { navigator.vibrate(ok ? 15 : [30, 40, 30]); } catch (e) {}
  const answers = { ...(me.answers || {}), [i]: { p: pick, ok, ms: Date.now() - LT.shownAt } };
  const next = { ...me, answers, answered: Object.keys(answers).length, correct: (me.correct || 0) + (ok ? 1 : 0), streak, best: Math.max(me.best || 0, streak) };
  if (next.answered >= r.n) { next.finishedAt = Date.now(); next.timeMs = next.finishedAt - r.startAt; setTimeout(() => Sound.play('finish'), 400); }
  LT.players[meUid()] = next;
  if (streak === 3 || streak === 5 || streak === 8) pop(`🔥 ${streak} in a row! You're on fire`);
  Store.fs.doc(`rooms/${LT.rid}/players/${meUid()}`).set(next).catch(e => { console.warn(e); toast('Connection problem. Your answers are saved when you are back online.'); });
  countForRevision(q, ok);
  paintRace();
  clearTimeout(LT.adv);
  LT.adv = setTimeout(() => { if (LT.view === 'live' && visible('room')) renderRoom(true); }, ok ? 900 : 2200);
}
// a question that is also in your prep: this answer moves it up or down in your revision
function countForRevision(q, ok) {
  if (!App.prep) return;
  const key = norm(q.question), mine = App.bank[q.id] && App.questions.find(x => x.id === q.id) || App.questions.find(x => norm(x.question) === key);
  if (mine) try { Progress.record(mine, ok ? 'correct' : 'wrong', false); } catch (e) {}
}
function finishMine() {
  const r = LT.room, me = LT.players[meUid()]; if (!me || me.finishedAt) return;
  const next = { ...me, finishedAt: Date.now(), timeMs: Math.min(Date.now(), r.endAt) - r.startAt };
  LT.players[meUid()] = next;
  Store.fs.doc(`rooms/${LT.rid}/players/${meUid()}`).set(next).catch(() => {});
  Sound.play('finish'); renderRoom(true);
}
function renderWait() {
  const r = LT.room, me = LT.players[meUid()], left = joined().filter(p => !p.finishedAt);
  $('roomView').innerHTML = `<div class="lt-live">
    <div class="lt-top"><span class="lt-count">Done!</span><span class="lt-clock" id="ltClock">${mmss(r.endAt - Date.now())}</span></div>
    <div class="card lt-done"><span class="lt-big">${me.correct || 0}<small>/${r.n}</small></span><p>You finished in ${mmss(me.timeMs)}.</p>
      <p class="muted"><span class="dots"><i></i><i></i><i></i></span> Waiting for ${left.map(p => esc(ltName(p.uid))).join(', ') || 'the others'}…</p></div>
    <div class="lt-race" id="ltRace"></div></div>`;
  paintRace();
}

/* ---------- pop-ups: friendly, short, never blocking ---------- */
function pop(text) { LT.pops.push({ text, at: Date.now() }); if (LT.pops.length > 3) LT.pops.shift(); if (!LT.popBusy) nextPop(); }
function nextPop() {
  const el = $('ltPop');
  let t = LT.pops.shift(); while (t && Date.now() - t.at > 4000) t = LT.pops.shift();   // old news is dropped
  if (!t || !el || !visible('room')) { LT.popBusy = false; return; }
  t = t.text;
  LT.popBusy = true;
  el.innerHTML = `<span>${esc(t)}</span>`; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  setTimeout(() => { el.classList.remove('show'); setTimeout(nextPop, 400); }, 2600);
}
function popEvents(before, after) {
  const me = meUid(), r = LT.room;
  const score = P => Object.values(P).filter(p => p.joinedAt).sort((a, b) => (b.correct || 0) - (a.correct || 0) || (a.answered || 0) - (b.answered || 0));
  for (const p of Object.values(after)) {
    if (p.uid === me) continue;
    const b = before[p.uid] || {};
    if (p.finishedAt && !b.finishedAt) pop(`🏁 ${ltName(p.uid)} finished: ${p.correct || 0}/${r.n}`);
    else if ((p.streak || 0) >= 4 && (b.streak || 0) < 4) pop(`😮 ${ltName(p.uid)} has ${p.streak} in a row!`);
  }
  const mine = after[me] || {}, mineBefore = before[me] || {};
  const leader = P => { const S = score(P); return S[0] && (S[0].correct || 0) > ((S[1] || {}).correct || 0) ? S[0] : null; };   // a tie has no leader
  const lead0 = leader(before), lead1 = leader(after);
  if (lead1 && (!lead0 || lead1.uid !== lead0.uid) && (lead1.correct || 0) > 0) pop(lead1.uid === me ? '🥇 You took the lead!' : `👀 ${ltName(lead1.uid)} just took the lead`);
  for (const p of Object.values(after)) {
    if (p.uid === me || !p.joinedAt) continue;
    const b = before[p.uid] || {};
    if ((mine.answered || 0) > (p.answered || 0) + 2 && (mineBefore.answered || 0) <= (b.answered || 0) + 2) pop(`⚡ You're faster than ${ltName(p.uid)}!`);
    if ((mine.correct || 0) === (p.correct || 0) && (mine.correct || 0) >= 3 && ((b.correct || 0) !== (mineBefore.correct || 0))) pop(`😬 Close race: you and ${ltName(p.uid)} both on ${mine.correct}`);
  }
}

/* ---------- 3. results: podium, scores, trap questions ---------- */
function renderResults() {
  const r = LT.room, R = ranking(), me = meUid(), mineP = LT.players[me];
  const medal = ['🥇', '🥈', '🥉'];
  const podium = [R[1], R[0], R[2]].map((p, k) => p ? `<div class="pod pod${[2, 1, 3][k]}">${pAvatar(ltPerson(p.uid), 'lt-av')}<b>${esc(ltName(p.uid))}</b><small>${p.correct || 0}/${r.n} · ${mmss(p.timeMs)}</small><div class="pod-step"><span>${medal[[1, 0, 2][k]]}</span></div></div>` : '<div class="pod empty"></div>').join('');
  const finished = Object.values(LT.players).filter(p => p.joinedAt);
  const stats = r.qs.map((q, i) => { const a = finished.map(p => (p.answers || {})[i]).filter(Boolean); return { q, i, n: a.length, wrong: a.filter(x => !x.ok).length }; });
  const traps = stats.filter(s => s.n && s.wrong >= Math.max(1, Math.ceil(s.n / 2))).sort((a, b) => b.wrong / b.n - a.wrong / a.n).slice(0, 5);
  const myWrong = mineP ? r.qs.filter((q, i) => (mineP.answers || {})[i] && !mineP.answers[i].ok) : [];
  const notMine = myWrong.filter(q => !App.questions.some(x => x.id === q.id || norm(x.question) === norm(q.question)));
  const myRank = R.findIndex(p => p.uid === me);
  const cheer = myRank === 0 && R.length > 1 ? '🎉 You won!' : myRank === 0 ? '🎉 Well done!' : myRank > 0 ? `You came ${['', '2nd', '3rd', '4th', '5th'][myRank]}. ${mineP && mineP.correct >= R[0].correct - 1 ? 'So close!' : 'Next time!'}` : 'Final results';
  $('roomView').innerHTML = `<div class="lt-results">
    <div class="lt-hero"><span class="lt-flag">🏆</span><h2>${cheer}</h2><p>${esc(r.title)}${r.topicName ? ' · ' + esc(r.topicName) : ''} · ${plural(r.n, 'question')}</p></div>
    ${R.length > 1 ? `<div class="podium">${podium}</div>` : ''}
    <div class="newbdgs" id="ltNewBadges" hidden></div>
    <section class="card"><h3>Scores</h3><ol class="lt-table">${R.map((p, k) => `<li class="${p.uid === me ? 'me' : ''}"><span class="rk">${medal[k] || k + 1}</span>${pAvatar(ltPerson(p.uid), 'lt-mini2')}<b>${esc(ltName(p.uid))}</b><span class="sc">${p.correct || 0}/${r.n}</span><span class="tm">${mmss(p.timeMs)}</span><span class="st">${p.best >= 3 ? `🔥${p.best}` : ''}</span></li>`).join('')}</ol></section>
    ${traps.length ? `<section class="card lt-traps"><h3>🪤 Trap questions <span class="muted small">most of you got these wrong</span></h3>${traps.map(s => {
        const mineA = mineP && (mineP.answers || {})[s.i];
        return `<div class="trap-q"><p class="tq">${rich(s.q.question)}</p><p><span class="badge ok">Answer: ${esc(s.q.answer)}</span> <span class="muted small">${s.wrong} of ${s.n} got it wrong${mineA ? (mineA.ok ? ' · you got it right 🛡️' : ` · you picked “${esc(mineA.p)}”`) : ''}</span></p>${s.q.explanation ? `<p class="small">${rich(s.q.explanation)}</p>` : ''}${s.q.trap ? `<p class="small trapline">Trap: ${rich(s.q.trap)}</p>` : ''}</div>`; }).join('')}</section>`
      : `<section class="card"><p class="muted">No trap questions this time: most of you got everything right. 💪</p></section>`}
    <div class="btns">${notMine.length ? `<button class="btn primary" type="button" data-ltaddwrong>Add the ${plural(notMine.length, 'question')} I got wrong to my prep</button>` : ''}
      <button class="btn" type="button" data-lthistory>My test history</button><button class="btn ghost" type="button" data-ltback>Done</button></div>
    ${myWrong.length && myWrong.length > notMine.length ? `<p class="muted small center">Questions you got wrong that are already in your prep will come back sooner in your revision.</p>` : ''}</div>`;
  if (r.host === meUid() && r.status !== 'done') Store.fs.doc(`rooms/${LT.rid}`).set({ status: 'done' }, { merge: true }).catch(() => {});
  if (mineP && !LT.saved) { saveHistory(R, stats, traps); Sound.play(myRank === 0 ? 'win' : 'finish'); }
}
async function saveHistory(R, stats, traps) {   // eslint: async because it compares badges before and after
  LT.saved = true;
  const r = LT.room, me = meUid(), mine = LT.players[me], rank = R.findIndex(p => p.uid === me) + 1;
  const answered = Object.keys(mine.answers || {}).length;
  if (answered < Math.ceil(r.n / 2)) return;                           // answered less than half: not counted as played
  // a "trap dodged": you got it right while at least 2 others got it wrong
  const dodged = r.qs.filter((q, i) => ((mine.answers || {})[i] || {}).ok && Object.values(LT.players).filter(p => p.uid !== me && ((p.answers || {})[i] || {}).ok === false).length >= 2).length;
  const before = await historyList();
  const doc = { rid: LT.rid, at: r.startAt, title: r.title, topicName: r.topicName || '', n: r.n, host: r.host,
    players: R.map((p, k) => ({ uid: p.uid, name: p.uid === me ? displayName() : fullName(Social.people[p.uid] || {}) || 'Friend', correct: p.correct || 0, timeMs: p.timeMs, rank: k + 1, best: p.best || 0 })),
    me: { correct: mine.correct || 0, answered, timeMs: R[rank - 1].timeMs, rank, best: mine.best || 0, dodged, firstDone: R.filter(p => p.finishedAt).sort((a, b) => a.finishedAt - b.finishedAt)[0] && R.filter(p => p.finishedAt).sort((a, b) => a.finishedAt - b.finishedAt)[0].uid === me } };
  try {
    const ref = Store.fs.doc(`users/${me}/tests/${LT.rid}`), old = await ref.get();
    if (!old.exists) {
      await ref.set(doc); Activity.log('test_finished', { title: r.title, score: `${doc.me.correct}/${r.n}`, rank: `${rank} of ${R.length}` });
      showNewBadges(badgeLevels(before), badgeLevels([doc, ...before]));
    }
  } catch (e) { console.warn(e); }
}

/* ---------- 4. history, charts, head-to-head, badges ---------- */
// Badges never run out: each one has levels that keep going (Lv 1, 2, 3 …), with bronze → silver → gold → diamond looks.
// They are worked out from your saved test history, so they are the same on every device.
const playedOK = t => !t.me || t.me.answered === undefined || t.me.answered >= Math.ceil(t.n / 2);
const groupOf = t => (t.players || []).length;
const STEPS = [1, 3, 5, 10, 20, 35, 50, 75, 100];
const nextStep = n => n < STEPS.length ? STEPS[n] : STEPS[STEPS.length - 1] + 50 * (n - STEPS.length + 1);   // after 100: every 50 more
const pct = t => t.n ? t.me.correct / t.n : 0;
const hourOf = t => new Date(t.at || 0).getHours(), dayOf = t => new Date(t.at || 0).getDay();
const won = t => t.me.rank === 1 && groupOf(t) >= 2;
const countOf = f => H => H.filter(f).length;
// best run of tests in a row (newest last) where f(t) holds
const runOf = f => H => { let best = 0, cur = 0; [...H].sort((a, b) => (a.at || 0) - (b.at || 0)).forEach(t => { cur = f(t) ? cur + 1 : 0; best = Math.max(best, cur); }); return best; };
// streak kind: levels at 5, 8, 10, 15 … (fire) or 2, 3, 5, 7 … (runs of tests)
const BADGES = [
  // winning and placing
  { id: 'win', icon: '🏆', name: 'Winner', how: '1st place with friends', unit: 'win', count: countOf(won), hit: won },
  { id: 'champ', icon: '👑', name: 'Champion', how: 'Win tests in a row', unit: 'in a row', run: true, count: runOf(t => won(t)), hit: won },
  { id: 'podium', icon: '🥈', name: 'Podium', how: 'Top 3 in a test of 3 or more players', unit: 'podium', count: countOf(t => groupOf(t) >= 3 && t.me.rank <= 3), hit: t => groupOf(t) >= 3 && t.me.rank <= 3 },
  { id: 'close', icon: '📸', name: 'Photo finish', how: 'Win by just one point', unit: 'close win', count: countOf(t => won(t) && t.players.length > 1 && t.me.correct - (t.players.find(p => p.rank === 2) || {}).correct === 1), hit: t => won(t) && t.me.correct - ((t.players.find(p => p.rank === 2) || {}).correct || 0) === 1 },
  { id: 'fast', icon: '⚡', name: 'Fastest finisher', how: 'Finish first with 60% or more, with friends', unit: 'time', count: countOf(t => t.me.firstDone && groupOf(t) >= 2 && pct(t) >= 0.6), hit: t => t.me.firstDone && groupOf(t) >= 2 && pct(t) >= 0.6 },
  { id: 'trap', icon: '🛡️', name: 'Trap dodger', how: 'Right where 2 or more others went wrong', unit: 'trap', count: H => H.reduce((a, t) => a + (groupOf(t) >= 3 ? (t.me.dodged || 0) : 0), 0), hit: t => groupOf(t) >= 3 && t.me.dodged > 0 },
  // getting it right
  { id: 'perfect', icon: '🎯', name: 'Perfect score', how: 'Every answer right, 10 or more questions', unit: 'perfect test', count: countOf(t => t.n >= 10 && t.me.correct === t.n), hit: t => t.n >= 10 && t.me.correct === t.n },
  { id: 'sharp', icon: '🧠', name: 'Sharpshooter', how: '90% or more in a test of 10+', unit: 'test', count: countOf(t => t.n >= 10 && pct(t) >= 0.9), hit: t => t.n >= 10 && pct(t) >= 0.9 },
  { id: 'steady', icon: '📈', name: 'Steady', how: '70% or more in tests in a row', unit: 'in a row', run: true, count: runOf(t => t.n >= 10 && pct(t) >= 0.7), hit: t => t.n >= 10 && pct(t) >= 0.7 },
  { id: 'fire', icon: '🔥', name: 'On fire', how: 'Right answers in a row', unit: 'in a row', streak: true, count: H => H.reduce((a, t) => Math.max(a, t.me.best || 0), 0), hit: t => (t.me.best || 0) >= 5 },
  { id: 'mixed', icon: '🧩', name: 'All-rounder', how: '80% or more in a mixed-subject test', unit: 'test', count: countOf(t => /^Mixed/.test(t.title || '') && t.n >= 10 && pct(t) >= 0.8), hit: t => /^Mixed/.test(t.title || '') && pct(t) >= 0.8 },
  { id: 'topic', icon: '🔬', name: 'Topic expert', how: '80% or more in a one-topic test', unit: 'test', count: countOf(t => t.topicName && t.n >= 10 && pct(t) >= 0.8), hit: t => t.topicName && pct(t) >= 0.8 },
  { id: 'speed', icon: '⏱️', name: 'Quick thinker', how: 'Under 10 seconds a question with 70% or more', unit: 'test', count: countOf(t => t.n >= 10 && pct(t) >= 0.7 && t.me.timeMs / Math.max(1, t.me.answered || t.n) < 10000), hit: t => pct(t) >= 0.7 && t.me.timeMs / Math.max(1, t.me.answered || t.n) < 10000 },
  { id: 'marathon', icon: '🏃', name: 'Marathon', how: 'Finish a 30-question test', unit: 'marathon', count: countOf(t => t.n >= 30 && (t.me.answered === undefined || t.me.answered >= t.n)), hit: t => t.n >= 30 },
  // showing up
  { id: 'regular', icon: '🎖️', name: 'Regular', how: 'Live tests played', unit: 'test', count: H => H.length, hit: () => true },
  { id: 'days', icon: '🗓️', name: 'Habit', how: 'Different days with a live test', unit: 'day', count: H => new Set(H.map(t => new Date(t.at || 0).toDateString())).size, hit: () => true },
  { id: 'early', icon: '🌅', name: 'Early bird', how: 'A test before 8 in the morning', unit: 'test', count: countOf(t => hourOf(t) >= 4 && hourOf(t) < 8), hit: t => hourOf(t) >= 4 && hourOf(t) < 8 },
  { id: 'night', icon: '🦉', name: 'Night owl', how: 'A test after 10 at night', unit: 'test', count: countOf(t => hourOf(t) >= 22 || hourOf(t) < 4), hit: t => hourOf(t) >= 22 || hourOf(t) < 4 },
  { id: 'weekend', icon: '🎒', name: 'Weekend warrior', how: 'A test on Saturday or Sunday', unit: 'test', count: countOf(t => dayOf(t) === 0 || dayOf(t) === 6), hit: t => dayOf(t) === 0 || dayOf(t) === 6 },
  // friends
  { id: 'host', icon: '📣', name: 'Host', how: 'Host a test with friends', unit: 'test', count: countOf(t => t.host === meUid() && groupOf(t) >= 2), hit: t => t.host === meUid() && groupOf(t) >= 2 },
  { id: 'rivals', icon: '🤝', name: 'Friendly rivals', how: 'Different friends you played with', unit: 'friend', count: H => new Set(H.flatMap(t => t.players.map(p => p.uid)).filter(u => u !== meUid())).size, hit: t => groupOf(t) >= 2 },
  { id: 'party', icon: '🎉', name: 'Full house', how: 'A test with 5 players', unit: 'test', count: countOf(t => groupOf(t) >= 5), hit: t => groupOf(t) >= 5 },
  { id: 'loyal', icon: '💞', name: 'Study buddy', how: 'Tests with the same friend', unit: 'test', count: H => { const c = {}; H.forEach(t => t.players.forEach(p => { if (p.uid !== meUid()) c[p.uid] = (c[p.uid] || 0) + 1; })); return Math.max(0, ...Object.values(c)); }, hit: t => groupOf(t) >= 2 },
];
const FIRE = [5, 8, 10, 15, 20, 25, 30, 40, 50];
const RUNS = [2, 3, 5, 7, 10, 15, 20, 30, 50];
function levelOf(b, n) {
  const steps = b.streak ? FIRE : b.run ? RUNS : null, add = b.streak ? 10 : 10;
  const at = k => steps ? (k < steps.length ? steps[k] : steps[steps.length - 1] + add * (k - steps.length + 1)) : nextStep(k);
  let lv = 0; while (at(lv) <= n) lv++;
  const goal = at(lv), prev = lv === 0 ? 0 : at(lv - 1);
  return { lv, goal, prev, pct: Math.round(100 * Math.min(1, (n - prev) / Math.max(1, goal - prev))) };
}
const tierOf = lv => lv >= 7 ? 'diamond' : lv >= 5 ? 'gold' : lv >= 3 ? 'silver' : lv >= 1 ? 'bronze' : 'none';
const TIER_NAME = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold', diamond: 'Diamond', none: 'Not yet' };
function badgeLevels(H) {
  H = H.filter(playedOK);
  const out = {};
  BADGES.forEach(b => { const n = b.count(H), L = levelOf(b, n); const last = H.filter(b.hit).sort((x, y) => (y.at || 0) - (x.at || 0))[0]; out[b.id] = { ...L, n, last: last && last.at }; });
  return out;
}
async function historyList() { try { const s = await Store.fs.collection(`users/${meUid()}/tests`).get(); return s.docs.map(d => d.data()).filter(t => t && t.me); } catch (e) { return []; } }
function badgeCard(b, L, big) {
  const t = tierOf(L.lv), unit = b.unit + (L.n === 1 || b.streak ? '' : 's');
  return `<div class="bdg2 t-${t}${big ? ' big' : ''}" title="${esc(b.how)}">
    <span class="bdg-ic"><i>${b.icon}</i>${L.lv ? `<b class="lv">${L.lv}</b>` : ''}</span>
    <strong>${esc(b.name)}</strong>
    <small>${L.lv ? `${TIER_NAME[t]} · Lv ${L.lv}` : 'Not yet'}</small>
    <span class="bdg-bar" aria-hidden="true"><i style="width:${L.pct}%"></i></span>
    <small class="bdg-next">${L.n ? `${L.n} ${b.streak || b.run ? 'in a row (best)' : unit}` : ''}${L.n ? ' · ' : ''}next at ${L.goal}</small>
    ${big ? `<p class="bdg-how">${esc(b.how)}</p>${L.last ? `<p class="bdg-last">Last earned ${esc(fmtDate(L.last))}</p>` : ''}` : ''}
  </div>`;
}
function badgeStrip(H) {
  const L = badgeLevels(H), total = BADGES.reduce((a, b) => a + L[b.id].lv, 0);
  return `<section class="card bdg-sec"><div class="bdg-head"><h3>Badges <span class="muted small">${total} ${total === 1 ? 'level' : 'levels'} earned</span></h3><button class="linkbtn" type="button" data-ltbadges>View all ${icon('next')}</button></div>
    <div class="bdg-strip" role="list">${[...BADGES].sort((x, y) => L[y.id].lv - L[x.id].lv).map(b => `<button type="button" class="bdg-chip t-${tierOf(L[b.id].lv)}" data-ltbadges role="listitem" aria-label="${esc(b.name)}, level ${L[b.id].lv}"><span class="bdg-ic"><i>${b.icon}</i>${L[b.id].lv ? `<b class="lv">${L[b.id].lv}</b>` : ''}</span><small>${esc(b.name)}</small></button>`).join('')}</div></section>`;
}
async function openBadges() {
  leaveRoom(); LT.view = 'badges'; $('roomView').innerHTML = '<p class="muted center">Loading…</p>'; show('room');
  const H = await historyList(), L = badgeLevels(H);
  if (LT.view !== 'badges') return;
  $('roomView').innerHTML = `<div class="head-row"><h2>Badges</h2><button class="btn ghost" type="button" data-lthistory>${icon('back')}Tests</button></div>
    <div class="bdg-grid">${[...BADGES].sort((x, y) => L[y.id].lv - L[x.id].lv).map(b => badgeCard(b, L[b.id], true)).join('')}</div>`;
}
// after a test: "New badge!" or "Level up!" on the results screen
function showNewBadges(before, after) {
  const news = BADGES.filter(b => after[b.id].lv > before[b.id].lv);
  if (!news.length) return;
  setTimeout(() => {
    const box = $('ltNewBadges'); if (!box) return;
    box.innerHTML = news.map(b => `<div class="newbdg">${badgeCard(b, after[b.id])}<span>${before[b.id].lv ? `Level up! ${esc(b.name)} is now Lv ${after[b.id].lv}` : `New badge: ${esc(b.name)}!`}</span></div>`).join('');
    box.hidden = false; Sound.play('streak');
    if (!prefersReduced()) { const c = document.createElement('div'); c.className = 'confetti'; for (let i = 0; i < 30; i++) { const p = document.createElement('i'); p.style.cssText = `--x:${(Math.random() * 2 - 1) * 160}px;--y:${-40 - Math.random() * 140}px;--r:${Math.random() * 720 - 360}deg;--d:${(0.9 + Math.random() * 0.7).toFixed(2)}s;background:${['#10a58f', '#1b93c9', '#f5a300', '#ff7a93', '#7c5cff'][i % 5]};left:${20 + Math.random() * 60}%`; c.appendChild(p); } box.appendChild(c); setTimeout(() => c.remove(), 1800); }
  }, 900);
}
MODES.tests = () => { leaveRoom(); markInvitesSeen(); LT.view = 'history'; $('roomView').innerHTML = '<p class="muted center">Loading your tests…</p>'; show('room'); loadHistory(); };
async function loadHistory() {
  let H = [];
  try { const s = await Store.fs.collection(`users/${meUid()}/tests`).get(); H = s.docs.map(d => d.data()).filter(t => t && t.me).filter(playedOK).sort((a, b) => (b.at || 0) - (a.at || 0)); } catch (e) { console.warn(e); }
  if (LT.view !== 'history' || !visible('room')) return;
  const me = meUid(), wins = H.filter(t => t.me.rank === 1 && t.players.length > 1).length;
  const avg = H.length ? Math.round(100 * H.reduce((a, t) => a + t.me.correct / t.n, 0) / H.length) : 0;
  const best = H.reduce((a, t) => Math.max(a, Math.round(100 * t.me.correct / t.n)), 0);
  const h2h = {};
  H.forEach(t => t.players.forEach(p => { if (p.uid === me) return; const x = h2h[p.uid] = h2h[p.uid] || { uid: p.uid, name: p.name, w: 0, l: 0 }; x.name = p.name || x.name; if (t.me.rank < p.rank) x.w++; else x.l++; }));
  $('roomView').innerHTML = `<div class="head-row"><h2>Live tests</h2></div>
    <div class="btns"><button class="btn primary" type="button" data-ltnew>🏁 Start a new live test</button></div>
    <div id="ltInvites"></div>
    ${H.length ? `<div class="lt-stats">
        <div class="stat"><b>${H.length}</b><small>Tests played</small></div><div class="stat"><b>${wins}</b><small>Wins</small></div>
        <div class="stat"><b>${avg}%</b><small>Average score</small></div><div class="stat"><b>${best}%</b><small>Best score</small></div></div>
      <div class="lt-hist-grid">
        <section class="card chart-card" id="ltChart"></section>
        <section class="card"><h3>Head to head</h3>${Object.values(h2h).length ? `<div class="h2h">${Object.values(h2h).sort((a, b) => b.w + b.l - a.w - a.l).map(x => {
            const tot = x.w + x.l; return `<div class="h2h-row">${pAvatar(Social.people[x.uid] || { uid: x.uid, first: x.name }, 'lt-mini2')}<b>You vs ${esc((Social.people[x.uid] && Social.people[x.uid].first) || x.name)}</b><span class="h2h-bar"><i class="w" style="width:${100 * x.w / tot}%"></i><i class="l" style="width:${100 * x.l / tot}%"></i></span><small>${x.w} won · ${x.l} lost</small></div>`; }).join('')}</div>` : '<p class="muted">Play with friends to see who wins more often.</p>'}</section>
      </div>` : `<div class="empty-state">${ART.empty}<strong>No live tests yet</strong><p>Challenge your friends: everyone answers the same questions at the same time. Your results and badges will show here.</p></div>`}
    ${badgeStrip(H)}
    ${H.length ? `<section class="card"><h3>Past tests</h3><div class="lt-past">${H.map(t => `<button type="button" class="lt-row" data-ltopen="${esc(t.rid)}">
        <span class="lt-rank r${t.me.rank}">${['🥇', '🥈', '🥉'][t.me.rank - 1] || '#' + t.me.rank}</span>
        <span class="pmain"><b>${esc(t.title)}${t.topicName ? ' · ' + esc(t.topicName) : ''}</b><small>${esc(fmtDate(t.at))} · ${t.players.length > 1 ? `with ${esc(t.players.filter(p => p.uid !== me).map(p => (p.name || '').split(' ')[0]).join(', '))}` : 'solo'}</small></span>
        <span class="lt-sc">${t.me.correct}/${t.n}</span></button>`).join('')}</div></section>` : ''}`;
  paintInviteList();
  if (H.length > 1) {
    const pts = [...H].reverse().slice(-20);
    lineChart($('ltChart'), { title: 'Your scores', sub: `Last ${pts.length} tests`, data: pts.map(t => ({ label: new Date(t.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), value: Math.round(100 * t.me.correct / t.n), tip: `<b>${esc(t.title)}</b><br>${esc(fmtDate(t.at))}<br>${t.me.correct}/${t.n} · ${['1st', '2nd', '3rd', '4th', '5th'][t.me.rank - 1]} of ${t.players.length}` })), every: Math.max(1, Math.ceil(pts.length / 6)) });
  } else if ($('ltChart')) $('ltChart').innerHTML = `<h3>Your scores</h3><p class="muted">Play one more test to see your progress chart.</p>`;
}

/* ---------- clicks ---------- */
$('room').addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  const d = b.dataset;
  try {
    if ('ltback' in d) { const v = LT.view; leaveRoom(); LT.view = null; return v === 'history' ? goHome() : MODES.tests(); }
    if (d.ltfriend) { const S = LT.setup; if (S.friends.has(d.ltfriend)) S.friends.delete(d.ltfriend); else if (S.friends.size < ROOM_MAX - 1) S.friends.add(d.ltfriend); else toast(`At most ${ROOM_MAX - 1} friends.`); return renderLtSetup(); }
    if (d.ltn) { LT.setup.n = Number(d.ltn); return renderLtSetup(); }
    if (d.ltmin) { LT.setup.min = Number(d.ltmin); return renderLtSetup(); }
    if ('ltcreate' in d) { b.disabled = true; b.textContent = 'Creating…'; return await createRoom(); }
    if ('ltjoin' in d) { b.disabled = true; await Store.fs.doc(`rooms/${LT.rid}/players/${meUid()}`).set(blankPlayer()); return; }
    if ('ltstart' in d) {
      b.disabled = true; const now = Date.now() + 3000;                 // a 3-second countdown for everyone
      await Store.fs.doc(`rooms/${LT.rid}`).set({ status: 'live', startAt: now, endAt: now + LT.room.secs * 1000 }, { merge: true }); return;
    }
    if ('ltcancel' in d) { await Store.fs.doc(`rooms/${LT.rid}`).set({ status: 'cancelled' }, { merge: true }); return; }
    if (d.ltpick !== undefined) { if (Date.now() < LT.room.startAt) return; return pickAnswer(Number(d.ltpick)); }
    if ('lthistory' in d) return MODES.tests();
    if ('ltbadges' in d) return openBadges();
    if ('ltnew' in d) return openLtSetup();
    if (d.ltopen) return openRoom(d.ltopen);
    if ('ltaddwrong' in d) {
      const r = LT.room, mineP = LT.players[meUid()];
      const qs = r.qs.filter((q, i) => (mineP.answers || {})[i] && !mineP.answers[i].ok && !App.questions.some(x => x.id === q.id || norm(x.question) === norm(q.question)));
      const data = { type: 'mcq', questions: qs.map(q => stripItem({ ...q, id: undefined })) };
      const share = { from: ltName(r.host) === 'You' ? 'your live test' : `the live test by ${ltName(r.host)}`, fromUser: '', what: 'mcq', count: qs.length, subjectName: r.subjectName === 'Mixed' ? '' : r.subjectName, topicName: r.topicName, title: r.title, text: JSON.stringify(data), room: LT.rid };
      const guess = share.subjectName ? matchTopic(share.subjectName, App.subjects.map(x => x.name)) : -1;
      leaveRoom(); return openImport('active', 'mcq', { share, subject: guess >= 0 ? App.subjects[guess].code : null });
    }
  } catch (err) { console.warn(err); b.disabled = false; toast('That did not work. Check your internet and try again.'); }
});
document.addEventListener('keydown', e => {
  if (!visible('room') || LT.view !== 'live' || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  const k = '1234abcd'.indexOf(e.key.toLowerCase()); if (k >= 0 && LT.opts && k % 4 < LT.opts.length) pickAnswer(k % 4);
});

/* ---------- invites: live, in the Tests tab (badge + pop-up anywhere in the app) ---------- */
const Invites = { unsub: null, histUnsub: null, rooms: [], first: true, played: new Set() };
const seenRooms = () => { try { return new Set(JSON.parse(localStorage.getItem('rc-seenrooms-' + meUid()) || '[]')); } catch (e) { return new Set(); } };
function markInvitesSeen() { try { const s = seenRooms(); Invites.rooms.forEach(r => s.add(r.id)); localStorage.setItem('rc-seenrooms-' + meUid(), JSON.stringify([...s].slice(-200))); } catch (e) {} paintTestsTab(); }
// not yet played by you (a finished test is saved in your history), still open, and not too old
const openInvites = () => Invites.rooms.filter(r => r.host !== meUid() && !Invites.played.has(r.id) && (r.status === 'lobby' || r.status === 'live') && Date.now() - (r.created || 0) < 6 * 3600e3 && (r.status === 'lobby' || Date.now() < (r.endAt || 0)));
const myOpenRooms = () => Invites.rooms.filter(r => r.host === meUid() && !Invites.played.has(r.id) && (r.status === 'lobby' || (r.status === 'live' && Date.now() < (r.endAt || 0))));
function startInvites() {
  stopInvites(); if (!App.authUser || App.viewAs) return;
  Invites.first = true;
  Invites.histUnsub = Store.fs.collection(`users/${meUid()}/tests`).onSnapshot(s => { Invites.played = new Set(s.docs.map(d => d.id)); paintTestsTab(); if (visible('room') && LT.view === 'history') paintInviteList(); }, () => {});
  Invites.unsub = Store.fs.collection('rooms').where('invited', 'array-contains', meUid()).onSnapshot(s => {
    const before = new Set(Invites.rooms.map(r => r.id));
    Invites.rooms = s.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
    const seen = seenRooms();
    openInvites().forEach(r => {
      if (before.has(r.id) || seen.has(r.id) || (Invites.first && Date.now() - (r.created || 0) > 15 * 60e3)) return;
      if (LT.rid === r.id) return;
      loadPerson(r.host).then(() => {
        const t = `${friendName(r.host)} invited you to a live test: ${r.title}`;
        toast(`🏁 ${t}`); Sound.play('invite'); Notify.show('🏁 Live test invite', t, 'room-' + r.id, '#room=' + r.id);
      });
    });
    Invites.first = false;
    paintTestsTab();
    if (visible('room') && LT.view === 'history') paintInviteList();
  }, e => console.warn('rooms', e));
}
function stopInvites() { if (Invites.histUnsub) { try { Invites.histUnsub(); } catch (e) {} Invites.histUnsub = null; } Invites.played = new Set(); if (Invites.unsub) { try { Invites.unsub(); } catch (e) {} Invites.unsub = null; } Invites.rooms = []; paintTestsTab(); }
function paintTestsTab() {
  const b = $('testsBadge'); if (!b) return;
  const seen = seenRooms(), n = openInvites().filter(r => !seen.has(r.id)).length;
  b.hidden = !n; b.textContent = n > 9 ? '9+' : String(n);
}
function paintInviteList() {
  const box = $('ltInvites'); if (!box) return;
  const inv = openInvites(), mine = myOpenRooms();
  box.innerHTML = inv.length || mine.length ? `<section class="card lt-inv"><h3>${inv.length ? 'Invites for you' : 'Your open test'}</h3>${[...inv, ...mine].map(r => `<div class="lt-inv-row">${pAvatar(ltPerson(r.host), 'lt-mini2')}<span class="pmain"><b>${esc(r.host === meUid() ? 'Your test' : (friendName(r.host) + ' invites you'))}</b><small>${esc(r.title)}${r.topicName ? ' · ' + esc(r.topicName) : ''} · ${plural(r.n, 'question')} · ${r.status === 'live' ? '<span class="live-dot">live now</span>' : 'waiting in the lobby'}</small></span><button class="btn small ${r.host === meUid() ? '' : 'primary'}" type="button" data-ltopen="${esc(r.id)}">${r.host === meUid() ? 'Open' : r.status === 'live' ? 'Watch' : 'Join'}</button></div>`).join('')}</section>` : '';
}
