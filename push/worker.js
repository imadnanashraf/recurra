// Recurra push sender: a free Cloudflare Worker.
// The app calls it when you send a message, a friend request, or invite friends to a live test.
// It checks who is asking (their Firebase sign-in), that they may notify that person
// (friends, or invited to their test), then sends the notification with Firebase Cloud Messaging.
// Secret: FIREBASE_SERVICE_ACCOUNT (the same JSON the GitHub jobs use). Vars: PROJECT_ID, APP_URL.
// Also (POST /ai): the free trial uploads. Secret GEMINI_API_KEY (the admin's free Google AI key).
// Each person gets FREE uploads; the count lives in Firestore aiTrial/{uid}, which only this sender can change.
// The file passes straight through to Google and is never stored here.

const enc = new TextEncoder();
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...CORS } });
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-expose-headers': 'x-trial-used' };

// ---- who is asking: verify the Firebase ID token (RS256, Google's public keys) ----
let keys = null, keysUntil = 0;
async function googleKeys() {
  if (keys && Date.now() < keysUntil) return keys;
  const r = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
  const age = Number((r.headers.get('cache-control') || '').match(/max-age=(\d+)/)?.[1] || 3600);
  keys = (await r.json()).keys; keysUntil = Date.now() + age * 1000;
  return keys;
}
async function verifyIdToken(token, project) {
  const [h, p, s] = token.split('.');
  if (!s) throw new Error('bad token');
  const head = JSON.parse(new TextDecoder().decode(fromB64url(h))), body = JSON.parse(new TextDecoder().decode(fromB64url(p)));
  const jwk = (await googleKeys()).find(k => k.kid === head.kid);
  if (!jwk || head.alg !== 'RS256') throw new Error('unknown key');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, fromB64url(s), enc.encode(`${h}.${p}`));
  const now = Date.now() / 1000;
  if (!ok || body.aud !== project || body.iss !== `https://securetoken.google.com/${project}` || body.exp < now || !body.sub) throw new Error('invalid token');
  return body.sub;
}

// ---- the sender's own access to Firestore and FCM (service account → OAuth token) ----
let access = null, accessUntil = 0;
async function accessToken(sa) {
  if (access && Date.now() < accessUntil) return access;
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claim = b64url(enc.encode(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), c => c.charCodeAt(0)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = b64url(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(`${head}.${claim}`)));
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${head}.${claim}.${sig}` });
  const t = await r.json(); if (!t.access_token) throw new Error('no access token');
  access = t.access_token; accessUntil = Date.now() + 50 * 60e3;
  return access;
}
const val = v => v == null ? null : 'stringValue' in v ? v.stringValue : 'integerValue' in v ? Number(v.integerValue) : 'doubleValue' in v ? v.doubleValue : 'booleanValue' in v ? v.booleanValue : 'arrayValue' in v ? (v.arrayValue.values || []).map(val) : 'mapValue' in v ? fields(v.mapValue.fields || {}) : null;
const fields = f => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, val(v)]));
async function fsGet(env, tok, path) {
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${env.PROJECT_ID}/databases/(default)/documents/${path}`, { headers: { authorization: 'Bearer ' + tok } });
  if (r.status === 404) return null; if (!r.ok) throw new Error('firestore ' + r.status);
  return r.json();
}

// ---- a few messages per minute per person at most ----
const recent = new Map();
function tooMany(uid) { const now = Date.now(), list = (recent.get(uid) || []).filter(t => now - t < 60e3); list.push(now); recent.set(uid, list); return list.length > 40; }

// ---- free trial uploads (POST /ai) ----
const FREE = 5, GEM = 'https://generativelanguage.googleapis.com/v1beta';
function pickModel(models) {      // the newest stable "Flash" model
  const names = (models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => String(m.name || '').replace(/^models\//, ''));
  const ver = n => Number((n.match(/^gemini-(\d+(?:\.\d+)?)/) || [])[1] || 0);
  const stable = names.filter(n => /^gemini-\d+(\.\d+)?-flash$/.test(n)).sort((a, b) => ver(b) - ver(a));
  return stable[0] || (names.includes('gemini-flash-latest') ? 'gemini-flash-latest' : 'gemini-2.5-flash');
}
let model = '', modelUntil = 0;
async function trialModel(env) {
  if (env.GEMINI_MODEL) return env.GEMINI_MODEL;
  if (model && Date.now() < modelUntil) return model;
  const r = await fetch(`${GEM}/models?pageSize=200`, { headers: { 'x-goog-api-key': env.GEMINI_API_KEY } });
  model = pickModel(r.ok ? (await r.json()).models : []); modelUntil = Date.now() + 6 * 3600e3;
  return model;
}
async function aiTrial(req, env) {
  if (req.method !== 'POST') return json({ ok: true, service: 'Recurra free uploads', on: !!env.GEMINI_API_KEY });
  if (!env.GEMINI_API_KEY) return json({ error: 'free uploads are off' }, 403);
  try {
    const uid = await verifyIdToken((req.headers.get('authorization') || '').replace(/^Bearer /, ''), env.PROJECT_ID);
    if (tooMany(uid)) return json({ error: 'slow down' }, 429);
    if (Number(req.headers.get('content-length') || 0) > 21e6) return json({ error: 'too large' }, 413);
    const tok = await accessToken(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT));
    const doc = await fsGet(env, tok, `aiTrial/${uid}`), used = doc ? Number(fields(doc.fields).used || 0) : 0;
    if (used >= FREE) return json({ error: 'trial used', used }, 402);
    // the file goes straight through to Google (not read or kept here)
    const stream = new URL(req.url).searchParams.get('stream') === '1';      // live progress: Google's answer arrives piece by piece
    const r = await fetch(`${GEM}/models/${await trialModel(env)}:${stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`, { method: 'POST', headers: { 'x-goog-api-key': env.GEMINI_API_KEY, 'content-type': 'application/json' }, body: req.body });
    let now = used;
    if (r.ok) {
      const name = `projects/${env.PROJECT_ID}/databases/(default)/documents/aiTrial/${uid}`;
      await fetch(`https://firestore.googleapis.com/v1/projects/${env.PROJECT_ID}/databases/(default)/documents:commit`, { method: 'POST', headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json' },
        body: JSON.stringify({ writes: [{ update: { name, fields: {} }, updateMask: { fieldPaths: [] }, updateTransforms: [{ fieldPath: 'used', increment: { integerValue: '1' } }, { fieldPath: 'at', setToServerValue: 'REQUEST_TIME' }] }] }) });
      now = used + 1;
    }
    return new Response(r.body, { status: r.status, headers: { 'content-type': r.ok && stream ? 'text/event-stream' : 'application/json', 'cache-control': 'no-store', 'x-trial-used': String(now), ...CORS } });
  } catch (e) {
    return json({ error: String(e && e.message || e).slice(0, 100) }, /token|key/.test(String(e && e.message)) ? 401 : 500);
  }
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (new URL(req.url).pathname === '/ai') return aiTrial(req, env);
    if (req.method !== 'POST') return json({ ok: true, service: 'Recurra push sender' });
    try {
      const from = await verifyIdToken((req.headers.get('authorization') || '').replace(/^Bearer /, ''), env.PROJECT_ID);
      if (tooMany(from)) return json({ error: 'slow down' }, 429);
      const b = await req.json(), to = String(b.to || ''), type = String(b.type || '');
      if (!/^[A-Za-z0-9]{10,64}$/.test(to) || to === from) return json({ error: 'bad recipient' }, 400);
      const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT), tok = await accessToken(sa);
      // may "from" notify "to"?
      let allowed = false;
      if (type === 'test') {
        const room = await fsGet(env, tok, `rooms/${String(b.room || '').replace(/[^A-Za-z0-9]/g, '')}`), r = room && fields(room.fields);
        allowed = !!(r && r.host === from && (r.invited || []).includes(to));
      } else {
        const f = await fsGet(env, tok, `friendships/${from < to ? from + '_' + to : to + '_' + from}`), d = f && fields(f.fields);
        allowed = !!d && (type === 'request' ? d.status === 'pending' && d.from === from : d.status === 'accepted');
      }
      if (!allowed) return json({ error: 'not allowed' }, 403);
      // their phones and browsers
      const list = await fsGet(env, tok, `users/${to}/devices`), devices = ((list && list.documents) || []).map(d => ({ name: d.name, ...fields(d.fields) })).filter(d => d.token);
      const title = String(b.title || 'Recurra').slice(0, 60), body = String(b.body || '').slice(0, 160), where = String(b.where || '').slice(0, 80), tag = String(b.tag || type).slice(0, 60);
      let sent = 0;
      for (const d of devices.slice(0, 10)) {
        const message = d.kind === 'android'
          ? { token: d.token, data: { where, type }, android: { priority: 'HIGH', notification: { title, body, tag, icon: 'ic_stat_notify', color: '#2F6F73', sound: 'default', channel_id: type === 'test' ? 'tests' : 'messages' } } }
          : { token: d.token, data: { title, body, tag, url: (env.APP_URL || './') + where }, webpush: { headers: { Urgency: 'high', TTL: '86400' } } };
        const r = await fetch(`https://fcm.googleapis.com/v1/projects/${env.PROJECT_ID}/messages:send`, { method: 'POST', headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json' }, body: JSON.stringify({ message }) });
        if (r.ok) sent++;
        else if (r.status === 404 || r.status === 400) {           // an old token: forget it
          const e = await r.text();
          if (/UNREGISTERED|registration-token-not-registered|INVALID_ARGUMENT/.test(e)) await fetch(`https://firestore.googleapis.com/v1/${d.name}`, { method: 'DELETE', headers: { authorization: 'Bearer ' + tok } });
        }
      }
      return json({ ok: true, sent });
    } catch (e) {
      return json({ error: String(e && e.message || e).slice(0, 100) }, /token|key/.test(String(e && e.message)) ? 401 : 500);
    }
  },
};
