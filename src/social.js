/* =====================================================================
   PART 6 — PEOPLE: your name and @username, friends, real-time chat
   - Everyone picks a unique @username (asked once, changeable in Settings).
   - Friends are found by @username, name, or their exact email
     (emails are never shown or listed; only a one-way fingerprint is stored).
   - A friend request must be accepted before two people can chat.
   - Messages arrive live (no refresh). The admin cannot read chats.
   Database:
     usernames/{name}       { uid }                     one owner per name
     people/{uid}           { username, first, last, name, photo, … }   what friends see
     emails/{sha256(email)} { uid }                     exact-email lookup only
     friendships/{a_b}      { users:[a,b], status, from, lastAt, lastText, lastFrom, read_<uid> }
     chats/{a_b}/messages/{id} { from, at, kind, text }
   ===================================================================== */
const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;
const Social = { list: [], people: {}, unsub: null, peopleUnsubs: {}, open: null, msgUnsub: null, msgs: [], first: true, lastSeen: {}, searchSeq: 0, results: null, sel: null };
const hasHover = () => !!(window.matchMedia && matchMedia('(hover: hover)').matches);
const pairId = (a, b) => a < b ? `${a}_${b}` : `${b}_${a}`;
const meUid = () => App.authUser && App.authUser.uid;
const fullName = p => [p.first, p.last].filter(Boolean).join(' ').trim() || (p.name || '').trim();
const cleanName = s => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 30);

/* ---------- one-way fingerprint of an email (SHA-256) ---------- */
async function sha256(text) {
  try { if (window.crypto && crypto.subtle) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); } } catch (e) {}
  // small fallback for old browsers
  const K = [], H = [], isP = n => { for (let f = 2; f * f <= n; f++) if (n % f === 0) return false; return true; };
  for (let n = 2, k = 0; k < 64; n++) if (isP(n)) { if (k < 8) H[k] = (Math.pow(n, 1 / 2) * 4294967296) | 0; K[k++] = (Math.pow(n, 1 / 3) * 4294967296) | 0; }
  const bytes = [...unescape(encodeURIComponent(text))].map(c => c.charCodeAt(0)), l = bytes.length * 8;
  bytes.push(0x80); while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i--) bytes.push(i > 3 ? 0 : (l >>> (i * 8)) & 255);
  const r = (x, n) => (x >>> n) | (x << (32 - n));
  for (let i = 0; i < bytes.length; i += 64) {
    const w = []; for (let j = 0; j < 16; j++) w[j] = (bytes[i + 4 * j] << 24) | (bytes[i + 4 * j + 1] << 16) | (bytes[i + 4 * j + 2] << 8) | bytes[i + 4 * j + 3];
    for (let j = 16; j < 64; j++) { const a = w[j - 15], b = w[j - 2]; w[j] = (w[j - 16] + (r(a, 7) ^ r(a, 18) ^ (a >>> 3)) + w[j - 7] + (r(b, 17) ^ r(b, 19) ^ (b >>> 10))) | 0; }
    let [a, b, c, d, e, f, g, h] = H;
    for (let j = 0; j < 64; j++) {
      const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[j] + w[j]) | 0, t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0; H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  return H.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
}

/* ---------- avatars of other people ---------- */
function pColor(uid) { let h = 0; for (const ch of uid || 'x') h = (h * 31 + ch.charCodeAt(0)) >>> 0; return AVATAR_COLORS[h % AVATAR_COLORS.length]; }
function pAvatar(p, cls = '') {
  p = p || {};
  const inner = p.photo ? `<img src="${esc(p.photo)}" alt="" referrerpolicy="no-referrer">` : esc(initials(fullName(p) || p.username || '?'));
  return `<span class="avatar ${cls}" style="background:${pColor(p.uid)}">${inner}</span>`;
}

/* ---------- profile: first name, last name, @username ---------- */
function suggestBase(first, last) {
  const s = [first, last].filter(Boolean).join('_').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_').replace(/[^a-z0-9_.]/g, '');
  return (s || 'student').slice(0, 16).replace(/^[._]+|[._]+$/g, '').padEnd(3, '0');
}
async function usernameOwner(name) {
  try { const d = await Store.fs.doc(`usernames/${name}`).get(); return d.exists ? (d.data() || {}).uid || '?' : null; } catch (e) { return '?'; }
}
async function suggestUsername(first, last) {
  const base = suggestBase(first, last);
  for (const tail of ['', ...Array.from({ length: 6 }, () => String(10 + Math.floor(Math.random() * 89)))]) {
    const u = (base + tail).slice(0, 20), owner = await usernameOwner(u);
    if (!owner || owner === meUid()) return u;
  }
  return base + Date.now().toString(36).slice(-4);
}
const Setup = { edit: false, timer: null, seq: 0, ok: false, touched: false };
function needsSetup() { return !!(App.authUser && App.user && !App.viewAs && App.user.uid === App.authUser.uid && !App.profile.username); }
function openSetup(edit) {
  Setup.edit = !!edit; Setup.ok = false; Setup.touched = !!edit;
  const p = App.profile, guess = fullName(p) || displayName();
  const [g1, ...gr] = guess.split(' ');
  $('setupTitle').textContent = edit ? 'Your name and username' : 'Welcome! Set up your profile';
  $('setupIntro').textContent = edit ? 'Friends see your name and find you by your @username.' : 'Friends find you by your @username. Your email stays private. You can change these later in Settings.';
  $('setFirst').value = p.first || (p.last ? '' : g1 || ''); $('setLast').value = p.last || (p.first ? '' : gr.join(' '));
  $('setUser').value = p.username || '';
  $('setCancel').hidden = !edit; msg('setMsg', ''); hint('', '');
  $('setupSheet').hidden = false; document.body.classList.add('sheet-open');
  if (!p.username) suggestUsername($('setFirst').value, $('setLast').value).then(u => { if (!Setup.touched && !$('setUser').value) { $('setUser').value = u; checkUsername(); } });
  else checkUsername();
  setTimeout(() => { try { $(edit ? 'setUser' : 'setFirst').focus(); } catch (e) {} }, 50);
}
function closeSetup() { $('setupSheet').hidden = true; document.body.classList.remove('sheet-open'); }
function hint(text, cls) { const h = $('setUserHint'); h.textContent = text; h.className = 'uhint ' + (cls || ''); }
function checkUsername() {
  clearTimeout(Setup.timer);
  const u = $('setUser').value.trim().toLowerCase().replace(/^@/, '');
  Setup.ok = false;
  if (!u) return hint('3 to 20 characters: small letters, numbers, _ or .', '');
  if (/\s/.test(u)) return hint('No spaces. Use _ or . instead.', 'bad');
  if (!USERNAME_RE.test(u)) return hint(u.length < 3 ? 'At least 3 characters.' : u.length > 20 ? 'At most 20 characters.' : 'Only small letters, numbers, _ and . are allowed.', 'bad');
  if (u === App.profile.username) { Setup.ok = true; return hint('✓ This is your username', 'good'); }
  hint('Checking…', '');
  const seq = ++Setup.seq;
  Setup.timer = setTimeout(async () => {
    const owner = await usernameOwner(u);
    if (seq !== Setup.seq) return;
    if (owner === '?') return hint('Could not check. Check your internet.', 'bad');
    Setup.ok = !owner || owner === meUid();
    hint(Setup.ok ? `✓ @${u} is available` : `✗ @${u} is taken. Try another.`, Setup.ok ? 'good' : 'bad');
  }, 300);
}
$('setUser').addEventListener('input', () => {
  Setup.touched = true;
  const el = $('setUser'), v = el.value.toLowerCase().replace(/^@/, '').replace(/\s+/g, '_');
  if (v !== el.value) el.value = v;
  checkUsername();
});
['setFirst', 'setLast'].forEach(id => $(id).addEventListener('input', () => {
  if (Setup.touched || App.profile.username) return;
  clearTimeout(Setup.sug);
  Setup.sug = setTimeout(() => suggestUsername($('setFirst').value, $('setLast').value).then(u => { if (!Setup.touched) { $('setUser').value = u; checkUsername(); } }), 400);
}));
$('setCancel').addEventListener('click', closeSetup);
$('setupForm').addEventListener('submit', async e => {
  e.preventDefault();
  const first = cleanName($('setFirst').value), last = cleanName($('setLast').value), u = $('setUser').value.trim().toLowerCase();
  if (!first) return msg('setMsg', 'Please enter your first name.', 'err');
  if (!last) return msg('setMsg', 'Please enter your last name.', 'err');
  if (!USERNAME_RE.test(u)) return msg('setMsg', 'Pick a username: 3 to 20 small letters, numbers, _ or .', 'err');
  const btn = $('setSave'); btn.disabled = true; msg('setMsg', 'Saving…');
  try {
    const uid = meUid(), old = App.profile.username, owner = await usernameOwner(u);
    if (owner === '?') throw new Error('net');
    if (owner && owner !== uid) { btn.disabled = false; Setup.ok = false; hint(`✗ @${u} is taken. Try another.`, 'bad'); return msg('setMsg', `@${u} was just taken. Pick another.`, 'err'); }
    const name = `${first} ${last}`;
    const b = Store.fs.batch();
    b.set(Store.fs.doc(`usernames/${u}`), { uid, at: Date.now() });
    if (old && old !== u) b.delete(Store.fs.doc(`usernames/${old}`));
    b.set(Store.fs.doc(`people/${uid}`), { ...personDoc({ first, last, username: u }), active: Date.now(), away: false });
    if (App.authUser.email) b.set(Store.fs.doc(`emails/${await sha256(App.authUser.email.trim().toLowerCase())}`), { uid });
    await b.commit();
    await Store.setProfile({ first, last, name, username: u });
    Object.assign(App.profile, { first, last, name, username: u });
    try { await App.fb.auth.currentUser.updateProfile({ displayName: name }); } catch (err) {}
    btn.disabled = false; closeSetup(); paintAvatars(); paintChatBtn();
    if (visible('settings')) renderSettings();
    toast(old ? 'Profile saved.' : `Welcome, ${first}! You are @${u}.`);
    Activity.log(old && old !== u ? 'username_changed' : old ? 'profile_updated' : 'username_set', old ? { what: 'name and username', username: u } : { username: u });
  } catch (err) { console.warn(err); btn.disabled = false; msg('setMsg', 'Could not save. Check your internet and try again.', 'err'); }
});
function personDoc(over = {}) {
  const p = { ...App.profile, ...over }, name = fullName(p);
  return { uid: meUid(), username: p.username || '', first: p.first || '', last: p.last || '', name, nameLower: name.toLowerCase(), lastLower: (p.last || '').toLowerCase(), photo: p.photo || (App.authUser && App.authUser.photoURL) || '', updated: Date.now() };   // the photo you see on yourself: yours, else Google's
}
// keep what friends see (photo, name) in step with your profile
function syncPerson() { if (App.profile.username && !App.viewAs) Store.fs.doc(`people/${meUid()}`).set({ ...personDoc(), active: Date.now(), away: !!document.hidden }, { merge: true }).catch(() => {}); }

/* ---------- friends list (live) ---------- */
const otherOf = f => (f.users || []).find(u => u !== meUid());
function startSocial() {
  stopSocial();
  if (!App.authUser || App.viewAs) return;
  Social.first = true;
  Social.unsub = Store.fs.collection('friendships').where('users', 'array-contains', meUid()).onSnapshot(s => {
    const prev = new Map(Social.list.map(f => [f.id, f]));
    Social.list = s.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
    Social.list.forEach(f => watchPerson(otherOf(f)));
    if (!Social.first) Social.list.forEach(f => {                       // news while you are elsewhere: pop-up, sound, notification
      const p = prev.get(f.id), other = otherOf(f);
      const say = (text, sound, where) => loadPerson(other).then(() => {
        const who = friendName(other), t = text(who);
        toast(t); Sound.play(sound); Notify.show(sound === 'receive' ? who : 'Recurra', sound === 'receive' ? (f.lastText || 'sent something') : t, 'chat-' + f.id, where);
      });
      if (f.status === 'pending' && f.from !== meUid() && !p) say(who => `${who} sent you a friend request.`, 'request', '#chat');
      else if (f.status === 'accepted' && p && p.status === 'pending' && f.from === meUid()) say(who => `${who} accepted your friend request.`, 'join', '#chat=' + f.id);
      else if (f.status === 'accepted' && f.lastFrom && f.lastFrom !== meUid() && (f.lastAt || 0) > ((p && p.lastAt) || 0) && !(visible('thread') && Social.open === f.id && !document.hidden))
        say(who => `${who}: ${f.lastText || 'sent something'}`, 'receive', '#chat=' + f.id);
    });
    Social.first = false;
    paintChatBtn();
    if (visible('chat')) renderInbox();
    if (visible('thread')) { paintThreadHead(); paintTyping(); }
    Route.tryChat();
  }, e => console.warn('friends', e));
  beat(); clearInterval(Social.hb); Social.hb = setInterval(beat, 60e3);
}
function stopSocial() {
  if (Social.unsub) { try { Social.unsub(); } catch (e) {} Social.unsub = null; }
  Object.values(Social.peopleUnsubs).forEach(u => { try { u(); } catch (e) {} }); Social.peopleUnsubs = {};
  clearInterval(Social.hb); closeThread(); Social.list = []; paintChatBtn();
}
// "online": the app is open and in front on one of your devices (checked every minute)
function beat(away) {
  if (!App.authUser || App.viewAs || !App.profile.username) return;
  Store.fs.doc(`people/${meUid()}`).set({ active: Date.now(), away: !!away }, { merge: true }).catch(() => {});
}
document.addEventListener('visibilitychange', () => { if (App.authUser && App.profile && App.profile.username) beat(document.hidden); });
addEventListener('pagehide', () => beat(true));
const isOnlineP = p => !!(p && p.active && !p.away && Date.now() - p.active < 150e3);
function lastSeenText(p) {
  if (!p || !p.active) return '';
  if (isOnlineP(p)) return 'online';
  const s = (Date.now() - p.active) / 1000;
  if (s < 3600) return `last seen ${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `last seen ${Math.round(s / 3600)} h ago`;
  return `last seen ${timeShort(p.active)}`;
}
async function loadPerson(uid) {
  if (!uid || Social.people[uid]) return Social.people[uid];
  try { const d = await Store.fs.doc(`people/${uid}`).get(); if (d.exists) Social.people[uid] = { uid, ...d.data() }; } catch (e) {}
  return Social.people[uid];
}
function watchPerson(uid) {
  if (!uid || Social.peopleUnsubs[uid]) return;
  Social.peopleUnsubs[uid] = Store.watchDoc(`people/${uid}`, p => {
    Social.people[uid] = { uid, ...p };
    if (visible('chat')) renderInbox();
    if (visible('thread') && Social.open && otherOf(friendship(Social.open) || {}) === uid) paintThreadHead();
  });
}
const friendName = uid => { const p = Social.people[uid]; return p ? fullName(p) || '@' + p.username : 'Someone'; };
const friendship = id => Social.list.find(f => f.id === id);
const unreadOf = f => f.status === 'accepted' && f.lastFrom && f.lastFrom !== meUid() && (f.lastAt || 0) > (f['read_' + meUid()] || 0);
function badgeCount() { return Social.list.filter(f => (f.status === 'pending' && f.from !== meUid()) || unreadOf(f)).length; }
function paintChatBtn() {
  const b = $('chatBtn'), on = !!(App.authUser && App.user && !App.viewAs && App.profile && App.profile.username);
  b.hidden = !on; if (!on) return;
  const n = badgeCount();
  $('chatBadge').hidden = !n; $('chatBadge').textContent = n > 9 ? '9+' : String(n);
  b.setAttribute('aria-label', n ? `Friends and chat, ${n} new` : 'Friends and chat');
}

/* ---------- opening a place from a notification: #chat, #chat=<id>, #tests, #room=<id> ---------- */
const Route = {
  want: null,
  set(hash) { if (hash && /^#(chat|tests|room)/.test(hash)) { this.want = hash; this.go(); } },
  go() {
    const w = this.want; if (!w || !App.authUser || !App.profile.username) return;
    if (w === '#chat') { this.want = null; return MODES.chat(); }
    if (w === '#tests') { this.want = null; return MODES.tests(); }
    if (w.startsWith('#room=')) { this.want = null; return openRoom(w.slice(6)); }
    this.tryChat();
  },
  tryChat() { const w = this.want; if (w && w.startsWith('#chat=') && friendship(w.slice(6))) { this.want = null; openThread(w.slice(6)); } },
};
if (location.hash) { Route.want = location.hash; try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} }
if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.open) Route.set(e.data.open); });
if (LN && LN.addListener) try { LN.addListener('localNotificationActionPerformed', a => { const w = a && a.notification && a.notification.extra && a.notification.extra.where; if (w) Route.set(w); }); } catch (e) {}

/* ---------- inbox: search, requests, chats ---------- */
MODES.chat = () => { closeThread(); Social.results = null; $('friendSearch').value = ''; renderInbox(); show('chat'); };
function timeShort(ms) {
  if (!ms) return '';
  const d = new Date(ms), now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
function relationBtn(uid) {
  const f = friendship(pairId(meUid(), uid));
  if (!f) return `<button class="btn small primary" type="button" data-fadd="${esc(uid)}">Add friend</button>`;
  if (f.status === 'accepted') return `<button class="btn small" type="button" data-fopen="${esc(f.id)}">Message</button>`;
  if (f.status === 'blocked') return `<span class="muted small">Blocked</span>`;
  if (f.from === meUid()) return `<span class="pill p-none">Requested</span>`;
  return `<button class="btn small primary" type="button" data-faccept="${esc(f.id)}">Accept</button>`;
}
const avWrap = (p, cls = '') => `<span class="avwrap${isOnlineP(p) ? ' on' : ''}" data-photo="${esc(p.uid || '')}">${pAvatar(p, cls)}</span>`;
function personRow(p, right, extra = '') {
  return `<div class="prow">${avWrap(p)}<span class="pmain"><b>${esc(fullName(p) || 'New user')}</b><small>@${esc(p.username || '')}${extra}</small></span><span class="pright">${right}</span></div>`;
}
function typingNow(f, uid) { return !!(f && f['typing_' + uid] && Date.now() - f['typing_' + uid] < 6000); }
function renderInbox() {
  const me = meUid(), mine = App.profile.username;
  $('myHandle').innerHTML = mine ? `You are <b>@${esc(mine)}</b>. Share it so friends can add you.` : '';
  const R = Social.results;
  $('friendResults').innerHTML = !R ? '' : R.loading ? '<p class="muted small">Searching…</p>'
    : R.msg ? `<p class="muted small">${esc(R.msg)}</p>`
    : `<p class="label">Search results</p><div class="plist">${R.people.map(p => personRow(p, relationBtn(p.uid))).join('')}</div>`;
  const incoming = Social.list.filter(f => f.status === 'pending' && f.from !== me);
  const outgoing = Social.list.filter(f => f.status === 'pending' && f.from === me);
  const chats = Social.list.filter(f => f.status === 'accepted').sort((a, b) => (b.lastAt || b.acceptedAt || 0) - (a.lastAt || a.acceptedAt || 0));
  const blocked = Social.list.filter(f => f.status === 'blocked' && f.blockedBy === me);
  const P = uid => Social.people[uid] || { uid, username: '…' };
  let html = '';
  if (!Notify.can() && !dismissed('notif')) html += `<div class="card notif-ask"><span>🔔</span><div><b>Know when friends write</b><small>Turn on notifications for new messages, friend requests and live-test invites.</small></div><div class="btns"><button class="btn small primary" type="button" data-notifon>Turn on</button><button class="btn small ghost" type="button" data-notifno>Not now</button></div></div>`;
  if (incoming.length) html += `<section class="card fsec"><h3>Friend requests <span class="count">${incoming.length}</span></h3><div class="plist">${incoming.map(f => personRow(P(otherOf(f)), `<button class="btn small primary" type="button" data-faccept="${esc(f.id)}">Accept</button><button class="btn small ghost" type="button" data-fdecline="${esc(f.id)}">Decline</button>`)).join('')}</div></section>`;
  html += `<section class="card fsec"><h3>Chats</h3>${chats.length ? `<div class="clist">${chats.map(f => {
      const p = P(otherOf(f)), un = unreadOf(f), typing = typingNow(f, otherOf(f));
      const last = typing ? '<i class="typing-text">typing…</i>' : esc(f.lastText ? `${f.lastFrom === me ? 'You: ' : ''}${f.lastText}` : 'Say hello 👋');
      return `<div class="crow${un ? ' unread' : ''}" role="button" tabindex="0" data-fopen="${esc(f.id)}">${avWrap(p)}<span class="pmain"><b>${esc(fullName(p) || '@' + p.username)}</b><small>${last}</small></span><span class="cmeta"><small>${esc(timeShort(f.lastAt || f.acceptedAt))}</small>${un ? '<i class="udot" aria-label="unread"></i>' : ''}</span></div>`;
    }).join('')}</div>` : `<div class="empty-state small">${ART.empty}<strong>No friends yet</strong><p>Search above by @username, name or email, and send a friend request. Once they accept, you can chat here.</p></div>`}</section>`;
  if (outgoing.length) html += `<section class="card fsec"><h3>Waiting for them to accept</h3><div class="plist">${outgoing.map(f => personRow(P(otherOf(f)), `<button class="btn small ghost" type="button" data-fdecline="${esc(f.id)}">Cancel</button>`)).join('')}</div></section>`;
  if (blocked.length) html += `<section class="card fsec"><h3>Blocked</h3><div class="plist">${blocked.map(f => personRow(P(otherOf(f)), `<button class="btn small ghost" type="button" data-funblock="${esc(f.id)}">Unblock</button>`)).join('')}</div></section>`;
  $('chatList').innerHTML = html;
}
const dismissed = k => { try { return localStorage.getItem('rc-dismiss-' + k) === '1'; } catch (e) { return false; } };
const dismiss = k => { try { localStorage.setItem('rc-dismiss-' + k, '1'); } catch (e) {} };
async function searchPeople(raw) {
  const q = raw.trim(), seq = ++Social.searchSeq;
  if (!q) { Social.results = null; return renderInbox(); }
  Social.results = { loading: true }; renderInbox();
  let people = [], note = '';
  try {
    if (EMAIL_RE.test(q)) {
      const d = await Store.fs.doc(`emails/${await sha256(q.toLowerCase())}`).get();
      const uid = d.exists ? (d.data() || {}).uid : null;
      if (uid) { const p = await Store.fs.doc(`people/${uid}`).get(); if (p.exists) people = [{ uid, ...p.data() }]; }
      if (!people.length) note = 'Nobody with that exact email has set up a profile yet.';
    } else {
      const s = q.toLowerCase().replace(/^@/, '');
      if (s.length < 3) note = 'Type at least 3 letters of a @username or name, or a full email.';
      else {
        const pref = (field, v) => Store.fs.collection('people').where(field, '>=', v).where(field, '<=', v + '').limit(8).get();
        const snaps = await Promise.all([pref('username', s.replace(/\s+/g, '_')), pref('nameLower', s), pref('lastLower', s)]);
        const seen = new Set();
        snaps.forEach(sn => sn.docs.forEach(d => { if (!seen.has(d.id)) { seen.add(d.id); people.push({ uid: d.id, ...d.data() }); } }));
        if (!people.length) note = `No one found for “${q}”. Check the spelling, or ask for their @username.`;
      }
    }
  } catch (e) { console.warn(e); note = 'Could not search. Check your internet.'; }
  if (seq !== Social.searchSeq) return;
  people = people.filter(p => p.uid !== meUid() && p.username);
  Social.results = note ? { msg: note } : people.length ? { people } : { msg: 'That is you! Search for a friend instead.' };
  people.forEach(p => { Social.people[p.uid] = { ...(Social.people[p.uid] || {}), ...p }; });
  renderInbox();
}
let searchTimer = null;
$('friendSearch').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => searchPeople($('friendSearch').value), 300); });
$('friendSearch').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(searchTimer); searchPeople($('friendSearch').value); } });

async function sendRequest(uid) {
  const me = meUid(), id = pairId(me, uid);
  await Store.fs.doc(`friendships/${id}`).set({ users: [me, uid].sort(), from: me, status: 'pending', at: Date.now() });
  Activity.log('friend_request_sent', { to: '@' + ((Social.people[uid] || {}).username || '') });
  Sound.play('send'); toast(`Friend request sent to ${friendName(uid)}.`);
  Push.send(uid, 'request', { title: 'New friend request', body: `${displayName()} (@${App.profile.username}) wants to be friends.`, where: '#chat' });
}
$('chat').addEventListener('click', async e => {
  const ph = e.target.closest('[data-photo]'); if (ph && ph.dataset.photo) { e.stopPropagation(); return openPhoto(ph.dataset.photo); }
  const b = e.target.closest('button, [data-fopen]'); if (!b) return;
  const d = b.dataset;
  try {
    if (d.fadd) { b.disabled = true; await sendRequest(d.fadd); return; }
    if (d.faccept) {
      b.disabled = true;
      await Store.fs.doc(`friendships/${d.faccept}`).set({ status: 'accepted', acceptedAt: Date.now() }, { merge: true });
      const f = friendship(d.faccept); Activity.log('friend_added', { who: '@' + ((Social.people[otherOf(f || {})] || {}).username || '') });
      Sound.play('join');
      if (f) Push.send(otherOf(f), 'accepted', { title: 'Friend request accepted', body: `${displayName()} accepted your friend request. Say hello!`, where: '#chat=' + f.id });
      return toast(`You are now friends with ${friendName(otherOf(f || {}))}.`);
    }
    if (d.fdecline) { b.disabled = true; await Store.fs.doc(`friendships/${d.fdecline}`).delete(); return; }
    if (d.funblock) { b.disabled = true; await Store.fs.doc(`friendships/${d.funblock}`).delete(); Activity.log('user_unblocked'); return toast('Unblocked. You can add them again.'); }
    if (d.fopen) return openThread(d.fopen);
    if ('copyhandle' in d) return copyText('@' + App.profile.username, 'Your username was copied.');
    if ('notifon' in d) { const ok = await Notify.ask(); if (ok) { toast('Notifications are on.'); Push.register(); } else toast('Notifications are blocked. You can allow them in your browser or phone settings.'); dismiss('notif'); return renderInbox(); }
    if ('notifno' in d) { dismiss('notif'); return renderInbox(); }
  } catch (err) { console.warn(err); b.disabled = false; toast('That did not work. Check your internet and try again.'); }
});
$('chat').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset && e.target.dataset.fopen) { e.preventDefault(); openThread(e.target.dataset.fopen); } });

/* ---------- profile photo, large ---------- */
function openPhoto(uid) {
  const p = uid === meUid() ? { uid, ...App.profile } : Social.people[uid]; if (!p) return;
  const f = friendship(pairId(meUid(), uid)), name = fullName(p) || '@' + p.username;
  $('photoView').innerHTML = `<div class="pv-card" role="document">
      <button class="btn ghost iconbtn pv-x" type="button" data-pvclose aria-label="Close">✕</button>
      ${p.photo ? `<img class="pv-img" src="${esc(p.photo)}" alt="${esc(name)}">` : `<div class="pv-img pv-initials" style="background:${pColor(uid)}">${esc(initials(name))}</div>`}
      <h2>${esc(name)}</h2><p class="muted">@${esc(p.username || '')}${uid !== meUid() && lastSeenText(p) ? ` · <span class="${isOnlineP(p) ? 'on-text' : ''}">${esc(lastSeenText(p))}</span>` : ''}</p>
      ${f && f.status === 'accepted' && f.acceptedAt ? `<p class="small muted">Friends since ${esc(fmtDate(f.acceptedAt))}</p>` : ''}
      ${f && f.status === 'accepted' && Social.open !== f.id ? `<div class="btns"><button class="btn primary" type="button" data-pvchat="${esc(f.id)}">Message</button></div>` : ''}
    </div>`;
  $('photoView').hidden = false; document.body.classList.add('sheet-open');
}
function closePhoto() { $('photoView').hidden = true; document.body.classList.remove('sheet-open'); }
$('photoView').addEventListener('click', e => {
  const c = e.target.closest('[data-pvchat]'); if (c) { closePhoto(); return openThread(c.dataset.pvchat); }
  if (e.target === $('photoView') || e.target.closest('[data-pvclose]')) closePhoto();
});
addEventListener('keydown', e => { if (e.key === 'Escape' && !$('photoView').hidden) closePhoto(); });

/* ---------- one chat ---------- */
function openThread(id) {
  closeThread();
  const f = friendship(id); if (!f) return;
  Social.open = id; Social.msgs = []; Social.sel = null; Social.seenIds = null;
  $('msgList').innerHTML = '<p class="muted small center">Loading…</p>'; $('msgText').value = ''; sizeComposer();
  paintThreadHead(); show('thread'); document.body.classList.add('in-thread'); fitThread();
  Social.msgUnsub = Store.fs.collection(`chats/${id}/messages`).orderBy('at').limitToLast(300).onSnapshot(s => {
    const near = nearBottom(), before = Social.seenIds;
    Social.msgs = s.docs.map(d => ({ id: d.id, ...(d.data() || {}) })).filter(m => m.kind !== 'test');
    if (before && Social.msgs.some(m => !before.has(m.id) && m.from !== meUid())) Sound.play('pop');
    Social.seenIds = new Set(Social.msgs.map(m => m.id));
    renderMessages(); markRead();
    if (near || Social.justSent || !before) { scrollToEnd(); Social.justSent = false; }
  }, err => { console.warn(err); $('msgList').innerHTML = '<p class="muted small center">Could not load this chat. Check your internet.</p>'; });
  clearInterval(Social.typingTick); Social.typingTick = setInterval(paintTyping, 1500);
}
function resetActions() { $('threadActions').querySelectorAll('[data-tact]').forEach(b => { delete b.dataset.sure; b.textContent = b.dataset.tact === 'remove' ? 'Remove friend' : 'Block'; }); }
function closeThread() {
  if (Social.msgUnsub) { try { Social.msgUnsub(); } catch (e) {} Social.msgUnsub = null; }
  if (Social.open) stopTyping();
  clearInterval(Social.typingTick); Social.open = null; document.body.classList.remove('in-thread');
}
const nearBottom = () => { const l = $('msgList'); return l.scrollHeight - l.scrollTop - l.clientHeight < 140; };
const scrollToEnd = () => { const l = $('msgList'); try { l.scrollTop = l.scrollHeight; } catch (e) {} };
// the chat fills the screen exactly: header on top, messages scroll in the middle, the box to type at the bottom
function fitThread() {
  const top = document.querySelector('.topbar'), vv = window.visualViewport;
  const h = (vv ? vv.height : innerHeight) - (top ? top.getBoundingClientRect().height : 0);
  document.documentElement.style.setProperty('--thread-h', Math.max(320, Math.round(h)) + 'px');
}
addEventListener('resize', () => { if (Social.open) { const n = nearBottom(); fitThread(); if (n) scrollToEnd(); } });
if (window.visualViewport) visualViewport.addEventListener('resize', () => { if (Social.open) { const n = nearBottom(); fitThread(); if (n) scrollToEnd(); } });
function paintThreadHead() {
  const f = friendship(Social.open);
  if (!f) { if (visible('thread')) { toast('This chat is no longer available.'); MODES.chat(); } return; }
  const p = Social.people[otherOf(f)] || { uid: otherOf(f), username: '…' };
  $('threadWho').innerHTML = `${avWrap(p)}<span class="pmain"><b>${esc(fullName(p) || '@' + p.username)}</b><small id="threadStatus">${statusLine(f, p)}</small></span>`;
  const blocked = f.status === 'blocked';
  $('msgForm').hidden = blocked || f.status !== 'accepted';
  $('threadNote').hidden = !blocked; $('threadNote').textContent = blocked ? (f.blockedBy === meUid() ? 'You blocked this person. Unblock them from the friends list to chat again.' : 'You can’t send messages in this chat.') : '';
  if (Social.msgs.length) renderMessages();
}
function statusLine(f, p) {
  if (typingNow(f, otherOf(f))) return '<span class="typing-text">typing…</span>';
  const t = lastSeenText(p);
  return t ? `<span class="${isOnlineP(p) ? 'on-text' : ''}">${esc(t)}</span>` : `@${esc(p.username || '')}`;
}
function paintTyping() {
  const f = friendship(Social.open); if (!f) return;
  const p = Social.people[otherOf(f)] || {}, st = $('threadStatus');
  if (st) st.innerHTML = statusLine(f, p);
  const on = typingNow(f, otherOf(f)), box = $('typingRow');
  if (box) { box.hidden = !on; if (on && nearBottom()) scrollToEnd(); }
  if (visible('chat')) renderInbox();
}
function dayLabel(ms) {
  const d = new Date(ms), now = new Date(), y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}
const linkify = s => esc(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
const onlyEmoji = s => /^(\p{Extended_Pictographic}|\p{Emoji_Component}|\s){1,8}$/u.test(s || '') && !/^[\d\s#*]+$/.test(s || '');
const REACTS = ['❤️', '😂', '👍', '😮', '🔥', '🙏'];
// other message kinds (shared MCQs …) register a renderer here
const MSG_KINDS = {};
function renderMessages() {
  const f = friendship(Social.open); if (!f) return;
  const me = meUid(), other = otherOf(f), theirRead = f['read_' + other] || 0, P = Social.people[other] || { uid: other };
  const list = Social.msgs;
  let html = '', day = '';
  if (!list.length) html = `<div class="chat-hello"><span>👋</span><p>You and ${esc(friendName(other))} are friends now. Say hello!</p><div class="hello-chips">${['Hi! 👋', 'Ready to study? 📚', 'Quiz later? 🏁'].map(t => `<button type="button" class="chip" data-quick="${esc(t)}">${esc(t)}</button>`).join('')}</div></div>`;
  list.forEach((m, k) => {
    const dl = dayLabel(m.at || Date.now());
    if (dl !== day) { html += `<div class="day-sep"><span>${esc(dl)}</span></div>`; day = dl; }
    const prev = list[k - 1], next = list[k + 1], at = m.at || Date.now();
    const same = (a, b) => a && b && a.from === b.from && Math.abs((b.at || 0) - (a.at || 0)) < 180e3 && dayLabel(a.at) === dayLabel(b.at);
    const first = !same(prev, m), last = !same(m, next), mine = m.from === me, sel = Social.sel === m.id, card = !!MSG_KINDS[m.kind];
    const big = !card && onlyEmoji(m.text);
    const body = card ? MSG_KINDS[m.kind](m, mine, f) : `<p>${linkify(m.text || '')}</p>`;
    const reacts = Object.entries(m).filter(([key, v]) => key.startsWith('re_') && v);
    const rc = {}; reacts.forEach(([key, v]) => { (rc[v] = rc[v] || []).push(key.slice(3)); });
    const time = new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    const tick = mine ? `<svg class="mtick${theirRead >= at ? ' seen' : ''}" viewBox="0 0 22 12" role="img" aria-label="${theirRead >= at ? 'Seen' : 'Sent'}"><path d="M1 6.5l3.5 3.5L11 3"/>${theirRead >= at ? '<path d="M8 9.5l1 1L16 3"/>' : ''}</svg>` : '';
    html += `<div class="msg-row ${mine ? 'mine' : 'theirs'}${first ? ' gfirst' : ''}${last ? ' glast' : ''}${sel ? ' sel' : ''}${big ? ' bigemoji' : ''}" data-mid="${esc(m.id)}">
      ${!mine ? (last ? `<span class="avwrap" data-photo="${esc(other)}">${pAvatar(P, 'tiny')}</span>` : '<span class="av-gap"></span>') : ''}
      <div class="bwrap">
        ${sel ? `<div class="react-bar" role="toolbar" aria-label="React">${REACTS.map(r => `<button type="button" data-react="${r}" class="${m['re_' + me] === r ? 'on' : ''}">${r}</button>`).join('')}${!card && m.text ? '<button type="button" data-mcopy title="Copy">⧉</button>' : ''}${mine ? `<button type="button" class="del" data-mdel="${esc(m.id)}" title="Delete">🗑</button>` : ''}</div>` : ''}
        <div class="bubble${card ? ' card-msg' : ''}" title="${esc(new Date(at).toLocaleString())}">${body}<span class="mtime">${esc(time)}${tick}</span></div>
        ${Object.keys(rc).length ? `<div class="reacts">${Object.entries(rc).map(([e, who]) => `<button type="button" data-react="${e}" class="${who.includes(me) ? 'on' : ''}" title="${esc(who.map(u => u === me ? 'You' : friendName(u)).join(', '))}">${e}${who.length > 1 ? ` <small>${who.length}</small>` : ''}</button>`).join('')}</div>` : ''}
      </div></div>`;
  });
  html += `<div class="msg-row theirs typing-row glast" id="typingRow"${typingNow(f, other) ? '' : ' hidden'}><span class="avwrap">${pAvatar(P, 'tiny')}</span><div class="bwrap"><div class="bubble typing-bubble" aria-label="typing"><span class="dots"><i></i><i></i><i></i></span></div></div></div>`;
  $('msgList').innerHTML = html;
}
function markRead() {
  const f = friendship(Social.open);
  if (!f || document.hidden || !visible('thread') || f.status !== 'accepted') return;
  const key = 'read_' + meUid();
  if ((f.lastAt || 0) > (f[key] || 0) || !f[key]) { f[key] = Date.now(); Store.fs.doc(`friendships/${f.id}`).set({ [key]: f[key] }, { merge: true }).catch(() => {}); paintChatBtn(); }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && visible('thread')) markRead(); });
async function sendMessage(fields) {
  const f = friendship(Social.open); if (!f || f.status !== 'accepted') return false;
  const me = meUid(), at = Date.now();
  const m = { from: me, at, kind: 'text', ...fields };
  Social.justSent = true;
  await Store.fs.collection(`chats/${f.id}/messages`).doc().set(m);
  const preview = m.kind === 'text' ? m.text : (m.preview || 'Sent something');
  await Store.fs.doc(`friendships/${f.id}`).set({ lastAt: at, lastText: String(preview).slice(0, 90), lastFrom: me, lastKind: m.kind, ['read_' + me]: at, ['typing_' + me]: 0 }, { merge: true });
  Social.typedAt = 0;
  Sound.play('send');
  Push.send(otherOf(f), 'message', { title: displayName(), body: String(preview).slice(0, 120), where: '#chat=' + f.id, tag: 'chat-' + f.id });
  return true;
}
// "typing…": written at most every 3 seconds while you type, cleared when you send or leave
function noteTyping() {
  const f = friendship(Social.open); if (!f || f.status !== 'accepted') return;
  const now = Date.now();
  if (!$('msgText').value.trim()) return stopTyping();
  if (now - (Social.typedAt || 0) < 3000) return;
  Social.typedAt = now;
  Store.fs.doc(`friendships/${f.id}`).set({ ['typing_' + meUid()]: now }, { merge: true }).catch(() => {});
}
function stopTyping() {
  const f = friendship(Social.open); if (!f || !Social.typedAt) return;
  Social.typedAt = 0;
  if (f.status === 'accepted') Store.fs.doc(`friendships/${f.id}`).set({ ['typing_' + meUid()]: 0 }, { merge: true }).catch(() => {});
}
function sizeComposer() { const t = $('msgText'); t.style.height = 'auto'; t.style.height = Math.min(140, t.scrollHeight || 40) + 'px'; }
$('msgText').addEventListener('input', () => { sizeComposer(); noteTyping(); });
$('msgText').addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== $('msgText')) stopTyping(); }, 300));
$('msgText').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && hasHover()) { e.preventDefault(); $('msgForm').requestSubmit ? $('msgForm').requestSubmit() : $('msgForm').dispatchEvent(new Event('submit', { cancelable: true })); } });
$('msgForm').addEventListener('submit', async e => {
  e.preventDefault();
  const text = $('msgText').value.trim(); if (!text) return;
  if (text.length > 2000) return toast('That message is too long (2000 characters at most).');
  $('msgText').value = ''; sizeComposer();
  if (hasHover()) $('msgText').focus();
  try { await sendMessage({ text }); }
  catch (err) { console.warn(err); $('msgText').value = text; toast('Not sent. Check your internet and try again.'); }
});
async function react(mid, emoji) {
  const m = Social.msgs.find(x => x.id === mid); if (!m) return;
  const key = 're_' + meUid(), val = m[key] === emoji ? '' : emoji;
  m[key] = val; Social.sel = null; renderMessages();
  if (val) Sound.play('pop');
  try { await Store.fs.doc(`chats/${Social.open}/messages/${mid}`).set({ [key]: val }, { merge: true }); } catch (err) { toast('Could not react. Check your internet.'); }
}
$('thread').addEventListener('click', async e => {
  const ph = e.target.closest('[data-photo]'); if (ph && ph.dataset.photo) return openPhoto(ph.dataset.photo);
  const q = e.target.closest('[data-quick]'); if (q) { $('msgText').value = q.dataset.quick; return $('msgForm').requestSubmit ? $('msgForm').requestSubmit() : null; }
  const del = e.target.closest('[data-mdel]');
  if (del) {
    try { await Store.fs.doc(`chats/${Social.open}/messages/${del.dataset.mdel}`).delete(); Social.sel = null; } catch (err) { toast('Could not delete. Check your internet.'); }
    return;
  }
  const rb = e.target.closest('[data-react]'); if (rb) { const row = rb.closest('.msg-row'); return react(row.dataset.mid, rb.dataset.react); }
  if (e.target.closest('[data-mcopy]')) { const m = Social.msgs.find(x => x.id === Social.sel); Social.sel = null; renderMessages(); return copyText(m ? m.text : '', 'Copied.'); }
  if (e.target.closest('#threadBack')) return MODES.chat();
  if (e.target.closest('#threadMenu')) { $('threadActions').hidden = !$('threadActions').hidden; resetActions(); return; }
  const act = e.target.closest('[data-tact]');
  if (act) {
    const f = friendship(Social.open), who = friendName(otherOf(f || {}));
    if (!act.dataset.sure) {                                // ask once more, in place (no pop-up box)
      act.dataset.sure = '1'; $('threadActions').hidden = false;
      act.textContent = act.dataset.tact === 'remove' ? `Tap again to remove ${who}` : `Tap again to block ${who}`;
      return;
    }
    if (act.dataset.tact === 'remove') {
      $('threadActions').hidden = true;
      await Store.fs.doc(`friendships/${f.id}`).delete(); Activity.log('friend_removed'); toast(`${who} was removed from your friends.`); return MODES.chat();
    }
    if (act.dataset.tact === 'block') {
      $('threadActions').hidden = true;
      await Store.fs.doc(`friendships/${f.id}`).set({ status: 'blocked', blockedBy: meUid(), blockedAt: Date.now() }, { merge: true }); Activity.log('user_blocked'); toast(`${who} is blocked.`); return MODES.chat();
    }
    return;
  }
  if (!$('threadActions').hidden && !e.target.closest('#threadActions')) $('threadActions').hidden = true;
  if (e.target.closest('a, button, input, textarea, select, .card-msg')) return;
  const row = e.target.closest('.msg-row[data-mid]');      // tap a message: react, copy, or delete your own
  const was = Social.sel; Social.sel = row && was !== row.dataset.mid ? row.dataset.mid : null;
  if (was !== Social.sel) renderMessages();
});
// double-tap (or double-click) a message: ❤️
$('msgList').addEventListener('dblclick', e => { const row = e.target.closest('.msg-row[data-mid]'); if (row && !e.target.closest('a, button, .card-msg')) { e.preventDefault(); react(row.dataset.mid, '❤️'); } });
$('chatBtn').addEventListener('click', () => MODES.chat());

/* =====================================================================
   SHARING in chat: MCQs, notes, a syllabus, or a request for one.
   The receiver must tap "Add to my prep"; it then goes through the normal
   Add screen (pick the subject, the same checks), and is MERGED with what
   they already have. They get their own copy.
   ===================================================================== */
const SHARE_MAX = 300;
const WHAT = { mcq: { icon: '📝', one: 'MCQ', many: 'MCQs' }, notes: { icon: '📒', one: 'note', many: 'notes' }, syllabus: { icon: '🗂️', one: 'syllabus', many: 'syllabus' } };
const Share = { step: null, what: null, subject: '', topic: '', reqMid: null };
const countLabel = (what, n) => what === 'syllabus' ? 'Syllabus' : `${n} ${n === 1 ? WHAT[what].one : WHAT[what].many}`;
// the groups (topics) of one subject, as the question bank shows them
function shareGroups(what, code) {
  if (what === 'mcq') { const ch = bankBook().chapters.find(c => c.code === code); return ch ? ch.groups.map(g => ({ key: g.key, name: g.name, items: g.list.map(e => e.q) })) : []; }
  const T = (App.subjects.find(s => s.code === code) || {}).topics || [], G = {};
  App.notes.filter(n => n.code === code).forEach(n => {
    const i = topicIndex(n, T), name = i >= 0 ? T[i] : n.topic && !isCatchAll(n.topic) ? n.topic : T.length ? OTHERS : 'General', key = i >= 0 ? 't' + i : 'n' + normTopic(name);
    (G[key] = G[key] || { key, name, rank: i >= 0 ? i : 1e6, items: [] }).items.push(n);
  });
  return Object.values(G).sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
}
function openSharePanel(step, opts = {}) {
  Object.assign(Share, { step, what: opts.what || (step === 'menu' || step === 'ask' ? null : step), subject: opts.subject || '', topic: '', reqMid: opts.reqMid || Share.reqMid || null });
  if (step === 'menu') Share.reqMid = null;
  renderSharePanel(); $('sharePanel').hidden = false; $('msgPlus').setAttribute('aria-expanded', 'true');
  try { $('sharePanel').scrollIntoView({ block: 'nearest' }); } catch (e) {}
}
function closeSharePanel() { Share.step = null; Share.reqMid = null; $('sharePanel').hidden = true; $('msgPlus').setAttribute('aria-expanded', 'false'); }
function renderSharePanel() {
  const box = $('sharePanel'), st = Share.step, prep = App.prep;
  const head = (t, back = true) => `<div class="sp-head">${back ? `<button class="btn ghost iconbtn" type="button" data-sp="menu" aria-label="Back">${icon('back')}</button>` : ''}<strong>${t}</strong><button class="btn ghost iconbtn" type="button" data-spclose aria-label="Close">✕</button></div>`;
  if (st === 'menu') {
    box.innerHTML = head('Share with your friend', false) + `<div class="sp-grid">
      <button type="button" class="sp-opt" data-sp="mcq"><span>📝</span><b>MCQs</b><small>From your question bank</small></button>
      <button type="button" class="sp-opt" data-sp="notes"><span>📒</span><b>Revision notes</b><small>From your notes</small></button>
      <button type="button" class="sp-opt" data-sp="syllabus"><span>🗂️</span><b>My syllabus</b><small>Subjects and topics</small></button>
      <button type="button" class="sp-opt" data-sp="ask"><span>🙋</span><b>Ask for…</b><small>Request MCQs, notes or a syllabus</small></button></div>
      ${prep ? `<p class="muted small">Sharing from your prep <b>${esc(prep.name)}</b>. Switch prep at the top to share from another.</p>` : '<p class="muted small">Open or create a prep first to share from it.</p>'}`;
    return;
  }
  if (st === 'ask') {
    const w = Share.what || 'mcq';
    box.innerHTML = head('Ask your friend for…') + `<div class="seg seg3" role="group">${['mcq', 'notes', 'syllabus'].map(k => `<button type="button" data-askwhat="${k}" aria-pressed="${w === k}">${k === 'syllabus' ? 'Syllabus' : WHAT[k].many.replace(/^./, c => c.toUpperCase())}</button>`).join('')}</div>
      ${w === 'syllabus' ? '' : `<label for="askAbout">About what? <span class="muted">optional</span></label><input id="askAbout" maxlength="80" placeholder="e.g. Computer Networks, OSI model">`}
      <div class="btns"><button class="btn primary" type="button" data-spsend="ask">Send request</button></div>`;
    Share.what = w; return;
  }
  if (!prep) { box.innerHTML = head('Share') + '<p class="muted">Open or create a prep first.</p>'; return; }
  if (st === 'syllabus') {
    const subs = App.subjects, nt = subs.reduce((a, x) => a + (x.topics || []).length, 0);
    box.innerHTML = head('Share my syllabus') + (subs.length ? `<div class="sp-sum"><span>🗂️</span><div><b>${esc(prep.name)}</b><small>${plural(subs.length, 'subject')}${nt ? ` · ${plural(nt, 'topic')}` : ''}${prep.examDate ? ` · exam ${esc(fmtDate(examMsFrom(prep.examDate)))}` : ''}</small></div></div>
      <p class="muted small">Your friend can start a new prep from it, or merge it into theirs. Your questions and progress are not shared.</p>
      <div class="btns"><button class="btn primary" type="button" data-spsend="syllabus">Send syllabus</button></div>` : '<p class="muted">This prep has no subjects yet.</p>');
    return;
  }
  // MCQs or notes: subject → topic → send
  const what = st, count = code => what === 'mcq' ? App.questions.filter(q => q.code === code).length : App.notes.filter(n => n.code === code).length;
  const subs = App.subjects.filter(x => count(x.code));
  if (!subs.length) { box.innerHTML = head(`Share ${WHAT[what].many}`) + `<p class="muted">You have no ${WHAT[what].many} in ${esc(prep.name)} yet.</p>`; return; }
  if (!subs.some(x => x.code === Share.subject)) Share.subject = subs[0].code;
  const groups = shareGroups(what, Share.subject), g = groups.find(x => x.key === Share.topic);
  const n = g ? g.items.length : count(Share.subject), sub = App.subjects.find(x => x.code === Share.subject);
  box.innerHTML = head(`Share ${WHAT[what].many}`) + `<label for="spSubject">Subject</label>
    <select id="spSubject">${subs.map(x => `<option value="${esc(x.code)}"${x.code === Share.subject ? ' selected' : ''}>${esc(x.name)} (${count(x.code)})</option>`).join('')}</select>
    <label for="spTopic">Topic</label>
    <select id="spTopic"><option value="">All topics (${count(Share.subject)})</option>${groups.map(x => `<option value="${esc(x.key)}"${x.key === Share.topic ? ' selected' : ''}>${esc(x.name)} (${x.items.length})</option>`).join('')}</select>
    <div class="sp-sum"><span>${WHAT[what].icon}</span><div><b>${countLabel(what, Math.min(n, SHARE_MAX))}</b><small>${esc(sub.name)}${g ? ' · ' + esc(g.name) : ''}${n > SHARE_MAX ? ` · the ${SHARE_MAX} you know least are sent` : ''}</small></div></div>
    <p class="muted small">Your friend gets a copy. Your answers and progress are not shared.</p>
    <div class="btns"><button class="btn primary" type="button" data-spsend="${what}">Send ${countLabel(what, Math.min(n, SHARE_MAX))}</button></div>`;
  $('spSubject').onchange = () => { Share.subject = $('spSubject').value; Share.topic = ''; renderSharePanel(); };
  $('spTopic').onchange = () => { Share.topic = $('spTopic').value; renderSharePanel(); };
}
const SHARE_STRIP = ['id', 'subject', 'code', 'retired', 'num'];
const stripItem = o => Object.fromEntries(Object.entries(o).filter(([k, v]) => !SHARE_STRIP.includes(k) && !isEmptyVal(v)));
async function sendShare(what) {
  const f = friendship(Social.open); if (!f || f.status !== 'accepted') return;
  const to = '@' + ((Social.people[otherOf(f)] || {}).username || '');
  if (what === 'ask') {
    const w = Share.what, about = (($('askAbout') || {}).value || '').trim().slice(0, 80);
    const text = `${w === 'syllabus' ? 'your syllabus' : WHAT[w].many}${about ? ` on ${about}` : ''}`;
    await sendMessage({ kind: 'request', what: w, about, text: '', preview: `🙋 Asked for ${text}`, status: 'open' });
    Activity.log('asked_for', { to, what: text });
    closeSharePanel(); return toast('Request sent.');
  }
  let data, title = App.prep.name, subjectName = '', topicName = '', n = 0;
  if (what === 'syllabus') {
    data = { type: 'syllabus', name: App.prep.name, examDate: App.prep.examDate || '', subjects: App.subjects.map(x => ({ code: x.code, name: x.name, part: x.part || '', topics: x.topics || [] })) };
    n = App.subjects.length;
  } else {
    const sub = App.subjects.find(x => x.code === Share.subject), groups = shareGroups(what, Share.subject), g = groups.find(x => x.key === Share.topic);
    let items = g ? g.items : groups.flatMap(x => x.items);
    if (items.length > SHARE_MAX) { const lv = q => { const s = getState(q.id); return s ? s.lv : -1; }; items = [...items].sort((a, b) => lv(a) - lv(b)).slice(0, SHARE_MAX); }
    n = items.length; subjectName = sub.name; topicName = g ? g.name : '';
    data = what === 'mcq' ? { type: 'mcq', questions: items.map(stripItem) } : { type: 'notes', notes: items.map(stripItem) };
  }
  const sref = Store.fs.collection(`chats/${f.id}/shares`).doc();
  await sref.set({ from: meUid(), at: Date.now(), what, data });
  const label = countLabel(what, n);
  await sendMessage({ kind: 'share', what, sid: sref.id, count: n, title, subjectName, topicName, text: '', preview: `${WHAT[what].icon} Shared ${what === 'syllabus' ? 'a syllabus' : label}`, status: 'sent' });
  if (Share.reqMid) Store.fs.doc(`chats/${f.id}/messages/${Share.reqMid}`).set({ status: 'done', doneAt: Date.now(), doneBy: meUid() }, { merge: true }).catch(() => {});
  Activity.log('shared', { to, summary: what === 'syllabus' ? `the syllabus of "${title}"` : `${label} on ${subjectName}${topicName ? ' · ' + topicName : ''}` });
  closeSharePanel(); toast('Sent.');
}
// how the cards look in the chat
MSG_KINDS.share = (m, mine, f) => {
  const W = WHAT[m.what] || WHAT.mcq, who = friendName(otherOf(f)), added = m.status === 'added';
  const sub = m.what === 'syllabus' ? `${esc(m.title || '')} · ${plural(m.count || 0, 'subject')}` : [m.subjectName, m.topicName].filter(Boolean).map(esc).join(' · ');
  const state = mine ? `<small class="sc-state">${added ? `✓ ${esc(who)} added ${m.what === 'syllabus' ? 'it' : 'them'}` : `Waiting for ${esc(who)} to add ${m.what === 'syllabus' ? 'it' : 'them'}`}</small>`
    : added ? `<small class="sc-state">✓ You added ${m.what === 'syllabus' ? 'it' : 'them'}</small> <button class="linkbtn" type="button" data-shareadd="${esc(m.id)}">Add again</button>`
    : `<button class="btn small primary" type="button" data-shareadd="${esc(m.id)}">${m.what === 'syllabus' ? 'Use this syllabus' : 'Add to my prep'}</button>`;
  return `<div class="share-card"><span class="sc-ic">${W.icon}</span><div class="sc-body"><b>${m.what === 'syllabus' ? 'Syllabus' : countLabel(m.what, m.count || 0)}</b><small>${sub}</small></div></div><div class="sc-act">${state}</div>`;
};
MSG_KINDS.request = (m, mine, f) => {
  const who = friendName(otherOf(f)), done = m.status === 'done', w = m.what === 'syllabus' ? 'your syllabus' : WHAT[m.what].many;
  const text = mine ? `You asked for ${m.what === 'syllabus' ? 'their syllabus' : WHAT[m.what].many}` : `${esc(who)} asks for ${w}`;
  const act = done ? `<small class="sc-state">✓ Sent</small>` : mine ? `<small class="sc-state">Waiting for ${esc(who)}</small>`
    : `<button class="btn small primary" type="button" data-reqsend="${esc(m.id)}" data-what="${esc(m.what)}">Send ${m.what === 'syllabus' ? 'it' : 'them'}</button>`;
  return `<div class="share-card"><span class="sc-ic">🙋</span><div class="sc-body"><b>${text}</b>${m.about ? `<small>on ${esc(m.about)}</small>` : ''}</div></div><div class="sc-act">${act}</div>`;
};
$('msgPlus').addEventListener('click', () => { if ($('sharePanel').hidden) openSharePanel('menu'); else closeSharePanel(); });
$('sharePanel').addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  if ('spclose' in b.dataset) return closeSharePanel();
  if (b.dataset.sp) return openSharePanel(b.dataset.sp, { reqMid: Share.reqMid });
  if (b.dataset.askwhat) { Share.what = b.dataset.askwhat; return renderSharePanel(); }
  if (b.dataset.spsend) {
    b.disabled = true; b.textContent = 'Sending…';
    try { await sendShare(b.dataset.spsend); } catch (err) { console.warn(err); b.disabled = false; b.textContent = 'Try again'; toast('Not sent. Check your internet and try again.'); }
  }
});
// receiver: open the Add screen with the shared items (subject first, the same checks, merging)
$('msgList').addEventListener('click', async e => {
  const req = e.target.closest('[data-reqsend]');
  if (req) { const w = req.dataset.what; return openSharePanel(w, { reqMid: req.dataset.reqsend, what: w }); }
  const b = e.target.closest('[data-shareadd]'); if (!b) return;
  const m = Social.msgs.find(x => x.id === b.dataset.shareadd), f = friendship(Social.open); if (!m || !f) return;
  b.disabled = true;
  try {
    const d = await Store.fs.doc(`chats/${f.id}/shares/${m.sid}`).get();
    if (!d.exists) { b.disabled = false; return toast('This share is no longer available.'); }
    const data = d.data().data, from = friendName(otherOf(f));
    const share = { fid: f.id, mid: m.id, from, fromUser: '@' + ((Social.people[otherOf(f)] || {}).username || ''), what: m.what, count: m.count, subjectName: m.subjectName, topicName: m.topicName, title: m.title, text: JSON.stringify(data) };
    if (m.what !== 'syllabus' && !App.prep) { b.disabled = false; return toast('Open or create a prep first, then tap Add again.'); }
    const guess = m.subjectName ? matchTopic(m.subjectName, App.subjects.map(x => x.name)) : -1;
    openImport(m.what === 'syllabus' && !App.prep ? 'new' : 'active', m.what, { share, subject: guess >= 0 ? App.subjects[guess].code : null });
  } catch (err) { console.warn(err); b.disabled = false; toast('Could not open it. Check your internet.'); }
});
// after the Add screen saved a share: mark the card, log it, go back to the chat
async function shareAdded(c) {
  const sh = App.imp && App.imp.share; if (!sh) return false;
  if (sh.fid) Store.fs.doc(`chats/${sh.fid}/messages/${sh.mid}`).set({ status: 'added', doneAt: Date.now(), doneBy: meUid() }, { merge: true }).catch(() => {});
  const label = sh.what === 'syllabus' ? `the syllabus "${sh.title || ''}"` : countLabel(sh.what, sh.count || 0);
  const detail = c && c.kind !== 'syllabus' ? [c.fresh && `${c.fresh} new`, c.filled && `${c.filled} merged`, c.same && `${c.same} already there`].filter(Boolean).join(', ') : '';
  Activity.log('share_added', { from: sh.fromUser, summary: label, prep: (App.prep && App.prep.name) || (c && c.syllabus && c.syllabus.name) || '', detail });
  if (sh.fid && friendship(sh.fid)) { openThread(sh.fid); toast(`Added ${label} from ${sh.from}.`); }
  else if (sh.room) { openRoom(sh.room); toast(`Added ${label}. They join your revision.`); }
  else { show('home'); toast(`Added ${label}.`); }
  return true;
}
