// Gets the Firebase settings file for the Android app (google-services.json), so the app can receive
// notifications when it is closed. Uses the same service account as the other jobs. If the Android app
// is not registered in Firebase yet, it registers it (package app.recurra). Prints nothing secret.
import admin from 'firebase-admin';
import { writeFileSync } from 'node:fs';

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}'), out = process.argv[2];
const project = sa.project_id, pkg = 'app.recurra', API = 'https://firebase.googleapis.com/v1beta1';
try {
  const { access_token } = await admin.credential.cert(sa).getAccessToken();
  const call = async (path, opt = {}) => { const r = await fetch(`${API}/${path}`, { ...opt, headers: { authorization: `Bearer ${access_token}`, 'content-type': 'application/json' } }); const j = await r.json(); if (!r.ok) throw new Error(`${r.status} ${j.error && j.error.status}`); return j; };
  let app = ((await call(`projects/${project}/androidApps`)).apps || []).find(a => a.packageName === pkg);
  if (!app) {
    let op = await call(`projects/${project}/androidApps`, { method: 'POST', body: JSON.stringify({ packageName: pkg, displayName: 'Recurra Android' }) });
    for (let i = 0; i < 20 && !op.done; i++) { await new Promise(r => setTimeout(r, 2000)); op = await call(op.name); }
    app = op.response;
    console.log('Registered the Android app in Firebase.');
  }
  const cfg = await call(`projects/${project}/androidApps/${app.appId}/config`);
  writeFileSync(out, Buffer.from(cfg.configFileContents, 'base64'));
  console.log('Android Firebase settings ready: notifications when the app is closed are on.');
} catch (e) {
  console.log(`::notice::Could not get the Android Firebase settings (${e.message}). The app still works; closed-app notifications on Android stay off until this succeeds (see push/README.md).`);
}
