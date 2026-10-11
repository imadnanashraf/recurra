/* =====================================================================
   SUPERADMIN PANEL (only adnan.ashraf19@gmail.com, enforced by the database rules too)
   People: everyone's status, last seen, device and place, with actions.
   Activity log: every logged action, filterable by person, kind, place and dates.
   Turning a login off and erasing a login are finished by the hourly account job.
   ===================================================================== */
const Admin = { users: [], logs: [], logLimit: 300, logsFull: false, tab: 'people', current: null };
const ONLINE_MS = 6 * 60e3;
const isOnline = u => !!u.lastSeen && Date.now() - u.lastSeen < ONLINE_MS;
const whoOf = u => ({ uid: u.uid, email: u.email || '', name: u.name || '' });
const personName = u => (u.name || (u.email || '').split('@')[0] || 'Unknown').trim();

MODES.admin = () => {
  if (!isAdminUser(App.authUser) || App.viewAs) return goHome();
  show('admin'); setAdmTab(Admin.tab); loadUsers();
};
function personAvatar(u, cls = '') {
  let h = 0; for (const ch of u.uid || 'x') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const inner = u.photo ? `<img src="${esc(u.photo)}" alt="">` : esc(initials(personName(u)));
  return `<span class="avatar ${cls}" style="background:${AVATAR_COLORS[h % AVATAR_COLORS.length]}">${inner}</span>`;
}
function statusBadges(u) {
  const b = [];
  if ((u.email || '').toLowerCase() === ADMIN_EMAIL) b.push('<span class="badge">Admin</span>');
  if (u.test) b.push('<span class="badge">Test</span>');
  if (u.status === 'deleting') b.push(`<span class="badge bad">Erased ${esc(fmtDate(u.deleteAt))}</span>`);
  else if (u.status === 'disabled') b.push('<span class="badge bad">Turned off</span>');
  else if (u.status === 'deleted') b.push('<span class="badge bad">Deleted</span>');
  else if (isOnline(u)) b.push('<span class="badge good">Online now</span>');
  return b.join(' ');
}

function setAdmTab(t) {
  Admin.tab = t;
  [...$('admTabs').children].forEach(b => b.setAttribute('aria-pressed', String(b.dataset.adm === t)));
  $('admPeople').hidden = t !== 'people'; $('admLogs').hidden = t !== 'logs';
  if (t === 'logs') {
    if (!$('logFrom').value) { $('logFrom').value = dayKey(addDays(Date.now(), -6)); $('logTo').value = todayKey(); }
    loadLogs(true);
  }
}
$('admTabs').addEventListener('click', e => { const b = e.target.closest('[data-adm]'); if (b) setAdmTab(b.dataset.adm); });
$('admRefresh').addEventListener('click', () => { loadUsers(); if (Admin.tab === 'logs') loadLogs(true); });

/* ---------- people ---------- */
async function loadUsers() {
  if (!Admin.users.length) $('admUserList').innerHTML = '<div class="empty">Loading…</div>';
  try {
    const snap = await Store.fs.collection('users').get();
    Admin.users = snap.docs.map(d => ({ uid: d.id, ...(d.data() || {}) }))
      .sort((a, b) => (b.lastSeen || b.created || 0) - (a.lastSeen || a.created || 0));
  } catch (e) {
    console.warn(e);
    $('admUserList').innerHTML = '<div class="empty">Could not load people. The new database rules may not be published yet.</div>';
    return;
  }
  renderUsers(); fillLogUsers();
  if (Admin.current && visible('adminUser')) { const u = Admin.users.find(x => x.uid === Admin.current.uid); if (u) { Admin.current = u; renderPerson(); } }
}
function renderUsers() {
  const all = Admin.users, week = Date.now() - 7 * DAY_MS;
  $('admStats').innerHTML = `
    <div class="stat"><b>${all.length}</b><small>People</small></div>
    <div class="stat"><b>${all.filter(isOnline).length}</b><small>Online now</small></div>
    <div class="stat"><b>${all.filter(u => (u.lastSeen || 0) > week).length}</b><small>Active this week</small></div>
    <div class="stat"><b>${all.filter(u => isBlocked(u.status)).length}</b><small>Turned off or deleting</small></div>`;
  const q = $('admSearch').value.trim().toLowerCase(), f = $('admStatus').value;
  const list = all.filter(u => {
    if (q && !`${u.name || ''} ${u.email || ''}`.toLowerCase().includes(q)) return false;
    if (f === 'online') return isOnline(u);
    if (f === 'active') return !isBlocked(u.status);
    if (f === 'test') return !!u.test;
    if (f) return u.status === f;
    return true;
  });
  $('admUserList').innerHTML = list.length ? list.map(u => `
    <button class="row person" type="button" data-uid="${esc(u.uid)}">
      ${personAvatar(u, 'sm')}
      <span class="name">${esc(personName(u))}<small>${esc(u.email || '')}</small>
        <small>${esc([u.lastPlatform, u.lastPlace].filter(Boolean).join(' · ') || 'No activity yet')} · ${esc(isOnline(u) ? 'active now' : 'last seen ' + ago(u.lastSeen))}</small></span>
      <span class="n">${statusBadges(u)}</span></button>`).join('')
    : '<div class="empty">Nobody matches.</div>';
}
$('admSearch').addEventListener('input', renderUsers);
$('admStatus').addEventListener('change', renderUsers);
$('admUserList').addEventListener('click', e => { const b = e.target.closest('[data-uid]'); if (b) openPerson(b.dataset.uid); });

/* ---------- one person ---------- */
function openPerson(uid) {
  const u = Admin.users.find(x => x.uid === uid); if (!u) return;
  Admin.current = u; show('adminUser'); renderPerson(); loadPersonExtras(u);
}
$('auBack').addEventListener('click', () => { show('admin'); setAdmTab(Admin.tab); renderUsers(); });
function renderPerson(note) {
  const u = Admin.current, self = u.uid === App.authUser.uid, gone = u.status === 'deleted';
  $('auTitle').textContent = personName(u);
  $('auHead').innerHTML = `${personAvatar(u, 'big')}<div class="au-id"><strong>${esc(personName(u))}</strong><span class="muted">${esc(u.email || '')}</span><span>${statusBadges(u)}</span></div>`;
  const statusLine = u.status === 'deleting' ? `Being deleted: erased on ${fmtDate(u.deleteAt)}` : u.status === 'disabled' ? 'Turned off (cannot sign in)' : gone ? 'Deleted (login removal pending)' : 'Active';
  $('auInfo').innerHTML = `<h3>Details</h3><dl class="kv">
    <div><dt>Status</dt><dd>${esc(statusLine)}</dd></div>
    <div><dt>Joined</dt><dd>${esc(fmtDate(u.created))}</dd></div>
    <div><dt>Last seen</dt><dd>${esc(isOnline(u) ? 'Online now' : ago(u.lastSeen))}${u.lastSeen ? ` <span class="muted">(${esc(fmtTime(u.lastSeen))})</span>` : ''}</dd></div>
    <div><dt>Last used on</dt><dd>${esc([u.lastPlatform, u.lastDevice].filter(Boolean).join(' · ') || '–')}</dd></div>
    <div><dt>IP address</dt><dd class="mono">${esc(u.lastIp || '–')}</dd></div>
    <div><dt>Place</dt><dd>${esc(u.lastPlace || '–')}</dd></div>
  </dl>`;
  const act = [];
  if (!self && !gone) act.push(`<button class="mode" type="button" data-au="open"><strong>Open their account</strong><span>See and change their preps, questions and progress as they see them</span></button>`);
  if (u.email && !gone) act.push(`<button class="mode" type="button" data-au="reset"><strong>Send a password reset email</strong><span>They get a link at ${esc(u.email)} to set a new password</span></button>`);
  if (!self && !gone) act.push(`<div class="au-rename"><label for="auPass">Set a new password</label><div class="row-inline"><div class="pw"><input id="auPass" type="password" autocomplete="new-password" minlength="6" placeholder="At least 6 characters"><button class="pwtoggle" type="button" data-pw="auPass" aria-label="Show password">Show</button></div><button class="btn" type="button" data-au="setpw">Set</button></div><small class="muted">They are signed out on every device and use this password from now on. Tell them the new password yourself.</small></div>`);
  if (!gone) act.push(`<div class="au-rename"><label for="auName">Name</label><div class="row-inline"><input id="auName" maxlength="40" value="${esc(u.name || '')}"><button class="btn" type="button" data-au="rename">Save</button></div></div>`);
  if (!self && !gone) {
    const btns = [];
    if (u.status === 'disabled') btns.push('<button class="btn" type="button" data-au="enable">Turn back on</button>');
    else if (u.status !== 'deleting') btns.push('<button class="btn" type="button" data-au="disable">Turn off sign-in</button>');
    if (u.status === 'deleting') btns.push('<button class="btn" type="button" data-au="restore">Cancel deletion</button>');
    else btns.push('<button class="btn" type="button" data-au="schedule">Delete in 30 days</button>');
    btns.push('<button class="btn danger" type="button" data-au="now">Delete now, permanently</button>');
    act.push(`<div class="btns grid">${btns.join('')}</div>`);
  }
  if (self) act.push('<p class="muted small">This is your own account, so it cannot be turned off or deleted here.</p>');
  $('auActions').innerHTML = `<h3>Actions</h3><div class="au-acts">${act.join('')}</div><div id="auConfirm"></div><p class="msg" id="auMsg"></p>`;
  if (note) msg('auMsg', note, 'ok');
}
async function loadPersonExtras(u) {
  $('auPreps').innerHTML = '<h3>Preps</h3><div class="empty">Loading…</div>';
  $('auLog').innerHTML = '<h3>Recent activity</h3><div class="empty">Loading…</div>';
  try {
    const preps = await Store.fs.collection(`users/${u.uid}/preps`).get();
    const rows = [];
    for (const d of preps.docs) {
      const p = d.data() || {};
      const bank = await Store.fs.collection(`users/${u.uid}/preps/${d.id}/bank`).get();
      const nq = bank.docs.reduce((a, b) => a + Object.keys((b.data() || {}).q || {}).length, 0);
      rows.push(`<div class="row topic"><span class="name">${esc(p.name || 'Prep')}<small>${plural((p.subjects || []).length, 'subject')} · ${plural(nq, 'question')}${p.examDate ? ' · exam ' + esc(p.examDate) : ''}</small></span><span class="n">${esc(fmtDate(p.created))}</span></div>`);
    }
    if (Admin.current !== u) return;
    $('auPreps').innerHTML = `<h3>Preps</h3>${rows.length ? `<div class="list flat">${rows.join('')}</div>` : '<p class="muted small">No preps yet.</p>'}`;
  } catch (e) { $('auPreps').innerHTML = '<h3>Preps</h3><p class="muted small">Could not load preps.</p>'; }
  try {
    const s = await Store.fs.collection('logs').where('uid', '==', u.uid).limit(300).get();
    const logs = s.docs.map(d => ({ id: d.id, ...(d.data() || {}) })).sort((a, b) => b.at - a.at).slice(0, 15);
    if (Admin.current !== u) return;
    $('auLog').innerHTML = `<h3>Recent activity</h3>${logs.length ? `<div class="loglist compact">${logs.map(l => logRow(l, true)).join('')}</div>` : '<p class="muted small">Nothing logged yet.</p>'}
      <button class="btn" type="button" data-au="alllogs">See all in the activity log</button>`;
  } catch (e) { $('auLog').innerHTML = '<h3>Recent activity</h3><p class="muted small">Could not load activity.</p>'; }
}
async function adminSet(u, fields, action, detail) {
  await Store.fs.doc(`users/${u.uid}`).set(fields, { merge: true });
  Object.assign(u, fields);
  await Activity.log(action, detail || {}, whoOf(u));
  if ('status' in fields) kickJob();          // block or unblock the login now instead of at the next scheduled run
}
// Starts the account job on GitHub straight away, using the admin's GitHub key (saved in Settings → Admin)
async function kickJob() {
  try {
    const d = await Store.fs.doc('adminConfig/github').get();
    const token = d.exists && (d.data() || {}).token;
    if (!token) return false;
    const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/accounts.yml/dispatches`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }, body: JSON.stringify({ ref: 'main' }),
    });
    return r.status === 204;
  } catch (e) { return false; }
}
function watchTask(ref, u) {
  if (typeof ref.onSnapshot !== 'function') return;
  const stop = ref.onSnapshot(s => {
    const t = s.exists ? (s.data() || {}) : {};
    if (t.status === 'done') { stop(); if (Admin.current === u && visible('adminUser')) msg('auMsg', `Password changed. ${personName(u)} has been signed out and must use the new password.`, 'ok'); else toast('Password changed.'); }
    if (t.status === 'failed') { stop(); if (Admin.current === u && visible('adminUser')) msg('auMsg', `Could not set the password: ${t.error || 'unknown error'}.`, 'err'); }
  }, () => {});
}
// delete all of a person's data now; the profile becomes a short "deleted" marker until the job removes the login
async function adminDeleteNow(u) {
  const base = `users/${u.uid}`, writes = [];
  for (const pid of await Store.ids(`${base}/preps`)) {
    for (const col of ['bank', 'notes', 'progress']) (await Store.ids(`${base}/preps/${pid}/${col}`)).forEach(id => writes.push({ path: `${base}/preps/${pid}/${col}/${id}`, data: null }));
    writes.push({ path: `${base}/preps/${pid}`, data: null });
  }
  (await Store.ids(`${base}/devices`)).forEach(id => writes.push({ path: `${base}/devices/${id}`, data: null }));
  writes.push({ path: base, data: { status: 'deleted', deletedAt: Date.now(), email: u.email || '', name: u.name || '' } });
  await Store.write(writes);
  await Activity.log('admin_deleted_now', {}, whoOf(u));
  Object.keys(u).forEach(k => { if (!['uid', 'email', 'name'].includes(k)) delete u[k]; });
  Object.assign(u, { status: 'deleted', deletedAt: Date.now() });
}
$('adminUser').addEventListener('click', async e => {
  const b = e.target.closest('[data-au]'); if (!b) return;
  const u = Admin.current, a = b.dataset.au, box = $('auConfirm');
  const confirm = (html, yes, fn) => {
    box.innerHTML = `<div class="confirm"><span>${html}</span><div class="btns"><button class="btn danger" type="button" id="auYes">${yes}</button><button class="btn" type="button" id="auNo">Cancel</button></div></div>`;
    $('auNo').onclick = () => { box.innerHTML = ''; };
    $('auYes').onclick = async () => { $('auYes').disabled = true; try { await fn(); } catch (err) { console.warn(err); msg('auMsg', 'That did not work. Check your internet and try again.', 'err'); $('auYes') && ($('auYes').disabled = false); } };
  };
  const done = (note) => { box.innerHTML = ''; renderPerson(note); renderUsers(); loadPersonExtras(u); };
  try {
    if (a === 'open') return openAccountAs(whoOf(u));
    if (a === 'alllogs') { show('admin'); $('logUser').value = u.uid; return setAdmTab('logs'); }
    if (a === 'reset') {
      await App.fb.auth.sendPasswordResetEmail(u.email);
      await Activity.log('admin_reset_sent', {}, whoOf(u));
      return msg('auMsg', `Sent. ${personName(u)} will get a link at ${u.email} to set a new password.`, 'ok');
    }
    if (a === 'setpw') {
      const pw = $('auPass').value;
      if (pw.length < 6) return msg('auMsg', 'Use a password of at least 6 characters.', 'err');
      return confirm(`Set this as <b>${esc(personName(u))}</b>'s new password? They will be signed out on every device.`, 'Set password', async () => {
        const ref = Store.fs.collection('adminTasks').doc();
        await ref.set({ type: 'setPassword', uid: u.uid, email: u.email || '', password: pw, status: 'pending', at: Date.now(), by: App.authUser.email });
        await Activity.log('admin_password_set', {}, whoOf(u));
        box.innerHTML = ''; $('auPass').value = '';
        const fast = await kickJob();
        msg('auMsg', fast ? 'Setting the password… this usually takes under a minute.' : 'Saved. It is applied at the next scheduled run, within about 10 minutes. Add a GitHub key in Settings → Admin to make it take under a minute.', 'ok');
        watchTask(ref, u);
      });
    }
    if (a === 'rename') {
      const name = $('auName').value.trim(); if (!name) return msg('auMsg', 'Name cannot be empty.', 'err');
      await adminSet(u, { name }, 'admin_renamed', { name }); return done('Name saved.');
    }
    if (a === 'disable') return confirm(`Turn off <b>${esc(personName(u))}</b>? They are signed out on every device straight away and cannot sign in until you turn the account back on. Nothing is deleted.`, 'Turn off', async () => {
      await adminSet(u, { status: 'disabled', disabledAt: Date.now() }, 'admin_disabled'); done('Turned off. Their login is blocked within the hour, and the app is locked for them right now.');
    });
    if (a === 'enable') { await adminSet(u, { status: 'active', disabledAt: 0 }, 'admin_enabled'); return done('Turned back on. They can sign in again within the hour.'); }
    if (a === 'schedule') {
      const deleteAt = Date.now() + DELETE_WAIT_DAYS * DAY_MS;
      return confirm(`Delete <b>${esc(personName(u))}</b>'s account? They are signed out now and cannot sign in. Everything is erased for good on <b>${esc(fmtDate(deleteAt))}</b> unless you cancel before then.`, 'Delete in 30 days', async () => {
        await adminSet(u, { status: 'deleting', deleteRequestedAt: Date.now(), deleteAt }, 'admin_delete_scheduled', { deleteAt }); done(`Scheduled. Everything will be erased on ${fmtDate(deleteAt)}.`);
      });
    }
    if (a === 'restore') { await adminSet(u, { status: 'active', deleteAt: 0, deleteRequestedAt: 0 }, 'admin_restored'); return done('Deletion cancelled. They can sign in again within the hour.'); }
    if (a === 'now') {
      box.innerHTML = `<div class="confirm delete-box"><span>This erases <b>${esc(personName(u))}</b>'s preps, questions, notes and progress <b>right now</b>, and their login is removed within the hour. It cannot be undone.</span>
        <label for="auType">Type their email to confirm</label><input id="auType" autocomplete="off" spellcheck="false">
        <div class="btns grid"><button class="btn" type="button" id="auNo">Cancel</button><button class="btn danger" type="button" id="auYes" disabled>Delete now</button></div></div>`;
      $('auType').oninput = () => { $('auYes').disabled = $('auType').value.trim().toLowerCase() !== (u.email || '').toLowerCase(); };
      $('auNo').onclick = () => { box.innerHTML = ''; };
      $('auYes').onclick = async () => {
        $('auYes').disabled = true; msg('auMsg', 'Deleting…');
        try { await adminDeleteNow(u); done('Deleted. Their data is gone, and their login is removed within the hour.'); }
        catch (err) { console.warn(err); msg('auMsg', 'Could not delete everything. Check your internet and try again.', 'err'); }
      };
    }
  } catch (err) { console.warn(err); msg('auMsg', authError(err) || 'That did not work. Try again.', 'err'); }
});

/* ---------- activity log ---------- */
function fillLogUsers() {
  const sel = $('logUser'), keep = sel.value;
  sel.innerHTML = '<option value="">Everyone</option>' + Admin.users.map(u => `<option value="${esc(u.uid)}">${esc(personName(u))} (${esc(u.email || '')})</option>`).join('');
  sel.value = keep;
}
async function loadLogs(reset) {
  if (reset) Admin.logLimit = 300;
  const from = $('logFrom').value ? keyToMs($('logFrom').value) : addDays(Date.now(), -6);
  const to = $('logTo').value ? addDays(keyToMs($('logTo').value), 1) : addDays(Date.now(), 1);
  $('logCount').textContent = 'Loading…';
  try {
    const s = await Store.fs.collection('logs').where('at', '>=', from).where('at', '<', to).orderBy('at', 'desc').limit(Admin.logLimit).get();
    Admin.logs = s.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
    Admin.logsFull = Admin.logs.length >= Admin.logLimit;
  } catch (e) { console.warn(e); $('logCount').textContent = 'Could not load the activity log.'; return; }
  renderLogs();
}
function logRow(l, compact) {
  const where = [l.platform, l.device, l.ip, l.place].filter(Boolean).join(' · ');
  return `<div class="logrow">
    <span class="lt" title="${esc(new Date(l.at).toString())}">${esc(new Date(l.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }))}${compact ? `<small>${esc(new Date(l.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }))}</small>` : ''}</span>
    <span class="lw">${compact ? '' : `<button class="linkbtn" type="button" data-loguid="${esc(l.uid)}">${esc(l.name || l.email || 'Someone')}</button> `}${esc(actionText(l))}
      ${l.byEmail ? `<span class="badge">by ${esc(l.byEmail === ADMIN_EMAIL ? 'admin' : l.byEmail)}</span>` : ''}
      <small>${esc(where || '–')}</small></span>
    <span class="lg">${esc(actionGroup(l))}</span></div>`;
}
function renderLogs() {
  const q = $('logSearch').value.trim().toLowerCase(), uid = $('logUser').value, g = $('logGroup').value, pf = $('logPlatform').value;
  const list = Admin.logs.filter(l => (!uid || l.uid === uid) && (!g || actionGroup(l) === g) && (!pf || l.platform === pf) &&
    (!q || `${l.name} ${l.email} ${actionText(l)} ${l.ip} ${l.place} ${l.device} ${l.platform}`.toLowerCase().includes(q)));
  let html = '', lastDay = '';
  const label = ms => { const k = dayKey(ms); return k === todayKey() ? 'Today' : k === dayKey(addDays(Date.now(), -1)) ? 'Yesterday' : new Date(ms).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }); };
  list.forEach(l => { const k = dayKey(l.at); if (k !== lastDay) { lastDay = k; html += `<h4 class="logday">${esc(label(l.at))}</h4>`; } html += logRow(l); });
  $('logList').innerHTML = html || '<div class="empty">No activity matches these filters.</div>';
  $('logCount').textContent = `${plural(list.length, 'entry')}${list.length !== Admin.logs.length ? ` (of ${Admin.logs.length} loaded)` : ''}`.replace('entrys', 'entries');
  $('logMore').hidden = !Admin.logsFull;
}
['logSearch'].forEach(id => $(id).addEventListener('input', renderLogs));
['logUser', 'logGroup', 'logPlatform'].forEach(id => $(id).addEventListener('change', renderLogs));
['logFrom', 'logTo'].forEach(id => $(id).addEventListener('change', () => loadLogs(true)));
$('logMore').addEventListener('click', () => { Admin.logLimit += 300; loadLogs(); });
$('logList').addEventListener('click', e => { const b = e.target.closest('[data-loguid]'); if (b && Admin.users.some(u => u.uid === b.dataset.loguid)) openPerson(b.dataset.loguid); });

/* ---------- GitHub key for instant admin actions (Settings → Admin) ---------- */
async function renderAdminKey() {
  if (!isAdminUser(App.authUser) || App.viewAs) return;
  let has = false;
  try { const d = await Store.fs.doc('adminConfig/github').get(); has = !!(d.exists && (d.data() || {}).token); } catch (e) {}
  $('ghKeyState').innerHTML = has ? '<span class="badge good">Key saved</span> Password changes and turning accounts off take under a minute.' : '<span class="badge warn">No key</span> Password changes and turning accounts off wait for the next run (up to 10 minutes).';
}
$('ghKeySave').addEventListener('click', async () => {
  const token = $('ghKey').value.trim();
  if (!/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(token)) return msg('ghKeyMsg', 'That does not look like a GitHub key. It starts with github_pat_.', 'err');
  try {
    await Store.fs.doc('adminConfig/github').set({ token, savedAt: Date.now() });
    $('ghKey').value = '';
    msg('ghKeyMsg', (await kickJob()) ? 'Saved and tested: the account job started.' : 'Saved, but GitHub refused it. Check the key has "Actions: Read and write" for the recurra repository.', 'ok');
    renderAdminKey();
  } catch (e) { msg('ghKeyMsg', 'Could not save. Check your internet.', 'err'); }
});
