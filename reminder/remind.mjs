// Runs on GitHub's servers every hour (see .github/workflows/remind.yml).
// For each person with reminders on, at the hours they chose (in their own time zone),
// it sends a browser notification to each browser they turned reminders on in,
// but only if a review is still waiting today (not finished, not paused).
// The Android app schedules its own notifications on the phone; this job does not touch it.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { prepStatus, reminderText, localDate, localHour } from './decide.mjs';

const { FIREBASE_SERVICE_ACCOUNT, APP_URL, FORCE } = process.env;
if (!FIREBASE_SERVICE_ACCOUNT) { console.error('Missing the FIREBASE_SERVICE_ACCOUNT secret.'); process.exit(1); }

initializeApp({ credential: cert(JSON.parse(FIREBASE_SERVICE_ACCOUNT)) });
const db = getFirestore(), fcm = getMessaging();
const users = await db.collection('users').get();
let sent = 0, skipped = 0, failed = 0;

for (const u of users.docs) {
  const who = u.id.slice(0, 4) + '…';                       // never print ids or messages in public logs
  const remind = u.data().remind || {};
  if (!remind.on) continue;
  const tz = remind.tz || 'Asia/Kolkata';
  if (!FORCE && !(remind.hours || []).includes(localHour(tz))) continue;
  const devices = (await db.collection(`users/${u.id}/devices`).get()).docs.filter(d => d.data().kind === 'web' && d.data().token);
  if (!devices.length) continue;
  const today = localDate(tz), items = [];
  for (const p of (await db.collection(`users/${u.id}/preps`).get()).docs) {
    const days = await db.doc(`users/${u.id}/preps/${p.id}/progress/_days`).get();
    const st = prepStatus(days.exists ? days.data() : null, today, p.data().resetAt || 0);
    if (st) items.push({ name: p.data().name || 'Your prep', status: st });
  }
  const body = reminderText(items);
  if (!body) { console.log(`${who}: nothing waiting`); skipped++; continue; }
  for (const d of devices) {
    try {
      await fcm.send({ token: d.data().token, data: { title: 'Recurra', body, url: APP_URL || './' }, webpush: { headers: { Urgency: 'high', TTL: '3600' } } });
      sent++;
    } catch (e) {
      if (/registration-token-not-registered|invalid-registration-token|invalid-argument/.test(e.code || '')) { await d.ref.delete(); console.log(`${who}: removed an old browser`); }
      else { console.log(`${who}: send failed (${e.code || e.message})`); failed++; }
    }
  }
  console.log(`${who}: sent to ${devices.length} browser(s)`);
}
console.log(`${new Date().toISOString()}: ${sent} sent, ${skipped} with nothing waiting, ${failed} failed, ${users.size} people checked.`);
if (failed && !sent) process.exit(1);
