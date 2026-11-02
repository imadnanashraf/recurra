// Checks for the daily plan and the review gaps (src/core.js). Run: node scripts/plantest.cjs
const fs = require('fs'), vm = require('vm');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + '/../src/core.js', 'utf8') + '\nthis.X = { todayPlan, applyResult, applyPractice, mixNewOld, addDays, dayStart, SCHEDULE, spreadDay, gapFactor, forecastDays, questionFamilies, clampMinutes };', ctx);
const { todayPlan, applyResult, applyPractice, mixNewOld, addDays, dayStart, SCHEDULE, spreadDay, gapFactor, forecastDays, questionFamilies, clampMinutes } = ctx.X;
let pass = 0, fail = 0; const ok = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x)); } };
const now = new Date(2026, 9, 15, 10).getTime(), DAY = 864e5;
const exam = d => new Date(2026, 9, 15 + d).getTime();
const Q = (n, added, code = 'A', topic = 't') => Array.from({ length: n }, (_, i) => ({ id: code + added + i, code, added, order: i, topic, subtopic: 's' + i, question: `Distinct question number ${i} about item${i} widget${i * 7}`, answer: 'ans' + i }));
const st = map => id => map[id];
const days = ms => Math.round((dayStart(ms) - dayStart(now)) / DAY);
const secsOf = (p, S, spq) => p.due.reduce((a, q) => a + ((S[q.id] || {}).lv >= 4 ? 10 : spq), 0) + p.fresh.length * spq * 1.25;

// daily minutes: 75 by default, never over 90
ok('default 75 minutes', clampMinutes(0) === 75 && clampMinutes(undefined) === 75);
ok('never over 90', clampMinutes(120) === 90 && clampMinutes(45) === 45);

// --- gaps ---
{ // new, right on the first day: still learning (level 0), back in 1 day (2 when sure)
  const a = applyResult(null, 'correct', 'A', now, exam(76), false, 'sure');
  ok('first day right + sure: level 0, back in 2 days', a.lv === 0 && days(a.due) === 2, [a.lv, days(a.due)]);
  const b = applyResult(null, 'correct', 'A', now, exam(76), false, 'unsure');
  ok('first day right + not sure: level 0, back tomorrow', b.lv === 0 && days(b.due) === 1);
  // confirmed on a later day
  const c = applyResult({ ...a }, 'correct', 'A', now + 2 * DAY, exam(76), false, 'sure');
  ok('confirmed on a later day + sure: level 2 (3 days)', c.lv === 2 && Math.round((dayStart(c.due) - dayStart(now + 2 * DAY)) / DAY) === 3, [c.lv]);
  const d = applyResult({ ...b }, 'correct', 'A', now + DAY, exam(76), false, 'unsure');
  ok('confirmed + not sure: level 1', d.lv === 1);
}
{ // sure jumps 2 levels, not sure 1; wrong back to 0
  const s = { lv: 2, t: now - 3 * DAY, f: now - 9 * DAY, due: now, a: 3, c: 3, w: 0, s: 3 };
  ok('sure: +2 levels (3 → 14 days)', applyResult(s, 'correct', 'A', now, exam(76), false, 'sure').lv === 4);
  ok('not sure: +1 level', applyResult(s, 'correct', 'A', now, exam(76), false, 'unsure').lv === 3);
  ok('confidence not asked: +1 level', applyResult(s, 'correct', 'A', now, exam(76), false, '').lv === 3);
  const w = applyResult(s, 'wrong', 'A', now, exam(76), false, 'sure'); ok('wrong: level 0, tomorrow', w.lv === 0 && days(w.due) === 1);
  const h = applyResult({ ...s, w: 3 }, 'correct', 'A', now, exam(76), false, 'sure'); ok('hard question (3 wrongs): never past level 3', h.lv === 3);
}
{ // level 5 far from exam → 30 days; run-up and the day before the exam
  const s = { lv: 4, t: now - 10 * DAY, f: now - 40 * DAY, due: now, a: 4, c: 4, w: 0, s: 4 };
  ok('level 5 far from exam → 30 days', days(applyResult(s, 'correct', 'A', now, exam(76), false, 'sure').due) === 30);
  ok('18 days left: gap at most 6', days(applyResult(s, 'correct', 'A', now, exam(18), false, 'sure').due) === 6);
  ok('2 days left: tomorrow (the day before)', days(applyResult(s, 'correct', 'A', now, exam(2), false, 'sure').due) === 1);
  // self-check factor stretches long gaps
  ok('factor 1.2 → 36 days', days(applyResult(s, 'correct', 'A', now, exam(90), false, 'sure', { factor: 1.2 }).due) === 36);
}
// --- spreading: never earlier, lightest day of the window ---
{ const load = {}; const L = d => load[dayStart(d)] || 0;
  const target = addDays(now, 3), got = [];
  for (let i = 0; i < 9; i++) { const d = spreadDay(target, 3, L); got.push(days(d)); load[dayStart(d)] = (load[dayStart(d)] || 0) + 1; }
  ok('10 pushed to day 3 spread over days 3–5, never earlier', got.every(d => d >= 3 && d <= 5) && new Set(got).size === 3 && got.filter(d => d === 3).length === 3, got);
  ok('a 1-day gap is not moved', days(spreadDay(addDays(now, 1), 1, L)) === 1);
  ok('spreading never passes the day before the exam', days(spreadDay(addDays(now, 14), 14, () => 0, addDays(now, 15))) <= 15);
  // through applyResult
  const busy = d => days(d) === 3 ? 50 : 0;
  const r = applyResult({ lv: 1, t: now - DAY, f: now - 5 * DAY, due: now, a: 1, c: 1, w: 0, s: 1 }, 'correct', 'A', now, exam(76), false, '', { load: busy });
  ok('a busy day 3 → the review goes to day 4', days(r.due) === 4, days(r.due)); }
// --- self-check ---
ok('remembering 80% → gaps shorten', gapFactor(1, '1111011110'.repeat(4)) < 1);
ok('remembering 100% → gaps grow', gapFactor(1, '1'.repeat(40)) > 1);
ok('remembering 90% → unchanged', gapFactor(1, '1111111110'.repeat(4)) === 1);
ok('too few reviews → unchanged', gapFactor(1, '0000') === 1);
ok('limits 0.7–1.4', gapFactor(0.7, '0'.repeat(40)) === 0.7 && gapFactor(1.4, '1'.repeat(40)) === 1.4);

// --- the day ---
{ // 1000 unseen, nothing due: new ones up to their share of 75 minutes
  const qs = Q(1000, '2026-10-10'); const p = todayPlan(qs, st({}), now, exam(76), ['A'], null, { minutes: 75, secsPerQ: 30 });
  ok('new per day: a third of 75 min at 37.5 s → 36', p.fresh.length === 36, p.fresh.length);
  ok('queue: all of them', p.queue.length === 36);
  ok('fits in 75 minutes', secsOf(p, {}, 30) <= 75 * 60); }
{ // a heavy day: 400 due at level 1 (30 s each = 200 min): fitted to 75 minutes, riskiest first, new still get their share
  const qs = [...Q(500, '2026-10-10'), ...Q(400, '2026-10-01', 'B')], S = {};
  qs.filter(q => q.code === 'B').forEach((q, i) => { S[q.id] = { t: now - 5 * DAY, f: now - 9 * DAY, lv: i < 50 ? 0 : 1, due: now - (i % 5) * DAY, a: 1, c: 1, w: i < 20 ? 2 : 0, s: 1 }; });
  const p = todayPlan(qs, st(S), now, exam(76), ['A', 'B'], null, { minutes: 75, secsPerQ: 30 });
  const secs = secsOf(p, S, 30);
  ok('heavy day: within 75 minutes', secs <= 75 * 60 && secs > 70 * 60, Math.round(secs / 60));
  ok('heavy day: some revisions moved on', p.deferred > 0 && p.catchingUp === 'slow');
  ok('heavy day: new ones keep about a third', p.fresh.length > 0 && p.fresh.length * 37.5 <= 75 * 60 * 0.31, p.fresh.length);
  ok('heavy day: level-0 (learning) revisions all in', S && qs.filter(q => S[q.id] && S[q.id].lv === 0).every(q => p.due.includes(q)));
  const order = p.queue;
  ok('order: first 4 new, then 1 new after 3 revisions', order.slice(0, 4).every(q => !S[q.id]) && !S[order[7].id] && !!S[order[4].id] && !!S[order[5].id] && !!S[order[6].id], order.slice(0, 8).map(q => !!S[q.id]));
  ok('90 minutes is the most', (() => { const p9 = todayPlan(qs, st(S), now, exam(76), ['A', 'B'], null, { minutes: 200, secsPerQ: 30 }); return secsOf(p9, S, 30) <= 90 * 60; })()); }
{ // strong questions count as quick checks (10 s)
  const qs = Q(300, '2026-10-01', 'B'), S = {};
  qs.forEach(q => { S[q.id] = { t: now - 20 * DAY, f: now - 50 * DAY, lv: 4, due: now, a: 4, c: 4, w: 0, s: 4 }; });
  const p = todayPlan(qs, st(S), now, exam(76), ['B'], null, { minutes: 75, secsPerQ: 30 });
  ok('300 strong reviews at 10 s fit in 75 minutes', p.due.length === 300 && p.deferred === 0, [p.due.length, p.deferred]); }
{ // families: near-identical questions, one a day from level 2
  const base = { code: 'A', topic: 'Transport', subtopic: 'TCP', added: '2026-10-01' };
  const qs = [
    { ...base, id: 'f1', order: 1, question: 'Which transport protocol is connection oriented and reliable?', answer: 'TCP' },
    { ...base, id: 'f2', order: 2, question: 'Which protocol is reliable and connection oriented at the transport layer?', answer: 'TCP' },
    { ...base, id: 'f3', order: 3, question: 'What is the default port number of HTTPS?', answer: '443' },
  ];
  const fam = questionFamilies(qs);
  ok('similar questions form a family', fam.get('f1') === fam.get('f2') && fam.get('f3') !== fam.get('f1'));
  const S = {}; qs.forEach(q => { S[q.id] = { t: now - 5 * DAY, f: now - 20 * DAY, lv: 2, due: now, a: 2, c: 2, w: 0, s: 2 }; });
  const p = todayPlan(qs, st(S), now, exam(76), ['A'], null, { minutes: 75, secsPerQ: 30 });
  ok('one of a family a day (the other moves on)', p.due.length === 2 && p.buried === 1, [p.due.length, p.buried]);
  const S2 = {}; qs.forEach(q => { S2[q.id] = { t: now - 5 * DAY, f: now - 20 * DAY, lv: 1, due: now, a: 1, c: 1, w: 0, s: 1 }; });
  ok('weak family members are all asked', todayPlan(qs, st(S2), now, exam(76), ['A'], null, {}).due.length === 3); }
{ // final week: no new; behind warning
  const qs = Q(50, '2026-10-10'); const p = todayPlan(qs, st({}), now, exam(6), ['A'], null); ok('final week: no new questions', p.fresh.length === 0 && p.finalWeek);
  const big = Q(4000, '2026-10-10'); const pb = todayPlan(big, st({}), now, exam(40), ['A'], null, { minutes: 75, secsPerQ: 30 });
  ok('too many new for the days left: warns how many', pb.behind > 0 && pb.behind < 4000, pb.behind); }
{ // forecast
  const qs = Q(20, '2026-10-01'), S = {}; qs.forEach((q, i) => { S[q.id] = { t: now - DAY, f: now - 9 * DAY, lv: 2, due: addDays(now, 1 + (i % 3)), a: 1, c: 1 }; });
  const f = forecastDays(qs, st(S), now, { minutes: 75, secsPerQ: 30 }, 7);
  ok('forecast: 7 days, counts by day', f.length === 7 && f[0].n === 7 && f[1].n === 7 && f[2].n === 6 && f[3].n === 0, f.map(d => d.n)); }
// newest and oldest mixed: 2 of 3 newest, 1 oldest
{ const list = Array.from({ length: 10 }, (_, i) => i); ok('mix newest/oldest', JSON.stringify(mixNewOld(list, 6)) === JSON.stringify([0, 1, 9, 2, 3, 8])); }
// early practice doesn't fast-forward; wrong still counts
{ const s = { lv: 3, t: now - DAY, f: now - 30 * DAY, due: now + 6 * DAY, a: 3, c: 3, w: 0, s: 3 };
  const r = applyPractice(s, 'correct', 'A', now, exam(76), false, 'sure'); ok('early right: level and date kept', r.lv === 3 && r.due === s.due && r.c === 4);
  const w = applyPractice(s, 'wrong', 'A', now, exam(76), false, 'sure'); ok('early wrong: back to level 0, tomorrow', w.lv === 0 && days(w.due) === 1);
  const late = applyPractice({ ...s, t: now - 6 * DAY, due: now + DAY }, 'correct', 'A', now, exam(76), false, 'sure'); ok('past half the wait: counts as a review', late.lv === 5); }
{ const qs = Q(10, '2026-10-10'); const p = todayPlan(qs, st({}), now, exam(76), ['A'], null, { minutes: 15, secsPerQ: 30 }); ok('small day: a third of 15 minutes of new, not marked as sized', p.fresh.length === 7 && !p.fitted, [p.fresh.length, p.fitted]); }
console.log(pass, 'passed,', fail, 'failed');
