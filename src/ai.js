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
  if (/API[_ ]KEY[_ ]INVALID|API key not valid|API key expired/i.test(t)) return own ? 'Google says this key is not valid. Copy it again from Google AI Studio (it starts with AIza), or connect it again.' : 'The free uploads are not working right now.';
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
  if (!/^AIza[0-9A-Za-z_-]{30,}$/.test(key)) return { error: 'This does not look like a key. It is a long code that starts with AIza. Copy it again.' };
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
const AG = {   // little drawings of what Google's page looks like (simplified)
  frame: inner => `<svg viewBox="0 0 240 150" class="ag-art" aria-hidden="true"><rect x="6" y="6" width="228" height="138" rx="12" class="ag-win"/><rect x="6" y="6" width="228" height="22" rx="12" class="ag-bar"/><rect x="6" y="18" width="228" height="10" class="ag-bar"/>
    <circle cx="20" cy="17" r="3" class="ag-dot"/><circle cx="30" cy="17" r="3" class="ag-dot"/><rect x="44" y="11" width="150" height="12" rx="6" class="ag-url"/><text x="52" y="20.5" class="ag-urlt">aistudio.google.com</text>${inner}</svg>`,
  ring: (x, y, w, h) => `<rect x="${x - 5}" y="${y - 5}" width="${w + 10}" height="${h + 10}" rx="${(h + 10) / 2}" class="ag-ring"/>`,
  hand: (x, y) => `<text x="${x}" y="${y}" class="ag-hand">👆</text>`,
};
const AG_ART = {
  why: `<svg viewBox="0 0 240 150" class="ag-art" aria-hidden="true"><circle cx="120" cy="72" r="54" class="ag-glow"/><text x="120" y="92" text-anchor="middle" class="ag-big">🔑</text><text x="176" y="52" class="ag-mid">✨</text><text x="52" y="118" class="ag-mid">📄</text></svg>`,
  open: AG.frame(`<text x="120" y="70" text-anchor="middle" class="ag-h">Google AI Studio</text><rect x="70" y="86" width="100" height="22" rx="11" class="ag-btn"/><text x="120" y="101" text-anchor="middle" class="ag-btnt">Sign in</text>`),
  terms: AG.frame(`<rect x="40" y="40" width="160" height="92" rx="10" class="ag-dlg"/><text x="54" y="60" class="ag-t">Welcome to AI Studio</text><rect x="54" y="72" width="12" height="12" rx="3" class="ag-check"/><path d="M57 78l3 3 5-6" class="ag-tick"/><text x="72" y="82" class="ag-s">I accept the terms</text>
    <rect x="126" y="100" width="62" height="20" rx="10" class="ag-btn"/><text x="157" y="114" text-anchor="middle" class="ag-btnt">Continue</text>${AG.ring(126, 100, 62, 20)}${AG.hand(170, 140)}`),
  create: AG.frame(`<text x="24" y="50" class="ag-h">API keys</text><rect x="24" y="60" width="192" height="8" rx="4" class="ag-line"/><rect x="24" y="74" width="140" height="8" rx="4" class="ag-line"/>
    <rect x="130" y="96" width="86" height="24" rx="12" class="ag-btn"/><text x="173" y="112" text-anchor="middle" class="ag-btnt">Create API key</text>${AG.ring(130, 96, 86, 24)}${AG.hand(186, 144)}`),
  copy: AG.frame(`<rect x="30" y="40" width="180" height="92" rx="10" class="ag-dlg"/><text x="44" y="60" class="ag-t">API key created</text><rect x="44" y="72" width="152" height="20" rx="6" class="ag-key"/><text x="52" y="86" class="ag-mono">AIzaSyB•••••••••••••••</text>
    <rect x="146" y="102" width="50" height="20" rx="10" class="ag-btn"/><text x="171" y="116" text-anchor="middle" class="ag-btnt">Copy</text>${AG.ring(146, 102, 50, 20)}${AG.hand(176, 144)}`),
  back: `<svg viewBox="0 0 240 150" class="ag-art" aria-hidden="true"><rect x="28" y="24" width="72" height="110" rx="12" class="ag-win"/><text x="64" y="84" text-anchor="middle" class="ag-mid">🌐</text>
    <path d="M110 79h28" class="ag-arrow"/><path d="M132 72l8 7-8 7" class="ag-arrow"/><rect x="146" y="24" width="72" height="110" rx="12" class="ag-app"/><text x="182" y="86" text-anchor="middle" class="ag-mid">📚</text><text x="182" y="120" text-anchor="middle" class="ag-s">Recurra</text></svg>`,
  done: `<svg viewBox="0 0 240 150" class="ag-art" aria-hidden="true"><circle cx="120" cy="74" r="50" class="ag-okc"/><path d="M96 75l16 16 32-34" class="ag-ok"/></svg>`,
};
function agSteps() {
  const where = NATIVE ? 'your phone’s browser' : 'a new tab';
  return [
    { art: 'why', title: 'Get unlimited free uploads', text: `<p>Connect your own <b>free</b> Google AI key. It takes about <b>1 minute</b>.</p><ul class="ag-list"><li>✅ Free. No card, no payment.</li><li>✅ Use the Google account you already have.</li><li>✅ The key is saved only on this ${NATIVE ? 'phone' : 'device'}.</li></ul><p class="muted small">Not now? <b>Copy AI prompt</b> always works for free.</p>`, next: 'Start' },
    { art: 'open', title: 'Step 1: Open Google AI Studio', text: `<p>Tap the button below. Google AI Studio opens in ${where}.</p><p>If it asks you to sign in, use your Google account (the same Gmail is fine).</p>`, open: true, next: 'I opened it' },
    { art: 'terms', title: 'Step 2: Accept (first time only)', text: `<p>If you see a welcome box with terms, <b>tick the box</b> and tap <b>Continue</b>.</p><p class="muted small">Didn’t see this? That’s fine, go to the next step.</p>`, next: 'Next' },
    { art: 'create', title: 'Step 3: Create your key', text: `<p>Tap the blue <b>Create API key</b> button.</p><p>If it asks you to pick a project, choose the one it suggests and tap <b>Create</b> again.</p><p class="muted small">Can’t find the button? Look for <b>Get API key</b> in the menu on the left (tap ☰ on a phone).</p>`, open: true, openLabel: 'Open AI Studio again', next: 'Next' },
    { art: 'copy', title: 'Step 4: Copy the key', text: `<p>A long code starting with <b>AIza…</b> appears. Tap <b>Copy</b> next to it.</p><p class="muted small">It is like a password for your free AI. Don’t share it with anyone.</p>`, next: 'I copied it' },
    { art: 'back', title: 'Step 5: Come back here', text: NATIVE ? `<p>Come back to <b>Recurra</b>: tap your phone’s <b>back</b> button, or switch apps.</p>` : `<p>Come back to this <b>Recurra</b> tab.</p>`, next: 'I’m back' },
    { title: 'Step 6: Paste your key', paste: true },
    { art: 'done', title: 'Connected!', text: `<p>Your free key works. You can now upload PDFs and photos as much as you like.</p><p class="muted small">Google gives a free daily limit, which is plenty for studying. If you ever reach it, it resets the next day, and Copy AI prompt still works.</p>`, finish: true },
  ];
}
function aiGuide(step) {
  AI.step = step; const S = agSteps(), s = S[step], sheet = $('aiGuide');
  document.body.classList.add('sheet-open'); sheet.hidden = false;
  const dots = S.map((_, i) => `<i class="${i === step ? 'on' : i < step ? 'done' : ''}"></i>`).join('');
  let main;
  if (s.paste) {
    main = `<p>Tap <b>Paste</b> to put your key in the box, then tap <b>Connect</b>.</p>
      <div class="ag-paste"><input id="agKey" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="AIza…" aria-label="Your Google AI key"><button class="btn" type="button" id="agPaste">Paste</button></div>
      <p class="ag-msg" id="agMsg" role="alert"></p>
      <p class="muted small">If Paste does not work: press and hold inside the box, then tap <b>Paste</b>.</p>`;
  } else main = s.text;
  sheet.innerHTML = `<div class="card sheet-card ag-card">
      <div class="ag-top"><div class="ag-dots" aria-hidden="true">${dots}</div><button class="x" type="button" id="agClose" aria-label="Close">×</button></div>
      ${s.art ? AG_ART[s.art] : ''}
      <h2>${esc(s.title)}</h2>
      <div class="ag-text">${main}</div>
      ${s.open ? `<a class="btn ag-open${step === 1 ? " primary" : ""}" id="agOpen" href="${AI_STUDIO}" target="_blank" rel="noopener noreferrer">${esc(s.openLabel || 'Open Google AI Studio')} ↗</a>` : ''}
      <div class="btns grid">${step > 0 && !s.finish ? '<button class="btn" type="button" id="agBack">Back</button>' : '<span></span>'}
        ${s.paste ? '<button class="btn primary" type="button" id="agConnect">Connect</button>' : `<button class="btn ${s.open && step === 1 ? '' : 'primary'}" type="button" id="agNext">${esc(s.finish ? 'Start uploading' : s.next)}</button>`}</div>
    </div>`;
  const close = () => { sheet.hidden = true; document.body.classList.remove('sheet-open'); aiRender(); };
  $('agClose').onclick = close;
  sheet.onclick = e => { if (e.target === sheet) close(); };
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
