/* =====================================================================
   SYLLABUS: each subject's topics, and how much of it is covered.
   Optional. Nothing extra to do when adding MCQs or notes: they are matched
   to topics by their topic name. One tap marks a topic as studied.
   ===================================================================== */
const Syl = { open: null, edit: null };
const hasSyllabus = () => App.subjects.some(s => (s.topics || []).length);
const topicKey = (code, name) => `${code}::${normTopic(name)}`;
const doneMap = () => (App.prep && App.prep.topicDone) || {};
MODES.syllabus = () => { Syl.open = null; Syl.edit = null; renderSyllabus(); show('syllabus'); };

function sylStats() {
  const done = doneMap();
  return App.subjects.map(s => {
    const topics = s.topics || [];
    const T = topics.map((name, i) => ({ i, name, q: 0, seen: 0, strong: 0, notes: 0, ids: [], done: !!done[topicKey(s.code, name)] }));
    const other = {};
    App.questions.filter(q => q.code === s.code).forEach(q => {
      const i = topicIndex(q, topics), st = getState(q.id), name = q.topic || 'General';
      const t = i >= 0 ? T[i] : (other[normTopic(name)] = other[normTopic(name)] || { name, q: 0, seen: 0, strong: 0, notes: 0, ids: [], other: true });
      t.q++; t.ids.push(q.id);
      if (st && st.t) t.seen++;
      if (st && st.lv >= 4) t.strong++;
    });
    App.notes.filter(n => n.code === s.code).forEach(n => { const i = topicIndex(n, topics); if (i >= 0) T[i].notes++; });
    T.forEach(t => { t.state = !t.q ? 'none' : t.strong / t.q >= 0.6 ? 'strong' : 'learn'; });
    return { s, topics: T, other: topics.length ? Object.values(other) : [], doneN: T.filter(t => t.done).length, strongN: T.filter(t => t.state === 'strong').length, gaps: T.filter(t => !t.q) };
  });
}
// two rings: outer = studied (ticked), inner = strong in memory
function sylRing(outer, inner, size, label) {
  const R1 = 44, R2 = 33, C1 = 2 * Math.PI * R1, C2 = 2 * Math.PI * R2;
  return `<svg class="syl-ring" viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="${esc(label)}">
    <circle class="tr" cx="50" cy="50" r="${R1}"/>${outer > 0 ? `<circle class="o" cx="50" cy="50" r="${R1}" stroke-dasharray="${(C1 * outer).toFixed(1)} ${C1.toFixed(1)}"/>` : ''}
    <circle class="tr" cx="50" cy="50" r="${R2}"/>${inner > 0 ? `<circle class="i" cx="50" cy="50" r="${R2}" stroke-dasharray="${(C2 * inner).toFixed(1)} ${C2.toFixed(1)}"/>` : ''}
    <text x="50" y="${size > 80 ? 55 : 57}" text-anchor="middle">${Math.round(outer * 100)}%</text></svg>`;
}
function renderSyllabus() {
  const all = sylStats(), topics = all.flatMap(x => x.topics), total = topics.length;
  const done = topics.filter(t => t.done).length, strong = topics.filter(t => t.state === 'strong').length, gaps = topics.filter(t => !t.q).length;
  if (!App.subjects.length) {
    $('sylHero').innerHTML = `<div class="empty-state">${ART.empty}<strong>No subjects yet</strong><p>Add your subjects first (Today → Add questions or notes), then their topics here.</p></div>`;
    $('sylList').innerHTML = ''; return;
  }
  $('sylHero').innerHTML = total ? `<div class="syl-hero">
      ${sylRing(done / total, strong / total, 132, `${Math.round(100 * done / total)}% studied`)}
      <div class="syl-facts">
        <p class="syl-big"><b>${done}</b> of ${total} topics studied</p>
        <p><i class="dot d-done"></i>${strong} strong in memory <span class="muted">· inner ring</span></p>
        <p><i class="dot d-none"></i>${gaps ? `${gaps} ${gaps === 1 ? 'topic has' : 'topics have'} no questions yet` : 'Every topic has questions'}</p>
        <div class="btns">${gaps ? '<button class="btn primary" type="button" data-sgaps="">Fill the gaps</button>' : ''}<button class="btn" type="button" data-mode="import">Add questions or notes</button></div>
      </div>
    </div>
    <div class="syl-legend"><span><i class="tile-sw s-none"></i>No questions yet</span><span><i class="tile-sw s-learn"></i>Learning</span><span><i class="tile-sw s-strong"></i>Strong in memory</span><span><i class="tick-sw">✓</i>Studied (tap the circle)</span></div>`
    : `<div class="card syl-start"><strong>Make it a full syllabus (optional)</strong>
        <p class="muted">Add the topics of each subject, as your official syllabus lists them. You'll see what you've covered, what's strong, and what still has no questions. Adding MCQs and notes stays exactly the same.</p>
        <div class="btns"><button class="btn primary" type="button" data-simport>Import my syllabus with AI</button><button class="btn" type="button" data-sedit="${esc(App.subjects[0].code)}">Type the topics</button></div></div>`;
  $('sylList').innerHTML = all.map(x => sylCard(x)).join('');
  if (Syl.edit && $('sylText')) $('sylText').focus();
}
function sylCard(x) {
  const { s, topics } = x, n = topics.length;
  const head = `<header class="syl-head">
      ${n ? sylRing(x.doneN / n, x.strongN / n, 54, `${x.doneN} of ${n} topics studied`) : '<span class="syl-code">' + esc(s.code) + '</span>'}
      <div class="syl-title"><strong>${esc(s.name)}</strong><small>${[s.code, s.part && `Part ${s.part}`, s.marks && `${s.marks} marks`, n && `${x.doneN}/${n} studied`].filter(Boolean).map(esc).join(' · ')}</small></div>
      <button class="btn ghost" type="button" data-sedit="${esc(s.code)}">${n ? 'Edit' : 'Add topics'}</button></header>`;
  if (Syl.edit === s.code) {
    return `<section class="syl-card editing" data-code="${esc(s.code)}">${head}
      <label class="syl-edit-label" for="sylText">Topics of ${esc(s.name)}, one per line</label>
      <textarea id="sylText" rows="8" spellcheck="false" placeholder="OSI model&#10;TCP/IP model&#10;IP addressing and subnetting">${esc((s.topics || []).join('\n'))}</textarea>
      <p class="muted small">Tip: paste the list straight from your syllabus PDF. Numbers and bullets are removed for you.</p>
      <div class="btns"><button class="btn primary" type="button" data-ssave="${esc(s.code)}">Save topics</button><button class="btn" type="button" data-scancel>Cancel</button></div></section>`;
  }
  const tile = t => {
    const key = `${s.code}|${t.other ? 'o' : 't'}|${t.other ? normTopic(t.name) : t.i}`, open = Syl.open === key;
    return `<div class="tile s-${t.other ? 'other' : t.state}${t.done ? ' done' : ''}${open ? ' open' : ''}">
      ${t.other ? '' : `<button class="tick" type="button" data-tick="${esc(s.code)}|${t.i}" aria-pressed="${t.done}" aria-label="${t.done ? 'Studied' : 'Mark as studied'}: ${esc(t.name)}">${t.done ? '✓' : ''}</button>`}
      <button class="tname" type="button" data-topen="${esc(key)}">${esc(t.name)}<small>${t.q ? plural(t.q, 'Q') : 'no Qs'}${t.other ? ' · not in syllabus' : ''}</small></button></div>`;
  };
  let panel = '';
  const openT = Syl.open && Syl.open.startsWith(s.code + '|') ? (() => {
    const [, kind, id] = Syl.open.split('|');
    return kind === 't' ? topics[Number(id)] : x.other.find(o => normTopic(o.name) === id);
  })() : null;
  if (openT) {
    panel = `<div class="syl-panel"><strong>${esc(openT.name)}</strong>
      <p class="muted small">${openT.q ? `${plural(openT.q, 'question')} · ${openT.seen} seen · ${openT.strong} strong` : 'No questions on this topic yet.'}${openT.other ? '' : ` · ${plural(openT.notes, 'note')}`}</p>
      <div class="btns">
        ${openT.other ? `<button class="btn" type="button" data-sadd="${esc(s.code)}" data-name="${esc(openT.name)}">Add to the syllabus</button>`
          : `<button class="btn${openT.done ? '' : ' primary'}" type="button" data-tick="${esc(s.code)}|${openT.i}">${openT.done ? '✓ Studied (undo)' : 'Mark as studied'}</button>`}
        ${openT.q ? `<button class="btn" type="button" data-spractice>Practice this topic</button>` : ''}
        ${openT.other ? '' : `<button class="btn" type="button" data-sgaps="${esc(s.code)}" data-name="${esc(openT.name)}">Get questions for it</button>`}
      </div></div>`;
  }
  return `<section class="syl-card" data-code="${esc(s.code)}">${head}
    ${n ? `<div class="syl-bar" role="img" aria-label="${x.doneN} of ${n} studied">${topics.map(t => `<i class="s-${t.state}${t.done ? ' done' : ''}"></i>`).join('')}</div>` : ''}
    ${n ? `<div class="tiles">${topics.map(tile).join('')}</div>` : `<p class="muted small">No topics yet. Add them to see coverage for ${esc(s.name)}.</p>`}
    ${x.other.length ? `<div class="tiles other-tiles"><span class="label">Other topics in your questions</span>${x.other.map(tile).join('')}</div>` : ''}
    ${panel}
    ${n && x.gaps.length ? `<button class="linkbtn syl-gap" type="button" data-sgaps="${esc(s.code)}">Get questions for ${plural(x.gaps.length, 'empty topic')}</button>` : ''}
  </section>`;
}
async function saveSubjects(next) {
  await Store.setPrep(App.prepId, { subjects: next });
  App.subjects = next; App.prep.subjects = next; rebuild(); updateTabs();
}
function celebrate(card) {
  toast(`${card.querySelector('.syl-title strong').textContent}: every topic studied!`);
  if (prefersReduced()) return;
  const box = document.createElement('div'); box.className = 'confetti';
  const colors = ['#10a58f', '#1b93c9', '#f5a300', '#ff7a93', '#7c5cff', '#4fd894'];
  for (let i = 0; i < 36; i++) {
    const p = document.createElement('i');
    p.style.cssText = `--x:${(Math.random() * 2 - 1) * 180}px;--y:${-60 - Math.random() * 160}px;--r:${Math.random() * 720 - 360}deg;--d:${(0.9 + Math.random() * 0.7).toFixed(2)}s;background:${colors[i % colors.length]};left:${30 + Math.random() * 40}%`;
    box.appendChild(p);
  }
  card.appendChild(box); setTimeout(() => box.remove(), 1800);
}
$('syllabus').addEventListener('click', async e => {
  const t = e.target.closest('button'); if (!t) return;
  const d = t.dataset;
  try {
    if ('tick' in d) {
      const [code, i] = d.tick.split('|'), s = App.subjects.find(x => x.code === code), name = s.topics[Number(i)], key = topicKey(code, name);
      const now = doneMap()[key] ? 0 : Date.now();
      App.prep.topicDone = { ...doneMap(), [key]: now };
      renderSyllabus();
      const st = sylStats().find(x => x.s.code === code);
      if (now && st.doneN === st.topics.length) { celebrate($('sylList').querySelector(`[data-code="${code}"]`)); Activity.log('subject_completed', { prep: App.prep.name, subject: s.name }); }
      await Store.setPrep(App.prepId, { topicDone: App.prep.topicDone });
      return;
    }
    if ('topen' in d) { Syl.open = Syl.open === d.topen ? null : d.topen; return renderSyllabus(); }
    if ('sedit' in d) { Syl.edit = d.sedit; Syl.open = null; renderSyllabus(); $('sylList').querySelector('.editing').scrollIntoView({ block: 'center' }); return; }
    if ('scancel' in d) { Syl.edit = null; return renderSyllabus(); }
    if ('simport' in d) return openImport('active', 'syllabus');
    if ('ssave' in d) {
      const topics = topicsOf({ topics: $('sylText').value.split('\n') });
      const next = App.subjects.map(s => s.code === d.ssave ? { ...s, topics } : s);
      t.disabled = true; await saveSubjects(next); Syl.edit = null; renderSyllabus();
      Activity.log('syllabus_edited', { prep: App.prep.name, subject: (next.find(s => s.code === d.ssave) || {}).name, topics: topics.length });
      return toast(topics.length ? `Saved ${plural(topics.length, 'topic')}.` : 'Topics removed.');
    }
    if ('sadd' in d) {
      const next = App.subjects.map(s => s.code === d.sadd ? { ...s, topics: [...(s.topics || []), d.name] } : s);
      await saveSubjects(next); Syl.open = null; renderSyllabus(); return toast(`Added "${d.name}" to the syllabus.`);
    }
    if ('spractice' in d) {
      const st = sylStats(), [code, kind, id] = Syl.open.split('|'), x = st.find(y => y.s.code === code);
      const T = kind === 't' ? x.topics[Number(id)] : x.other.find(o => normTopic(o.name) === id);
      const pool = App.questions.filter(q => T.ids.includes(q.id)), lv = q => { const s = getState(q.id); return s ? s.lv : -1; };
      return startSession(T.name, shuffle(shuffle(pool).sort((a, b) => lv(a) - lv(b)).slice(0, 30)));
    }
    if ('sgaps' in d) {
      const st = sylStats(), focus = {};
      st.filter(x => !d.sgaps || x.s.code === d.sgaps).forEach(x => {
        const g = d.name ? [d.name] : x.gaps.map(t => t.name);
        if (g.length) focus[x.s.code] = g.slice(0, 25);
      });
      if (!Object.keys(focus).length) return toast('Every topic already has questions.');
      const n = Object.values(focus).reduce((a, b) => a + b.length, 0);
      await copyText(promptFor('mcq', App.prep.name, App.subjects, focus), `Prompt for ${plural(n, 'topic')} copied. Paste it into your AI chat, then add the reply with “Add questions or notes”.`);
    }
  } catch (err) { console.warn(err); toast('That did not work. Check your internet and try again.'); }
});
function sylLinkRow() {
  if (!hasSyllabus()) return `<button class="row topic syl-link" type="button" data-mode="syllabus"><span class="name"><b>Syllabus and coverage</b><small>Optional: add each subject's topics to see what you've covered</small></span><span class="n">${icon('next')}</span></button>`;
  const t = sylStats().flatMap(x => x.topics), done = t.filter(x => x.done).length;
  return `<button class="row topic syl-link" type="button" data-mode="syllabus"><span class="name"><b>Syllabus and coverage</b><small>${done} of ${t.length} topics studied · ${t.filter(x => x.state === 'strong').length} strong</small></span><span class="n">${sylRing(done / (t.length || 1), t.filter(x => x.state === 'strong').length / (t.length || 1), 40, 'coverage')}</span></button>`;
}
