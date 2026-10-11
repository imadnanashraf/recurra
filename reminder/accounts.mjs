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
// tasks from the admin panel (set a password); the password is removed from the database as soon as it is used
let tasksDone = 0;
const tasks = await db.collection('adminTasks').where('status', '==', 'pending').get();
for (const t of tasks.docs) {
  const x = t.data();
  try {
    if (x.type === 'setPassword') {
      await auth.updateUser(x.uid, { password: x.password });
      await auth.revokeRefreshTokens(x.uid);
      await db.doc(`users/${x.uid}`).set({ signOutAt: Date.now(), passwordSetAt: Date.now() }, { merge: true });   // their open app signs out now
      await log({ action: 'password_applied', uid: x.uid, email: x.email || '', name: '' });
    }
    await t.ref.update({ status: 'done', doneAt: Date.now(), password: admin.firestore.FieldValue.delete() });
    tasksDone++;
  } catch (e) {
    await t.ref.update({ status: 'failed', error: e.message || String(e), password: admin.firestore.FieldValue.delete() });
  }
}
const oldTasks = await db.collection('adminTasks').where('doneAt', '<', now - DAY).limit(200).get();
for (const d of oldTasks.docs) await d.ref.delete();

const restored = await db.collection('users').where('authDisabled', '==', true).get();
for (const d of restored.docs) {
  if (LOCKED.includes(d.data().status)) continue;
  await quiet(() => auth.updateUser(d.id, { disabled: false }));
  await d.ref.set({ authDisabled: false }, { merge: true });
  on++;
}
const old = await db.collection('logs').where('at', '<', now - 365 * DAY).limit(400).get();
if (!old.empty) { const b = db.batch(); old.docs.forEach(d => b.delete(d.ref)); await b.commit(); }
console.log(`Accounts: ${tasksDone} admin tasks done, ${erased} erased, ${off} logins turned off, ${on} turned back on, ${old.size} old log entries removed.`);
