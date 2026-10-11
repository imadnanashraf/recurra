// Creates (or refreshes) the test account with a demo prep, its questions and notes,
// and about a month of realistic study history so Today, Progress and the calendar have data.
// Runs from GitHub Actions (.github/workflows/seed-demo.yml). The password is random and never printed:
// sign in once with "Forgot password?" — the reset email arrives in the owner's normal Gmail inbox.
import admin from 'firebase-admin';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { cleanSyllabus, cleanQuestions, cleanNotes, applyResult, dayKey, addDays, dayStart, sumDay } from './applib.mjs';

const EMAIL = process.env.DEMO_EMAIL || 'adnan.ashraf19+test@gmail.com';
const NAME = 'Test Student';
const PID = 'demo';
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const auth = admin.auth(), db = admin.firestore();

let user;
try { user = await auth.getUserByEmail(EMAIL); console.log('Test account exists, refreshing its demo prep.'); }
catch (e) {
  user = await auth.createUser({ email: EMAIL, emailVerified: true, displayName: NAME, password: randomBytes(18).toString('base64url') });
  console.log('Created the test account.');
}
if (!user.emailVerified) await auth.updateUser(user.uid, { emailVerified: true });
const uid = user.uid, base = `users/${uid}`, prep = `${base}/preps/${PID}`;

// ---- content, cleaned exactly as the app's import does ----
const demo = JSON.parse(readFileSync(new URL('../samples/demo-prep.json', import.meta.url), 'utf8'));
const now = Date.now(), today = dayKey(now);
const sy = cleanSyllabus(demo).syllabus;
const questions = cleanQuestions(demo.questions, sy.subjects, today).questions;
const notes = cleanNotes(demo.notes, sy.subjects, today).notes;

// ---- a month of study, simulated with the app's own scheduling rules ----
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const state = {}, days = {};
const start = addDays(now, -30);
for (let i = 0; i < 30; i++) {
  const t = addDays(start, i) + 19 * 3600e3;            // around 7 pm each day
  if (i % 9 === 5) continue;                            // a few days off
  const due = questions.filter(q => state[q.id] && state[q.id].due <= dayStart(t));
  const fresh = questions.filter(q => !state[q.id]).slice(0, 4);
  const skill = 0.55 + 0.35 * (i / 30);
  let n = 0, c = 0;
  for (const q of [...due, ...fresh]) {
    const ok = rnd() < skill + 0.05 * Math.min(4, (state[q.id] && state[q.id].lv) || 0);
    state[q.id] = applyResult(state[q.id], ok ? 'correct' : 'wrong', q.subject, t, 0, false, ok ? 'sure' : '');
    n++; if (ok) c++;
  }
  if (n) days[dayKey(t)] = sumDay({ by: { seed: { n, c } }, done: true });
}

// ---- write it: wipe the old demo prep, then put everything back fresh ----
const batchWrites = [];
for (const col of ['bank', 'notes', 'progress']) {
  const snap = await db.collection(`${prep}/${col}`).get();
  snap.docs.forEach(d => batchWrites.push([d.ref, null]));
}
const r = now;                                            // a new reset time makes every device drop its old copy
batchWrites.push([db.doc(prep), { name: sy.name, examDate: sy.examDate, marking: sy.marking, subjects: sy.subjects, created: now, resetAt: r }]);
const chunk = (col, field, items) => {
  const by = {};
  items.forEach(x => { (by[x.subject] = by[x.subject] || {})[x.id] = x; });
  for (const [code, map] of Object.entries(by)) batchWrites.push([db.doc(`${prep}/${col}/${code}__0`), { code, [field]: map }]);
};
chunk('bank', 'q', questions);
chunk('notes', 'n', notes);
const prog = {};
for (const [id, st] of Object.entries(state)) (prog[st.k] = prog[st.k] || {})[id] = st;
for (const [code, q] of Object.entries(prog)) batchWrites.push([db.doc(`${prep}/progress/${code}`), { q, r, updated: now }]);
batchWrites.push([db.doc(`${prep}/progress/_days`), { d: days, spq: 25, next: null, r, updated: now }]);
batchWrites.push([db.doc(base), { email: EMAIL, name: NAME, activePrep: PID, test: true }, { merge: true }]);
for (let i = 0; i < batchWrites.length; i += 400) {
  const b = db.batch();
  batchWrites.slice(i, i + 400).forEach(([ref, data, opt]) => data === null ? b.delete(ref) : b.set(ref, data, opt || {}));
  await b.commit();
}
console.log(`Demo prep ready: ${questions.length} questions, ${notes.length} notes, ${Object.keys(days).length} days of history.`);
