/* =====================================================================
   SELECT, DELETE and CLUB (Question bank and Revision notes)
   Tap "Select" (or press and hold a question or note), tick several,
   then: Delete (asks Yes/No, then offers Undo for a few seconds) or
   Club into one topic (an existing topic, or a new one you name).
   Clubbing works within one subject. Each note stays its own note.
   Your progress on a question is kept when it is clubbed.
   ===================================================================== */
const Sel = { on: false, kind: null, ids: new Set(), undo: null, undoTimer: null };
const SEL = {
  bank: { sec: 'bank', index: 'bankIndex', entry: '[data-bq]', idOf: el => el.dataset.bq, word: ['question', 'questions'], raw: () => App.bank, field: 'q', col: 'bank', docs: () => App.bankDocs, render: () => renderBank(), reading: () => !!BankUI.open },
  notes: { sec: 'notes', index: 'notesIndex', entry: '[data-note]', idOf: el => el.dataset.note, word: ['note', 'notes'], raw: () => App.notesMap, field: 'n', col: 'notes', docs: () => App.notesDocs, render: () => renderNotes(), reading: () => !!NotesUI.open || NotesUI.all },
};
const selWord = (kind, n) => `${n} ${SEL[kind].word[n === 1 ? 0 : 1]}`;

function selStart(kind, firstId) {
  Sel.on = true; Sel.kind = kind; Sel.ids = new Set(firstId ? [firstId] : []);
  document.body.classList.add('selecting'); $(SEL[kind].sec).classList.add('sel-mode');
  selPaint();
}
function selStop() {
  if (!Sel.on) return;
  const k = Sel.kind; Sel.on = false; Sel.ids.clear(); Sel.kind = null;
  document.body.classList.remove('selecting');
  ['bank', 'notes'].forEach(x => $(SEL[x].sec).classList.remove('sel-mode'));
  $('selBar').hidden = true;
  if (k) SEL[k].render();
}
function selToggle(id) { if (Sel.ids.has(id)) Sel.ids.delete(id); else Sel.ids.add(id); selPaint(); }
// show ticks on the list and the bar at the bottom
function selPaint() {
  ['bank', 'notes'].forEach(k => { const b = $(SEL[k].sec).querySelector('[data-seltoggle]'); if (b) b.textContent = Sel.on && Sel.kind === k ? 'Cancel' : 'Select'; });
  if (!Sel.on) return;
  const C = SEL[Sel.kind], box = $(C.index);
  box.querySelectorAll(C.entry).forEach(el => { const on = Sel.ids.has(C.idOf(el)); el.classList.toggle('picked', on); el.setAttribute('aria-pressed', String(on)); });
  const n = Sel.ids.size, bar = $('selBar');
  bar.hidden = false;
  bar.innerHTML = `<button class="sb-x" type="button" data-selcancel aria-label="Stop selecting">×</button>
    <span class="sb-n">${n ? `<b>${n}</b> selected` : 'Tap to select'}</span>
    <button class="btn small ghost" type="button" data-selall>All shown</button>
    <button class="btn small" type="button" data-selclub ${n >= 2 ? '' : 'disabled'} title="${n >= 2 ? '' : 'Select 2 or more'}">Club</button>
    <button class="btn small danger" type="button" data-seldel ${n ? '' : 'disabled'}>Delete</button>`;
}

// ---- saving: rewrite the chunks of the subjects that changed ----
async function selSave(kind, newMap, codes, subjects) {
  const C = SEL[kind], base = Store.prepPath(App.prepId), by = {};
  codes.forEach(code => { by[code] = {}; Object.values(newMap).forEach(o => { if (o.subject === code) by[code][o.id] = o; }); });
  const writes = chunkWrites(`${base}/${C.col}`, C.field, by, C.docs());
  if (subjects) writes.push({ path: base, data: { ...stripId(App.prep), subjects } });
  await Store.write(writes);
}

// ---- delete: Yes / No, then Undo for a few seconds ----
function selDeleteAsk() {
  const kind = Sel.kind, n = Sel.ids.size; if (!n) return;
  selSheet(`<div class="sel-ic danger" aria-hidden="true">🗑</div>
    <h2>Delete ${selWord(kind, n)}?</h2>
    <p class="muted">${kind === 'bank' ? 'They leave your reviews and practice. ' : ''}You can undo this for a few seconds right after.</p>
    <div class="btns grid"><button class="btn" type="button" data-shno>No, keep them</button><button class="btn danger" type="button" data-shyes>Yes, delete</button></div>`,
    () => selDelete());
}
async function selDelete() {
  const kind = Sel.kind, C = SEL[kind], raw = C.raw(), ids = [...Sel.ids];
  const gone = ids.map(id => raw[id]).filter(Boolean); if (!gone.length) return selStop();
  const newMap = { ...raw }; ids.forEach(id => delete newMap[id]);
  const codes = [...new Set(gone.map(o => o.subject))];
  try { await selSave(kind, newMap, codes); }
  catch (e) { console.warn(e); return toast('Could not delete. Check your internet and try again.'); }
  Activity.log('content_deleted', { prep: App.prep.name, summary: selWord(kind, gone.length) });
  Sound.play('tap');
  selStop();
  selUndoOffer(`Deleted ${selWord(kind, gone.length)}.`, async () => {
    const back = { ...SEL[kind].raw() }; gone.forEach(o => { back[o.id] = o; });
    await selSave(kind, back, codes);
    Activity.log('content_restored', { prep: App.prep.name, summary: selWord(kind, gone.length) });
    toast(`Brought back ${selWord(kind, gone.length)}.`);
  });
}
function selUndoOffer(text, undo) {
  const bar = $('undoBar'); clearTimeout(Sel.undoTimer); Sel.undo = undo;
  bar.innerHTML = `<span>${esc(text)}</span><button class="btn small" type="button" id="undoGo">Undo</button>`;
  bar.hidden = false; bar.classList.remove('go'); void bar.offsetWidth; bar.classList.add('go');
  $('undoGo').onclick = async () => { const u = Sel.undo; Sel.undo = null; bar.hidden = true; clearTimeout(Sel.undoTimer); if (u) try { await u(); } catch (e) { toast('Could not undo. Check your internet.'); } };
  Sel.undoTimer = setTimeout(() => { bar.hidden = true; Sel.undo = null; }, 7000);
}

// ---- club into one topic ----
function selClubAsk() {
  const kind = Sel.kind, C = SEL[kind], raw = C.raw(), items = [...Sel.ids].map(id => raw[id]).filter(Boolean);
  if (items.length < 2) return;
  const codes = [...new Set(items.map(o => o.subject))];
  if (codes.length > 1) return toast('Club works within one subject. Pick items from one subject only.');
  const code = codes[0], subj = App.subjects.find(s => s.code === code) || { topics: [] };
  // every topic of this subject: the syllabus first, then topics your items already use
  const used = Object.values(raw).filter(o => o.subject === code && o.topic && !isCatchAll(o.topic)).map(o => o.topic);
  const topics = [];
  [...(subj.topics || []), ...used.sort((a, b) => a.localeCompare(b))].forEach(t => { if (t && !topics.some(x => normTopic(x) === normTopic(t))) topics.push(t); });
  const counts = {}; items.forEach(o => { const k = normTopic(o.topic || ''); if (k) counts[k] = (counts[k] || 0) + 1; });
  const [topKey, topN] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || ['', 0];
  const allSame = topN === items.length && !isCatchAll(items[0].topic || '');
  const suggest = topN * 2 >= items.length ? (items.find(o => normTopic(o.topic || '') === topKey) || {}).topic || '' : '';
  const S = { mode: allSame && topics.length ? 'existing' : 'new', pick: allSame ? topics.find(t => normTopic(t) === topKey) || '' : '', name: isCatchAll(suggest) ? '' : suggest, find: '' };
  const draw = () => {
    const match = S.mode === 'new' && S.name.trim() ? topics.find(t => normTopic(t) === normTopic(S.name)) : null;
    const ok = S.mode === 'existing' ? !!S.pick : !!S.name.trim();
    const list = topics.filter(t => !S.find || t.toLowerCase().includes(S.find.toLowerCase()));
    selSheet(`<div class="sel-ic" aria-hidden="true">🗂️</div>
      <h2>Club ${selWord(kind, items.length)}</h2>
      <p class="muted small">${esc(subjName(code))} · they will all be under one topic.${kind === 'bank' ? ' Your progress on each question is kept.' : ' Each note stays its own note.'}</p>
      <div class="club-tabs" role="tablist">
        <button type="button" role="tab" data-cm="existing" aria-selected="${S.mode === 'existing'}" ${topics.length ? '' : 'disabled'}>Existing topic</button>
        <button type="button" role="tab" data-cm="new" aria-selected="${S.mode === 'new'}">New topic</button>
      </div>
      ${S.mode === 'existing' ? `
        ${topics.length > 8 ? `<input class="club-find" id="clubFind" type="search" placeholder="Search topics" value="${esc(S.find)}" autocomplete="off">` : ''}
        <div class="club-list" role="radiogroup" aria-label="Topics">${list.map(t => `<button type="button" role="radio" aria-checked="${t === S.pick}" data-ct="${esc(t)}"><span class="cr"></span>${esc(t)}</button>`).join('') || '<p class="muted small">No topic matches.</p>'}</div>`
      : `<label for="clubName">Topic name <small class="muted">(required)</small></label>
        <input id="clubName" maxlength="60" autocomplete="off" placeholder="e.g. Transport Layer" value="${esc(S.name)}">
        <p class="club-note">${match ? `“${esc(match)}” already exists: they will be added to it.` : S.name.trim() ? (subj.topics && subj.topics.length ? 'A new topic, also added to your Syllabus.' : 'A new topic.') : ''}</p>`}
      <div class="btns grid"><button class="btn" type="button" data-shno>Cancel</button><button class="btn primary" type="button" data-shyes ${ok ? '' : 'disabled'}>Club</button></div>`,
      () => selClub(kind, items, code, S.mode === 'existing' ? S.pick : (match || S.name.trim()), topics), true);
    const box = $('selSheet');
    box.querySelectorAll('[data-cm]').forEach(b => { b.onclick = () => { S.mode = b.dataset.cm; draw(); }; });
    box.querySelectorAll('[data-ct]').forEach(b => { b.onclick = () => { S.pick = b.dataset.ct; draw(); }; });
    const nm = $('clubName'); if (nm) { nm.oninput = () => { S.name = nm.value; const p = nm.selectionStart; draw(); const n2 = $('clubName'); n2.focus(); n2.setSelectionRange(p, p); }; if (!S.name) setTimeout(() => nm.focus(), 50); }
    const fd = $('clubFind'); if (fd) fd.oninput = () => { S.find = fd.value; const p = fd.selectionStart; draw(); const f2 = $('clubFind'); f2.focus(); f2.setSelectionRange(p, p); };
  };
  draw();
}
async function selClub(kind, items, code, topic, topics) {
  topic = String(topic || '').trim(); if (!topic) return;
  const C = SEL[kind], newMap = { ...C.raw() };
  items.forEach(o => { newMap[o.id] = { ...o, topic }; });
  // a new topic joins the Syllabus, but only if this subject already has syllabus topics (else everything else would fall into "Others")
  let subjects = null;
  const subj = App.subjects.find(s => s.code === code);
  if (subj && (subj.topics || []).length && !subj.topics.some(t => normTopic(t) === normTopic(topic))) subjects = App.subjects.map(s => s.code === code ? { ...s, topics: [...s.topics, topic] } : s);
  try { await selSave(kind, newMap, [code], subjects); }
  catch (e) { console.warn(e); return toast('Could not save. Check your internet and try again.'); }
  Activity.log('content_clubbed', { prep: App.prep.name, summary: selWord(kind, items.length), topic, subject: subjName(code) });
  Sound.play('check');
  selStop();
  toast(`${selWord(kind, items.length)[0].toUpperCase() + selWord(kind, items.length).slice(1)} now under “${topic}”.`);
}

// ---- a small centred box for "are you sure" and "club" ----
function selSheet(html, onYes, keepOpen) {
  const sh = $('selSheet'); sh.hidden = false; document.body.classList.add('sheet-open');
  sh.innerHTML = `<div class="card sheet-card sel-card">${html}</div>`;
  const close = () => { sh.hidden = true; sh.innerHTML = ''; document.body.classList.remove('sheet-open'); };
  sh.onclick = e => { if (e.target === sh) close(); };
  sh.querySelector('[data-shno]').onclick = close;
  const y = sh.querySelector('[data-shyes]');
  y.onclick = async () => { y.disabled = true; y.textContent = 'Saving…'; await onYes(); close(); };
}

// ---- wiring: Select button, press-and-hold, taps while selecting ----
['bank', 'notes'].forEach(kind => {
  const C = SEL[kind], sec = $(C.sec);
  sec.addEventListener('click', e => {
    const tg = e.target.closest('[data-seltoggle]');
    if (tg) { e.stopImmediatePropagation(); return Sel.on && Sel.kind === kind ? selStop() : selStart(kind); }
    if (!Sel.on || Sel.kind !== kind) return;
    const el = e.target.closest(C.entry);
    if (el && $(C.index).contains(el)) { e.preventDefault(); e.stopImmediatePropagation(); if (!Sel.held) selToggle(C.idOf(el)); Sel.held = false; }
  }, true);
  // press and hold an item to start selecting with it
  let timer = null, sx = 0, sy = 0;
  sec.addEventListener('pointerdown', e => {
    const el = e.target.closest(C.entry); if (!el || !$(C.index).contains(el) || e.button > 0) return;
    sx = e.clientX; sy = e.clientY; clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null; Sel.held = true; if (navigator.vibrate) try { navigator.vibrate(15); } catch (er) {}
      if (Sel.on && Sel.kind === kind) selToggle(C.idOf(el)); else selStart(kind, C.idOf(el));
    }, 480);
  });
  const cancel = () => { clearTimeout(timer); timer = null; };
  sec.addEventListener('pointermove', e => { if (timer && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) cancel(); });
  sec.addEventListener('pointerup', cancel); sec.addEventListener('pointercancel', cancel);
  sec.addEventListener('contextmenu', e => { if (e.target.closest(C.entry)) e.preventDefault(); });
  // the list redraws (search, filter, new data): keep the ticks; opening a note or question ends selecting
  new MutationObserver(() => { if (Sel.on && Sel.kind === kind) { if (C.reading()) selStop(); else selPaint(); } }).observe($(C.index), { childList: true });
});
$('selBar').addEventListener('click', e => {
  if (e.target.closest('[data-selcancel]')) return selStop();
  if (e.target.closest('[data-selall]')) { const C = SEL[Sel.kind]; $(C.index).querySelectorAll(C.entry).forEach(el => Sel.ids.add(C.idOf(el))); return selPaint(); }
  if (e.target.closest('[data-seldel]')) return selDeleteAsk();
  if (e.target.closest('[data-selclub]')) return selClubAsk();
});
