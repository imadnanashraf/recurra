/* =====================================================================
   UPDATES for the Android app: every new build must be installed.
   The "Build Android app" job publishes recurra.apk on GitHub and then writes
   Firestore public/config.android = { build, apk }. The installed app knows its
   own build from its version name ("2.0.0-n2-b54"). When a newer build exists,
   a pop-up in the middle of the screen asks to install it and cannot be
   closed until the new app is installed. Nothing updates quietly.
   (The updater add-on is only used to read the installed version; it is told
   not to contact anyone.) The website ignores all of this.
   ===================================================================== */
const Upd = { P: null, busy: false, gate: false };
if (NATIVE && window.capacitorExports) {
  try { Upd.P = capacitorExports.registerPlugin('CapacitorUpdater'); Upd.P.notifyAppReady().catch(() => {}); } catch (e) { Upd.P = null; }
}
// the installed app's build number, from its version name ("2.0.0-n2-b54"); older apps had no "-b": 0
const installedBuild = v => Number((String(v || '').match(/-b(\d+)/) || [])[1] || 0);
// what to do: 'force' (a newer build must be installed) or 'none'
function updDecide(conf, nativeVersion) {
  if (!conf || !conf.build || !conf.apk) return 'none';
  return Number(conf.build) > installedBuild(nativeVersion) ? 'force' : 'none';
}
async function updCheck() {
  if (!NATIVE || !Upd.P || Upd.busy || Upd.gate || !Store.fs) return;
  Upd.busy = true;
  try {
    // an app code copy downloaded by an earlier version: go back to the installed app's own code
    try { const cur = await Upd.P.current(); if (cur && cur.bundle && cur.bundle.id && cur.bundle.id !== 'builtin') { await Upd.P.reset(); return; } } catch (e) {}
    const d = await Store.fs.doc('public/config').get(), conf = d.exists ? (d.data() || {}).android : null;
    const nativeV = (await Upd.P.getBuiltinVersion()).version;
    if (updDecide(conf, nativeV) === 'force') showUpdateGate(conf);
  } catch (e) { console.warn('update check', e); }
  Upd.busy = false;
}
function updStart() {
  if (!NATIVE || !Upd.P) return;
  updCheck();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) updCheck(); });
}
// the pop-up that cannot be closed until the new app is installed
function showUpdateGate(conf) {
  const g = $('updGate'); Upd.gate = true;
  g.hidden = false; document.body.classList.add('sheet-open', 'upd-open');
  g.innerHTML = `<div class="card upd-card" role="alertdialog" aria-modal="true" aria-labelledby="updTitle">
      <div class="upd-ic" aria-hidden="true"><svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" class="c"/><path d="M24 12v17M16.5 22.5L24 30l7.5-7.5M15 35h18" class="a"/></svg></div>
      <h2 id="updTitle">Update needed</h2>
      <p>A new version of Recurra is ready${conf.build ? ` (build ${conf.build})` : ''}. Please install it to keep using the app.</p>
      <p class="muted small">Your questions, notes and progress are safe in your account.</p>
      <a class="btn primary upd-go" id="updGo" href="${esc(conf.apk)}" target="_blank" rel="noopener">Download &amp; install</a>
      <ol class="upd-steps">
        <li>Tap <b>Download &amp; install</b>.</li>
        <li>When it finishes, tap the downloaded <b>recurra.apk</b>.</li>
        <li>Tap <b>Install</b>. If Android asks, allow installing from this source.</li>
      </ol>
      <button class="linkbtn" type="button" id="updAgain">I installed it, check again</button>
    </div>`;
  $('updGo').onclick = () => { setTimeout(() => { $('updGo').textContent = 'Downloading… open it when it finishes'; }, 400); };
  $('updAgain').onclick = () => { location.reload(); };
}

/* ---------- the website: tell people when a newer version is out ----------
   A tab (or the website saved to a home screen) that stays open keeps running the
   old code. Every 5 minutes, and when you come back to it, it checks version.json;
   if a newer build is out, a bar at the top says so with a Reload button. */
const WEB_BUILD = '{{BUILD_ID}}';
async function webUpdateCheck() {
  if (NATIVE || location.protocol !== 'https:' || $('webUpd').hidden === false) return;
  try {
    const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) return;
    const v = await r.json();
    if (v.build && v.build !== WEB_BUILD) {
      const bar = $('webUpd'); bar.hidden = false;
      bar.innerHTML = `<span>✨ A new version of Recurra is ready.</span><button class="btn small primary" type="button" id="webUpdGo">Reload</button>`;
      $('webUpdGo').onclick = () => location.reload();
    }
  } catch (e) {}
}
if (!NATIVE) {
  setInterval(() => { if (!document.hidden) webUpdateCheck(); }, 5 * 60e3);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) webUpdateCheck(); });
  setTimeout(webUpdateCheck, 20e3);
}
