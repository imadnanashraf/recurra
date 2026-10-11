/* =====================================================================
   PART 5 — ACTIVITY LOG, ACCOUNT STATUS, SUPERADMIN
   Every sign-in, app open and change is written to the "logs" collection
   with where it happened (website / installed app / Android app, device,
   IP address and rough place). Only the superadmin can read the logs.
   ===================================================================== */
const ADMIN_EMAIL = 'adnan.ashraf19@gmail.com';
const REPO = 'imadnanashraf/recurra';   // where the account job runs (GitHub Actions)
const DAY_MS = 864e5, DELETE_WAIT_DAYS = 30;
const isAdminUser = u => !!(u && (u.email || '').toLowerCase() === ADMIN_EMAIL && u.emailVerified);
const BLOCKED = ['deleting', 'deleted', 'disabled'];
const isBlocked = status => BLOCKED.includes(status);
const fmtDate = ms => ms ? new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '–';
const fmtTime = ms => ms ? new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '–';
function ago(ms) {
  if (!ms) return 'never';
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 360) return 'online now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < DAY_MS / 1000) return `${Math.round(s / 3600)} h ago`;
  if (s < 30 * DAY_MS / 1000) return `${Math.round(s / 86400)} days ago`;
  return fmtDate(ms);
}

function platformLabel() {
  if (NATIVE) return 'Android app';
  try { if (matchMedia('(display-mode: standalone)').matches || navigator.standalone) return 'Installed web app'; } catch (e) {}
  return 'Website';
}
function deviceLabel(ua = navigator.userAgent || '') {
  const model = (ua.match(/Android [\d.]+; (?:[a-z]{2}-[a-z]{2}; )?([^;)]+?)(?: Build|\))/i) || [])[1];
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iPod/i.test(ua) ? 'iPhone/iPad' : /Windows/i.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/i.test(ua) ? 'Mac' : /CrOS/i.test(ua) ? 'ChromeOS' : /Linux/i.test(ua) ? 'Linux' : 'unknown system';
  if (NATIVE) return model && model !== 'K' ? `Android phone (${model.trim()})` : 'Android phone';
  const br = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
    : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'a browser';
  return `${br} on ${os}`;
}

const Activity = {
  netCache: null,
  // IP address and rough place (city, country). Free public lookup; cached for 30 minutes.
  async net() {
    if (this.netCache && Date.now() - this.netCache.t < 30 * 60e3) return this.netCache;
    try { const c = JSON.parse(sessionStorage.getItem('rc-net') || 'null'); if (c && Date.now() - c.t < 30 * 60e3) return (this.netCache = c); } catch (e) {}
    const get = async (url, ms = 3500) => {
      const ctl = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = ctl && setTimeout(() => ctl.abort(), ms);
      try { const r = await fetch(url, ctl ? { signal: ctl.signal } : {}); return r && r.ok && r.json ? await r.json() : null; }
      catch (e) { return null; } finally { if (timer) clearTimeout(timer); }
    };
    let out = { ip: '', place: '', t: Date.now() };
    const a = await get('https://ipapi.co/json/');
    if (a && a.ip) out = { ip: a.ip, place: [a.city, a.region, a.country_name].filter(Boolean).filter((v, i, l) => l.indexOf(v) === i).join(', '), t: Date.now() };
    else { const b = await get('https://api.ipify.org?format=json'); if (b && b.ip) out.ip = b.ip; }
    this.netCache = out;
    try { sessionStorage.setItem('rc-net', JSON.stringify(out)); } catch (e) {}
    return out;
  },
  // who = the account the action is about (defaults to the account in view); the signed-in person is recorded as "by" when different
  async log(action, detail = {}, who) {
    try {
      const actor = App.authUser;
      if (!actor || !Store.fs) return;
      const target = who || (App.viewAs ? App.viewAs : { uid: actor.uid, email: actor.email || '', name: displayName() });
      const net = await this.net();
      const doc = { at: Date.now(), action, detail, uid: target.uid, email: target.email || '', name: target.name || '',
        platform: platformLabel(), device: deviceLabel(), ip: net.ip || '', place: net.place || '' };
      if (target.uid !== actor.uid) { doc.byUid = actor.uid; doc.byEmail = actor.email || ''; }
      await Store.fs.collection('logs').doc().set(doc);
    } catch (e) { console.warn('log failed', e); }
  },
  // "last seen" on the profile, every 5 minutes while the app is open (own account only)
  hb: null,
  async seen() {
    if (!App.authUser || App.viewAs || document.hidden) return;
    const net = await this.net();
    Store.fs.doc(`users/${App.authUser.uid}`).set({ lastSeen: Date.now(), lastPlatform: platformLabel(), lastDevice: deviceLabel(), lastIp: net.ip || '', lastPlace: net.place || '' }, { merge: true }).catch(() => {});
  },
  start() {
    clearInterval(this.hb);
    this.seen();
    this.hb = setInterval(() => this.seen(), 5 * 60e3);
  },
  stop() { clearInterval(this.hb); this.hb = null; },
  // one "opened the app" entry per 30 minutes of use on each device
  opened() {
    let last = 0; const k = 'rc-opened-' + App.authUser.uid;
    try { last = Number(localStorage.getItem(k)) || 0; localStorage.setItem(k, String(Date.now())); } catch (e) {}
    if (Date.now() - last > 30 * 60e3) this.log('app_opened');
  },
};
document.addEventListener('visibilitychange', () => { if (!document.hidden && App.authUser) { Activity.seen(); Activity.opened(); } });

// Human-readable lines for the log. [group, text or (detail) => text]
const ACTIONS = {
  account_created: ['Account', 'Created an account'],
  signed_in: ['Sign-in', 'Signed in'],
  signed_out: ['Sign-in', 'Signed out'],
  app_opened: ['Sign-in', 'Opened the app'],
  password_reset_sent: ['Account', 'Asked for a password reset email'],
  password_changed: ['Account', 'Changed their password'],
  profile_updated: ['Account', d => `Changed their ${d.what || 'profile'}`],
  reminders_changed: ['Account', d => d.on ? 'Turned daily reminders on' : 'Turned daily reminders off'],
  delete_requested: ['Account', d => `Asked to delete the account (erased on ${fmtDate(d.deleteAt)})`],
  account_erased: ['Account', 'Account and all its data erased'],
  prep_created: ['Content', d => `Created the prep "${d.prep}"${d.questions ? ` with ${d.questions} questions` : ''}`],
  prep_deleted: ['Content', d => `Deleted the prep "${d.prep}"`],
  prep_reset: ['Content', d => `Reset progress in "${d.prep}"`],
  prep_exported: ['Content', d => `Exported "${d.prep}"`],
  content_added: ['Content', d => `Added ${d.summary} to "${d.prep}"`],
  subject_saved: ['Content', d => `${d.edit ? 'Edited' : 'Added'} the subject "${d.subject}" in "${d.prep}"`],
  syllabus_edited: ['Content', d => `Edited the topics of "${d.subject}" (${d.topics}) in "${d.prep}"`],
  subject_completed: ['Study', d => `Studied every topic of "${d.subject}" in "${d.prep}"`],
  subject_removed: ['Content', d => `Removed the subject "${d.subject}" from "${d.prep}"`],
  username_set: ['Account', d => `Picked the username @${d.username}`],
  username_changed: ['Account', d => `Changed their username to @${d.username}`],
  friend_request_sent: ['Friends', d => `Sent a friend request to ${d.to || 'someone'}`],
  friend_added: ['Friends', d => `Became friends with ${d.who || 'someone'}`],
  friend_removed: ['Friends', 'Removed a friend'],
  user_blocked: ['Friends', 'Blocked someone'],
  user_unblocked: ['Friends', 'Unblocked someone'],
  session_finished: ['Study', d => `Studied ${d.n} ${d.n === 1 ? 'question' : 'questions'} in "${d.prep}" (${d.right} right first try)`],
  day_paused: ['Study', d => d.paused ? `Paused today in "${d.prep}"` : `Resumed today in "${d.prep}"`],
  admin_opened_account: ['Admin', 'Admin opened this account'],
  admin_reset_sent: ['Admin', 'Admin sent a password reset email'],
  admin_password_set: ['Admin', 'Admin set a new password'],
  password_applied: ['Admin', 'New password applied (they were signed out everywhere)'],
  admin_renamed: ['Admin', d => `Admin renamed the account to "${d.name}"`],
  admin_disabled: ['Admin', 'Admin turned the account off'],
  admin_enabled: ['Admin', 'Admin turned the account back on'],
  admin_delete_scheduled: ['Admin', d => `Admin scheduled deletion (erased on ${fmtDate(d.deleteAt)})`],
  admin_restored: ['Admin', 'Admin cancelled the deletion and restored the account'],
  admin_deleted_now: ['Admin', 'Admin deleted the account and all its data'],
};
function actionText(l) {
  const a = ACTIONS[l.action];
  if (!a) return l.action.replace(/_/g, ' ');
  try { return typeof a[1] === 'function' ? a[1](l.detail || {}) : a[1]; } catch (e) { return l.action; }
}
const actionGroup = l => (ACTIONS[l.action] || ['Other'])[0];
