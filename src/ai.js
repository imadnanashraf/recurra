/* =====================================================================
   UPLOAD A PDF OR PHOTO → MCQs, notes or a syllabus, in one tap.
   Three ways, in this order:
   1. Your own free Google AI (Gemini) key, saved ONLY on this device.
   2. A few free uploads on Recurra's key (the "free trial"), sent through
      the small Recurra sender (push/worker.js) so the key is never in the app.
   3. Copy AI prompt: always there, always free, never locked.
   The file goes straight from this device to Google, is read, and is
   forgotten. Recurra never stores it; the log only says which file it was.
   ===================================================================== */
const AI = { FREE: 5, loaded: false, loading: false, trialOn: false, trialUrl: '', used: 0, interest: false,
  files: [], pages: '', busy: false, ctl: null, step: 0, err: '' };
const GEM = 'https://generativelanguage.googleapis.com/v1beta';
const AI_MAX = 14 * 1024 * 1024;           // Google takes about 20 MB per request; files grow by a third when sent
const AI_STUDIO = 'https://aistudio.google.com/apikey';
const aiStore = {
  get(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } },
  set(k, v) { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) {} },
};
const aiKey = () => aiStore.get('rc-gkey');
const aiModel = () => aiStore.get('rc-gmodel') || 'gemini-2.5-flash';
const aiMode = () => aiKey() ? 'own' : AI.trialOn && AI.used < AI.FREE ? 'trial' : 'none';
const fmtSize = b => b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';

// is the upload card shown on the Add screen right now?
function aiShown() {
  const { kind, target, share } = App.imp || {};
  if (share || !App.authUser || App.viewAs) return false;
  if (kind === 'syllabus') return true;
  return target !== 'new' && (kind === 'mcq' || kind === 'notes') && !!App.subjects.find(s => s.code === App.imp.subject);
}
async function aiLoad() {
  if (AI.loading || !App.authUser) return; AI.loading = true;
  try { const c = await Store.fs.doc('public/config').get(), d = c.exists ? c.data() || {} : {}; AI.trialOn = !!(d.aiTrial && d.pushUrl); AI.trialUrl = d.pushUrl || ''; } catch (e) {}
  try { const t = await Store.fs.doc(`aiTrial/${meUid()}`).get(); AI.used = t.exists ? Number((t.data() || {}).used || 0) : 0; } catch (e) {}
  try { const p = await Store.fs.doc(`proInterest/${meUid()}`).get(); AI.interest = p.exists; } catch (e) {}
  AI.loaded = true; AI.loading = false;
  if (visible('import')) aiRender();
}

// the best everyday "Flash" model this key can use (newest stable one)
function pickModel(models) {
  const names = (models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => String(m.name || '').replace(/^models\//, ''));
  const ver = n => Number((n.match(/^gemini-(\d+(?:\.\d+)?)/) || [])[1] || 0);
  const stable = names.filter(n => /^gemini-\d+(\.\d+)?-flash$/.test(n)).sort((a, b) => ver(b) - ver(a));
  if (stable.length) return stable[0];
  if (names.includes('gemini-flash-latest')) return 'gemini-flash-latest';
  const any = names.filter(n => /^gemini-[\d.]+-flash/.test(n) && !/lite|image|tts|audio|live|thinking|exp/.test(n)).sort((a, b) => ver(b) - ver(a));
  return any[0] || 'gemini-2.5-flash';
}
// what went wrong, in plain words
function aiError(status, text, own) {
  const t = String(text || '');
  if (status === 0) return 'No connection to Google right now. Check your internet and try again.';
  if (/API[_ ]KEY[_ ]INVALID|API key not valid|API key expired/i.test(t)) return own ? 'Google says this key is not valid. Copy it again from Google AI Studio (it starts with AQ.), or create a new key there.' : 'The free uploads are not working right now.';
  if (status === 402 || /trial used/i.test(t)) return 'Your free uploads are used up. Connect your own free key (1 minute) for unlimited uploads.';
  if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(t)) return own ? 'You have reached today’s free limit from Google. It resets tomorrow. Today, use Copy AI prompt instead.' : 'The free uploads are busy right now. Try again later, or connect your own free key.';
  if (status === 403 || /PERMISSION_DENIED|SERVICE_DISABLED/i.test(t)) return own ? 'Google says this key is not ready yet. Wait 1 minute and try again.' : 'The free uploads are not available right now.';
  if (status === 413 || /too large|payload/i.test(t)) return 'This file is too big for one upload. Split it into chapters and upload one at a time.';
  if (status >= 500) return 'Google’s AI is busy right now. Try again in a minute.';
  if (status === 400) return 'Google could not read this file. Try a clearer photo, a smaller PDF, or fewer pages.';
  return 'That did not work. Try again in a minute, or use Copy AI prompt.';
}
// test a key: can it list the models? → { ok, model } or { error }
async function aiTestKey(key) {
  if (!looksLikeKey(key)) return { error: 'This does not look like a key. A key is a long code that starts with AQ. (or AIza for older keys). Copy it again.' };
  try {
    const r = await fetch(`${GEM}/models?pageSize=200`, { headers: { 'x-goog-api-key': key } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { error: aiError(r.status, JSON.stringify(j), true) };
    return { ok: true, model: pickModel(j.models) };
  } catch (e) { return { error: aiError(0) }; }
}

// ---- the file(s) → what Google reads ----
const readAs = (file, how) => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(r.error); r[how](file); });
async function photoPart(file) {            // photos are made smaller first (sharp enough to read, much faster to send)
  try {
    const url = URL.createObjectURL(file), img = new Image();
    await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = url; });
    const k = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
    const data = c.toDataURL('image/jpeg', 0.85).split(',')[1];
    if (data) return { inline_data: { mime_type: 'image/jpeg', data } };
  } catch (e) {}
  return { inline_data: { mime_type: file.type || 'image/jpeg', data: String(await readAs(file, 'readAsDataURL')).split(',')[1] } };
}
async function filePart(file) {
  if (/^image\//.test(file.type)) return photoPart(file);
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return { inline_data: { mime_type: 'application/pdf', data: String(await readAs(file, 'readAsDataURL')).split(',')[1] } };
  return { text: 'My material:\n' + String(await readAs(file, 'readAsText')).slice(0, 200000) };
}
function aiPrompt() {
  const pages = AI.pages.trim(), hasPdf = AI.files.some(f => /pdf/i.test(f.type) || /\.pdf$/i.test(f.name));
  const where = `My material is in the attached file${AI.files.length > 1 ? 's' : ''}.${pages && hasPdf ? ` Use ONLY pages ${pages} of the PDF.` : ''} If a page is hard to read, skip it; never guess.`;
  return currentPrompt().replace(/\[paste[^\]]*\]\s*$/, where);
}

// ---- generate ----
async function aiGenerate() {
  const mode = aiMode(); if (!AI.files.length || AI.busy) return;
  const total = AI.files.reduce((n, f) => n + f.size, 0);
  const pdfBytes = AI.files.filter(f => !/^image\//.test(f.type)).reduce((n, f) => n + f.size, 0);
  if (pdfBytes > AI_MAX) { AI.err = `This is ${fmtSize(pdfBytes)}. One upload can be up to ${fmtSize(AI_MAX)}. Split the PDF into chapters, or use Copy AI prompt (ChatGPT and Gemini accept bigger files).`; return aiRender(); }
  if (mode === 'none') return aiGuide(0);
  AI.busy = true; AI.err = ''; aiRender();
  const names = AI.files.map(f => f.name).join(', '), kind = App.imp.kind;
  const sub = App.subjects.find(s => s.code === App.imp.subject);
  let status = 0, text = '';
  try {
    const parts = [];
    for (const f of AI.files) parts.push(await filePart(f));
    parts.push({ text: aiPrompt() });
    const body = JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', temperature: 0.4 } });
    AI.ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = AI.ctl && setTimeout(() => AI.ctl.abort(), 240e3);
    let r;
    if (mode === 'own') r = await fetch(`${GEM}/models/${encodeURIComponent(aiModel())}:generateContent`, { method: 'POST', headers: { 'x-goog-api-key': aiKey(), 'content-type': 'application/json' }, body, signal: AI.ctl && AI.ctl.signal });
    else {
      const token = await App.fb.auth.currentUser.getIdToken();
      r = await fetch(AI.trialUrl.replace(/\/+$/, '') + '/ai', { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body, signal: AI.ctl && AI.ctl.signal });
    }
    if (timer) clearTimeout(timer);
    status = r.status;
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error('google'), { status, text: JSON.stringify(j) });
    if (mode === 'trial') { const u = Number(r.headers.get('x-trial-used')); AI.used = isFinite(u) && u > 0 ? u : AI.used + 1; }
    const c = (j.candidates || [])[0];
    text = c && c.content ? (c.content.parts || []).map(p => p.text || '').join('') : '';
    if (!text.trim()) throw Object.assign(new Error('empty'), { status: 200, text: (j.promptFeedback && j.promptFeedback.blockReason) || (c && c.finishReason) || '' });
  } catch (e) {
    AI.busy = false; AI.ctl = null;
    if (e && e.name === 'AbortError') { AI.err = 'Stopped. Nothing was added.'; return aiRender(); }
    AI.err = e && e.message === 'empty' ? 'Google did not give anything back for this file. Try a clearer photo or fewer pages.' : aiError(e && e.status || status, e && e.text, mode === 'own');
    Activity.log('ai_upload_failed', { files: names, why: AI.err.split('.')[0], via: mode === 'own' ? 'own key' : 'free trial' });
    if (mode === 'trial' && /used up/.test(AI.err)) AI.used = AI.FREE;
    return aiRender();
  }
  // done: show it like a paste, then forget the file
  const info = { files: names, size: fmtSize(total), pages: AI.pages.trim(), kind, subject: sub ? sub.name : '', via: mode === 'own' ? 'own key' : 'free trial' };
  AI.busy = false; AI.ctl = null; AI.files = []; AI.pages = '';
  $('impText').value = text.trim();
  doCheck();
  const ch = App.imp.checked;
  info.result = !ch ? 'nothing usable' : kind === 'mcq' ? plural((ch.questions || []).length, 'MCQ') : kind === 'notes' ? plural((ch.notes || []).length, 'note') : 'a syllabus';
  Activity.log('ai_upload', info);
  Sound.play('check');
  aiRender();
  const pv = $('impPreview'); if (pv && !pv.hidden) pv.scrollIntoView({ behavior: 'smooth', block: 'start' });
  else $('impPaste').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---- the card on the Add screen ----
function aiRender() {
  const box = $('impAI'); if (!box) return;
  box.hidden = !aiShown(); if (box.hidden) return;
  if (!AI.loaded) { aiLoad(); }
  const mode = aiMode(), kind = App.imp.kind;
  const make = kind === 'mcq' ? 'Make MCQs' : kind === 'notes' ? 'Make revision notes' : 'Read my syllabus';
  const what = kind === 'syllabus' ? 'your official syllabus (PDF or photo)' : 'your notes, a chapter, or photos of your notes';
  const left = Math.max(0, AI.FREE - AI.used);
  const status = mode === 'own' ? `<span class="ai-ok">✓ Your own Google AI key is connected</span>`
    : mode === 'trial' ? `<span class="ai-free">🎁 ${left} of ${AI.FREE} free uploads left</span>`
    : AI.trialOn && AI.loaded ? `<span class="ai-free">Your ${AI.FREE} free uploads are used up</span>` : '';
  if (AI.busy) {
    box.innerHTML = `<div class="ai-head"><span class="ai-ic">📄</span><div><strong>Upload a PDF or photo</strong>${status}</div></div>
      <div class="ai-busy"><span class="ai-spin" aria-hidden="true"></span><div><b>Reading your file…</b><small>This usually takes 20–60 seconds. Keep this screen open.</small></div></div>
      <button class="btn" type="button" id="aiStop">Stop</button>`;
    $('aiStop').onclick = () => { if (AI.ctl) AI.ctl.abort(); };
    return;
  }
  const filesHtml = AI.files.map((f, i) => `<li><span>${/^image\//.test(f.type) ? '🖼️' : /pdf/i.test(f.type) || /\.pdf$/i.test(f.name) ? '📕' : '📄'}</span><b>${esc(f.name)}</b><small>${fmtSize(f.size)}</small><button class="x" type="button" data-airm="${i}" aria-label="Remove ${esc(f.name)}">×</button></li>`).join('');
  const hasPdf = AI.files.some(f => /pdf/i.test(f.type) || /\.pdf$/i.test(f.name));
  const body = mode === 'none'
    ? `<p class="muted">Turn ${what} into ${kind === 'mcq' ? 'MCQs' : kind === 'notes' ? 'revision notes' : 'your syllabus'} in one tap. Connect your own <b>free</b> Google AI key first. It takes about a minute and needs no card.</p>
       <div class="btns"><button class="btn primary" type="button" id="aiConnect">Connect my free key</button></div>`
    : `<label class="ai-drop" for="aiFile"><span class="ai-drop-ic">⬆️</span><b>${AI.files.length ? 'Add more' : 'Choose a PDF or photos'}</b><small>PDF up to ${fmtSize(AI_MAX)} · photos · Hinglish is fine</small></label>
       <input id="aiFile" type="file" accept="application/pdf,image/*,.txt,.md" multiple hidden>
       ${AI.files.length ? `<ul class="ai-files">${filesHtml}</ul>` : ''}
       ${hasPdf ? `<label for="aiPages" class="ai-pages-l">Only some pages? <small>(optional)</small></label><input id="aiPages" class="ai-pages" placeholder="e.g. 5-12" value="${esc(AI.pages)}" inputmode="numeric" autocomplete="off">` : ''}
       <p class="ai-note">🔒 Your file goes only to Google to be read, and is not kept by Recurra. Don’t upload anything private: Google may use free uploads to improve its AI.</p>
       <div class="btns"><button class="btn primary" type="button" id="aiGo"${AI.files.length ? '' : ' disabled'}>${make}</button></div>`;
  const foot = mode === 'own' ? `<div class="ai-foot"><button class="linkbtn" type="button" id="aiManage">Change or remove my key</button></div>`
    : mode === 'trial' ? `<div class="ai-foot"><button class="linkbtn" type="button" id="aiConnect2">Connect my own free key</button> for unlimited uploads</div>` : '';
  box.innerHTML = `<div class="ai-head"><span class="ai-ic">📄</span><div><strong>Upload a PDF or photo</strong>${status}</div></div>
    ${body}
    ${AI.err ? `<div class="ai-err" role="alert"><p>${esc(AI.err)}</p><div class="btns"><button class="btn small" type="button" id="aiUseCopy">Use Copy AI prompt instead</button>${/key|used up|limit/.test(AI.err) && mode !== 'own' ? '<button class="btn small" type="button" id="aiConnect3">Connect my free key</button>' : ''}</div></div>` : ''}
    ${foot}
    <div class="ai-pro"><span>⭐</span><div><b>Pro: one tap, no setup</b><small>${AI.interest ? 'Thanks! We’ll tell you when it’s ready.' : 'Coming soon'}</small></div>${AI.interest ? '<span class="badge">✓ On the list</span>' : '<button class="btn small" type="button" id="aiNotify">Notify me</button>'}</div>`;
  const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
  on('aiConnect', () => aiGuide(0)); on('aiConnect2', () => aiGuide(0)); on('aiConnect3', () => aiGuide(0));
  on('aiGo', aiGenerate);
  on('aiManage', aiManage);
  on('aiNotify', aiNotify);
  on('aiUseCopy', () => { const h = $('impHelp'); h.scrollIntoView({ behavior: 'smooth', block: 'start' }); h.classList.remove('hl'); void h.offsetWidth; h.classList.add('hl'); });
  const inp = $('aiFile');
  if (inp) inp.onchange = () => { AI.files.push(...[...inp.files].slice(0, 12)); AI.files = AI.files.slice(0, 12); AI.err = ''; inp.value = ''; aiRender(); };
  const pg = $('aiPages'); if (pg) pg.oninput = () => { AI.pages = pg.value.replace(/[^0-9,\- ]/g, '').slice(0, 30); };
  box.querySelectorAll('[data-airm]').forEach(b => { b.onclick = () => { AI.files.splice(Number(b.dataset.airm), 1); aiRender(); }; });
}
async function aiNotify() {
  try {
    const p = Social.people[meUid()] || {};
    await Store.fs.doc(`proInterest/${meUid()}`).set({ at: Date.now(), name: displayName(), username: p.username || '' });
    AI.interest = true; Activity.log('pro_interest'); toast('Thanks! We’ll tell you when Pro is ready.'); aiRender();
  } catch (e) { toast('Could not save. Check your internet and try again.'); }
}
function aiManage() {
  const box = $('impAI'), foot = box.querySelector('.ai-foot');
  foot.innerHTML = `<div class="confirm"><span>Remove your Google AI key from this device? You can connect it again any time.</span>
    <div class="btns"><button class="btn small" type="button" id="aiKeep">Keep it</button><button class="btn small" type="button" id="aiNew">Connect a different key</button><button class="btn small danger" type="button" id="aiDel">Remove</button></div></div>`;
  $('aiKeep').onclick = aiRender; $('aiNew').onclick = () => aiGuide(0);
  $('aiDel').onclick = () => { aiStore.set('rc-gkey', ''); aiStore.set('rc-gmodel', ''); Activity.log('ai_key_removed'); toast('Key removed from this device.'); aiRender(); };
}

// ---- the step-by-step guide to get a free key (for anyone, no tech words) ----
// Matches Google AI Studio as of late 2026: new keys start with "AQ." (older ones "AIza");
// brand-new accounts often get a key made for them after accepting the terms.
const AG = {   // simplified drawings of Google's pages
  frame: inner => `<rect x="6" y="6" width="228" height="138" rx="12" class="ag-win"/><rect x="6" y="6" width="228" height="22" rx="12" class="ag-bar"/><rect x="6" y="18" width="228" height="10" class="ag-bar"/>
    <circle cx="20" cy="17" r="3" class="ag-dot"/><circle cx="30" cy="17" r="3" class="ag-dot"/><rect x="44" y="11" width="150" height="12" rx="6" class="ag-url"/><text x="52" y="20.5" class="ag-urlt">aistudio.google.com/apikey</text>${inner}`,
  ring: (x, y, w, h) => `<rect x="${x - 5}" y="${y - 5}" width="${w + 10}" height="${h + 10}" rx="${Math.min(12, (h + 10) / 2)}" class="ag-ring"/>`,
  btn: (x, y, w, label, h = 20) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" class="ag-btn"/><text x="${x + w / 2}" y="${y + h / 2 + 3.2}" text-anchor="middle" class="ag-btnt">${label}</text>`,
  menu: on => `<rect x="12" y="34" width="52" height="104" rx="6" class="ag-side"/><text x="18" y="50" class="ag-s2">Home</text><text x="18" y="64" class="ag-s2">Dashboard</text>
    <rect x="15" y="70" width="46" height="13" rx="6" class="${on ? 'ag-sel' : 'ag-side'}"/><text x="18" y="80" class="ag-s2 b">Get API key</text><text x="18" y="96" class="ag-s2">Projects</text>`,
};
const AG_PARTS = {
  open: AG.frame(`<text x="120" y="66" text-anchor="middle" class="ag-h">Google AI Studio</text><text x="120" y="80" text-anchor="middle" class="ag-s">Sign in with your Google account</text>${AG.btn(80, 92, 80, 'Sign in', 22)}`),
  openT: [120, 103, 80, 22],
  terms: on => AG.frame(`<rect x="34" y="38" width="172" height="98" rx="10" class="ag-dlg"/><text x="48" y="56" class="ag-t">Welcome to Google AI Studio</text><text x="48" y="68" class="ag-s">Terms of Service</text>
    <rect x="48" y="78" width="12" height="12" rx="3" class="ag-box"/><g class="${on === 'tick' ? 'ag-after' : on === 'ticked' ? '' : 'ag-hide'}"><rect x="48" y="78" width="12" height="12" rx="3" class="ag-check"/><path d="M51 84l3 3 5-6" class="ag-tick"/></g><text x="66" y="87.5" class="ag-s">I agree to the terms</text>
    ${AG.btn(130, 106, 64, 'Continue')}`),
  termsT1: [54, 84, 12, 12], termsT2: [162, 116, 64, 20],
  keys: AG.frame(`${AG.menu(true)}<text x="74" y="50" class="ag-h">API keys</text>${AG.btn(160, 38, 66, 'Create API key', 18)}
    <rect x="74" y="64" width="152" height="1" class="ag-line"/><text x="74" y="78" class="ag-s2">Key</text><text x="150" y="78" class="ag-s2">Project</text>
    <rect x="74" y="84" width="152" height="1" class="ag-line"/><text x="74" y="98" class="ag-mono2">AQ.Ab…k9Qf</text><text x="150" y="98" class="ag-s2">Default Gemini Project</text>
    <rect x="74" y="104" width="152" height="1" class="ag-line"/>`),
  keysT: [193, 47, 66, 18],
  project: AG.frame(`<rect x="30" y="34" width="180" height="104" rx="10" class="ag-dlg"/><text x="44" y="52" class="ag-t">Create a new key</text>
    <text x="44" y="66" class="ag-s2">Name your key</text><rect x="44" y="70" width="152" height="14" rx="4" class="ag-field"/><text x="48" y="80" class="ag-s2">Gemini API Key</text>
    <text x="44" y="96" class="ag-s2">Choose a project</text><rect x="44" y="100" width="152" height="14" rx="4" class="ag-field"/><text x="48" y="110" class="ag-s2">Default Gemini Project  ▾</text>
    ${AG.btn(148, 118, 48, 'Create key', 16)}`),
  projectT: [172, 126, 48, 16],
  copy: on => AG.frame(`<rect x="30" y="38" width="180" height="96" rx="10" class="ag-dlg"/><text x="44" y="56" class="ag-t">API key</text><text x="44" y="68" class="ag-s2">Copy it now and keep it private</text>
    <rect x="44" y="76" width="152" height="20" rx="6" class="ag-key"/><text x="50" y="89.5" class="ag-mono">AQ.Ab8RN•••••••••••••</text><g class="ag-copyic"><rect x="176" y="80" width="9" height="11" rx="2"/><rect x="179" y="77" width="9" height="11" rx="2"/></g>
    ${AG.btn(150, 106, 46, 'Copy')}<g class="${on === 'copied' ? 'ag-after' : 'ag-hide'}"><rect x="80" y="104" width="62" height="22" rx="11" class="ag-toast"/><text x="111" y="118.5" text-anchor="middle" class="ag-toastt">✓ Copied</text></g>`),
  copyT: [173, 116, 46, 20],
  back: `<rect x="28" y="24" width="72" height="110" rx="12" class="ag-win"/><text x="64" y="84" text-anchor="middle" class="ag-mid">🌐</text><text x="64" y="120" text-anchor="middle" class="ag-s">AI Studio</text>
    <g class="ag-go"><path d="M110 79h28" class="ag-arrow"/><path d="M132 72l8 7-8 7" class="ag-arrow"/></g><rect x="146" y="24" width="72" height="110" rx="12" class="ag-app"/><text x="182" y="86" text-anchor="middle" class="ag-mid">📚</text><text x="182" y="120" text-anchor="middle" class="ag-s">Recurra</text>`,
  paste: on => `<rect x="20" y="20" width="200" height="112" rx="14" class="ag-win"/><text x="36" y="44" class="ag-t">Step: Paste your key</text>
    <rect x="36" y="56" width="120" height="22" rx="6" class="ag-field"/><text x="42" y="70.5" class="ag-mono ${on ? 'ag-after' : 'ag-hide'}">AQ.Ab8RN•••••••</text>
    <rect x="162" y="56" width="42" height="22" rx="8" class="ag-field"/><text x="183" y="70.5" text-anchor="middle" class="ag-s2 b">Paste</text>
    ${AG.btn(132, 96, 72, 'Connect', 22)}`,
  pasteT: [183, 67, 42, 22],
  done: `<circle cx="120" cy="74" r="50" class="ag-okc"/><path d="M96 75l16 16 32-34" class="ag-ok"/>`,
  why: `<circle cx="120" cy="72" r="54" class="ag-glow"/><text x="120" y="92" text-anchor="middle" class="ag-big">🔑</text><text x="176" y="52" class="ag-mid">✨</text><text x="52" y="118" class="ag-mid">📄</text>`,
};
const agSvg = (inner, extra = '') => `<svg viewBox="0 0 240 150" class="ag-art${extra}" aria-hidden="true">${inner}</svg>`;
const agPoint = ([x, y, w, h]) => AG.ring(x - w / 2, y - h / 2, w, h);
const AG_ART = {
  why: agSvg(AG_PARTS.why), open: agSvg(AG_PARTS.open + agPoint(AG_PARTS.openT)),
  terms: agSvg(AG_PARTS.terms('ticked') + agPoint(AG_PARTS.termsT2)),
  keys: agSvg(AG_PARTS.keys + agPoint(AG_PARTS.keysT)), project: agSvg(AG_PARTS.project + agPoint(AG_PARTS.projectT)),
  copy: agSvg(AG_PARTS.copy('') + agPoint(AG_PARTS.copyT)), back: agSvg(AG_PARTS.back), done: agSvg(AG_PARTS.done),
};
// the "Watch how" walkthrough: each scene = a picture, where the finger goes and taps, and a caption
const AG_SCENES = [
  { svg: AG_PARTS.open, to: AG_PARTS.openT, cap: 'Open Google AI Studio and sign in with your Google account.' },
  { svg: AG_PARTS.terms('tick'), to: AG_PARTS.termsT1, cap: 'First time only: tick the box to agree…' },
  { svg: AG_PARTS.terms('ticked'), to: AG_PARTS.termsT2, cap: '…and tap Continue.' },
  { svg: AG_PARTS.keys, to: AG_PARTS.keysT, cap: 'On “API keys”, tap Create API key. (Already see a key in the list? Google made one for you: just open it and copy it.)', dur: 6000 },
  { svg: AG_PARTS.project, to: AG_PARTS.projectT, cap: 'If it asks for a project, keep the one it suggests and tap Create key.' },
  { svg: AG_PARTS.copy('copied'), to: AG_PARTS.copyT, cap: 'Your key appears. It starts with AQ. Tap Copy.' },
  { svg: AG_PARTS.back, to: null, cap: 'Come back to Recurra.' },
  { svg: AG_PARTS.paste(true), to: AG_PARTS.pasteT, cap: 'Tap Paste, then Connect.' },
  { svg: AG_PARTS.done, to: null, cap: 'Done! Your free key is connected.' },
];
function agSteps() {
  const where = NATIVE ? 'your phone’s browser' : 'a new tab';
  return [
    { art: 'why', title: 'Get unlimited free uploads', text: `<p>Connect your own <b>free</b> Google AI key. It takes about <b>1 minute</b>.</p><ul class="ag-list"><li>✅ Free. No card, no payment.</li><li>✅ Use the Google account you already have.</li><li>✅ The key is saved only on this ${NATIVE ? 'phone' : 'device'}.</li></ul><p class="muted small">Not now? <b>Copy AI prompt</b> always works for free.</p>`, next: 'Start', video: true },
    { art: 'open', title: 'Step 1: Open Google AI Studio', text: `<p>Tap the button below. Google AI Studio opens in ${where}.</p><p>If it asks you to sign in, use your Google account (your Gmail).</p>`, open: true, next: 'I opened it' },
    { art: 'terms', title: 'Step 2: Agree (first time only)', text: `<p>If you see a welcome box with <b>Terms of Service</b>, tick the box and tap <b>Continue</b>.</p><p class="muted small">Didn’t see this? That’s fine, go to the next step.</p>`, next: 'Next' },
    { art: 'keys', title: 'Step 3: Find or create your key', text: `<p>You should now be on the <b>API keys</b> page. If not, tap <b>Get API key</b> in the menu (tap ☰ on a phone).</p><p><b>Already see a key in the list?</b> Google made one for you. Tap it to open it and go to Step 5.</p><p>No key yet? Tap the blue <b>Create API key</b> button.</p>`, open: true, openLabel: 'Open the API keys page', next: 'Next' },
    { art: 'project', title: 'Step 4: Pick a project (if asked)', text: `<p>If a box asks you to <b>choose a project</b>, keep the one it suggests (like <b>Default Gemini Project</b>). If the list is empty, choose <b>Create a new project</b>.</p><p>Then tap <b>Create key</b>.</p>`, next: 'Next' },
    { art: 'copy', title: 'Step 5: Copy the key', text: `<p>Your key appears: a long code that starts with <b>AQ.</b> (older keys start with <b>AIza</b>). Tap <b>Copy</b> or the copy icon ⧉.</p><p class="muted small">Copy it now: Google may show it hidden with dots later. It is like a password for your free AI, so don’t share it.</p>`, next: 'I copied it' },
    { art: 'back', title: 'Step 6: Come back here', text: NATIVE ? `<p>Come back to <b>Recurra</b>: tap your phone’s <b>back</b> button, or switch apps.</p>` : `<p>Come back to this <b>Recurra</b> tab.</p>`, next: 'I’m back' },
    { title: 'Step 7: Paste your key', paste: true },
    { art: 'done', title: 'Connected!', text: `<p>Your free key works. You can now upload PDFs and photos as much as you like.</p><p class="muted small">Google gives a free daily limit, which is plenty for studying. If you ever reach it, it resets the next day, and Copy AI prompt still works.</p>`, finish: true },
  ];
}
// ---- the walkthrough player (about 40 seconds, plays once; pause, replay, close) ----
const AGV = { i: 0, timer: null, t0: 0, left: 0, paused: false, back: 0 };
function agVideo(from) {
  AGV.back = from; AGV.i = 0; AGV.paused = false;
  const sheet = $('aiGuide');
  sheet.innerHTML = `<div class="card sheet-card ag-card ag-vcard">
      <div class="ag-top"><strong>How to get your free key</strong><button class="x" type="button" id="agvClose" aria-label="Close">×</button></div>
      <div class="ag-screen" id="agvScreen"></div>
      <div class="ag-bars" aria-hidden="true">${AG_SCENES.map((_, i) => `<i data-i="${i}"><b></b></i>`).join('')}</div>
      <p class="ag-cap" id="agvCap" aria-live="polite"></p>
      <div class="btns grid"><button class="btn" type="button" id="agvPause">Pause</button><button class="btn primary" type="button" id="agvDone">Show the steps</button></div>
      <p class="muted small">Simplified drawings: Google’s real page may look a little different.</p>
    </div>`;
  const stop = () => { clearTimeout(AGV.timer); AGV.timer = null; };
  $('agvClose').onclick = $('agvDone').onclick = () => { stop(); aiGuide(AGV.back); };
  $('agvPause').onclick = () => {
    const scr = $('agvScreen');
    if (AGV.i >= AG_SCENES.length) { AGV.i = 0; return agScene(); }          // Replay
    AGV.paused = !AGV.paused; scr.classList.toggle('paused', AGV.paused);
    document.querySelectorAll('.ag-bars i.on b').forEach(b => { b.style.animationPlayState = AGV.paused ? 'paused' : 'running'; });
    $('agvPause').textContent = AGV.paused ? 'Play' : 'Pause';
    if (AGV.paused) { stop(); AGV.left -= Date.now() - AGV.t0; } else { AGV.t0 = Date.now(); AGV.timer = setTimeout(agNext, AGV.left); }
  };
  agScene();
}
function agScene() {
  const sc = AG_SCENES[AGV.i], dur = sc.dur || 4500, scr = $('agvScreen'); if (!scr) return;
  const cur = sc.to ? `<g class="ag-cur" style="--tx:${sc.to[0]}px;--ty:${sc.to[1]}px;animation-duration:${dur}ms"><circle r="7" class="ag-tap" style="animation-duration:${dur}ms"/><text x="-4" y="22" class="ag-finger">👆</text></g>` : '';
  scr.innerHTML = agSvg(sc.svg + cur, ' ag-play');
  scr.style.setProperty('--d', dur + 'ms'); scr.classList.remove('paused');
  $('agvCap').textContent = `${AGV.i + 1}. ${sc.cap}`;
  document.querySelectorAll('.ag-bars i').forEach((b, k) => { b.className = k < AGV.i ? 'done' : k === AGV.i ? 'on' : ''; const bb = b.firstChild; bb.style.animationDuration = dur + 'ms'; bb.style.animationPlayState = 'running'; });
  $('agvPause').textContent = 'Pause'; AGV.paused = false;
  AGV.left = dur; AGV.t0 = Date.now(); clearTimeout(AGV.timer); AGV.timer = setTimeout(agNext, dur);
}
function agNext() {
  AGV.i++;
  if (AGV.i < AG_SCENES.length) return agScene();
  AGV.timer = null; const p = $('agvPause'); if (p) p.textContent = 'Replay';
  document.querySelectorAll('.ag-bars i').forEach(b => { b.className = 'done'; });
}
const looksLikeKey = k => /^(AQ\.|AIza)[A-Za-z0-9_.\-]{20,}$/.test(k);
function aiGuide(step) {
  clearTimeout(AGV.timer); AGV.timer = null;
  AI.step = step; const S = agSteps(), s = S[step], sheet = $('aiGuide');
  document.body.classList.add('sheet-open'); sheet.hidden = false;
  const dots = S.map((_, i) => `<i class="${i === step ? 'on' : i < step ? 'done' : ''}"></i>`).join('');
  let main;
  if (s.paste) {
    main = `<p>Tap <b>Paste</b> to put your key in the box, then tap <b>Connect</b>.</p>
      <div class="ag-paste"><input id="agKey" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="AQ.…" aria-label="Your Google AI key"><button class="btn" type="button" id="agPaste">Paste</button></div>
      <p class="ag-msg" id="agMsg" role="alert"></p>
      <p class="muted small">If Paste does not work: press and hold inside the box, then tap <b>Paste</b>.</p>`;
  } else main = s.text;
  sheet.innerHTML = `<div class="card sheet-card ag-card">
      <div class="ag-top"><div class="ag-dots" aria-hidden="true">${dots}</div><button class="x" type="button" id="agClose" aria-label="Close">×</button></div>
      ${s.art ? AG_ART[s.art] : ''}
      <h2>${esc(s.title)}</h2>
      <div class="ag-text">${main}</div>
      ${s.video ? '<button class="btn ag-watch" type="button" id="agWatch"><span>▶</span> Watch how (40 seconds)</button>' : ''}
      ${s.open ? `<a class="btn ag-open${step === 1 ? ' primary' : ''}" id="agOpen" href="${AI_STUDIO}" target="_blank" rel="noopener noreferrer">${esc(s.openLabel || 'Open Google AI Studio')} ↗</a>` : ''}
      <div class="btns grid">${step > 0 && !s.finish ? '<button class="btn" type="button" id="agBack">Back</button>' : '<span></span>'}
        ${s.paste ? '<button class="btn primary" type="button" id="agConnect">Connect</button>' : `<button class="btn ${s.open && step === 1 ? '' : 'primary'}" type="button" id="agNext">${esc(s.finish ? 'Start uploading' : s.next)}</button>`}</div>
      ${!s.video && !s.finish ? '<button class="linkbtn ag-rewatch" type="button" id="agWatch">▶ Watch how</button>' : ''}
    </div>`;
  const close = () => { sheet.hidden = true; document.body.classList.remove('sheet-open'); aiRender(); };
  $('agClose').onclick = close;
  sheet.onclick = e => { if (e.target === sheet) { clearTimeout(AGV.timer); close(); } };
  if ($('agWatch')) $('agWatch').onclick = () => agVideo(step);
  if ($('agBack')) $('agBack').onclick = () => aiGuide(step - 1);
  if ($('agNext')) $('agNext').onclick = () => s.finish ? close() : aiGuide(step + 1);
  if (s.paste) {
    const inp = $('agKey'), m = t => { $('agMsg').textContent = t || ''; $('agMsg').className = 'ag-msg' + (t ? ' err' : ''); };
    inp.focus();
    $('agPaste').onclick = async () => { try { const t = await navigator.clipboard.readText(); inp.value = (t || '').trim(); m(''); } catch (e) { m('Could not paste automatically. Press and hold inside the box, then tap Paste.'); inp.focus(); } };
    $('agConnect').onclick = async () => {
      const key = inp.value.trim().replace(/\s+/g, ''); const b = $('agConnect');
      if (!key) return m('The box is empty. Tap Paste first.');
      b.disabled = true; b.textContent = 'Checking…'; m('');
      const t = await aiTestKey(key);
      if (!t.ok) { b.disabled = false; b.textContent = 'Try again'; return m(t.error); }
      aiStore.set('rc-gkey', key); aiStore.set('rc-gmodel', t.model); AI.err = '';
      Activity.log('ai_key_connected', { model: t.model });
      Sound.play('done');
      aiGuide(step + 1);
    };
  }
}
