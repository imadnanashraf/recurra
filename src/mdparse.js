// ---------- 1a. Markdown block parser ----------
// Turns text like
//   ## Q: CN-TL-001
//   - Question: ...
//   - Options:
//     - TCP
// into { id: 'CN-TL-001', line: 12, f: { question: '...', options: ['TCP', ...] } }
// `marker` is 'Q' for MCQ files and 'N' for note files.
function parseBlocks(text, marker) {
  const blocks = [];
  let cur = null, field = null;
  const headRe = new RegExp('^##\\s+' + marker + ':\\s*(\\S+)');
  text.split(/\r?\n/).forEach((raw, idx) => {
    const line = raw.replace(/\s+$/, '');
    const head = line.match(headRe);
    if (head) { cur = { id: head[1].trim(), line: idx + 1, f: {} }; blocks.push(cur); field = null; return; }
    if (!cur) return;
    if (/^#{1,6}\s/.test(line)) { cur = null; field = null; return; }   // any other heading ends the block
    if (!line.trim()) return;                                            // blank line: ignore
    if (/^-{3,}$/.test(line.trim())) { field = null; return; }            // --- separator
    const kv = line.match(/^[-*]\s+([A-Za-z][A-Za-z /]*?)\s*:\s*(.*)$/);
    if (kv) { field = kv[1].toLowerCase(); cur.f[field] = kv[2].trim() || []; return; }
    const item = line.match(/^\s+[-*]\s+(.*)$/);
    if (item && field) {
      if (!Array.isArray(cur.f[field])) cur.f[field] = cur.f[field] ? [cur.f[field]] : [];
      cur.f[field].push(item[1].trim());
      return;
    }
    if (field) {                                   // continuation of a long value
      const v = cur.f[field], extra = line.trim();
      if (Array.isArray(v)) { if (v.length) v[v.length - 1] += ' ' + extra; }
      else cur.f[field] = (v + ' ' + extra).trim();
    }
  });
  return blocks;
}

const asText = v => Array.isArray(v) ? v.join(' ') : (v || '');

