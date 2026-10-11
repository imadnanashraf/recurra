// One-off check of closed-app notifications (run by hand: Actions → "Check notifications").
// Prints only counts, kinds, dates and error codes, never tokens or messages.
// Steps: 1) is the sender live and known to the app? 2) has the admin's phone registered?
// 3) can Google deliver straight to those devices? 4) does a friend's message go through the sender?
import admin from 'firebase-admin';
import { readFileSync } from 'node:fs';
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const say = (ok, msg) => console.log(`${ok ? '::notice::✅' : '::warning::❌'} ${msg}`);
const apiKey = (readFileSync('../config.js', 'utf8').match(/apiKey:\s*"([^"]+)"/) || [])[1];

const cfg = (await db.doc('public/config').get()).data() || {};
say(!!cfg.pushUrl, `1. Sender address saved for the app: ${cfg.pushUrl ? 'yes' : 'NO'}`);
if (cfg.pushUrl) { try { const r = await fetch(cfg.pushUrl); say(r.ok, `1b. Sender answers: HTTP ${r.status} ${(await r.text()).slice(0, 60)}`); } catch (e) { say(false, '1b. Sender does not answer: ' + e.message); } }

const me = await admin.auth().getUserByEmail('adnan.ashraf19@gmail.com');
const devs = await db.collection(`users/${me.uid}/devices`).get();
const list = devs.docs.map(d => ({ id: d.id, ...d.data() }));
say(list.length > 0, `2. Admin account devices registered for notifications: ${list.length} (${list.map(d => `${d.kind} updated ${new Date(d.updated || 0).toISOString().slice(0, 16)}`).join(', ') || 'none'})`);

for (const d of list) {
  try {
    const id = await admin.messaging().send(d.kind === 'android'
      ? { token: d.token, data: { where: '#chat', type: 'check' }, android: { priority: 'high', notification: { title: 'Recurra check (1 of 2)', body: 'Sent straight from Google. If you see this, your phone can receive notifications.', channelId: 'messages', icon: 'ic_stat_notify' } } }
      : { token: d.token, data: { title: 'Recurra check (1 of 2)', body: 'Sent straight from Google.', tag: 'check', url: './' } });
    say(true, `3. Google accepted a test for the ${d.kind} device (${id.slice(-12)})`);
  } catch (e) { say(false, `3. Google refused the ${d.kind} device: ${e.code || ''} ${String(e.message).slice(0, 140)}`); }
}

// 4. the full path: a friend's message → the sender → Google → the phone
const fr = await db.collection('friendships').where('users', 'array-contains', me.uid).where('status', '==', 'accepted').limit(1).get();
if (fr.empty) say(false, '4. No accepted friend to test the full path with');
else {
  const friend = fr.docs[0].data().users.find(u => u !== me.uid);
  try {
    const ct = await admin.auth().createCustomToken(friend);
    const t = await (await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: ct, returnSecureToken: true }) })).json();
    if (!t.idToken) say(false, '4. Could not sign in as the friend: ' + JSON.stringify(t.error || {}).slice(0, 140));
    else {
      const r = await fetch(cfg.pushUrl, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + t.idToken },
        body: JSON.stringify({ to: me.uid, type: 'message', title: 'Recurra check (2 of 2)', body: 'Sent through the Recurra sender, like a friend’s message.', where: '#chat', tag: 'check2' }) });
      const body = await r.text();
      say(r.ok && /"sent":[1-9]/.test(body), `4. Through the sender: HTTP ${r.status} ${body.slice(0, 140)}`);
    }
  } catch (e) { say(false, '4. Full path failed: ' + e.message); }
}
