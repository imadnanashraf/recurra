/* =====================================================================
   PART 2 — SAVING AND SYNCING PROGRESS (one prep at a time)
   Saved on this device first (works offline), then uploaded to Firebase.
   Changes from your other devices arrive live. Newest record per question wins.
   Every saved document carries "r" = the prep's reset time, so data from
   before a reset is ignored everywhere, even if an old device uploads it.
   ===================================================================== */

const DEVICE = (() => {
  try {
    let d = localStorage.getItem('dp-device');
    if (!d) { d = 'd' + Math.random().toString(36).slice(2, 10); localStorage.setItem('dp-device', d); }
    return d;
  } catch (e) { return 't' + Math.random().toString(36).slice(2, 10); }
})();

const Progress = {
  key: null,
  map: {},              // question id -> state
  days: {},             // day key -> { by: {device: {n, c}}, n, c, done, paused, pt, left, mins, lt }
  meta: { spq: 0, next: null },
  resetAt: 0,
  cloud: null, unsub: null,
  dirty: new Set(), timer: null, chains: {},

  get(id) { return this.map[id]; },

  // switch to a prep's progress (key = storage name on this device)
  open(key, resetAt) {
    if (this.cloud) this.flush();
    this.detach();
    clearTimeout(this.timer); this.timer = null;
    this.key = key; this.dirty = new Set();
    this.map = {}; this.days = {}; this.meta = { spq: 0, next: null }; this.resetAt = 0;
    this.loadLocal();
    if ((resetAt || 0) > this.resetAt) this.wipeTo(resetAt);
  },
  close() { if (this.cloud) this.flush(); this.detach(); this.key = null; },
  // stop without uploading anything more (used when the prep is being deleted)
  async discard() {
    clearTimeout(this.timer); this.timer = null; this.dirty.clear();
    this.discarded = this.cloud;
    this.detach(); this.key = null;
    await Promise.all(Object.values(this.chains).map(c => c.catch(() => {})));
  },

  loadLocal() {
    try {
      const raw = JSON.parse(localStorage.getItem(this.key) || '{}') || {};
      this.map = raw.q || {}; this.days = raw.days || {};
      this.meta = Object.assign({ spq: 0, next: null }, raw.meta || {});
      this.resetAt = raw.r || 0;
    } catch (e) { /* keep empty */ }
  },
  saveLocal() {
    if (!this.key) return;
    try { localStorage.setItem(this.key, JSON.stringify({ q: this.map, days: this.days, meta: this.meta, r: this.resetAt })); } catch (e) { /* storage blocked: keep in memory */ }
  },
  wipeTo(r) {
    const spq = this.meta.spq;
    this.map = {}; this.days = {}; this.meta = { spq, next: null };
    this.resetAt = r; this.dirty.clear();
    this.saveLocal();
  },
  // Save on this device now, upload within about a second (several answers go up together)
  later(code) {
    this.saveLocal();
    if (code) this.dirty.add(code);
    if (!this.timer) this.timer = setTimeout(() => { this.timer = null; this.flush(); }, 1000);
  },

  record(q, result, retry, conf) {
    this.map[q.id] = applyResult(this.map[q.id], result, q.code, Date.now(), examMsFrom(App.prep && App.prep.examDate), retry, conf);
    if (!retry) {
      const d = this.today(), mine = d.by[DEVICE] || (d.by[DEVICE] = { n: 0, c: 0 });
      mine.n++; if (result === 'correct') mine.c++;
      sumDay(d);
      this.dirty.add('_days');
    }
    this.later(q.code);
  },

  // ----- the day log (calendar, streak, pause, reminders) -----
  today() {
    const k = dayKey(Date.now());
    if (!this.days[k]) this.days[k] = { by: {}, n: 0, c: 0 };
    else if (!this.days[k].by) this.days[k] = normDay(this.days[k]);
    return this.days[k];
  },
  setToday(fields) {
    const d = this.today();
    if (Object.keys(fields).every(k => d[k] === fields[k])) return;   // nothing changed: no write
    Object.assign(d, fields);
    if ('paused' in fields) d.pt = Date.now();
    if ('left' in fields) d.lt = Date.now();
    this.later('_days');
  },
  setNext(next) {
    if (JSON.stringify(this.meta.next) === JSON.stringify(next)) return;
    this.meta.next = next;
    this.later('_days');
  },
  pace(seconds) {
    const s = Math.min(180, Math.max(5, seconds));
    this.meta.spq = this.meta.spq ? Math.round(this.meta.spq * 0.85 + s * 0.15) : Math.round(s);
    this.saveLocal();
  },

  // ----- cloud: one document per subject { q: {...}, r } plus "_days" { d, spq, next, r } -----
  attach(cloud, onChange) {
    this.detach();
    this.cloud = cloud;
    this.unsub = cloud.subscribe(
      docs => { const changed = this.applyRemote(docs); if (changed) onChange(); },
      err => { console.warn('Sync stopped', err); setSync('offline'); }
    );
  },
  detach() {
    if (this.unsub) { try { this.unsub(); } catch (e) {} }
    this.unsub = null; this.cloud = null;
  },
  applyRemote(docs) {
    let changed = false;
    for (const d of docs) if ((d.data.r || 0) > this.resetAt) { this.wipeTo(d.data.r); changed = true; }   // reset on another device
    let remoteDays = {}, remoteNext = null, remoteSpq = 0;
    const remote = {};
    for (const { id, data } of docs) {
      if ((data.r || 0) < this.resetAt) continue;              // from before a reset: ignore
      if (id === '_days') { remoteDays = data.d || {}; remoteNext = data.next || null; remoteSpq = data.spq || 0; }
      else Object.assign(remote, data.q || {});
    }
    for (const [id, st] of Object.entries(remote)) {
      if (!st || typeof st.lv !== 'number') continue;
      const mine = this.map[id];
      if (!mine || (st.t || 0) > (mine.t || 0)) { this.map[id] = st; changed = true; }
    }
    for (const [id, st] of Object.entries(this.map)) {
      const r = remote[id];
      if (!r || (st.t || 0) > (r.t || 0)) this.dirty.add(st.k);
    }
    for (const [k, e] of Object.entries(remoteDays)) {
      const mine = this.days[k];
      if (!mine || dayAhead(e, mine)) { this.days[k] = mergeDay(mine, e); changed = true; }
    }
    for (const [k, e] of Object.entries(this.days)) if (dayAhead(e, remoteDays[k])) this.dirty.add('_days');
    if (!this.meta.spq && remoteSpq) this.meta.spq = remoteSpq;
    if (!this.meta.next && remoteNext) this.meta.next = remoteNext;
    this.saveLocal();
    if (this.dirty.size) this.later();
    return changed;
  },

  flush() {
    if (!this.cloud) return;
    const cloud = this.cloud, r = this.resetAt;
    for (const code of this.dirty) {
      if (!code) continue;
      this.chains[code] = (this.chains[code] || Promise.resolve()).then(() => {
        if (this.resetAt !== r || this.discarded === cloud) return;   // reset or prep deleted meanwhile: don't upload old data
        if (code === '_days') return cloud.save('_days', { d: this.days, spq: this.meta.spq || 0, next: this.meta.next || null, r, updated: Date.now() });
        const q = {};
        for (const [id, st] of Object.entries(this.map)) if (st.k === code) q[id] = st;
        return cloud.save(code, { q, r, updated: Date.now() });
      }).catch(e => {
        console.warn('Save failed', e);
        this.dirty.add(code);
      });
    }
    this.dirty.clear();
  },
};

/* =====================================================================
   PART 3 — FIREBASE (sign-in and the database)
   Layout: users/<you>                      { email, ntfy, activePrep }
           users/<you>/preps/<prep>          { name, examDate, marking, subjects, created, resetAt }
           .../preps/<prep>/bank/<CODE>__0   { code, q: { id: question } }   (150 questions per document)
           .../preps/<prep>/notes/<CODE>__0  { code, n: { id: note } }
           .../preps/<prep>/progress/<CODE>  { q: { id: state }, r }   and  _days
   ===================================================================== */
const CHUNK = 150;
function loadScript(src) {
  return new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = () => fail(new Error('Could not load ' + src));
    document.head.appendChild(s);
  });
}
async function firebaseStart(config) {
  for (const part of ['app', 'auth', 'firestore']) await loadScript(`vendor/firebase-${part}-compat.js`);   // bundled with the app, works offline
  firebase.initializeApp(config);
  const fs = firebase.firestore();
  fs.settings({ ignoreUndefinedProperties: true });
  try { await fs.enablePersistence({ synchronizeTabs: true }); } catch (e) { /* no offline cache in this browser */ }
  return { auth: firebase.auth(), fs };
}

const Store = {
  fs: null, uid: null,
  base() { return `users/${this.uid}`; },
  prepPath(pid) { return `${this.base()}/preps/${pid}`; },
  newId() { return this.fs.collection(`${this.base()}/preps`).doc().id; },
  watchPreps(cb, err) {
    return this.fs.collection(`${this.base()}/preps`).onSnapshot(
      s => cb(s.docs.map(d => ({ id: d.id, ...(d.data() || {}) })), !!(s.metadata && s.metadata.fromCache)), err);
  },
  watchCol(path, cb, err) {
    return this.fs.collection(path).onSnapshot(s => cb(s.docs.map(d => ({ id: d.id, data: d.data() || {} }))), err);
  },
  async getProfile() { const d = await this.fs.doc(this.base()).get(); return d.exists ? d.data() : {}; },
  setProfile(fields) { return this.fs.doc(this.base()).set(fields, { merge: true }); },
  setPrep(pid, fields) { return this.fs.doc(this.prepPath(pid)).set(fields, { merge: true }); },
  async ids(path) { const s = await this.fs.collection(path).get(); return s.docs.map(d => d.id); },
  // writes = [{ path, data }] where data null means delete
  async write(writes) {
    for (let i = 0; i < writes.length; i += 400) {
      const b = this.fs.batch();
      writes.slice(i, i + 400).forEach(w => w.data === null ? b.delete(this.fs.doc(w.path)) : b.set(this.fs.doc(w.path), w.data));
      await b.commit();
    }
  },
};

// The writes that store all items of some subjects, split into documents of CHUNK items
function chunkWrites(colPath, field, itemsByCode, existingIds) {
  const writes = [];
  for (const [code, items] of Object.entries(itemsByCode)) {
    const ids = Object.keys(items).sort(), keep = new Set();
    for (let i = 0, c = 0; i < ids.length; i += CHUNK, c++) {
      const docId = `${code}__${c}`, part = {};
      ids.slice(i, i + CHUNK).forEach(k => { part[k] = items[k]; });
      keep.add(docId);
      writes.push({ path: `${colPath}/${docId}`, data: { code, [field]: part } });
    }
    existingIds.filter(id => id.startsWith(code + '__') && !keep.has(id)).forEach(id => writes.push({ path: `${colPath}/${id}`, data: null }));
  }
  return writes;
}
