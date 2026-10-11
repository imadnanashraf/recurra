// ---------- 1h. Importing syllabus, MCQs and notes ----------
// Everything a person pastes is checked here first. Bad items are listed and skipped, never saved.

const str = v => Array.isArray(v) ? v.map(x => String(x ?? '')).join(' ').trim() : (v == null ? '' : String(v)).trim();
const norm = s => str(s).toLowerCase().replace(/\s+/g, ' ');
const num = (v, d) => (v === '' || v == null || !Number.isFinite(Number(v))) ? d : Number(v);
const CODE_RE = /^[A-Za-z0-9]{1,12}$/;

// Short stable id from text, so the same question imported twice is recognised (not duplicated)
function hashId(s) {
  let h = 0x811c9dc5;
  for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}
const cleanId = s => str(s).replace(/[\s/.#$\[\]]+/g, '-').slice(0, 80);

// ---- syllabus ----
// topics of a subject: a list of short names (also accepted: "a; b; c", or units with their own topics)
function topicsOf(s) {
  let raw = Array.isArray(s.topics) ? s.topics : typeof s.topics === 'string' ? s.topics.split(/\n|;/) : [];
  if (Array.isArray(s.units)) s.units.forEach(u => { if (u && Array.isArray(u.topics)) raw = raw.concat(u.topics); else if (u) raw.push(u.name || u.title || u); });
  const out = [], seen = new Set();
  raw.forEach(t => {
    const v = str(t && typeof t === 'object' ? (t.name || t.title) : t).replace(/\s+/g, ' ').replace(/^[-•*\d.)\s]+/, '').slice(0, 160);
    const k = norm(v); if (v && !seen.has(k)) { seen.add(k); out.push(v); }
  });
  return out.slice(0, 200);
}
function cleanSyllabus(o) {
  const problems = [];
  const out = { name: str(o.name || o.exam || o.title), examDate: '', marking: null, subjects: [] };
  const d = str(o.examDate || o.exam_date || o.date);
  if (d) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) out.examDate = d;
    else problems.push(`Exam date "${d}" must look like 2026-12-30. It was left empty.`);
  }
  if (o.marking && typeof o.marking === 'object') {
    const m = o.marking;
    out.marking = { correct: num(m.correct, 1), wrong: num(m.wrong, 0), totalQuestions: num(m.totalQuestions ?? m.questions, 0), minutes: num(m.minutes ?? m.duration, 0) };
    if (out.marking.wrong > 0) out.marking.wrong = -out.marking.wrong;      // negative marking is stored as a negative number
  }
  (Array.isArray(o.subjects) ? o.subjects : []).forEach((s, i) => {
    if (!s || typeof s !== 'object') return problems.push(`Subject ${i + 1}: not in the right format`);
    const code = str(s.code).toUpperCase(), name = str(s.name);
    if (!CODE_RE.test(code)) return problems.push(`Subject ${i + 1} (${name || '?'}): "code" must be short letters or numbers, like CN`);
    if (!name) return problems.push(`Subject ${code}: missing "name"`);
    if (out.subjects.some(x => x.code === code)) return problems.push(`Subject code ${code} is used twice`);
    const topics = topicsOf(s);
    out.subjects.push({ code, name, part: str(s.part), ...(topics.length ? { topics } : {}) });
  });
  return { syllabus: out, problems };
}

// ---- MCQs ----
// subjects: the prep's subjects (to match codes or full names)
function cleanQuestions(list, subjects, today) {
  const problems = [], questions = [], newSubjects = [];
  const known = new Set(subjects.map(s => s.code));
  const byName = new Map(subjects.map(s => [norm(s.name), s.code]));
  const seen = new Set();
  (Array.isArray(list) ? list : []).forEach((q, i) => {
    const label = `Question ${i + 1}`;
    if (!q || typeof q !== 'object') return problems.push(`${label}: not in the right format`);
    const rawSub = str(q.subject ?? q.subjectCode ?? q.code);
    const code = byName.get(norm(rawSub)) || rawSub.toUpperCase();
    const question = str(q.question);
    const options = (Array.isArray(q.options) ? q.options : []).map(str).filter(Boolean);
    const ansRaw = str(q.answer ?? q.correctAnswer ?? q.correct);
    const answer = options.find(o => o === ansRaw) ?? options.find(o => norm(o) === norm(ansRaw));
    let p = null;
    if (!question) p = 'has no "question"';
    else if (!CODE_RE.test(code)) p = `"subject" must be a subject code like ${subjects[0] ? subjects[0].code : 'CN'}`;
    else if (options.length < 2) p = 'needs at least 2 "options"';
    else if (new Set(options.map(norm)).size !== options.length) p = 'has two options that are the same';
    else if (!ansRaw) p = 'has no "answer"';
    else if (answer === undefined) p = /^[A-Fa-f]$/.test(ansRaw)
      ? `"answer" is the letter ${ansRaw}; it must be the option text itself`
      : `"answer" (${ansRaw}) is not exactly one of the options`;
    const short = question.length > 60 ? question.slice(0, 57) + '…' : question;
    if (p) return problems.push(`${label}${short ? ` "${short}"` : ''}: ${p}`);
    const id = cleanId(q.id) || `${code}-${hashId(norm(question))}`;
    if (seen.has(id)) return problems.push(`${label} "${short}": appears twice in this file`);
    seen.add(id);
    if (!known.has(code) && !newSubjects.includes(code)) newSubjects.push(code);
    const item = {
      id, subject: code, topic: str(q.topic) || 'General', subtopic: str(q.subtopic),
      type: str(q.type), difficulty: str(q.difficulty), question, options, answer,
      explanation: str(q.explanation), hint: str(q.hint ?? q.memoryHint ?? q['memory hint']),
      concept: str(q.concept), trap: str(q.trap ?? q.examTrap), added: str(q.added) || today,
    };
    if (q.retired === true || norm(q.status) === 'retired') item.retired = true;
    questions.push(item);
  });
  return { questions, problems, newSubjects };
}

// ---- revision notes ----
const NOTE_FIELDS = ['keyDifference', 'points', 'memoryTrick', 'examTrap', 'related'];
function cleanNotes(list, subjects, today) {
  const problems = [], notes = [], newSubjects = [];
  const known = new Set(subjects.map(s => s.code));
  const byName = new Map(subjects.map(s => [norm(s.name), s.code]));
  const seen = new Set();
  (Array.isArray(list) ? list : []).forEach((n, i) => {
    const label = `Note ${i + 1}`;
    if (!n || typeof n !== 'object') return problems.push(`${label}: not in the right format`);
    const rawSub = str(n.subject ?? n.subjectCode ?? n.code);
    const code = byName.get(norm(rawSub)) || rawSub.toUpperCase();
    const title = str(n.title);
    if (!title) return problems.push(`${label}: has no "title"`);
    if (!CODE_RE.test(code)) return problems.push(`${label} "${title}": "subject" must be a subject code`);
    const id = cleanId(n.id) || `${code}-n${hashId(norm(title))}`;
    if (seen.has(id)) return problems.push(`${label} "${title}": appears twice in this file`);
    seen.add(id);
    if (!known.has(code) && !newSubjects.includes(code)) newSubjects.push(code);
    const item = { id, subject: code, topic: str(n.topic), title, added: str(n.added) || today };
    for (const [k, v] of Object.entries(n)) {
      if (['id', 'subject', 'subjectCode', 'code', 'topic', 'title', 'added', 'type'].includes(k)) continue;
      if (Array.isArray(v)) { const arr = v.map(str).filter(Boolean); if (arr.length) item[k] = arr; }
      else if (str(v)) item[k] = str(v);
    }
    notes.push(item);
  });
  return { notes, problems, newSubjects };
}

// ---- the older Markdown format (still accepted) ----
function mdToQuestions(text) {
  return parseBlocks(text, 'Q').map(b => ({
    id: b.id, subject: asText(b.f.subject), topic: asText(b.f.topic), subtopic: asText(b.f.subtopic),
    type: asText(b.f.type), difficulty: asText(b.f.difficulty), question: asText(b.f.question),
    options: Array.isArray(b.f.options) ? b.f.options : [], answer: asText(b.f.answer),
    explanation: asText(b.f.explanation), hint: asText(b.f['memory hint']), concept: asText(b.f.concept),
    trap: asText(b.f.trap), added: asText(b.f.added), status: asText(b.f.status),
  }));
}
function mdToNotes(text) {
  const map = { 'key difference': 'keyDifference', 'memory trick': 'memoryTrick', 'exam trap': 'examTrap', 'related questions': 'related' };
  return parseBlocks(text, 'N').map(b => {
    const o = { id: b.id };
    for (const [k, v] of Object.entries(b.f)) {
      const key = map[k] || k.replace(/\s+(\w)/g, (_, c) => c.toUpperCase());
      o[key] = key === 'related' && !Array.isArray(v) ? String(v).split(/\s*,\s*/) : v;
    }
    return o;
  });
}

// Reads pasted text or a file. Returns { kind, data } or { error }.
// kind: 'syllabus' | 'mcq' | 'notes' | 'prep'
function parseImport(text) {
  let t = String(text || '').trim();
  if (!t) return { error: 'Nothing pasted yet.' };
  const fence = t.match(/```(?:json|JSON|md|markdown)?\s*\n([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  if (/^##\s+Q:/m.test(t)) return { kind: 'mcq', data: { questions: mdToQuestions(t) } };
  if (/^##\s+N:/m.test(t)) return { kind: 'notes', data: { notes: mdToNotes(t) } };
  if (!/^[\[{]/.test(t)) {
    const i = t.search(/[\[{]/);
    if (i < 0) return { error: 'This is not JSON. It should start with { and end with }.' };
    t = t.slice(i);
  }
  let o;
  try { o = JSON.parse(t); }
  catch (e) {
    return { error: `The JSON has a mistake (${e.message}). Ask the AI to "return only valid JSON in one code block" and paste again.` };
  }
  if (Array.isArray(o)) {
    const first = o.find(x => x && typeof x === 'object') || {};
    if ('options' in first || 'answer' in first) return { kind: 'mcq', data: { questions: o } };
    if ('title' in first) return { kind: 'notes', data: { notes: o } };
    if ('code' in first) return { kind: 'syllabus', data: { subjects: o } };
    return { error: 'Could not tell what this list contains. Use one of the sample formats.' };
  }
  if (!o || typeof o !== 'object') return { error: 'This JSON is not in a format the app knows.' };
  const type = norm(o.type);
  if (['prep', 'syllabus', 'mcq', 'notes'].includes(type)) return { kind: type, data: o };
  if (Array.isArray(o.questions) && Array.isArray(o.subjects)) return { kind: 'prep', data: o };
  if (Array.isArray(o.questions)) return { kind: 'mcq', data: o };
  if (Array.isArray(o.notes)) return { kind: 'notes', data: o };
  if (Array.isArray(o.subjects)) return { kind: 'syllabus', data: o };
  return { error: 'This JSON is not in a format the app knows. Use one of the sample formats.' };
}

// ---- samples and AI prompts shown on the import screen ----
const SAMPLES = {
  syllabus: {
    type: 'syllabus', name: 'State Engineering Exam', examDate: '2027-03-15',
    subjects: [
      { code: 'CN', name: 'Computer Networks', part: 'B', topics: ['OSI and TCP/IP models', 'IP addressing and subnetting', 'Routing protocols'] },
      { code: 'DE', name: 'Digital Electronics', part: 'B', topics: ['Number systems', 'Logic gates', 'Flip-flops'] },
    ],
  },
  mcq: {
    type: 'mcq',
    questions: [{
      subject: 'CN', topic: 'Transport Layer', subtopic: 'TCP vs UDP', type: 'Confusion', difficulty: 'Easy',
      question: 'Which protocol is connection-oriented?',
      options: ['TCP', 'UDP', 'IP', 'ICMP'], answer: 'TCP',
      explanation: 'TCP sets up a connection with a three-way handshake before sending data. UDP, IP and ICMP are connectionless.',
      hint: 'TCP = Telephone call (connect first). UDP = posting a letter.',
      concept: 'Connection-oriented vs connectionless',
      trap: 'IP is part of TCP/IP, but IP itself is connectionless.',
    }],
  },
  notes: {
    type: 'notes',
    notes: [{
      subject: 'CN', topic: 'Transport Layer', title: 'TCP vs UDP',
      keyDifference: 'TCP is connection-oriented and reliable; UDP is connectionless and fast.',
      points: ['TCP: handshake, acknowledgements, resends lost data, keeps order. Header 20–60 bytes.', 'UDP: no handshake, no acknowledgements. Header 8 bytes.', 'TCP for web, email, file transfer. UDP for DNS, live video, games.'],
      memoryTrick: 'TCP = Telephone call. UDP = posting letters.',
      examTrap: 'DNS normally uses UDP port 53, but TCP 53 for zone transfers.',
    }],
  },
};

// focus = { CODE: [topics] }: only these subjects and topics (used for "fill the gaps")
function subjectLines(subjects, focus) {
  const list = focus ? subjects.filter(s => focus[s.code]) : subjects;
  return list.length
    ? list.map(s => { const tp = focus ? focus[s.code] : s.topics || []; return `   ${s.code} = ${s.name}${tp.length ? `\n      topics: ${tp.join('; ')}` : ''}`; }).join('\n')
    : '   (no subjects yet: invent a short code in capital letters, e.g. NET for Networking)';
}
const hasTopics = (subjects, focus) => !!focus || subjects.some(s => (s.topics || []).length);

function promptFor(kind, prepName, subjects, focus) {
  const json = JSON.stringify(SAMPLES[kind], null, 2);
  if (kind === 'syllabus') return `${subjects && subjects.length ? examLine(prepName) + '\n' : ''}Convert the exam syllabus I attach (PDF, photo or text) into JSON for my revision app.

Reply with ONLY one JSON code block in exactly this format:
${json}

Rules:
1. "code": a short, unique code of 2 to 5 capital letters for each subject.
2. "part": the section name if the syllabus has parts, otherwise "".
3. "examDate": the exam date as YYYY-MM-DD, or "" if not known.
4. Copy subject names as they are written in the syllabus.
5. "topics": every topic listed under that subject, one short item each, copied as written. Split long comma-separated lists into separate topics. Use [] if none are listed.
${subjects && subjects.length ? `6. I already have these subjects. When the syllabus has one of them, use exactly this code and name, so nothing is added twice:
${subjects.map(x => `   ${x.code} = ${x.name}`).join('\n')}
   Make new codes only for subjects that are not in this list.
` : ''}
My syllabus:
[attach the PDF or photo, or paste the text here]`;

  if (kind === 'mcq') return `${examLine(prepName)} Turn the study material at the end of this message into exam-style multiple-choice questions for my revision app.

Reply with ONLY one JSON code block in exactly this format:
${json}

Rules:
1. "subject" must be one of these codes:
${subjectLines(subjects, focus)}${hasTopics(subjects, focus) ? `\n   For "topic", copy one of the topics listed under that subject when one fits.` : ''}${focus ? `\n   Cover ONLY the topics listed above, about 3 questions per topic.` : ''}
2. Give exactly 4 options. "answer" must be copied exactly from "options" (the option text, never a letter like "A").
3. Mix the question types and write the type in "type": Factual, Conceptual, Application, Comparison, Confusion, Trap.
4. "difficulty": Easy, Medium or Hard.
5. "explanation": 1 to 3 short sentences in simple English: why the answer is right and why the most tempting wrong option is wrong.
6. "hint": a short memory trick. "trap": the mistake examiners try to catch. "concept": the idea being tested.
7. Write in simple English even if my material is in Hinglish.
8. Use only facts from my material or standard textbook facts. If my material looks wrong, use the correct fact and mention it in the explanation.
9. Make 15 to 25 questions that cover the whole material. Do not add an "id".

${focus ? `My material (optional; if I give none, use standard textbook knowledge of these topics):` : 'My material:'}
[paste your notes here, or attach the PDF or photo]`;

  return `${examLine(prepName)} From the study material at the end of this message, make short revision notes for my app. Focus on things students confuse and on exam traps.

Reply with ONLY one JSON code block in exactly this format:
${json}

Rules:
1. "subject" must be one of these codes:
${subjectLines(subjects, focus)}${hasTopics(subjects, focus) ? `\n   For "topic", copy one of the topics listed under that subject when one fits.` : ''}${focus ? `\n   Cover ONLY the topics listed above.` : ''}
2. One note per important idea, or per pair of concepts that are easy to confuse.
3. "keyDifference": one sentence for comparisons; use "" if the note is not a comparison.
4. "points": 3 to 6 short points. "memoryTrick" and "examTrap": one short sentence each.
5. Write in simple English even if my material is in Hinglish. Keep it short and to the point.
6. Make 5 to 12 notes. Do not add an "id".

${focus ? `My material (optional; if I give none, use standard textbook knowledge of these topics):` : 'My material:'}
[paste your notes here, or attach the PDF or photo]`;
}

// The AI prompt for MCQs or notes of ONE subject. The AI never writes a subject: the app adds it.
// allowed = the topics the AI may use (the subject's syllabus topics), pinned = one fixed topic, focus = topics to cover
// "State Engineering Exam" (exam on 15 Mar 2027) — prep may be a name or the prep itself
function examLine(prep) {
  const name = typeof prep === 'string' ? prep : (prep && prep.name) || 'my exam';
  const d = prep && typeof prep === 'object' && /^\d{4}-\d{2}-\d{2}$/.test(prep.examDate || '') ? prep.examDate : '';
  const when = d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  return `I am preparing for the exam "${name}"${when ? ` (exam on ${when})` : ''}.`;
}
const subjectInfo = s => s.part ? `Part ${s.part}` : '';
function promptForSubject(kind, prep, subject, allowed, pinned, focus) {
  const strip = o => { const c = { ...o }; delete c.subject; return c; };
  const sample = kind === 'mcq' ? { type: 'mcq', questions: SAMPLES.mcq.questions.map(strip) } : { type: 'notes', notes: SAMPLES.notes.notes.map(strip) };
  if (pinned) (kind === 'mcq' ? sample.questions : sample.notes).forEach(x => { x.topic = pinned; });
  const json = JSON.stringify(sample, null, 2);
  const topicRule = pinned ? `"topic": always exactly "${pinned}". Use only material about ${pinned}.`
    : allowed && allowed.length ? `"topic": copy exactly one of these topics of ${subject.name}:\n   ${allowed.join('; ')}\n   If an item fits none of them, write "Others" as the topic and suggest a short new topic name (2 to 5 words) in "subtopic".`
    : `"topic": a short topic name of 2 to 5 words.`;
  const cover = focus && focus.length && !pinned ? `\nCover ONLY these topics: ${focus.join('; ')}.` : '';
  const material = focus && focus.length || pinned ? 'My material (optional; if I give none, use standard textbook knowledge of these topics):' : 'My material:';
  const info = subjectInfo(subject), subjLine = `Subject: ${subject.name}${info ? ` (${info})` : ''}.`;
  if (kind === 'mcq') return `${examLine(prep)}
${subjLine}
Turn the study material at the end of this message into multiple-choice questions at the level of this exam, for my revision app.
Every question is for ONE subject: ${subject.name}. Do not add a "subject" field.${cover}

Reply with ONLY one JSON code block in exactly this format:
${json}

Rules:
1. ${topicRule}
2. Give exactly 4 options. "answer" must be copied exactly from "options" (the option text, never a letter like "A").
3. Mix the question types and write the type in "type": Factual, Conceptual, Application, Comparison, Confusion, Trap.
4. "difficulty": Easy, Medium or Hard.
5. "explanation": 1 to 3 short sentences in simple English: why the answer is right and why the most tempting wrong option is wrong.
6. "hint": a short memory trick. "trap": the mistake examiners try to catch. "concept": the idea being tested.
7. Write in simple English even if my material is in Hinglish.
8. Use only facts from my material or standard textbook facts. If my material looks wrong, use the correct fact and mention it in the explanation.
9. Make 15 to 25 questions. Do not add an "id".

${material}
[paste your notes here, or attach the PDF or photo]`;
  return `${examLine(prep)}
${subjLine}
From the study material at the end of this message, make short revision notes for my app. Focus on things students confuse and on exam traps.
Every note is for ONE subject: ${subject.name}. Do not add a "subject" field.${cover}

Reply with ONLY one JSON code block in exactly this format:
${json}

Rules:
1. ${topicRule}
2. One note per important idea, or per pair of concepts that are easy to confuse.
3. "keyDifference": one sentence for comparisons; use "" if the note is not a comparison.
4. "points": 3 to 6 short points. "memoryTrick" and "examTrap": one short sentence each.
5. Write in simple English even if my material is in Hinglish. Keep it short and to the point.
6. Make 5 to 12 notes. Do not add an "id".

${material}
[paste your notes here, or attach the PDF or photo]`;
}

// ---- merging what you already have with what comes in ----
// The same question = same subject + same question text (or the same id). The same note = same subject + same title.
// mode 'paste' (your own file): the new version replaces yours (your progress stays).
// mode 'share' (from a friend): yours is kept; only empty fields are filled, and note points are combined.
//   takeTheirs: where both have a different value, use theirs. Reworded questions with the same answer are "similar".
const isEmptyVal = v => v === undefined || v === null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length);
const SKIP_MERGE = new Set(['id', 'subject', 'added', 'retired']);
const qWords = s => new Set(norm(s).replace(/[^a-z0-9 ]/g, ' ').split(' ').filter(w => w.length > 2));
function similarQuestion(a, b) {
  if (norm(a.answer) !== norm(b.answer)) return false;
  const A = qWords(a.question), B = qWords(b.question);
  if (!A.size || !B.size) return false;
  let n = 0; A.forEach(w => { if (B.has(w)) n++; });
  return n / Math.max(A.size, B.size) >= 0.6;
}
function mergePlan(kind, items, existing, mode, takeTheirs) {
  const isQ = kind === 'mcq', key = o => `${o.subject}|${norm(isQ ? o.question : o.title)}`;
  const byId = new Map(existing.map(o => [o.id, o])), byKey = new Map(existing.map(o => [key(o), o]));
  const out = { write: [], fresh: 0, updated: 0, filled: 0, conflicts: 0, same: 0, similar: [], conflictList: [] };
  for (const it of items) {
    const old = byId.get(it.id) || byKey.get(key(it));
    if (!old) {
      const like = mode === 'share' && isQ ? existing.find(o => o.subject === it.subject && similarQuestion(o, it)) : null;
      if (like) { out.similar.push({ item: it, like }); continue; }
      out.fresh++; out.write.push(it); continue;
    }
    if (mode !== 'share') {
      const nu = { ...it, id: old.id, added: old.added || it.added };
      if (JSON.stringify({ ...nu, added: '' }) === JSON.stringify({ ...old, added: '' })) out.same++;
      else { out.updated++; out.write.push(nu); }
      continue;
    }
    const nu = { ...old }; let filled = false, conflict = false;
    const keys = [...new Set([...Object.keys(it), ...Object.keys(old)])].filter(k => !SKIP_MERGE.has(k) && k !== (isQ ? 'question' : 'title'));
    for (const k of keys) {
      const a = old[k], b = it[k];
      if (isEmptyVal(b) || JSON.stringify(a) === JSON.stringify(b)) continue;
      if (isEmptyVal(a)) { nu[k] = b; filled = true; continue; }
      if (k === 'topic' || k === 'subtopic') continue;                       // keep your own grouping
      if (isQ && (k === 'options' || k === 'answer')) {                        // options and answer go together
        if (!conflict) out.conflictList.push({ item: it, old, field: 'answer' });
        conflict = true; if (takeTheirs) { nu.options = it.options; nu.answer = it.answer; }
        continue;
      }
      if (!isQ && Array.isArray(a) && Array.isArray(b)) {                      // note points: combine, no duplicates
        const have = new Set(a.map(norm)), add = b.filter(x => !have.has(norm(x)));
        if (add.length) { nu[k] = [...a, ...add]; filled = true; }
        continue;
      }
      if (!conflict) out.conflictList.push({ item: it, old, field: k });
      conflict = true; if (takeTheirs) nu[k] = b;
    }
    if (conflict) out.conflicts++;
    if (filled) out.filled++;
    if (filled || (conflict && takeTheirs)) out.write.push(nu); else if (!conflict) out.same++;
  }
  return out;
}
