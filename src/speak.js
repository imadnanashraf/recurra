/* =====================================================================
   READ ALOUD 🔊 — questions, the Question bank and revision notes.
   Three voices, best first:
   1. Natural voice: Google's AI voice with your own free Google AI key
      (sounds like a real person). Audio already made is kept on this
      device, so hearing a note again does not use your free limit.
      If the limit is reached, it carries on with the phone's voice.
   2. Android app: the phone's own text-to-speech (keeps reading when the
      screen locks).
   3. Website: the browser's voices; the most natural one is picked.
   Settings → Read aloud: voice, speed, natural voice on/off.
   ===================================================================== */
const Speak = { on: false, src: '', segs: [], i: 0, paused: false, gen: 0, native: null, audio: null, url: '', ttsModel: '', naturalOff: false, voicesNative: null };
const SPEAK_IC = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>';
const SPEAK_RATES = [0.75, 0.9, 1, 1.15, 1.3, 1.5];
const speakRate = () => { const r = Number(prefs().speakRate); return SPEAK_RATES.includes(r) ? r : 1; };
const speakNaturalOn = () => typeof aiMode === 'function' && aiMode() === 'own' && prefs().speakNatural !== false && !Speak.naturalOff;
function speakNative() {
  if (!NATIVE || !window.capacitorExports) return null;
  try { return Speak.native || (Speak.native = capacitorExports.registerPlugin('TextToSpeech')); } catch (e) { return null; }
}
const speakWeb = () => !NATIVE && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
const speakOK = () => NATIVE || speakWeb();
function speakBtnHTML(src, big) {
  if (!speakOK()) return '';
  return `<button type="button" class="${big ? 'btn ' : 'qtool '}qspeak" data-speak="${src}" aria-pressed="false" title="Read aloud">${SPEAK_IC}<span>Listen</span></button>`;
}

/* ---------- what is read: small parts, each tied to what it highlights ---------- */
const SPEAK_SAY = [[/×/g, ' times '], [/÷/g, ' divided by '], [/≈/g, ' about '], [/≠/g, ' is not equal to '], [/≤/g, ' is at most '], [/≥/g, ' is at least '], [/√/g, ' root '], [/π/g, ' pi '], [/→/g, ' to '], [/∴/g, ' therefore '], [/∵/g, ' because '], [/²/g, ' squared '], [/³/g, ' cubed '], [/°/g, ' degrees '], [/±/g, ' plus or minus '], [/µ|μ/g, 'micro'], [/\s+/g, ' ']];
const speakClean = t => SPEAK_SAY.reduce((s, [a, b]) => s.replace(a, b), String(t || '')).trim();
const sayText = el => (el ? el.innerText || el.textContent || '' : '').replace(/\s*\n\s*/g, '. ').replace(/\.\s*\./g, '.');
function speakParts(src) {
  const out = [], add = (el, text, brk) => { const t = speakClean(text); if (t) out.push({ el, text: t, brk: !!brk }); };
  const pairs = root => root && root.querySelectorAll(':scope dl > div').forEach(d => { const dt = d.querySelector('dt'), dd = d.querySelector('dd'); add(d, `${sayText(dt)}. ${sayText(dd)}`); });
  if (src === 'quiz') {
    add($('qText'), sayText($('qText')), true);
    if (!$('qOpts').hidden) $('qOpts').querySelectorAll('.opt').forEach(b => add(b, `${b.querySelector('.key').textContent}. ${sayText(b.querySelector('.key').nextElementSibling)}${b.classList.contains('right') ? '. This is the answer.' : ''}`));
    pairs($('qFeedback'));
  } else if (src === 'bank') {
    const c = $('bankReader').querySelector('.bq-card'); if (!c) return out;
    add(c.querySelector('h3'), sayText(c.querySelector('h3')), true);
    c.querySelectorAll('.bq-opts li').forEach((li, k) => add(li, `${'ABCDEFGH'[k]}. ${sayText(li.querySelector('span'))}${li.classList.contains('right') ? '. This is the answer.' : ''}`));
    pairs(c);
  } else if (src === 'note' || src === 'readall') {
    let notes = src === 'note' ? [...$('notesReader').querySelectorAll('.reader-note .note')] : [...$('notesList').querySelectorAll('.ra-main > .note')];
    if (src === 'readall') { const top = (document.querySelector('.topbar') || { offsetHeight: 60 }).offsetHeight; const k = notes.findIndex(n => n.getBoundingClientRect().bottom > top + 40); notes = notes.slice(Math.max(0, k)); }
    notes.forEach(n => { add(n.querySelector('h3'), sayText(n.querySelector('h3')), true); pairs(n); });
  }
  return out;
}

/* ---------- start, pause, next, stop ---------- */
function speakStart(src) {
  speakStop(true);
  const segs = speakParts(src); if (!segs.length) return;
  Object.assign(Speak, { on: true, src, segs, i: 0, paused: false, gen: Speak.gen + 1 });
  featUse('speak');
  speakBar(); speakPaintBtns();
  speakGo();
}
function speakStop(quiet) {
  Speak.gen++; Speak.on = false; Speak.paused = false;
  speakEngineStop();
  document.querySelectorAll('.speaking').forEach(e => e.classList.remove('speaking'));
  Speak.segs = [];
  if (!quiet) { speakBar(); speakPaintBtns(); }
  else { const b = $('speakBar'); if (b) b.hidden = true; speakPaintBtns(); }
}
function speakEngineStop() {
  try { if (speakWeb()) speechSynthesis.cancel(); } catch (e) {}
  const n = speakNative(); if (n) n.stop().catch(() => {});
  if (Speak.audio) { try { Speak.audio.pause(); } catch (e) {} Speak.audio.onended = null; Speak.audio = null; }
}
// pause: the natural voice pauses where it is; the phone's voice starts this part again on Play (some phones cannot pause mid-sentence)
function speakPause() {
  if (!Speak.on) return;
  Speak.paused = !Speak.paused;
  if (Speak.paused) { if (Speak.audio) Speak.audio.pause(); else { Speak.gen++; speakEngineStop(); } }
  else if (Speak.audio) Speak.audio.play().catch(() => {});
  else { Speak.gen++; speakGo(); }
  speakBar();
}
function speakSkip() { if (!Speak.on) return; const g = Speak.cur; Speak.gen++; speakEngineStop(); Speak.i = Math.min(Speak.segs.length, (g ? g.to : Speak.i + 1)); Speak.paused = false; speakGo(); }
function speakHi(from, to) {
  document.querySelectorAll('.speaking').forEach(e => e.classList.remove('speaking'));
  const els = Speak.segs.slice(from, to).map(s => s.el).filter(Boolean);
  els.forEach(e => e.classList.add('speaking'));
  const e = els[0];
  if (e) { const r = e.getBoundingClientRect(), bar = $('speakBar'), bottom = innerHeight - (bar && !bar.hidden ? bar.offsetHeight + 16 : 0); if (r.top < 70 || r.bottom > bottom) e.scrollIntoView({ block: 'center', behavior: mq('(prefers-reduced-motion: reduce)') ? 'auto' : 'smooth' }); }
  speakBar();
}
function speakDone() { Speak.on = false; document.querySelectorAll('.speaking').forEach(e => e.classList.remove('speaking')); speakBar(); speakPaintBtns(); }

// the next part (or group of parts for the natural voice)
async function speakGo() {
  const g = Speak.gen;
  if (!Speak.on || Speak.paused) return;
  if (Speak.i >= Speak.segs.length) return speakDone();
  if (speakNaturalOn()) {
    const from = Speak.i; let to = from + 1, len = Speak.segs[from].text.length;
    while (to < Speak.segs.length && !Speak.segs[to].brk && len + Speak.segs[to].text.length < 1400) len += Speak.segs[to++].text.length;
    Speak.cur = { from, to };
    speakHi(from, to);
    const text = Speak.segs.slice(from, to).map(s => s.text.replace(/[^.!?:]$/, '$&.')).join('\n');
    try {
      const url = await speakNaturalAudio(text);
      if (g !== Speak.gen) return;
      speakNaturalNext(to);                          // get the next part ready while this one plays
      const a = Speak.audio = new Audio(url); a.playbackRate = speakRate(); a.preservesPitch = true;
      a.onended = () => { if (g !== Speak.gen) return; Speak.audio = null; Speak.i = to; speakGo(); };
      a.onerror = () => { if (g !== Speak.gen) return; Speak.audio = null; Speak.naturalOff = true; speakGo(); };
      await a.play();
      return;
    } catch (e) {
      if (g !== Speak.gen) return;
      Speak.naturalOff = true;                       // for now: the phone's voice
      toast(e.status === 429 ? 'Today’s free natural-voice limit is used up. Reading with the phone’s voice.' : 'The natural voice is not available right now. Reading with the phone’s voice.');
      return speakGo();
    }
  }
  const n = NATIVE && speakNative();
  if (n) return speakNativeGo(n, g);
  if (!speakWeb()) { toast('Read aloud is not available in this browser.'); return speakStop(); }
  const seg = Speak.segs[Speak.i]; Speak.cur = { from: Speak.i, to: Speak.i + 1 };
  speakHi(Speak.i, Speak.i + 1);
  const u = new SpeechSynthesisUtterance(seg.text), v = speakWebVoice();
  if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-IN';
  u.rate = speakRate();
  u.onend = () => { if (g !== Speak.gen || Speak.paused) return; Speak.i++; speakGo(); };
  u.onerror = e => { if (g !== Speak.gen || e.error === 'interrupted' || e.error === 'canceled') return; Speak.i++; speakGo(); };
  speechSynthesis.speak(u);
}
// Android: every part goes into the phone's queue at once, so reading carries on with the screen locked
async function speakNativeGo(n, g) {
  const voice = await speakNativeVoice(n), start = Speak.i;
  try {
    const all = Speak.segs.slice(start).map((s, k) => n.speak({ text: s.text, lang: 'en-IN', rate: speakRate(), voice, queueStrategy: k ? 1 : 0, category: 'playback' }));
    speakHi(start, start + 1); Speak.cur = { from: start, to: start + 1 };
    for (let k = 0; k < all.length; k++) {
      await all[k];
      if (g !== Speak.gen) return;
      Speak.i = start + k + 1; Speak.cur = { from: Speak.i, to: Speak.i + 1 };
      if (Speak.i < Speak.segs.length) speakHi(Speak.i, Speak.i + 1);
    }
    if (g === Speak.gen) speakDone();
  } catch (e) {
    if (g !== Speak.gen) return;
    toast(/not implemented|not available/i.test(String(e && e.message)) ? 'Read aloud needs the newest Android app. Update it from Settings.' : 'The phone’s voice could not start. Check Settings → Text-to-speech on your phone.');
    speakStop();
  }
}

/* ---------- picking the most natural voice ---------- */
function speakVoiceScore(name, lang, local) {
  const n = String(name).toLowerCase(), l = String(lang).toLowerCase().replace('_', '-');
  if (!l.startsWith('en')) return -1;
  return (/natural|neural|wavenet|premium|enhanced/.test(n) ? 4 : 0) + (/network|online/.test(n) || local === false ? 1.5 : 0) + (/google/.test(n) ? 1 : 0) + (l === 'en-in' ? 1.2 : l === 'en-gb' || l === 'en-us' ? 0.8 : 0.3) + (/compact|espeak/.test(n) ? -3 : 0);
}
function speakWebVoices() { try { return speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang)); } catch (e) { return []; } }
function speakWebVoice() {
  const all = speakWebVoices(), want = prefs().speakVoice;
  return (want && all.find(v => v.voiceURI === want)) || all.map(v => [v, speakVoiceScore(v.name, v.lang, v.localService)]).sort((a, b) => b[1] - a[1]).map(x => x[0])[0] || null;
}
async function speakNativeVoices(n) {
  if (Speak.voicesNative) return Speak.voicesNative;
  try { Speak.voicesNative = ((await n.getSupportedVoices()) || {}).voices || []; } catch (e) { Speak.voicesNative = []; }
  return Speak.voicesNative;
}
async function speakNativeVoice(n) {
  const list = await speakNativeVoices(n), want = prefs().speakVoice;
  let k = want ? list.findIndex(v => v.voiceURI === want || v.name === want) : -1;
  if (k < 0) { let best = -1; list.forEach((v, i) => { const s = speakVoiceScore(v.name, v.lang, v.localService); if (s > best) { best = s; k = i; } }); }
  return k >= 0 ? k : undefined;
}
if (speakWeb()) { try { speechSynthesis.getVoices(); speechSynthesis.addEventListener('voiceschanged', () => { if (visible('settings')) speakSettingsPaint(); }); } catch (e) {} }

/* ---------- the natural voice (Google AI, your own key) ---------- */
const TTS_VOICE = 'Kore';
async function speakTtsModel() {
  if (Speak.ttsModel) return Speak.ttsModel;
  const saved = aiStore.get(aiSlot('rc-ttsmodel')).split('|');
  if (saved[0] && Date.now() - Number(saved[1] || 0) < 3 * 864e5) return (Speak.ttsModel = saved[0]);
  const r = await fetch(`${GEM}/models?pageSize=200`, { headers: { 'x-goog-api-key': aiKey() } });
  if (!r.ok) throw Object.assign(new Error('models'), { status: r.status });
  const names = (((await r.json()) || {}).models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => String(m.name).replace(/^models\//, '')).filter(n => /tts/i.test(n));
  const ver = n => Number((n.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || 0);
  const pick = names.sort((a, b) => (/flash/.test(b) - /flash/.test(a)) || ver(b) - ver(a) || (/preview/.test(a) - /preview/.test(b)))[0];
  if (!pick) throw Object.assign(new Error('no tts'), { status: 404 });
  aiStore.set(aiSlot('rc-ttsmodel'), `${pick}|${Date.now()}`);
  return (Speak.ttsModel = pick);
}
const speakMem = new Map();
async function speakNaturalAudio(text) {
  const model = await speakTtsModel(), key = `${model}|${TTS_VOICE}|${text}`;
  if (speakMem.has(key)) return speakMem.get(key);
  const p = (async () => {
    const kept = await speakDb('get', key);
    if (kept) return URL.createObjectURL(kept);
    const body = { contents: [{ role: 'user', parts: [{ text }] }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: TTS_VOICE } } } } };
    const r = await fetch(`${GEM}/models/${encodeURIComponent(model)}:generateContent`, { method: 'POST', headers: { 'x-goog-api-key': aiKey(), 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) { if (r.status === 404) { Speak.ttsModel = ''; aiStore.set(aiSlot('rc-ttsmodel'), ''); } throw Object.assign(new Error('tts'), { status: r.status }); }
    const j = await r.json(), part = ((((j.candidates || [])[0] || {}).content || {}).parts || []).find(x => x.inlineData || x.inline_data);
    const d = part && (part.inlineData || part.inline_data); if (!d || !d.data) throw Object.assign(new Error('no audio'), { status: 200 });
    const bytes = Uint8Array.from(atob(d.data), c => c.charCodeAt(0)), mime = String(d.mimeType || d.mime_type || '');
    const blob = /wav|mpeg|mp3|ogg/.test(mime) ? new Blob([bytes], { type: mime }) : speakWav(bytes, Number((mime.match(/rate=(\d+)/) || [])[1] || 24000));
    speakDb('put', key, blob);
    return URL.createObjectURL(blob);
  })();
  speakMem.set(key, p);
  p.catch(() => speakMem.delete(key));
  return p;
}
function speakNaturalNext(from) {
  if (from >= Speak.segs.length) return;
  let to = from + 1, len = Speak.segs[from].text.length;
  while (to < Speak.segs.length && !Speak.segs[to].brk && len + Speak.segs[to].text.length < 1400) len += Speak.segs[to++].text.length;
  speakNaturalAudio(Speak.segs.slice(from, to).map(s => s.text.replace(/[^.!?:]$/, '$&.')).join('\n')).catch(() => {});
}
// raw sound from Google (16-bit, one channel) → a .wav the browser can play
function speakWav(pcm, rate) {
  const h = new DataView(new ArrayBuffer(44)), w = (o, s) => [...s].forEach((c, i) => h.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); h.setUint32(4, 36 + pcm.length, true); w(8, 'WAVE'); w(12, 'fmt '); h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 1, true);
  h.setUint32(24, rate, true); h.setUint32(28, rate * 2, true); h.setUint16(32, 2, true); h.setUint16(34, 16, true); w(36, 'data'); h.setUint32(40, pcm.length, true);
  return new Blob([h.buffer, pcm], { type: 'audio/wav' });
}
// audio already made stays on this device (the newest 120 parts). The first store held audio that read out an instruction: it is removed.
try { indexedDB.deleteDatabase('recurra-voice'); } catch (e) {}
function speakDb(op, key, val) {
  return new Promise(ok => {
    try {
      const req = indexedDB.open('recurra-voice2', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('a');
      req.onerror = () => ok(null);
      req.onsuccess = () => {
        const db = req.result, tx = db.transaction('a', op === 'get' ? 'readonly' : 'readwrite'), st = tx.objectStore('a');
        if (op === 'get') { const g = st.get(key); g.onsuccess = () => ok(g.result ? g.result.b : null); g.onerror = () => ok(null); }
        else {
          st.put({ b: val, t: Date.now() }, key);
          const all = st.getAllKeys(); all.onsuccess = () => { const ks = all.result; if (ks.length > 120) { const c = st.openCursor(); let n = ks.length - 120; const old = []; c.onsuccess = () => { const cur = c.result; if (!cur) { old.sort((a, b) => a[1] - b[1]).slice(0, n).forEach(([k]) => st.delete(k)); return; } old.push([cur.key, cur.value.t || 0]); cur.continue(); }; } };
          tx.oncomplete = () => ok(true);
        }
        tx.onerror = () => ok(null);
      };
    } catch (e) { ok(null); }
  });
}

/* ---------- the player bar and the Listen buttons ---------- */
function speakBar() {
  let b = $('speakBar');
  if (!Speak.on) { if (b) b.hidden = true; return; }
  if (!b) {
    b = document.createElement('div'); b.id = 'speakBar'; b.className = 'speak-bar'; b.setAttribute('role', 'region'); b.setAttribute('aria-label', 'Read aloud');
    b.innerHTML = `<button type="button" class="sb-play" data-sb="pause"></button><span class="sb-t"><b></b><small></small></span><button type="button" class="sb-rate" data-sb="rate" title="Speed"></button><button type="button" data-sb="next" aria-label="Skip to the next part" title="Next part"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l8 6-8 6zM17 6v12"/></svg></button><button type="button" data-sb="stop" aria-label="Stop reading" title="Stop"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`;
    document.body.appendChild(b);
    b.addEventListener('click', e => {
      const x = e.target.closest('[data-sb]'); if (!x) return;
      const k = x.dataset.sb;
      if (k === 'pause') speakPause();
      else if (k === 'next') speakSkip();
      else if (k === 'stop') speakStop();
      else if (k === 'rate') { const r = SPEAK_RATES[(SPEAK_RATES.indexOf(speakRate()) + 1) % SPEAK_RATES.length]; savePrefs({ speakRate: r }); if (Speak.audio) Speak.audio.playbackRate = r; else if (Speak.on && !Speak.paused) { Speak.gen++; speakEngineStop(); speakGo(); } speakBar(); }
    });
  }
  b.hidden = false;
  b.querySelector('.sb-play').innerHTML = Speak.paused ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10-6.5z"/></svg>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6v12M15 6v12"/></svg>';
  b.querySelector('.sb-play').setAttribute('aria-label', Speak.paused ? 'Play' : 'Pause');
  const what = { quiz: 'Question', bank: 'Question', note: 'Note', readall: 'Notes' }[Speak.src] || 'Reading';
  b.querySelector('.sb-t b').textContent = Speak.paused ? 'Paused' : `Reading: ${what.toLowerCase()}`;
  b.querySelector('.sb-t small').textContent = speakNaturalOn() ? '✨ Natural voice' : NATIVE ? 'Phone voice' : 'Device voice';
  b.querySelector('.sb-rate').textContent = speakRate() + '×';
}
function speakPaintBtns() { document.querySelectorAll('[data-speak]').forEach(b => { const on = Speak.on && Speak.src === b.dataset.speak; b.setAttribute('aria-pressed', String(on)); b.querySelector('span').textContent = on ? 'Stop' : 'Listen'; }); }
document.addEventListener('click', e => {
  const b = e.target.closest('[data-speak]'); if (!b) return;
  if (Speak.on && Speak.src === b.dataset.speak) speakStop(); else speakStart(b.dataset.speak);
});
// leaving the screen (or a new question / note) stops reading
function speakOnScreen(id) { if (Speak.on && ({ quiz: 'quiz', bank: 'bank', note: 'notes', readall: 'notes' }[Speak.src] !== id)) speakStop(true); }
function speakReset() { if (Speak.on) speakStop(true); }

/* ---------- Settings → Read aloud ---------- */
async function speakSettingsPaint() {
  const box = $('optSpeakBox'); if (!box) return;
  box.hidden = !speakOK();
  const sel = $('optVoice'), pf = prefs();
  let list = [];
  if (NATIVE) { const n = speakNative(); if (n) list = (await speakNativeVoices(n)).filter(v => /^en/i.test(v.lang)).map(v => ({ id: v.voiceURI || v.name, name: v.name, lang: v.lang, s: speakVoiceScore(v.name, v.lang, v.localService) })); }
  else list = speakWebVoices().map(v => ({ id: v.voiceURI, name: v.name, lang: v.lang, s: speakVoiceScore(v.name, v.lang, v.localService) }));
  list.sort((a, b) => b.s - a.s);
  sel.innerHTML = `<option value="">Most natural available</option>` + list.map(v => `<option value="${esc(v.id)}">${esc(v.name.replace(/^Microsoft |^Google /, ''))} (${esc(v.lang)})</option>`).join('');
  sel.value = list.some(v => v.id === pf.speakVoice) ? pf.speakVoice : '';
  $('optSpeakRate').value = String(speakRate());
  const own = typeof aiMode === 'function' && aiMode() === 'own';
  $('optNaturalRow').hidden = !own; $('optNatural').checked = pf.speakNatural !== false;
}
// Settings: hear the voice (a fixed sentence; the natural voice is used when it is on)
function speakTry(natural) {
  speakStop(true);
  const el = $('optVoiceTry');
  Object.assign(Speak, { on: true, src: 'try', segs: [{ el, text: 'Hello! This is how your notes and questions will sound. Rate is a frequency; interval is a time.', brk: true }], i: 0, paused: false, gen: Speak.gen + 1 });
  if (!natural) Speak.naturalOff = true;
  speakBar(); speakGo().finally(() => { if (!natural) Speak.naturalOff = false; });
}
