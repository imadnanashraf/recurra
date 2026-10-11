// ---------- 1i. Reminder wording (the same rules run in the app and in the GitHub reminder job) ----------
// daysDoc = one prep's progress/_days: { d: { "YYYY-MM-DD": { n, done, paused, left, mins } }, next: { day, count, mins }, r }
// Returns null (nothing to remind) or { count, mins, started }. count null = unknown.
function prepStatus(daysDoc, today, resetAt) {
  if (!daysDoc || (daysDoc.r || 0) < (resetAt || 0)) return null;
  const d = (daysDoc.d || {})[today];
  if (d && (d.done || d.paused)) return null;
  if (d && d.left > 0) return { count: d.left, mins: d.mins || 0, started: (d.n || 0) > 0 };
  const next = daysDoc.next;
  if (next && next.day === today && next.count > 0) return { count: next.count, mins: next.mins || 0, started: false };
  if (d && d.left === 0) return null;
  if (next && next.count === 0) return null;
  return { count: null, mins: null, started: false };
}
// items = [{ name, status }] → one short, friendly notification text, or null
function reminderText(items) {
  if (!items.length) return null;
  if (items.length === 1) {
    const { name, status: s } = items[0];
    if (!s.count) return `${name}: today's review is ready whenever you are.`;
    return s.started
      ? `${name}: ${s.count} questions left today (~${s.mins} min). Pick up where you stopped.`
      : `${name}: ${s.count} questions today (~${s.mins} min). A few minutes now keeps them fresh.`;
  }
  return 'Today: ' + items.map(({ name, status: s }) => s.count ? `${name} ${s.count} (~${s.mins} min)` : name).join(' · ') + '.';
}
