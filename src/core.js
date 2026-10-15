// ---------- 1d. Shuffling ----------
// Fisher–Yates: every order is equally likely. Options are reshuffled every time a question is shown.
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- 1e. Spaced-repetition schedule ----------
// Every question has a memory LEVEL from 0 to 5 and a DUE day.
//   Correct → level goes up 1, next review is further away.
//   Wrong or "Don't know" → level drops to 0, it comes back tomorrow
//   (and again later in the same session).
// Days until next review for each level:
const SCHEDULE = {
  gapDays: [1, 1, 3, 7, 14, 30],  // level 0..5
  maxLevel: 5,
  hardAfterWrongs: 3,             // a question missed 3+ times never waits more than…
  hardMaxLevel: 3,                // …7 days
  dueCapPerDay: 60,               // most old questions in one day's review
  newMin: 10, newMax: 30,         // new questions introduced per day
  finishNewDaysBeforeExam: 7,     // see every question at least once a week before the exam
  retriesInSession: 2,            // a missed question is asked again up to 2 more times in the session
  blockSize: 20,                  // a short break is offered after every 20 questions
  backlogStop: 60,                // more than this many due: no new questions until you catch up
  backlogSlow: 30,                // more than this: only the minimum of new ones
  runUpDays: 21,                  // in the last 3 weeks gaps get shorter, so revision spreads out…
  finalWeekDays: 7,               // …and in the last week: revision only, no new questions
  defaultSecsPerQ: 30,            // pace used for "Daily time" until yours is known
};

const dayStart = ms => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
const addDays = (ms, n) => { const d = new Date(dayStart(ms)); d.setDate(d.getDate() + n); return d.getTime(); };
const examMsFrom = date => { if (!date) return 0; const [y, m, d] = date.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };

// state: a=answered c=correct w=wrong sk="don't know" s=streak lv=level due=next review day f=first seen t=last seen k=subject code
//        ce=confident errors (wrong while "Sure"), g=lucky guesses
// `retry` = this is a repeat inside the same session (a correct repeat does not raise the level).
// `conf`  = how sure you were: 'sure' | 'unsure' | 'guess' (or empty when not asked)
//   correct + sure (or not asked) → level up
//   correct + unsure              → level stays, normal gap
//   correct + guess               → treated as not known yet: back in 1 day
//   wrong (any)                   → level 0, back tomorrow (a confident error is counted separately)
function applyResult(state, result, code, now, examMs, retry, conf) {
  const s = Object.assign({ a: 0, c: 0, w: 0, sk: 0, s: 0, lv: 0 }, state || {});
  if (typeof s.lv !== 'number') s.lv = 0;
  if (!s.f) s.f = now;
  s.k = code; s.t = now;
  if (result === 'correct') {
    s.a++; s.c++; s.s++;
    if (conf === 'guess') { s.g = (s.g || 0) + 1; s.lv = Math.min(s.lv, 1); s.s = 0; }
    else if (!retry && conf !== 'unsure') s.lv = Math.min(SCHEDULE.maxLevel, s.lv + 1);
  } else {
    if (result === 'wrong') { s.a++; s.w++; if (conf === 'sure') s.ce = (s.ce || 0) + 1; } else s.sk++;
    s.s = 0; s.lv = 0;
  }
  if (s.w >= SCHEDULE.hardAfterWrongs) s.lv = Math.min(s.lv, SCHEDULE.hardMaxLevel);
  let gap = conf === 'guess' && result === 'correct' ? 1 : SCHEDULE.gapDays[s.lv];
  if (examMs) {
    const daysLeft = Math.round((dayStart(examMs) - dayStart(now)) / 864e5);
    // the last 3 weeks: never wait more than about a third of the days left, so reviews spread out
    // instead of all landing on the day before the exam
    if (daysLeft <= SCHEDULE.runUpDays) gap = Math.min(gap, Math.max(1, Math.floor(daysLeft / 3)));
  }
  let due = addDays(now, gap);
  if (examMs) {                                   // never schedule past the day before the exam
    const lastDay = addDays(examMs, -1);
    if (due > lastDay) due = Math.max(addDays(now, 1), lastDay);
  }
  s.due = due;
  return s;
}
// Practising early (a topic, the Question bank, Extra practice) before half the wait has passed:
// a right answer is counted but does not move the question on, since it was not a real test of memory
// after a gap. A wrong answer counts as usual: it shows the question needs work.
function applyPractice(state, result, code, now, examMs, retry, conf) {
  if (state && state.t && state.due && result === 'correct' && conf !== 'guess') {
    const half = state.t + (state.due - state.t) / 2;
    if (now < half) return { ...state, a: (state.a || 0) + 1, c: (state.c || 0) + 1, s: (state.s || 0) + 1, t: now, k: code };
  }
  return applyResult(state, result, code, now, examMs, retry, conf);
}
// "2 of every 3 from the newest, 1 from the oldest": recent material first, but nothing waits for ever
function mixNewOld(list, k) {
  const a = list.slice(), out = [];
  while (out.length < k && a.length) out.push(out.length % 3 === 2 ? a.pop() : a.shift());
  return out;
}

// Session order: weakest first is not kind to mood, so the list is shuffled,
// and the strongest question you have answered before goes LAST ("end on a good note").
function orderSession(list, getState) {
  const out = shuffle(list);
  let best = -1, bestLv = 1;
  out.forEach((q, i) => { const s = getState(q.id); if (s && s.lv > bestLv && s.s > 0) { best = i; bestLv = s.lv; } });
  if (best >= 0) out.push(out.splice(best, 1)[0]);
  return { list: out, closer: best >= 0 };
}

// Builds today's review by itself: every question that is due, plus a fair share of new ones.
// weights (optional) = { CODE: marks }: new questions are shared out by marks; reviews are never affected
// opts (optional): { minutes, secsPerQ } = a daily time limit and your pace, to size the day
function todayPlan(questions, getState, now, examMs, subjectOrder, weights, opts = {}) {
  const start = dayStart(now), tomorrow = addDays(now, 1), dayAfter = addDays(now, 2);
  const due = [], unseen = [];
  let doneToday = 0, newToday = 0, dueTomorrow = 0;
  for (const q of questions) {
    const s = getState(q.id);
    if (!s || !s.t) { unseen.push(q); continue; }
    if (s.t >= start) doneToday++;
    if (s.f >= start) newToday++;
    if ((s.due || 0) < tomorrow) due.push(q);
    else if (s.due < dayAfter) dueTomorrow++;
  }
  // weakest and most overdue first
  due.sort((x, y) => (getState(x.id).lv - getState(y.id).lv) || (getState(x.id).due - getState(y.id).due));
  // how many new per day so every question is seen once, a week before the exam
  const daysLeft = examMs ? Math.round((examMs - start) / 864e5) : 60;
  const spread = Math.max(1, daysLeft - SCHEDULE.finishNewDaysBeforeExam);
  const perDay = Math.min(SCHEDULE.newMax, Math.max(SCHEDULE.newMin, Math.ceil(unseen.length / spread)));
  let newBudget = Math.max(0, perDay - newToday);
  // brakes: the final week is for revision; a pile of revision is cleared before new questions come in
  const finalWeek = !!examMs && daysLeft <= SCHEDULE.finalWeekDays;
  const catchingUp = due.length > SCHEDULE.backlogStop ? 'stop' : due.length > SCHEDULE.backlogSlow ? 'slow' : '';
  if (finalWeek || catchingUp === 'stop') newBudget = 0;
  else if (catchingUp === 'slow') newBudget = Math.min(newBudget, Math.max(0, SCHEDULE.newMin - newToday));
  // daily time: revision first, new ones with the time left
  let dueCap = SCHEDULE.dueCapPerDay, fitted = false;
  if (opts.minutes) {
    const fit = Math.max(5, Math.floor(opts.minutes * 60 / (opts.secsPerQ || SCHEDULE.defaultSecsPerQ)) - doneToday);
    if (fit < dueCap) { dueCap = Math.max(0, fit); if (due.length > dueCap) fitted = true; }     // "sized to your time" only when it really left something out
    const room = Math.max(0, fit - Math.min(due.length, dueCap));
    if (room < Math.min(newBudget, unseen.length)) { newBudget = room; fitted = true; }
  }
  // newest material first (what you studied most recently), then syllabus order
  const rank = c => { const i = subjectOrder.indexOf(c); return i < 0 ? 99 : i; };
  unseen.sort((x, y) => (y.added || '').localeCompare(x.added || '') || rank(x.code) - rank(y.code) || x.order - y.order);
  let fresh = mixNewOld(unseen, newBudget);
  if (weights && newBudget > 0) {                // highest marks first, but every subject keeps getting some
    const by = {}, picked = {};
    unseen.forEach(q => { (by[q.code] = by[q.code] || []).push(q); });
    fresh = [];
    while (fresh.length < newBudget) {
      let best = null, top = -1;
      for (const c of Object.keys(by)) {
        if (!by[c].length) continue;
        const sc = Math.max(1, weights[c] || 0) / ((picked[c] || 0) + 1);
        if (sc > top) { top = sc; best = c; }
      }
      if (!best) break;
      const n = picked[best] || 0;
      fresh.push(n % 3 === 2 ? by[best].pop() : by[best].shift()); picked[best] = n + 1;   // the same newest/oldest mix in each subject
    }
  }
  return {
    due: due.slice(0, dueCap),
    fresh,
    unseenLeft: unseen.length, doneToday, newToday, dueTomorrow,
    newPerDay: Math.min(perDay, unseen.length),
    dueAll: due.length, finalWeek, catchingUp, fitted, daysLeft,
  };
}

// ---------- 1e2. Matching a question's topic to the syllabus topics ----------
// Exact (ignoring case and punctuation), then "one contains the other", then most words shared.
const TOPIC_STOP = new Set(['and', 'the', 'of', 'for', 'in', 'to', 'with', 'its', 'their', 'basic', 'basics', 'introduction', 'intro', 'types', 'concept', 'concepts', 'fundamentals', 'overview', 'part', 'chapter', 'unit', 'topic']);
// names that mean "no particular topic": never matched to a syllabus topic
const CATCH_ALL = new Set(['others', 'other', 'general', 'misc', 'miscellaneous', 'none', '']);
const OTHERS = 'Others';
const normTopic = s => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
const isCatchAll = s => CATCH_ALL.has(normTopic(s));
// a rough word stem, so "modulation" = "modulator" = "modulated", "gates" = "gate"
const stem = w => { if (w.length > 3) w = w.replace(/s$/, ''); if (w.length > 6) w = w.replace(/(ation|ator|ing|ion|er|or|ed|al|ic|e)$/, ''); return w; };
function editDist1(a, b) {                          // true when a and b differ by at most one letter (typos)
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, diff = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++diff > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return diff + (a.length - i) + (b.length - j) <= 1;
}
const sameWord = (x, y) => x === y || stem(x) === stem(y) || (x.length >= 5 && y.length >= 5 && (x.startsWith(y.slice(0, 5)) && y.startsWith(x.slice(0, 5)) && Math.min(x.length, y.length) >= 6 || editDist1(x, y)));
const topicWords = s => [...new Set(normTopic(s).split(' ').filter(w => (w.length > 2 || /\d/.test(w)) && !TOPIC_STOP.has(w)))];
// Finds the syllabus topic a name resembles. Forgiving (spelling, plurals, extra words), but two different
// key words ("Digital Modulation" vs "Analog Modulation") are told apart.
function matchTopic(name, topics) {
  const n = normTopic(name);
  if (!n || CATCH_ALL.has(n) || !topics || !topics.length) return -1;
  const T = topics.map(normTopic);
  let i = T.indexOf(n); if (i >= 0) return i;
  const sq = x => x.replace(/ /g, '');                                   // "data link" = "datalink"
  i = T.findIndex(t => sq(t) === sq(n)); if (i >= 0) return i;
  const inside = T.map((t, k) => t.length >= 4 && n.length >= 4 && (` ${t} `.includes(` ${n} `) || ` ${n} `.includes(` ${t} `)) ? k : -1).filter(k => k >= 0);
  if (inside.length === 1) return inside[0];      // two topics both contain it ("Modulation") = unclear
  const a = topicWords(n); let best = -1, score = 0, tie = false;
  T.forEach((t, k) => {
    const b = topicWords(t); if (!a.length || !b.length) return;
    const hitA = a.filter(w => b.some(v => sameWord(w, v))).length, hitB = b.filter(v => a.some(w => sameWord(w, v))).length;
    if (!hitA) return;
    const small = Math.min(a.length, b.length), j = Math.min(hitA, hitB) / small;
    // every key word of the shorter name must be found, unless it is long (then 2 of 3 is enough)
    const ok = small <= 2 ? j === 1 : j >= 0.6;
    const sc = ok ? j + Math.min(hitA, hitB) / 100 : 0;
    if (sc > score) { score = sc; best = k; tie = false; } else if (sc && sc === score) tie = true;
  });
  return score && !tie ? best : -1;
}
// which syllabus topic a question or note belongs to (its topic, else its subtopic or title)
function topicIndex(item, topics) {
  if (!topics || !topics.length) return -1;
  for (const f of [item.topic, item.subtopic, item.title]) { const i = matchTopic(f, topics); if (i >= 0) return i; }
  return -1;
}

// ---------- 1f. Days and streaks ----------
// A day key is the local date, e.g. "2026-10-09".
const dayKey = ms => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const keyToMs = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };

// days: { "2026-10-09": { n: answered, c: right first time, done: finished review, paused: true } }
// Streak = days in a row with the review finished. A paused day does not break it (and does not add to it).
// Today does not break it either while it is still in progress.
function streaks(days, now) {
  const keys = Object.keys(days).filter(k => days[k].n || days[k].paused).sort();
  const today = dayKey(now);
  if (!keys.length) return { current: 0, best: 0 };
  let run = 0, best = 0;
  for (let ms = keyToMs(keys[0]); ms <= dayStart(now); ms = addDays(ms, 1)) {
    const k = dayKey(ms), e = days[k];
    if (e && e.done) { run++; best = Math.max(best, run); }
    else if ((e && e.paused) || k === today) continue;
    else run = 0;
  }
  return { current: run, best };
}
const dayPct = e => e && e.n ? Math.round(100 * e.c / e.n) : null;

// ---------- 1g. Merging the day log from two devices ----------
// Each device counts its own answers in by[deviceId] = { n, c }; the day total is the sum,
// so answering on the phone and the laptop on the same day adds up correctly.
function sumDay(e) {
  let n = 0, c = 0;
  for (const v of Object.values(e.by || {})) { n += v.n || 0; c += v.c || 0; }
  e.n = n; e.c = c;
  return e;
}
function normDay(e) {
  const x = { ...e };
  x.by = e.by ? { ...e.by } : (e.n ? { old: { n: e.n, c: e.c || 0 } } : {});
  return x;
}
function mergeDay(a, b) {
  if (!a) return sumDay(normDay(b));
  if (!b) return sumDay(normDay(a));
  a = normDay(a); b = normDay(b);
  const by = { ...a.by };
  for (const [dev, v] of Object.entries(b.by)) if (!by[dev] || (v.n || 0) > (by[dev].n || 0)) by[dev] = v;
  const m = { by, done: !!(a.done || b.done) };
  const p = (a.pt || 0) >= (b.pt || 0) ? a : b;          // latest pause/resume wins
  if (p.pt) { m.paused = !!p.paused; m.pt = p.pt; } else if (a.paused || b.paused) m.paused = true;
  const l = (a.lt || 0) >= (b.lt || 0) ? a : b;          // latest "left today" wins
  if (l.left !== undefined) { m.left = l.left; m.mins = l.mins || 0; m.lt = l.lt || 0; }
  return sumDay(m);
}
// true when my copy of a day has something the other copy is missing (so it must be uploaded)
function dayAhead(mine, theirs) {
  if (!theirs) return true;
  const t = normDay(theirs);
  for (const [dev, v] of Object.entries(normDay(mine).by)) if ((v.n || 0) > ((t.by[dev] || {}).n || 0)) return true;
  if (mine.done && !theirs.done) return true;
  if ((mine.pt || 0) > (theirs.pt || 0)) return true;
  if ((mine.lt || 0) > (theirs.lt || 0)) return true;
  return false;
}

