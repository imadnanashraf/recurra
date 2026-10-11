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
    const now = Date.now(); if (now - (this.last[name] || 0) < 250) return;   // never machine-gun the same sound
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
    }[name];
    if (S) try { this.tones(S); } catch (e) {}
  },
};
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
