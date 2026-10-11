/* =====================================================================
   UPDATES for the Android app.
   Two kinds:
   1. App code (screens, features): downloaded quietly in the background
      and used the next time the app opens. No reinstall. If a new version
      ever fails to start, the app goes back to the last good one by itself.
   2. Phone-level changes (permissions, new phone features): need a new
      APK. Then a pop-up in the middle of the screen asks to install it and
      cannot be closed until the new app is installed.
   The "Build Android app" job publishes recurra.apk + bundle.zip on GitHub
   and writes Firestore public/config.android = { level, build, apk, bundle }.
   level = the phone-level version (package.json "nativeLevel"); the installed
   app knows its own level from its version name ("2.0.0-n2").
   The updater add-on is told not to contact anyone else (no stats, no checks).
   The website ignores all of this.
   ===================================================================== */
const Upd = { P: null, busy: false, gate: false };
if (NATIVE && window.capacitorExports) {
  try { Upd.P = capacitorExports.registerPlugin('CapacitorUpdater'); Upd.P.notifyAppReady().catch(() => {}); } catch (e) { Upd.P = null; }
}
// what to do, given the published build and what this phone has: 'force' | 'download' | 'none'
function updDecide(conf, nativeVersion, webBuild, pending) {
  if (!conf || !conf.level) return 'none';
  const have = Number((String(nativeVersion || '').match(/-n(\d+)/) || [])[1] || 0);
  if (conf.level > have) return 'force';
  if (conf.bundle && Number(conf.build || 0) > Number(webBuild || 0) && Number(conf.build) !== Number(pending || 0)) return 'download';
  return 'none';
}
async function updCheck() {
  if (!NATIVE || !Upd.P || Upd.busy || !Store.fs) return;
  Upd.busy = true;
  try {
    const d = await Store.fs.doc('public/config').get(), conf = d.exists ? (d.data() || {}).android : null;
    const nativeV = (await Upd.P.getBuiltinVersion()).version;
    let pending = ''; try { pending = localStorage.getItem('rc-upd-next') || ''; } catch (e) {}
    const what = updDecide(conf, nativeV, window.APP_CONFIG && APP_CONFIG.webBuild, pending);
    if (what === 'force') showUpdateGate(conf);
    else if (what === 'download') {
      const b = await Upd.P.download({ url: conf.bundle, version: String(conf.build) });
      await Upd.P.next({ id: b.id });                         // used the next time the app opens
      try { localStorage.setItem('rc-upd-next', String(conf.build)); } catch (e) {}
      toast('An update is ready. It will be used the next time you open Recurra.');
    }
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
      <p>A new version of Recurra is ready. Please install it to keep using the app.</p>
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
