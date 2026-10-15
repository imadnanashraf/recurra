// Checks for the daily plan and the review gaps (src/core.js). Run: node scripts/plantest.cjs
const fs = require('fs'), vm = require('vm');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + '/../src/core.js', 'utf8') + '\nthis.X = { todayPlan, applyResult, applyPractice, mixNewOld, addDays, dayStart, SCHEDULE };', ctx);
const { todayPlan, applyResult, applyPractice, mixNewOld, addDays, dayStart, SCHEDULE } = ctx.X;
let pass = 0, fail = 0; const ok = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x)); } };
const now = new Date(2026, 9, 15, 10).getTime(), DAY = 864e5;
const exam = d => new Date(2026, 9, 15 + d).getTime();
const Q = (n, added, code = 'A') => Array.from({ length: n }, (_, i) => ({ id: code + added + i, code, added, order: i }));
const st = map => id => map[id];
// new per day: 1000 unseen, 76 days → 15
{ const qs = Q(1000, '2026-10-10'); const p = todayPlan(qs, st({}), now, exam(76), ['A'], null); ok('new per day 1000/69 → 15', p.fresh.length === 15, p.fresh.length); }
// backlog: 70 due → no new; 40 due → minimum
for (const [dueN, want] of [[70, 0], [40, 10], [10, 15]]) {
  const qs = [...Q(1000, '2026-10-10'), ...Q(dueN, '2026-10-01', 'B')], S = {};
  qs.filter(q => q.code === 'B').forEach(q => { S[q.id] = { t: now - 5 * DAY, f: now - 9 * DAY, lv: 1, due: now - DAY, a: 1, c: 1, w: 0 }; });
  const p = todayPlan(qs, st(S), now, exam(76), ['A', 'B'], null);
  ok(`backlog ${dueN} due → ${want} new`, p.fresh.length === want, [p.fresh.length, p.catchingUp]);
  ok(`backlog ${dueN}: revision capped at 60`, p.due.length === Math.min(60, dueN));
}
// final week: no new
{ const qs = Q(50, '2026-10-10'); const p = todayPlan(qs, st({}), now, exam(6), ['A'], null); ok('final week: no new questions', p.fresh.length === 0 && p.finalWeek); }
// newest and oldest mixed: 2 of 3 newest, 1 oldest
{ const list = Array.from({ length: 10 }, (_, i) => i); ok('mix newest/oldest', JSON.stringify(mixNewOld(list, 6)) === JSON.stringify([0, 1, 9, 2, 3, 8])); }
{ const qs = [...Q(20, '2026-10-14'), ...Q(20, '2026-09-01', 'O')]; const p = todayPlan(qs, st({}), now, exam(76), ['A', 'O'], null);
  ok('old unseen questions get a share', p.fresh.some(q => q.added === '2026-09-01') && p.fresh.filter(q => q.added === '2026-10-14').length > p.fresh.length / 2, p.fresh.map(q => q.added)); }
// daily time: 20 min at 30 s/question = 40 questions; 30 due → 30 revise + 10 new
{ const qs = [...Q(500, '2026-10-10'), ...Q(30, '2026-10-01', 'B')], S = {};
  qs.filter(q => q.code === 'B').forEach(q => { S[q.id] = { t: now - 5 * DAY, f: now - 9 * DAY, lv: 1, due: now - DAY }; });
  const p = todayPlan(qs, st(S), now, exam(76), ['A', 'B'], null, { minutes: 20, secsPerQ: 30 });
  ok('daily time 20 min: 30 revise + 10 new', p.due.length === 30 && p.fresh.length === 10, [p.due.length, p.fresh.length]);
  const p2 = todayPlan(qs, st(S), now, exam(76), ['A', 'B'], null, { minutes: 10, secsPerQ: 30 });
  ok('daily time 10 min: 20 revise, no new, fitted', p2.due.length === 20 && p2.fresh.length === 0 && p2.fitted, [p2.due.length, p2.fresh.length]); }
// gaps: normal, run-up, never past the day before
{ let s = applyResult(null, 'correct', 'A', now, exam(76), false, 'sure'); ok('level 1 → 1 day', Math.round((s.due - dayStart(now)) / DAY) === 1);
  s = { lv: 4, t: now - 10 * DAY, due: now, a: 4, c: 4, w: 0, s: 4 };
  const far = applyResult(s, 'correct', 'A', now, exam(76), false, 'sure'); ok('level 5 far from exam → 30 days', Math.round((far.due - dayStart(now)) / DAY) === 30);
  const near = applyResult(s, 'correct', 'A', now, exam(18), false, 'sure'); ok('18 days left: gap at most 6', Math.round((near.due - dayStart(now)) / DAY) === 6, Math.round((near.due - dayStart(now)) / DAY));
  const last = applyResult(s, 'correct', 'A', now, exam(2), false, 'sure'); ok('2 days left: tomorrow (the day before)', Math.round((last.due - dayStart(now)) / DAY) === 1); }
// early practice doesn't fast-forward; wrong still counts
{ const s = { lv: 3, t: now - DAY, due: now + 6 * DAY, a: 3, c: 3, w: 0, s: 3 };
  const r = applyPractice(s, 'correct', 'A', now, exam(76), false, 'sure'); ok('early right: level and date kept', r.lv === 3 && r.due === s.due && r.c === 4);
  const w = applyPractice(s, 'wrong', 'A', now, exam(76), false, 'sure'); ok('early wrong: back to level 0, tomorrow', w.lv === 0 && Math.round((w.due - dayStart(now)) / DAY) === 1);
  const late = applyPractice({ ...s, t: now - 6 * DAY, due: now + DAY }, 'correct', 'A', now, exam(76), false, 'sure'); ok('past half the wait: counts as a review', late.lv === 4); }
console.log(pass, 'passed,', fail, 'failed');
{ const qs = Q(10, '2026-10-10'); const p = todayPlan(qs, st({}), now, exam(76), ['A'], null, { minutes: 15, secsPerQ: 30 }); console.log(p.fresh.length === 10 && !p.fitted ? 'PASS small day not marked as sized' : 'FAIL small day ' + JSON.stringify([p.fresh.length, p.fitted])); }
