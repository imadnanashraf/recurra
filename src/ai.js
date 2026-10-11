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

// ---- generate (with live status) ----
// One request, sent with XMLHttpRequest so we can show the real upload %, and answered as a
// stream so we can count the questions while Google writes them.
function aiPost(url, headers, body, onUp, onText) {
  return new Promise((ok, no) => {
    const x = new XMLHttpRequest(); AI.xhr = x;
    x.open('POST', url); Object.entries(headers).forEach(([k, v]) => x.setRequestHeader(k, v));
    x.timeout = 300e3;
    if (x.upload) x.upload.onprogress = e => { if (e.lengthComputable) onUp(e.loaded / e.total); };
    x.onprogress = () => onText(x.responseText || '');
    x.onload = () => ok({ status: x.status, text: x.responseText || '', header: n => x.getResponseHeader(n) });
    x.onerror = x.ontimeout = () => ok({ status: 0, text: '', header: () => null });
    x.onabort = () => no(Object.assign(new Error('stopped'), { name: 'AbortError' }));
    x.send(body);
  });
}
// the text Google has written so far (from the "data: {...}" lines of the stream)
function sseText(raw) {
  let text = '', finish = '', block = '';
  for (const line of raw.split('\n')) {
    if (!line.startsWith('data:')) continue;
    try {
      const j = JSON.parse(line.slice(5));
      const c = (j.candidates || [])[0];
      if (c && c.content) text += (c.content.parts || []).map(p => p.text || '').join('');
      if (c && c.finishReason) finish = c.finishReason;
      if (j.promptFeedback && j.promptFeedback.blockReason) block = j.promptFeedback.blockReason;
    } catch (e) { /* a line still arriving */ }
  }
  return { text, finish, block };
}
const countItems = (t, kind) => (t.match(kind === 'mcq' ? /"question"\s*:/g : kind === 'notes' ? /"title"\s*:/g : /"name"\s*:/g) || []).length;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function aiGenerate() {
  const mode = aiMode(); if (!AI.files.length || AI.busy) return;
  const total = AI.files.reduce((n, f) => n + f.size, 0);
  const pdfBytes = AI.files.filter(f => !/^image\//.test(f.type)).reduce((n, f) => n + f.size, 0);
  if (pdfBytes > AI_MAX) { AI.err = `This is ${fmtSize(pdfBytes)}. One upload can be up to ${fmtSize(AI_MAX)}. Split the PDF into chapters, or use Copy AI prompt (ChatGPT and Gemini accept bigger files).`; return aiRender(); }
  if (mode === 'none') return aiGuide(0);
  const names = AI.files.map(f => f.name).join(', '), kind = App.imp.kind, via = mode === 'own' ? 'own key' : 'free trial';
  const sub = App.subjects.find(s => s.code === App.imp.subject);
  AI.busy = true; AI.err = ''; AI.retry = false; AI.stopped = false;
  AI.st = { stage: 'prep', i: 0, n: AI.files.length, up: 0, count: 0, attempt: 1, wait: 0, t0: Date.now(), tWrite: 0, kind };
  aiRender(); clearInterval(AI.tick); AI.tick = setInterval(aiPaintStatus, 1000);
  const fail = (msg, retry) => {
    clearInterval(AI.tick); AI.busy = false; AI.xhr = null; AI.err = msg; AI.retry = !!retry;
    Activity.log('ai_upload_failed', { files: names, why: msg.split('.')[0], via });
    aiRender();
  };
  // 1. prepare
  const parts = [];
  try {
    for (let i = 0; i < AI.files.length; i++) { AI.st.i = i + 1; aiPaintStatus(); parts.push(await filePart(AI.files[i])); if (AI.stopped) return fail('Stopped. Nothing was added.', true); }
  } catch (e) { return fail('Could not open this file on your device. Try choosing it again.', true); }
  parts.push({ text: aiPrompt() });
  const body = JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', temperature: 0.4 } });
  // 2–3. send, then Google writes (up to 3 tries when Google is busy or the line breaks)
  let res = null, out = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    Object.assign(AI.st, { stage: 'send', up: 0, count: 0, attempt, wait: 0, tWrite: 0 }); aiPaintStatus();
    try {
      const onUp = f => { AI.st.up = f; if (f >= 0.999 && AI.st.stage === 'send') { AI.st.stage = 'write'; AI.st.tWrite = Date.now(); } aiPaintStatus(); };
      const onText = raw => { if (AI.st.stage !== 'write') { AI.st.stage = 'write'; AI.st.tWrite = AI.st.tWrite || Date.now(); } AI.st.count = countItems(sseText(raw).text, kind); aiPaintStatus(); };
      if (mode === 'own') res = await aiPost(`${GEM}/models/${encodeURIComponent(aiModel())}:streamGenerateContent?alt=sse`, { 'x-goog-api-key': aiKey(), 'content-type': 'application/json' }, body, onUp, onText);
      else {
        const token = await App.fb.auth.currentUser.getIdToken();
        res = await aiPost(AI.trialUrl.replace(/\/+$/, '') + '/ai?stream=1', { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body, onUp, onText);
      }
    } catch (e) { return fail('Stopped. Nothing was added. Your file is still here: tap Try again when you’re ready.', true); }
    if (res.status === 200) {
      if (mode === 'trial') { const u = Number(res.header('x-trial-used')); AI.used = isFinite(u) && u > 0 ? u : AI.used + 1; }
      out = sseText(res.text);
      if (out.text.trim()) break;
      if (out.block || /SAFETY|RECITATION|PROHIBITED/.test(out.finish)) return fail('Google would not read this file. Try a different page or photo.', false);
      if (attempt < 3) { await aiWait(attempt); if (AI.stopped) return fail('Stopped. Nothing was added.', true); continue; }
      return fail('Google did not give anything back for this file. Try a clearer photo or fewer pages.', true);
    }
    const busy = res.status === 0 || res.status >= 500;
    if (busy && attempt < 3) { await aiWait(attempt); if (AI.stopped) return fail('Stopped. Nothing was added.', true); continue; }
    if (mode === 'trial' && res.status === 402) AI.used = AI.FREE;
    return fail(aiError(res.status, res.text, mode === 'own'), busy || res.status === 400);
  }
  // 4. check it, like a paste
  AI.st.stage = 'check'; aiPaintStatus();
  $('impText').value = out.text.trim();
  doCheck();
  const ch = App.imp.checked;
  clearInterval(AI.tick);
  if (!ch) {
    const cut = /MAX_TOKENS/.test(out.finish);
    AI.busy = false; AI.xhr = null;
    AI.err = cut ? 'Google’s answer was too long and got cut off. Try fewer pages (for example 1-10), then Try again.' : 'Google’s answer could not be read, so nothing was added. Tap Try again: it usually works the second time.';
    AI.retry = true; msg('impMsg', '');
    Activity.log('ai_upload', { files: names, size: fmtSize(total), pages: AI.pages.trim(), kind, subject: sub ? sub.name : '', via, result: 'nothing usable' });
    return aiRender();
  }
  const secs = Math.round((Date.now() - AI.st.t0) / 1000);
  Activity.log('ai_upload', { files: names, size: fmtSize(total), pages: AI.pages.trim(), kind, subject: sub ? sub.name : '', via,
    result: kind === 'mcq' ? plural(countItems(out.text, kind), 'MCQ') : kind === 'notes' ? plural(countItems(out.text, kind), 'note') : 'a syllabus' });
  AI.busy = false; AI.xhr = null; AI.files = []; AI.pages = '';          // done: forget the file
  const made = countItems(out.text, kind);
  AI.done = { what: kind === 'mcq' ? plural(made, 'question') : kind === 'notes' ? plural(made, 'note') : 'your syllabus', secs };
  Sound.play('check');
  aiRender();
  const pv = $('impPreview'); if (pv && !pv.hidden) pv.scrollIntoView({ behavior: 'smooth', block: 'start' });
  else $('impPaste').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
// Google is busy: wait a little, showing the countdown, then try again
async function aiWait(attempt) {
  const secs = attempt === 1 ? 4 : 8;
  for (let s = secs; s > 0 && !AI.stopped; s--) { AI.st.stage = 'wait'; AI.st.wait = s; aiPaintStatus(); await sleep(1000); }
}
function aiStop() { AI.stopped = true; if (AI.xhr) try { AI.xhr.abort(); } catch (e) {} }
// the live status inside the card: one short line + a slim bar (4 parts: prepare, send, write, check)
function aiPaintStatus() {
  const box = $('aiSteps'), st = AI.st; if (!box || !st) return;
  const order = ['prep', 'send', 'write', 'check'], at = st.stage === 'wait' ? 1 : order.indexOf(st.stage);
  const word = st.kind === 'mcq' ? 'question' : st.kind === 'notes' ? 'note' : 'subject';
  const long = (Date.now() - (st.tWrite || Date.now())) > 25e3;
  const line = {
    prep: st.n > 1 ? `Preparing file ${Math.min(st.i, st.n)} of ${st.n}…` : 'Preparing your file…',
    send: `Sending… ${Math.round(st.up * 100)}%`,
    wait: `Google is busy, retrying in ${st.wait}s…`,
    write: st.count ? `Writing… ${plural(st.count, word)} so far` : long ? 'Reading your file (long files take longer)…' : 'Google is reading your file…',
    check: 'Almost done…',
  }[st.stage];
  const fill = k => k < at ? 1 : k > at ? 0 : st.stage === 'send' ? st.up : st.stage === 'prep' ? (st.n ? (st.i - 1) / st.n : 0) : .5;
  box.innerHTML = `<p class="ai-line${st.stage === 'wait' ? ' warn' : ''}"><span class="ai-spin" aria-hidden="true"></span>${esc(line)}</p>
    <div class="ai-seg" aria-hidden="true">${order.map((_, k) => `<i><i style="width:${Math.round(fill(k) * 100)}%"></i></i>`).join('')}</div>`;
  const c = $('aiClock'); if (c) c.textContent = fmtDur2(Math.round((Date.now() - st.t0) / 1000));
}
const fmtDur2 = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

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
      <div class="ai-live" id="aiSteps" aria-live="polite"></div>
      <div class="ai-livefoot"><span class="ai-clock" id="aiClock">0:00</span><span>Keep this screen open</span><button class="btn small" type="button" id="aiStop">Stop</button></div>`;
    $('aiStop').onclick = aiStop;
    aiPaintStatus();
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
       ${AI.err && AI.retry && AI.files.length ? '' : `<div class="btns"><button class="btn primary" type="button" id="aiGo"${AI.files.length ? '' : ' disabled'}>${make}</button></div>`}`;
  const foot = mode === 'own' ? `<div class="ai-foot"><button class="linkbtn" type="button" id="aiManage">Change or remove my key</button></div>`
    : mode === 'trial' ? `<div class="ai-foot"><button class="linkbtn" type="button" id="aiConnect2">Connect my own free key</button> for unlimited uploads</div>` : '';
  box.innerHTML = `<div class="ai-head"><span class="ai-ic">📄</span><div><strong>Upload a PDF or photo</strong>${status}</div></div>
    ${body}
    ${AI.done && !AI.err ? `<div class="ai-done" role="status">✓ Made ${esc(AI.done.what)} in ${fmtDur2(AI.done.secs)}. Check them below, then tap <b>Add</b>.</div>` : ''}
    ${AI.err ? `<div class="ai-err" role="alert"><p>${esc(AI.err)}</p><div class="btns">${AI.retry && AI.files.length && mode !== 'none' ? '<button class="btn small primary" type="button" id="aiRetry">Try again</button><button class="btn small" type="button" id="aiOther">Choose other files</button>' : ''}<button class="btn small" type="button" id="aiUseCopy">Use Copy AI prompt instead</button>${/key|used up|limit/.test(AI.err) && mode !== 'own' ? '<button class="btn small" type="button" id="aiConnect3">Connect my free key</button>' : ''}</div></div>` : ''}
    ${foot}
    <div class="ai-pro"><span>⭐</span><div><b>Pro: one tap, no setup</b><small>${AI.interest ? 'Thanks! We’ll tell you when it’s ready.' : 'Coming soon'}</small></div>${AI.interest ? '<span class="badge">✓ On the list</span>' : '<button class="btn small" type="button" id="aiNotify">Notify me</button>'}</div>`;
  const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
  on('aiConnect', () => aiGuide(0)); on('aiConnect2', () => aiGuide(0)); on('aiConnect3', () => aiGuide(0));
  on('aiGo', () => { AI.done = null; aiGenerate(); });
  on('aiRetry', () => { AI.done = null; aiGenerate(); });
  on('aiOther', () => { AI.files = []; AI.err = ''; AI.retry = false; aiRender(); const f = $('aiFile'); if (f) f.click(); });
  on('aiManage', aiManage);
  on('aiNotify', aiNotify);
  on('aiUseCopy', () => { const h = $('impHelp'); h.scrollIntoView({ behavior: 'smooth', block: 'start' }); h.classList.remove('hl'); void h.offsetWidth; h.classList.add('hl'); });
  const inp = $('aiFile');
  if (inp) inp.onchange = () => { AI.files.push(...[...inp.files].slice(0, 12)); AI.files = AI.files.slice(0, 12); AI.err = ''; AI.done = null; inp.value = ''; aiRender(); };
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
  { svg: AG_PARTS.terms('ticked'), to: AG_PARTS.termsT2, cap: 'First time only: tick the box and tap Continue.' },
  { svg: AG_PARTS.keys, to: AG_PARTS.keysT, cap: 'Tap Create API key. Already see a key in the list? Google made one for you: just open it.', dur: 5500 },
  { svg: AG_PARTS.project, to: AG_PARTS.projectT, cap: 'If it asks for a project, keep the suggested one and tap Create key.' },
  { svg: AG_PARTS.copy('copied'), to: AG_PARTS.copyT, cap: 'Your key appears (it starts with AQ.). Tap Copy.' },
  { svg: AG_PARTS.back, to: null, cap: 'Come back to Recurra.', dur: 3000 },
  { svg: AG_PARTS.paste(true), to: AG_PARTS.pasteT, cap: 'Tap Paste, then Connect. Done!' },
];
// ---- screen 1: the walkthrough (plays by itself; ‹ › to move, pause) ----
const AGV = { i: 0, timer: null, t0: 0, left: 0, paused: false };
function agScene() {
  const sc = AG_SCENES[AGV.i], dur = sc.dur || 4200, scr = $('agvScreen'); if (!scr) return;
  const cur = sc.to ? `<g class="ag-cur" style="--tx:${sc.to[0]}px;--ty:${sc.to[1]}px;animation-duration:${dur}ms"><circle r="7" class="ag-tap" style="animation-duration:${dur}ms"/><text x="-4" y="22" class="ag-finger">👆</text></g>` : '';
  scr.innerHTML = agSvg(sc.svg + cur, ' ag-play');
  scr.style.setProperty('--d', dur + 'ms'); scr.classList.remove('paused');
  $('agvCap').textContent = sc.cap;
  $('agvNum').textContent = `${AGV.i + 1} / ${AG_SCENES.length}`;
  document.querySelectorAll('.ag-bars i').forEach((b, k) => { b.className = k < AGV.i ? 'done' : k === AGV.i ? 'on' : ''; const bb = b.firstChild; bb.style.animationDuration = dur + 'ms'; bb.style.animationPlayState = 'running'; });
  $('agvPrev').disabled = AGV.i === 0;
  AGV.paused = false; agPlayIcon();
  AGV.left = dur; AGV.t0 = Date.now(); clearTimeout(AGV.timer); AGV.timer = setTimeout(agNext, dur);
}
function agNext() {
  if (AGV.i < AG_SCENES.length - 1) { AGV.i++; return agScene(); }
  clearTimeout(AGV.timer); AGV.timer = null; AGV.paused = true; agPlayIcon(true);   // finished: stays on the last slide
  document.querySelectorAll('.ag-bars i').forEach(b => { b.className = 'done'; });
}
function agPlayIcon(ended) {
  const b = $('agvPlay'); if (!b) return;
  b.textContent = ended ? '↻' : AGV.paused ? '▶' : '❚❚';
  b.setAttribute('aria-label', ended ? 'Play again' : AGV.paused ? 'Play' : 'Pause');
}
function agToggle() {
  if (!AGV.timer && AGV.paused && $('agvPlay').textContent === '↻') { AGV.i = 0; return agScene(); }
  const scr = $('agvScreen');
  AGV.paused = !AGV.paused; scr.classList.toggle('paused', AGV.paused);
  document.querySelectorAll('.ag-bars i.on b').forEach(b => { b.style.animationPlayState = AGV.paused ? 'paused' : 'running'; });
  if (AGV.paused) { clearTimeout(AGV.timer); AGV.timer = null; AGV.left -= Date.now() - AGV.t0; } else { AGV.t0 = Date.now(); AGV.timer = setTimeout(agNext, Math.max(200, AGV.left)); }
  agPlayIcon();
}
const looksLikeKey = k => /^(AQ\.|AIza)[A-Za-z0-9_.\-]{20,}$/.test(k);
// the guide: 0 = watch how, 1 = connect (open AI Studio + paste), 2 = done
function aiGuide(step) {
  clearTimeout(AGV.timer); AGV.timer = null;
  AI.step = step; const sheet = $('aiGuide');
  document.body.classList.add('sheet-open'); sheet.hidden = false;
  const dots = [0, 1, 2].map(i => `<i class="${i === step ? 'on' : i < step ? 'done' : ''}"></i>`).join('');
  let body;
  if (step === 0) body = `
      <h2>Get your free Google AI key</h2>
      <p class="muted small ag-sub">Free, no card, about 1 minute. Here is how it looks:</p>
      <div class="ag-player">
        <div class="ag-screen" id="agvScreen"></div>
        <div class="ag-bars" aria-hidden="true">${AG_SCENES.map(() => '<i><b></b></i>').join('')}</div>
        <div class="ag-ctrl"><button class="ag-mini" type="button" id="agvPrev" aria-label="Previous">‹</button><button class="ag-mini" type="button" id="agvPlay" aria-label="Pause">❚❚</button><button class="ag-mini" type="button" id="agvNext" aria-label="Next">›</button><span class="ag-num" id="agvNum"></span></div>
        <p class="ag-cap" id="agvCap" aria-live="polite"></p>
      </div>
      <div class="btns grid"><button class="btn" type="button" id="agLater">Not now</button><button class="btn primary" type="button" id="agGo">Get my key</button></div>
      <p class="muted small">Simplified drawings: Google’s page may look a little different.</p>`;
  else if (step === 1) body = `
      <h2>Connect your key</h2>
      <ol class="ag-do">
        <li><span>1</span><div><p><b>Open Google AI Studio</b>, then create and copy your key (it starts with <b>AQ.</b>).</p>
          <a class="btn primary ag-open" id="agOpen" href="${AI_STUDIO}" target="_blank" rel="noopener noreferrer">Open Google AI Studio ↗</a></div></li>
        <li><span>2</span><div><p><b>Come back here and paste it</b></p>
          <div class="ag-paste"><input id="agKey" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="AQ.…" aria-label="Your Google AI key"><button class="btn" type="button" id="agPaste">Paste</button></div>
          <p class="ag-msg" id="agMsg" role="alert"></p>
          <p class="muted small">If Paste does not work: press and hold inside the box, then tap Paste.</p></div></li>
      </ol>
      <div class="btns grid"><button class="btn" type="button" id="agBack">‹ Watch again</button><button class="btn primary" type="button" id="agConnect">Connect</button></div>`;
  else body = `${AG_ART.done}<h2>Connected!</h2>
      <p>Your free key works. Upload PDFs and photos as much as you like.</p>
      <p class="muted small">Google gives a free daily limit, plenty for studying. If you ever reach it, it resets the next day, and Copy AI prompt still works.</p>
      <div class="btns grid"><span></span><button class="btn primary" type="button" id="agFinish">Start uploading</button></div>`;
  sheet.innerHTML = `<div class="card sheet-card ag-card">
      <div class="ag-top"><div class="ag-dots" aria-hidden="true">${dots}</div><button class="x" type="button" id="agClose" aria-label="Close">×</button></div>
      ${body}</div>`;
  const close = () => { clearTimeout(AGV.timer); AGV.timer = null; sheet.hidden = true; document.body.classList.remove('sheet-open'); aiRender(); };
  $('agClose').onclick = close;
  sheet.onclick = e => { if (e.target === sheet) close(); };
  if (step === 0) {
    $('agLater').onclick = close; $('agGo').onclick = () => aiGuide(1);
    $('agvPrev').onclick = () => { if (AGV.i > 0) { AGV.i--; agScene(); } };
    $('agvNext').onclick = () => { if (AGV.i < AG_SCENES.length - 1) { AGV.i++; agScene(); } else agNext(); };
    $('agvPlay').onclick = agToggle;
    AGV.i = 0; agScene();
  } else if (step === 1) {
    const inp = $('agKey'), m = t => { $('agMsg').textContent = t || ''; $('agMsg').className = 'ag-msg' + (t ? ' err' : ''); };
    $('agBack').onclick = () => aiGuide(0);
    $('agPaste').onclick = async () => { try { const t = await navigator.clipboard.readText(); inp.value = (t || '').trim(); m(''); } catch (e) { m('Could not paste automatically. Press and hold inside the box, then tap Paste.'); inp.focus(); } };
    $('agConnect').onclick = async () => {
      const key = inp.value.trim().replace(/\s+/g, ''); const b = $('agConnect');
      if (!key) return m('The box is empty. Copy your key in Google AI Studio, then tap Paste.');
      b.disabled = true; b.textContent = 'Checking…'; m('');
      const t = await aiTestKey(key);
      if (!t.ok) { b.disabled = false; b.textContent = 'Try again'; return m(t.error); }
      aiStore.set('rc-gkey', key); aiStore.set('rc-gmodel', t.model); AI.err = '';
      Activity.log('ai_key_connected', { model: t.model });
      Sound.play('done');
      aiGuide(2);
    };
  } else $('agFinish').onclick = close;
}
