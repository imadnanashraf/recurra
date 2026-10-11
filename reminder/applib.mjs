// Generated from src/mdparse.js, src/core.js and src/import.js by scripts/build.mjs. Edit those files, not this one.
// ---------- 1a. Markdown block parser ----------
// Turns text like
//   ## Q: CN-TL-001
//   - Question: ...
//   - Options:
//     - TCP
// into { id: 'CN-TL-001', line: 12, f: { question: '...', options: ['TCP', ...] } }
// `marker` is 'Q' for MCQ files and 'N' for note files.
function parseBlocks(text, marker) {
  const blocks = [];
  let cur = null, field = null;
  const headRe = new RegExp('^##\\s+' + marker + ':\\s*(\\S+)');
  text.split(/\r?\n/).forEach((raw, idx) => {
    const line = raw.replace(/\s+$/, '');
    const head = line.match(headRe);
    if (head) { cur = { id: head[1].trim(), line: idx + 1, f: {} }; blocks.push(cur); field = null; return; }
    if (!cur) return;
    if (/^#{1,6}\s/.test(line)) { cur = null; field = null; return; }   // any other heading ends the block
    if (!line.trim()) return;                                            // blank line: ignore
    if (/^-{3,}$/.test(line.trim())) { field = null; return; }            // --- separator
    const kv = line.match(/^[-*]\s+([A-Za-z][A-Za-z /]*?)\s*:\s*(.*)$/);
    if (kv) { field = kv[1].toLowerCase(); cur.f[field] = kv[2].trim() || []; return; }
    const item = line.match(/^\s+[-*]\s+(.*)$/);
    if (item && field) {
      if (!Array.isArray(cur.f[field])) cur.f[field] = cur.f[field] ? [cur.f[field]] : [];
      cur.f[field].push(item[1].trim());
      return;
    }
    if (field) {                                   // continuation of a long value
      const v = cur.f[field], extra = line.trim();
      if (Array.isArray(v)) { if (v.length) v[v.length - 1] += ' ' + extra; }
      else cur.f[field] = (v + ' ' + extra).trim();
    }
  });
  return blocks;
}

const asText = v => Array.isArray(v) ? v.join(' ') : (v || '');

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
  let due = addDays(now, conf === 'guess' && result === 'correct' ? 1 : SCHEDULE.gapDays[s.lv]);
  if (examMs) {                                   // never schedule past the day before the exam
    const lastDay = addDays(examMs, -1);
    if (due > lastDay) due = Math.max(addDays(now, 1), lastDay);
  }
  s.due = due;
  return s;
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
function todayPlan(questions, getState, now, examMs, subjectOrder) {
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
  const newBudget = Math.max(0, perDay - newToday);
  // newest material first (what you studied most recently), then syllabus order
  const rank = c => { const i = subjectOrder.indexOf(c); return i < 0 ? 99 : i; };
  unseen.sort((x, y) => (y.added || '').localeCompare(x.added || '') || rank(x.code) - rank(y.code) || x.order - y.order);
  return {
    due: due.slice(0, SCHEDULE.dueCapPerDay),
    fresh: unseen.slice(0, newBudget),
    unseenLeft: unseen.length, doneToday, newToday, dueTomorrow,
    newPerDay: Math.min(perDay, unseen.length),
  };
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

// ---------- 1h. Importing syllabus, MCQs and notes ----------
// Everything a person pastes is checked here first. Bad items are listed and skipped, never saved.

const str = v => Array.isArray(v) ? v.map(x => String(x ?? '')).join(' ').trim() : (v == null ? '' : String(v)).trim();
const norm = s => str(s).toLowerCase().replace(/\s+/g, ' ');
const num = (v, d) => (v === '' || v == null || !Number.isFinite(Number(v))) ? d : Number(v);
const CODE_RE = /^[A-Za-z0-9]{1,12}$/;

// Short stable id from text, so the same question imported twice is recognised (not duplicated)
function hashId(s) {
  let h = 0x811c9dc5;
  for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}
const cleanId = s => str(s).replace(/[\s/.#$\[\]]+/g, '-').slice(0, 80);

// ---- syllabus ----
function cleanSyllabus(o) {
  const problems = [];
  const out = { name: str(o.name || o.exam || o.title), examDate: '', marking: null, subjects: [] };
  const d = str(o.examDate || o.exam_date || o.date);
  if (d) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) out.examDate = d;
    else problems.push(`Exam date "${d}" must look like 2026-12-30. It was left empty.`);
  }
  if (o.marking && typeof o.marking === 'object') {
    const m = o.marking;
    out.marking = { correct: num(m.correct, 1), wrong: num(m.wrong, 0), totalQuestions: num(m.totalQuestions ?? m.questions, 0), minutes: num(m.minutes ?? m.duration, 0) };
    if (out.marking.wrong > 0) out.marking.wrong = -out.marking.wrong;      // negative marking is stored as a negative number
  }
  (Array.isArray(o.subjects) ? o.subjects : []).forEach((s, i) => {
    if (!s || typeof s !== 'object') return problems.push(`Subject ${i + 1}: not in the right format`);
    const code = str(s.code).toUpperCase(), name = str(s.name);
    if (!CODE_RE.test(code)) return problems.push(`Subject ${i + 1} (${name || '?'}): "code" must be short letters or numbers, like CN`);
    if (!name) return problems.push(`Subject ${code}: missing "name"`);
    if (out.subjects.some(x => x.code === code)) return problems.push(`Subject code ${code} is used twice`);
    out.subjects.push({ code, name, marks: num(s.marks, 0), part: str(s.part) });
  });
  return { syllabus: out, problems };
}

// ---- MCQs ----
// subjects: the prep's subjects (to match codes or full names)
function cleanQuestions(list, subjects, today) {
  const problems = [], questions = [], newSubjects = [];
  const known = new Set(subjects.map(s => s.code));
  const byName = new Map(subjects.map(s => [norm(s.name), s.code]));
  const seen = new Set();
  (Array.isArray(list) ? list : []).forEach((q, i) => {
    const label = `Question ${i + 1}`;
    if (!q || typeof q !== 'object') return problems.push(`${label}: not in the right format`);
    const rawSub = str(q.subject ?? q.subjectCode ?? q.code);
    const code = byName.get(norm(rawSub)) || rawSub.toUpperCase();
    const question = str(q.question);
    const options = (Array.isArray(q.options) ? q.options : []).map(str).filter(Boolean);
    const ansRaw = str(q.answer ?? q.correctAnswer ?? q.correct);
    const answer = options.find(o => o === ansRaw) ?? options.find(o => norm(o) === norm(ansRaw));
    let p = null;
    if (!question) p = 'has no "question"';
    else if (!CODE_RE.test(code)) p = `"subject" must be a subject code like ${subjects[0] ? subjects[0].code : 'CN'}`;
    else if (options.length < 2) p = 'needs at least 2 "options"';
    else if (new Set(options.map(norm)).size !== options.length) p = 'has two options that are the same';
    else if (!ansRaw) p = 'has no "answer"';
    else if (answer === undefined) p = /^[A-Fa-f]$/.test(ansRaw)
      ? `"answer" is the letter ${ansRaw}; it must be the option text itself`
      : `"answer" (${ansRaw}) is not exactly one of the options`;
    const short = question.length > 60 ? question.slice(0, 57) + '…' : question;
    if (p) return problems.push(`${label}${short ? ` "${short}"` : ''}: ${p}`);
    const id = cleanId(q.id) || `${code}-${hashId(norm(question))}`;
    if (seen.has(id)) return problems.push(`${label} "${short}": appears twice in this file`);
    seen.add(id);
    if (!known.has(code) && !newSubjects.includes(code)) newSubjects.push(code);
    const item = {
      id, subject: code, topic: str(q.topic) || 'General', subtopic: str(q.subtopic),
      type: str(q.type), difficulty: str(q.difficulty), question, options, answer,
      explanation: str(q.explanation), hint: str(q.hint ?? q.memoryHint ?? q['memory hint']),
      concept: str(q.concept), trap: str(q.trap ?? q.examTrap), added: str(q.added) || today,
    };
    if (q.retired === true || norm(q.status) === 'retired') item.retired = true;
    questions.push(item);
  });
  return { questions, problems, newSubjects };
}

// ---- revision notes ----
const NOTE_FIELDS = ['keyDifference', 'points', 'memoryTrick', 'examTrap', 'related'];
function cleanNotes(list, subjects, today) {
  const problems = [], notes = [], newSubjects = [];
  const known = new Set(subjects.map(s => s.code));
  const byName = new Map(subjects.map(s => [norm(s.name), s.code]));
  const seen = new Set();
  (Array.isArray(list) ? list : []).forEach((n, i) => {
    const label = `Note ${i + 1}`;
    if (!n || typeof n !== 'object') return problems.push(`${label}: not in the right format`);
    const rawSub = str(n.subject ?? n.subjectCode ?? n.code);
    const code = byName.get(norm(rawSub)) || rawSub.toUpperCase();
    const title = str(n.title);
    if (!title) return problems.push(`${label}: has no "title"`);
    if (!CODE_RE.test(code)) return problems.push(`${label} "${title}": "subject" must be a subject code`);
    const id = cleanId(n.id) || `${code}-n${hashId(norm(title))}`;
    if (seen.has(id)) return problems.push(`${label} "${title}": appears twice in this file`);
    seen.add(id);
    if (!known.has(code) && !newSubjects.includes(code)) newSubjects.push(code);
    const item = { id, subject: code, topic: str(n.topic), title, added: str(n.added) || today };
    for (const [k, v] of Object.entries(n)) {
      if (['id', 'subject', 'subjectCode', 'code', 'topic', 'title', 'added', 'type'].includes(k)) continue;
      if (Array.isArray(v)) { const arr = v.map(str).filter(Boolean); if (arr.length) item[k] = arr; }
      else if (str(v)) item[k] = str(v);
    }
    notes.push(item);
  });
  return { notes, problems, newSubjects };
}

// ---- the older Markdown format (still accepted) ----
function mdToQuestions(text) {
  return parseBlocks(text, 'Q').map(b => ({
    id: b.id, subject: asText(b.f.subject), topic: asText(b.f.topic), subtopic: asText(b.f.subtopic),
    type: asText(b.f.type), difficulty: asText(b.f.difficulty), question: asText(b.f.question),
    options: Array.isArray(b.f.options) ? b.f.options : [], answer: asText(b.f.answer),
    explanation: asText(b.f.explanation), hint: asText(b.f['memory hint']), concept: asText(b.f.concept),
    trap: asText(b.f.trap), added: asText(b.f.added), status: asText(b.f.status),
  }));
}
function mdToNotes(text) {
  const map = { 'key difference': 'keyDifference', 'memory trick': 'memoryTrick', 'exam trap': 'examTrap', 'related questions': 'related' };
  return parseBlocks(text, 'N').map(b => {
    const o = { id: b.id };
    for (const [k, v] of Object.entries(b.f)) {
      const key = map[k] || k.replace(/\s+(\w)/g, (_, c) => c.toUpperCase());
      o[key] = key === 'related' && !Array.isArray(v) ? String(v).split(/\s*,\s*/) : v;
    }
    return o;
  });
}

// Reads pasted text or a file. Returns { kind, data } or { error }.
// kind: 'syllabus' | 'mcq' | 'notes' | 'prep'
function parseImport(text) {
  let t = String(text || '').trim();
  if (!t) return { error: 'Nothing pasted yet.' };
  const fence = t.match(/```(?:json|JSON|md|markdown)?\s*\n([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  if (/^##\s+Q:/m.test(t)) return { kind: 'mcq', data: { questions: mdToQuestions(t) } };
  if (/^##\s+N:/m.test(t)) return { kind: 'notes', data: { notes: mdToNotes(t) } };
  if (!/^[\[{]/.test(t)) {
    const i = t.search(/[\[{]/);
    if (i < 0) return { error: 'This is not JSON. It should start with { and end with }.' };
    t = t.slice(i);
  }
  let o;
  try { o = JSON.parse(t); }
  catch (e) {
    return { error: `The JSON has a mistake (${e.message}). Ask the AI to "return only valid JSON in one code block" and paste again.` };
  }
  if (Array.isArray(o)) {
    const first = o.find(x => x && typeof x === 'object') || {};
    if ('options' in first || 'answer' in first) return { kind: 'mcq', data: { questions: o } };
    if ('title' in first) return { kind: 'notes', data: { notes: o } };
    if ('code' in first) return { kind: 'syllabus', data: { subjects: o } };
    return { error: 'Could not tell what this list contains. Use one of the sample formats.' };
  }
  if (!o || typeof o !== 'object') return { error: 'This JSON is not in a format the app knows.' };
  const type = norm(o.type);
  if (['prep', 'syllabus', 'mcq', 'notes'].includes(type)) return { kind: type, data: o };
  if (Array.isArray(o.questions) && Array.isArray(o.subjects)) return { kind: 'prep', data: o };
  if (Array.isArray(o.questions)) return { kind: 'mcq', data: o };
  if (Array.isArray(o.notes)) return { kind: 'notes', data: o };
  if (Array.isArray(o.subjects)) return { kind: 'syllabus', data: o };
  return { error: 'This JSON is not in a format the app knows. Use one of the sample formats.' };
}

// ---- samples and AI prompts shown on the import screen ----
const SAMPLES = {
  syllabus: {
    type: 'syllabus', name: 'State Engineering Exam', examDate: '2027-03-15',
    marking: { correct: 2, wrong: -0.5, totalQuestions: 100, minutes: 120 },
    subjects: [
      { code: 'CN', name: 'Computer Networks', marks: 20, part: 'B' },
      { code: 'DE', name: 'Digital Electronics', marks: 20, part: 'B' },
    ],
  },
  mcq: {
    type: 'mcq',
    questions: [{
      subject: 'CN', topic: 'Transport Layer', subtopic: 'TCP vs UDP', type: 'Confusion', difficulty: 'Easy',
      question: 'Which protocol is connection-oriented?',
      options: ['TCP', 'UDP', 'IP', 'ICMP'], answer: 'TCP',
      explanation: 'TCP sets up a connection with a three-way handshake before sending data. UDP, IP and ICMP are connectionless.',
      hint: 'TCP = Telephone call (connect first). UDP = posting a letter.',
      concept: 'Connection-oriented vs connectionless',
      trap: 'IP is part of TCP/IP, but IP itself is connectionless.',
    }],
  },
  notes: {
    type: 'notes',
    notes: [{
      subject: 'CN', topic: 'Transport Layer', title: 'TCP vs UDP',
      keyDifference: 'TCP is connection-oriented and reliable; UDP is connectionless and fast.',
      points: ['TCP: handshake, acknowledgements, resends lost data, keeps order. Header 20–60 bytes.', 'UDP: no handshake, no acknowledgements. Header 8 bytes.', 'TCP for web, email, file transfer. UDP for DNS, live video, games.'],
      memoryTrick: 'TCP = Telephone call. UDP = posting letters.',
      examTrap: 'DNS normally uses UDP port 53, but TCP 53 for zone transfers.',
    }],
  },
};

function subjectLines(subjects) {
  return subjects.length
    ? subjects.map(s => `   ${s.code} = ${s.name}`).join('\n')
    : '   (no subjects yet: invent a short code in capital letters, e.g. NET for Networking)';
}

function promptFor(kind, prepName, subjects) {
  const json = JSON.stringify(SAMPLES[kind], null, 2);
  if (kind === 'syllabus') return `Convert the exam syllabus I attach (PDF, photo or text) into JSON for my revision app.

Reply with ONLY one JSON code block in exactly this format:
${json}

Rules:
1. "code": a short, unique code of 2 to 5 capital letters for each subject.
2. "marks": the marks or weightage of that subject (0 if not given). "part": the section name if the syllabus has parts, otherwise "".
3. "examDate": the exam date as YYYY-MM-DD, or "" if not known.
4. "marking": marks for a correct answer, marks for a wrong answer (a negative number, 0 if no negative marking), total number of questions, and duration in minutes. Use 0 for anything not given.
5. Copy subject names as they are written in the syllabus.

My syllabus:
[attach the PDF or photo, or paste the text here]`;

  if (kind === 'mcq') return `I am preparing for "${prepName}". Turn the study material at the end of this message into exam-style multiple-choice questions for my revision app.

Reply with ONLY one JSON code block in exactly this format:
${json}

Rules:
1. "subject" must be one of these codes:
${subjectLines(subjects)}
2. Give exactly 4 options. "answer" must be copied exactly from "options" (the option text, never a letter like "A").
3. Mix the question types and write the type in "type": Factual, Conceptual, Application, Comparison, Confusion, Trap.
4. "difficulty": Easy, Medium or Hard.
5. "explanation": 1 to 3 short sentences in simple English: why the answer is right and why the most tempting wrong option is wrong.
6. "hint": a short memory trick. "trap": the mistake examiners try to catch. "concept": the idea being tested.
7. Write in simple English even if my material is in Hinglish.
8. Use only facts from my material or standard textbook facts. If my material looks wrong, use the correct fact and mention it in the explanation.
9. Make 15 to 25 questions that cover the whole material. Do not add an "id".

My material:
[paste your notes here, or attach the PDF or photo]`;

  return `I am preparing for "${prepName}". From the study material at the end of this message, make short revision notes for my app. Focus on things students confuse and on exam traps.

Reply with ONLY one JSON code block in exactly this format:
${json}

Rules:
1. "subject" must be one of these codes:
${subjectLines(subjects)}
2. One note per important idea, or per pair of concepts that are easy to confuse.
3. "keyDifference": one sentence for comparisons; use "" if the note is not a comparison.
4. "points": 3 to 6 short points. "memoryTrick" and "examTrap": one short sentence each.
5. Write in simple English even if my material is in Hinglish. Keep it short and to the point.
6. Make 5 to 12 notes. Do not add an "id".

My material:
[paste your notes here, or attach the PDF or photo]`;
}

export { cleanSyllabus, cleanQuestions, cleanNotes, applyResult, dayKey, addDays, dayStart, sumDay, SCHEDULE };
