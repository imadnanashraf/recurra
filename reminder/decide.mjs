// Decides what reminder to send (or none) from the day log the app saves.
// Kept separate from remind.mjs so it can be tested without Firebase.

// Today's date in India as "YYYY-MM-DD"
export function indiaToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
}

// daysDoc = { d: { "YYYY-MM-DD": { n, done, paused, left, mins } }, next: { day, count, mins } }
// Returns the message text, or null when no reminder is needed.
export function decide(daysDoc, today) {
  if (!daysDoc) return "Today's review is waiting. Open the app and press Start.";
  const d = (daysDoc.d || {})[today];
  if (d && (d.done || d.paused)) return null;
  if (d && d.left > 0) {
    const word = d.n > 0 ? 'left' : 'waiting';
    return `${d.left} questions ${word} today (~${d.mins} min). Open the app and press ${d.n > 0 ? 'Continue' : 'Start'}.`;
  }
  const next = daysDoc.next;
  if (next && next.day === today && next.count > 0) {
    return `${next.count} questions waiting today (~${next.mins} min). Open the app and press Start.`;
  }
  if (d && d.left === 0) return null;          // app says nothing is left
  return "Today's review is waiting. Open the app and press Start.";
}
