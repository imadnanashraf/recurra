/* =====================================================================
   SOUNDS: small, soft sounds made in the browser (no audio files).
   Quiet by default, never on loop, and off with one switch in Settings.
   ===================================================================== */
const Sound = {
  ctx: null, last: {},
  on() { try { return (typeof prefs === 'function' ? prefs().sounds : true) !== false; } catch (e) { return true; } },
  ready() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { this.ctx = new AC(); } catch (e) { return null; }
    return this.ctx;
  },
  // notes: [frequency, start (s), length (s), type, volume]
  tones(notes, gap = 0) {
    const c = this.ready(); if (!c) return;
    if (c.state === 'suspended') c.resume().catch(() => {});
    const t0 = c.currentTime + 0.01 + gap;
    for (const [f, s, d, type = 'sine', v = 0.12, f2] of notes) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t0 + s);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + s + d);
      g.gain.setValueAtTime(0.0001, t0 + s);
      g.gain.exponentialRampToValueAtTime(v, t0 + s + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + s + d);
      o.connect(g); g.connect(c.destination); o.start(t0 + s); o.stop(t0 + s + d + 0.05);
    }
  },
  play(name) {
    if (!this.on() || document.hidden) return;
    const now = Date.now(); if (now - (this.last[name] || 0) < (name === 'key' ? 60 : 250)) return;   // never machine-gun the same sound
    this.last[name] = now;
    const S = {
      send: [[520, 0, .09, 'sine', .07, 880]],                                   // a soft "whoosh" up
      receive: [[660, 0, .1, 'sine', .09], [880, .09, .14, 'sine', .08]],          // two gentle notes
      pop: [[740, 0, .07, 'triangle', .06]],                                       // a tiny pop (in an open chat)
      request: [[523, 0, .12, 'sine', .08], [659, .1, .12, 'sine', .08], [784, .2, .18, 'sine', .08]],
      invite: [[784, 0, .12, 'triangle', .1], [988, .12, .12, 'triangle', .1], [1319, .24, .25, 'triangle', .09]],
      join: [[600, 0, .08, 'sine', .08], [900, .07, .12, 'sine', .08]],
      tick: [[880, 0, .06, 'square', .035]],
      go: [[523, 0, .1, 'square', .05], [784, .1, .1, 'square', .05], [1047, .2, .3, 'square', .06]],
      right: [[880, 0, .08, 'sine', .09], [1320, .07, .14, 'sine', .08]],
      wrong: [[220, 0, .16, 'triangle', .08, 160]],
      streak: [[988, 0, .06, 'triangle', .07], [1175, .06, .06, 'triangle', .07], [1568, .12, .14, 'triangle', .07]],
      finish: [[659, 0, .12, 'triangle', .09], [784, .12, .12, 'triangle', .09], [1047, .24, .3, 'triangle', .09]],
      win: [[523, 0, .12, 'triangle', .1], [659, .12, .12, 'triangle', .1], [784, .24, .12, 'triangle', .1], [1047, .36, .45, 'triangle', .11], [784, .36, .45, 'sine', .05]],
      nudge: [[440, 0, .1, 'sine', .06], [554, .1, .12, 'sine', .06]],
      // practice: quieter than the live test, so feedback helps without becoming a game
      softRight: [[784, 0, .07, 'sine', .055], [1175, .06, .12, 'sine', .045]],
      softWrong: [[330, 0, .14, 'sine', .05, 262]],
      tap: [[1200, 0, .03, 'sine', .025]],
      key: [[1800 + Math.random() * 500, 0, .018, 'triangle', .012]],            // a whisper of a key tap while you type
      typingIn: [[880, 0, .05, 'sine', .03], [990, .07, .05, 'sine', .03], [1100, .14, .05, 'sine', .03]],   // they started typing
      breath: [[392, 0, .5, 'sine', .04], [523, .25, .7, 'sine', .035]],         // the break: calm
      done: [[523, 0, .1, 'sine', .07], [659, .1, .1, 'sine', .07], [784, .2, .12, 'sine', .07], [1047, .32, .35, 'sine', .07]],
      check: [[988, 0, .05, 'sine', .05], [1319, .05, .09, 'sine', .045]],
    }[name];
    if (S) try { this.tones(S); } catch (e) {}
  },
};

/* ---------- focus sound: a soft background (rain or brown noise) while you practise. Off by default. ---------- */
const Focus = {
  node: null, gain: null, kind: null,
  pref() { try { return (typeof prefs === 'function' && prefs().focusSound) || 'off'; } catch (e) { return 'off'; } },
  start() {
    const kind = this.pref(); if (kind === 'off' || document.hidden) return this.stop();
    if (this.node && this.kind === kind) return;
    this.stop();
    const c = Sound.ready(); if (!c) return;
    if (c.state === 'suspended') c.resume().catch(() => {});
    const len = c.sampleRate * 4, buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {                       // brown noise: soft and deep, no rhythm or melody to distract
      const d = buf.getChannelData(ch); let last = 0;
      for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; }
    }
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = kind === 'rain' ? 'highpass' : 'lowpass'; f.frequency.value = kind === 'rain' ? 400 : 700;
    const g = c.createGain(); g.gain.value = 0.0001; g.gain.exponentialRampToValueAtTime(kind === 'rain' ? 0.05 : 0.09, c.currentTime + 1.5);
    src.connect(f); f.connect(g); g.connect(c.destination); src.start();
    if (kind === 'rain') {                                   // a gentle drop now and then
      this.drops = setInterval(() => { if (!document.hidden) Sound.tones([[1400 + Math.random() * 900, 0, .025, 'sine', .006 + Math.random() * .006]]); }, 180);
    }
    this.node = src; this.gain = g; this.kind = kind;
  },
  stop() {
    clearInterval(this.drops);
    if (this.node) { try { const c = Sound.ctx; this.gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.6); const n = this.node; setTimeout(() => { try { n.stop(); } catch (e) {} }, 700); } catch (e) {} }
    this.node = null; this.kind = null;
  },
};
document.addEventListener('visibilitychange', () => { if (document.hidden) Focus.stop(); else if (Focus.wanted) Focus.start(); });
// browsers only allow sound after the first tap or key press
['pointerdown', 'keydown'].forEach(ev => addEventListener(ev, () => { const c = Sound.ready(); if (c && c.state === 'suspended') c.resume().catch(() => {}); }, { once: true, passive: true }));

/* =====================================================================
   NOTIFY: a phone/computer notification when the app is open but in the
   background (another tab, another app). When the app is fully closed,
   notifications come from the push sender instead (see push/README.md).
   ===================================================================== */
const Notify = {
  n: 1000,
  can() { return NATIVE ? !!LN : ('Notification' in window && Notification.permission === 'granted' && 'serviceWorker' in navigator); },
  async ask() {
    try {
      if (NATIVE) { const p = await LN.requestPermissions(); return p.display === 'granted'; }
      if (!('Notification' in window)) return false;
      return (await Notification.requestPermission()) === 'granted';
    } catch (e) { return false; }
  },
  // where: '#chat=<id>' / '#tests' / '#room=<id>' (opens there when tapped)
  async show(title, body, tag, where) {
    if (!document.hidden || !this.can()) return;
    try {
      if (NATIVE) { await LN.schedule({ notifications: [{ id: ++this.n, title, body, schedule: { at: new Date(Date.now() + 300), allowWhileIdle: true }, smallIcon: 'ic_stat_notify', extra: { where } }] }); return; }
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) await reg.showNotification(title, { body, tag, renotify: true, icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', data: { url: './' + (where || '') } });
    } catch (e) { console.warn('notify', e); }
  },
};
