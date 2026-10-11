// Hourly account job (GitHub Actions, .github/workflows/accounts.yml). Finishes what the app cannot do by itself:
//  - turns off the login of accounts that are turned off or being deleted (they are already locked in the app)
//  - erases accounts whose 30 days are up, and accounts the admin deleted "now" (all data + the login)
//  - turns logins back on for accounts the admin restored
//  - keeps the activity log to one year
import admin from 'firebase-admin';

const DAY = 864e5, LOCKED = ['deleting', 'deleted', 'disabled'];
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const auth = admin.auth(), db = admin.firestore(), now = Date.now();
const log = doc => db.collection('logs').add({ at: Date.now(), platform: 'Server', device: 'Hourly account job', ip: '', place: '', detail: {}, ...doc });
const quiet = async fn => { try { await fn(); } catch (e) { if (e.code !== 'auth/user-not-found') throw e; } };
let erased = 0, off = 0, on = 0;

const locked = await db.collection('users').where('status', 'in', LOCKED).get();
for (const d of locked.docs) {
  const u = d.data(), uid = d.id;
  if (u.status === 'deleted' || (u.status === 'deleting' && (u.deleteAt || 0) <= now)) {
    await db.recursiveDelete(d.ref);                 // the profile and everything under it
    await quiet(() => auth.deleteUser(uid));
    await log({ action: 'account_erased', uid, email: u.email || '', name: u.name || '' });
    erased++;
  } else if (!u.authDisabled) {
    await quiet(async () => { await auth.updateUser(uid, { disabled: true }); await auth.revokeRefreshTokens(uid); });
    await d.ref.set({ authDisabled: true }, { merge: true });
    off++;
  }
}
const restored = await db.collection('users').where('authDisabled', '==', true).get();
for (const d of restored.docs) {
  if (LOCKED.includes(d.data().status)) continue;
  await quiet(() => auth.updateUser(d.id, { disabled: false }));
  await d.ref.set({ authDisabled: false }, { merge: true });
  on++;
}
const old = await db.collection('logs').where('at', '<', now - 365 * DAY).limit(400).get();
if (!old.empty) { const b = db.batch(); old.docs.forEach(d => b.delete(d.ref)); await b.commit(); }
console.log(`Accounts: ${erased} erased, ${off} logins turned off, ${on} turned back on, ${old.size} old log entries removed.`);
