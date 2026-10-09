// Runs on GitHub's servers 4 times a day (see .github/workflows/remind.yml).
// Reads your day log from Firebase and, if today's review is not done or paused,
// sends a notification to your phone through ntfy.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { decide, indiaToday } from './decide.mjs';

const { FIREBASE_SERVICE_ACCOUNT, USER_UID, NTFY_TOPIC, APP_URL } = process.env;
if (!FIREBASE_SERVICE_ACCOUNT || !USER_UID || !NTFY_TOPIC) {
  console.error('Missing a secret: FIREBASE_SERVICE_ACCOUNT, USER_UID and NTFY_TOPIC are all required.');
  process.exit(1);
}

initializeApp({ credential: cert(JSON.parse(FIREBASE_SERVICE_ACCOUNT)) });
const snap = await getFirestore().doc(`users/${USER_UID}/progress/_days`).get();
const today = indiaToday();
const text = decide(snap.exists ? snap.data() : null, today);

if (!text) {
  console.log(`${today}: done or paused, no reminder.`);
} else {
  const res = await fetch(`https://ntfy.sh/${encodeURIComponent(NTFY_TOPIC)}`, {
    method: 'POST',
    body: text,
    headers: { Title: 'SI Telecom', Tags: 'books', ...(APP_URL ? { Click: APP_URL } : {}) },
  });
  console.log(`${today}: sent "${text}" (status ${res.status})`);
  if (!res.ok) process.exit(1);
}
