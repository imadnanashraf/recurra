// Gets the Firebase settings file for the Android app (google-services.json), so the app can receive
// notifications when it is closed. Uses the same service account as the other jobs. If the Android app
// is not registered in Firebase yet, it registers it (package app.recurra). It also registers the app's public
// signing fingerprints so "Continue with Google" works in the app. Prints nothing secret.
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
  // "Continue with Google" in the app: Google only trusts an app whose signing fingerprint is registered.
  // The fingerprints are public (they are printed on every APK); they are added once, then left alone.
  const want = [[process.env.KEY_SHA1, 'SHA_1'], [process.env.KEY_SHA256, 'SHA_256']].filter(([h]) => h).map(([h, t]) => [h.replace(/:/g, '').toLowerCase(), t]);
  if (want.length) {
    try {
      const have = new Set(((await call(`projects/${project}/androidApps/${app.appId}/sha`)).certificates || []).map(c => c.shaHash.toLowerCase()));
      for (const [shaHash, certType] of want) if (!have.has(shaHash)) { await call(`projects/${project}/androidApps/${app.appId}/sha`, { method: 'POST', body: JSON.stringify({ shaHash, certType }) }); console.log(`Registered the app's ${certType} fingerprint in Firebase.`); }
    } catch (e) { console.log(`::notice::Could not register the app's signing fingerprint (${e.message}). Google sign-in in the app stays off.`); }
  }
  const cfg = await call(`projects/${project}/androidApps/${app.appId}/config`);
  const gs = JSON.parse(Buffer.from(cfg.configFileContents, 'base64').toString('utf8'));
  // the Google "web client" the app asks Google for a sign-in token for; if the file does not list it yet, add it from the Google sign-in settings
  const hasWeb = c => (c.oauth_client || []).some(o => o.client_type === 3);
  if (!(gs.client || []).every(hasWeb)) {
    try {
      const r = await fetch(`https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/defaultSupportedIdpConfigs/google.com`, { headers: { authorization: `Bearer ${access_token}`, 'x-goog-user-project': project } });
      const j = await r.json(), id = r.ok && j.enabled !== false && j.clientId;
      if (id) gs.client.forEach(c => { if (!hasWeb(c)) c.oauth_client = [...(c.oauth_client || []), { client_id: id, client_type: 3 }]; });
      else console.log(`::notice::Google sign-in is not turned on in Firebase Authentication (${r.status}). Google sign-in in the app stays off.`);
    } catch (e) { console.log(`::notice::Could not read the Google sign-in settings (${e.message}).`); }
  }
  writeFileSync(out, JSON.stringify(gs, null, 2));
  console.log(`Android Firebase settings ready: notifications when the app is closed are on; Google sign-in ${(gs.client || []).every(hasWeb) ? 'on' : 'off'}.`);
} catch (e) {
  console.log(`::notice::Could not get the Android Firebase settings (${e.message}). The app still works; closed-app notifications on Android stay off until this succeeds (see push/README.md).`);
}
