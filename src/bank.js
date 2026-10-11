/* =====================================================================
   QUESTION BANK: every MCQ, like a book you can browse.
   Contents (subject → topic, numbered 1.1, 1.2 …), Weakest first, Newest,
   search, and a reader that shows the answer, explanation and your record.
   Practising still happens in the normal question screen.
   ===================================================================== */
const BankUI = { view: 'contents', q: '', open: null };
MODES.bank = () => { BankUI.open = null; renderBank(); show('bank'); };

function bankLinkRow() {
  const n = App.questions.length;
  return `<button class="row topic bank-link" type="button" data-mode="bank"><span class="name"><b>Question bank</b><small>${n ? `Browse, search and read all ${n} questions with answers` : 'Your questions will be listed here'}</small></span><span class="n">${icon('next')}</span></button>`;
}
// Book order: subject (prep order) → topic (syllabus order, then A–Z, "Others" last) → date added
function bankBook() {
  const order = App.subjects.map(s => s.code);
  const codes = [...new Set(App.questions.map(q => q.code))].sort((a, b) => (order.indexOf(a) + 1 || 999) - (order.indexOf(b) + 1 || 999) || a.localeCompare(b));
  const chapters = codes.map((code, ci) => {
    const T = (App.subjects.find(s => s.code === code) || {}).topics || [];
    const groupOf = q => { const i = topicIndex(q, T); return i >= 0 ? { key: 't' + i, name: T[i], rank: i } : isCatchAll(q.topic) ? { key: 'zz', name: T.length ? OTHERS : 'General', rank: 1e6 } : { key: 'n' + normTopic(q.topic), name: q.topic, rank: T.length ? 5e5 : 0 }; };
    const groups = {};
    App.questions.filter(q => q.code === code).forEach(q => { const g = groupOf(q); (groups[g.key] = groups[g.key] || { ...g, list: [] }).list.push(q); });
    const G = Object.values(groups).sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
    let k = 0;
    G.forEach(g => { g.list.sort((a, b) => (a.added || '').localeCompare(b.added || '') || a.question.localeCompare(b.question)); g.list = g.list.map(q => ({ q, num: `${ci + 1}.${++k}`, topic: g.name })); });
    return { code, name: subjName(code), n: ci + 1, groups: G, count: k };
  });
  return { chapters, flat: chapters.flatMap(c => c.groups.flatMap(g => g.list)) };
}
function memState(q) {
  const s = getState(q.id);
  if (!s || !s.t) return { cls: 'new', text: 'New', lv: 0, s };
  if (s.w && s.lv < 2) return { cls: 'weak', text: `Wrong ${s.w}×`, lv: s.lv, s };
  if (s.lv >= 4) return { cls: 'strong', text: 'Strong', lv: s.lv, s };
  return { cls: 'learn', text: 'Learning', lv: s.lv, s };
}
const bankText = q => [q.question, q.answer, q.options.join(' '), q.explanation, q.hint, q.trap, q.concept, q.topic, q.subtopic].filter(Boolean).join(' ');
function bankEntry(e, extra, re) {
  const m = memState(e.q);
  return `<li><button type="button" class="bq-e" data-bq="${esc(e.q.id)}">
    <span class="toc-n">${esc(e.num)}</span>
    <span class="bq-main"><span class="bq-t">${mark(esc(e.q.question), re)}</span>${extra ? `<small class="toc-sub">${extra}</small>` : ''}</span>
    <span class="bq-m m-${m.cls}">${levelBars(m.lv)}<small>${esc(m.text)}</small></span></button></li>`;
}
function renderBank() {
  const book = bankBook(), filter = $('bankFilter'), keep = filter.value;
  filter.innerHTML = `<option value="">All subjects (${book.flat.length})</option>` + book.chapters.map(c => `<option value="${esc(c.code)}">${esc(c.name)} (${c.count})</option>`).join('');
  filter.value = book.chapters.some(c => c.code === keep) ? keep : '';
  const sub = filter.value, inSub = e => !sub || e.q.code === sub;
  [...$('bankView').children].forEach(b => b.setAttribute('aria-pressed', String(b.dataset.bv === BankUI.view)));
  const empty = !book.flat.length;
  $('bankTools').hidden = empty; document.querySelector('#bank .nsearch').hidden = empty;
  const reader = !!BankUI.open && book.flat.some(e => e.q.id === BankUI.open);
  $('bankReader').hidden = !reader; $('bankIndex').hidden = reader;
  if (empty) { $('bankIndex').innerHTML = `<div class="empty-state">${ART.empty}<strong>No questions yet</strong><p>Add MCQs from Today → “Add questions or notes”. They'll be listed here like a book.</p></div>`; return; }
  if (reader) return renderBankReader(book);
  const q = BankUI.q.trim(), re = qRe(q), where = e => `${esc(subjName(e.q.code))} · ${esc(e.topic)}`;
  let html = '';
  if (q) {
    const lq = q.toLowerCase();
    const hits = book.flat.filter(inSub).map(e => {
      const t = e.q.question.toLowerCase(), body = bankText(e.q).toLowerCase();
      const score = t.includes(lq) ? 3 : (e.topic + ' ' + e.q.subtopic).toLowerCase().includes(lq) ? 2 : body.includes(lq) ? 1 : 0;
      if (!score) return null;
      const raw = bankText(e.q).slice(e.q.question.length + 1), i = raw.toLowerCase().indexOf(lq);
      const snip = score === 1 && i >= 0 ? (i > 40 ? '…' : '') + raw.slice(Math.max(0, i - 40), i + lq.length + 60) + '…' : '';
      return { e, score, snip };
    }).filter(Boolean).sort((a, b) => b.score - a.score || a.e.num.localeCompare(b.e.num, undefined, { numeric: true }));
    html = `<p class="muted small results-count">${hits.length ? `${plural(hits.length, 'question')} ${hits.length === 1 ? 'matches' : 'match'} “${esc(q)}”` : `Nothing matches “${esc(q)}”. Try a shorter word.`}</p>` +
      (hits.length ? `<ol class="bq-list">${hits.map(h => bankEntry(h.e, where(h.e) + (h.snip ? `<span class="snip">${mark(esc(h.snip), re)}</span>` : ''), re)).join('')}</ol>` : '');
  } else if (BankUI.view === 'weak') {
    const pr = e => { const s = getState(e.q.id); return !s || !s.t ? -1 : (s.w || 0) * 10 + (5 - s.lv); };
    const list = book.flat.filter(inSub).filter(e => pr(e) > 0 && (getState(e.q.id).w || getState(e.q.id).lv < 2)).sort((a, b) => pr(b) - pr(a));
    html = list.length ? `<p class="muted small results-count">${plural(list.length, 'question')} you got wrong or still find hard, worst first.</p>
      <div class="btns bq-act"><button class="btn primary" type="button" data-bqpractice="weak">Practise these (${Math.min(30, list.length)})</button></div>
      <ol class="bq-list">${list.map(e => bankEntry(e, where(e))).join('')}</ol>`
      : `<div class="empty-state small">${ART.empty}<strong>Nothing weak right now</strong><p>Questions you get wrong will gather here, worst first.</p></div>`;
  } else if (BankUI.view === 'recent') {
    const list = book.flat.filter(inSub).sort((a, b) => (b.q.added || '').localeCompare(a.q.added || '') || a.num.localeCompare(b.num, undefined, { numeric: true }));
    let day = null;
    html = `<div class="toc book recent">${list.map(e => {
      const head = e.q.added !== day ? `${day !== null ? '</ol></section>' : ''}<section class="toc-ch"><h3 class="toc-day">${esc(longDate(e.q.added))}</h3><ol class="bq-list">` : '';
      day = e.q.added; return head + bankEntry(e, where(e));
    }).join('')}</ol></section></div>`;
  } else {
    html = `<div class="toc book">${book.chapters.filter(c => !sub || c.code === sub).map(c => `
      <section class="toc-ch"><h3><span class="toc-cn">${c.n}</span><span class="toc-ct">${esc(c.name)}</span><small>${plural(c.count, 'question')}</small></h3>
      ${c.groups.map(g => `<div class="bq-topic"><span>${esc(g.name)}</span><small>${g.list.length}</small><button class="linkbtn" type="button" data-bqpractice="${esc(c.code)}|${esc(g.key)}">Practise</button></div>
        <ol class="bq-list">${g.list.map(e => bankEntry(e, e.q.subtopic ? esc(e.q.subtopic) : '')).join('')}</ol>`).join('')}</section>`).join('')}</div>`;
  }
  $('bankIndex').innerHTML = (q ? '' : `<div class="toc-head"><span class="label">${BankUI.view === 'weak' ? 'Weakest first' : BankUI.view === 'recent' ? 'By date added' : 'Contents'}</span></div>`) + html;
}
function renderBankReader(book) {
  const list = book.flat, i = list.findIndex(e => e.q.id === BankUI.open), e = list[i], q = e.q;
  const prev = list[i - 1], next = list[i + 1], re = qRe(BankUI.q.trim()), m = memState(q), s = m.s;
  const tags = [q.type, q.difficulty].filter(Boolean).map(t => `<span class="badge">${esc(t)}</span>`).join('');
  const extra = [['Explanation', q.explanation, ''], ['Memory hint', q.hint, 'trick'], ['Exam trap', q.trap, 'trap'], ['Concept', q.concept, '']].filter(x => x[1]);
  const record = !s || !s.t ? 'You have not answered this one yet.'
    : `Answered ${plural(s.a, 'time')}: ${s.c} right, ${s.w} wrong · last ${ago(s.t) === 'online now' ? 'just now' : ago(s.t).replace(/^1 (day|h)s? ago/, (m, u) => u === 'day' ? 'yesterday' : '1 hour ago')}${s.due ? ` · next review ${fmtDate(s.due)}` : ''}`;
  $('bankReader').innerHTML = `<div class="reader-bar">
      <button class="btn ghost" type="button" data-bqback>${icon('back')}${BankUI.q.trim() ? 'Results' : 'Contents'}</button>
      <span class="muted small">${i + 1} of ${list.length}</span>
      <span class="reader-nav"><button class="btn" type="button" data-bq="${prev ? esc(prev.q.id) : ''}" ${prev ? '' : 'disabled'} aria-label="Previous question">${icon('back')}</button><button class="btn" type="button" data-bq="${next ? esc(next.q.id) : ''}" ${next ? '' : 'disabled'} aria-label="Next question">${icon('next')}</button></span>
    </div>
    <article class="note bq-card">
      <div class="note-meta"><span class="note-num">${esc(e.num)}</span><span>${esc(subjName(q.code))} · ${esc(e.topic)}${q.subtopic ? ' · ' + esc(q.subtopic) : ''}</span><span class="note-date">${esc(shortDate(q.added))}</span></div>
      <h3>${mark(rich(q.question), re)}</h3>
      ${tags ? `<div class="bq-tags">${tags}</div>` : ''}
      <ol class="bq-opts">${q.options.map(o => `<li class="${o === q.answer ? 'right' : ''}"><span>${mark(rich(o), re)}</span>${o === q.answer ? `<b>Answer</b>` : ''}</li>`).join('')}</ol>
      ${extra.length ? `<dl>${extra.map(([k, v, c]) => `<div class="${c}"><dt>${k}</dt><dd>${mark(rich(v), re)}</dd></div>`).join('')}</dl>` : ''}
      <div class="bq-record m-${m.cls}">${levelBars(m.lv)}<span><b>${esc(m.text)}</b> · ${esc(record)}</span></div>
      <div class="btns"><button class="btn" type="button" data-bqpractice="${esc(q.code)}|one">Practise this topic</button></div>
    </article>
    <div class="reader-foot">${prev ? `<button type="button" class="reader-link" data-bq="${esc(prev.q.id)}"><small>Previous</small><span class="rl-t">${esc(prev.num)} ${esc(prev.q.question)}</span></button>` : '<span></span>'}${next ? `<button type="button" class="reader-link next" data-bq="${esc(next.q.id)}"><small>Next</small><span class="rl-t">${esc(next.num)} ${esc(next.q.question)}</span></button>` : ''}</div>`;
}
function openBankQ(id) { BankUI.open = id; renderBank(); window.scrollTo(0, 0); }
function bankPractice(arg) {
  const book = bankBook(), lv = q => { const s = getState(q.id); return s ? s.lv : -1; };
  let title, pool;
  if (arg === 'weak') {
    const pr = q => { const s = getState(q.id); return !s || !s.t ? -1 : (s.w || 0) * 10 + (5 - s.lv); };
    pool = book.flat.map(e => e.q).filter(q => { const s = getState(q.id); return s && s.t && (s.w || s.lv < 2) && (!$('bankFilter').value || q.code === $('bankFilter').value); }).sort((a, b) => pr(b) - pr(a)).slice(0, 30);
    return startSession('Weakest questions', shuffle(pool));
  }
  const [code, key] = arg.split('|'), ch = book.chapters.find(c => c.code === code);
  if (!ch) return;
  const g = key === 'one' ? ch.groups.find(x => x.list.some(e => e.q.id === BankUI.open)) : ch.groups.find(x => x.key === key);
  if (!g) return;
  title = g.name === OTHERS || g.name === 'General' ? `${ch.name}: ${g.name}` : g.name;
  pool = g.list.map(e => e.q);
  startSession(title, shuffle(shuffle(pool).sort((a, b) => lv(a) - lv(b)).slice(0, 30)));
}
$('bank').addEventListener('click', e => {
  const t = e.target.closest('[data-bq]');
  if (t && t.dataset.bq) return openBankQ(t.dataset.bq);
  if (e.target.closest('[data-bqback]')) { BankUI.open = null; renderBank(); return; }
  const p = e.target.closest('[data-bqpractice]'); if (p) return bankPractice(p.dataset.bqpractice);
  const v = e.target.closest('[data-bv]');
  if (v) { BankUI.view = v.dataset.bv; BankUI.open = null; renderBank(); }
});
$('bankSearch').addEventListener('input', () => { BankUI.q = $('bankSearch').value; BankUI.open = null; renderBank(); });
$('bankFilter').addEventListener('change', () => { BankUI.open = null; renderBank(); });
document.addEventListener('keydown', e => {
  if ($('bank').hidden || $('bankReader').hidden || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  const b = e.key === 'ArrowLeft' ? $('bankReader').querySelector('.reader-nav [data-bq]') : e.key === 'ArrowRight' ? $('bankReader').querySelectorAll('.reader-nav [data-bq]')[1] : null;
  if (b && b.dataset.bq) openBankQ(b.dataset.bq);
});
