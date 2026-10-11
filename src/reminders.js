/* =====================================================================
   PART 5 — REMINDERS
   Android app: notifications are scheduled on the phone itself for the next 14 days,
   and rescheduled whenever something changes (finishing or pausing today removes today's).
   Web: the browser gets a push token; the GitHub reminder job sends at your chosen hours.
   ===================================================================== */
const NATIVE = !!(window.Capacitor && typeof Capacitor.isNativePlatform === 'function' && Capacitor.isNativePlatform());
const LN = NATIVE && window.capacitorExports ? capacitorExports.registerPlugin('LocalNotifications') : null;
const DEFAULT_HOURS = [12, 16, 20, 22];

const Reminders = {
  timer: null,
  settings() { return Object.assign({ on: false, hours: DEFAULT_HOURS.slice() }, App.profile.remind || {}); },
  async save(fields) {
    const remind = Object.assign(this.settings(), fields, { tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata' });
    App.profile.remind = remind;
    await Store.setProfile({ remind });
    this.refreshSoon(0);
  },
  where() {
    if (NATIVE) return 'Notifications from this app on this phone. They stop for the day once you finish or pause.';
    if (!this.webSupported()) return 'This browser cannot show reminders. On your phone, use the Android app.';
    return 'Browser notifications on this device. On your phone, use the Android app instead.';
  },
  webSupported() { return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window && location.protocol === 'https:'; },

  // turn on: ask for permission and (web) register this browser
  async enable() {
    if (NATIVE) {
      const p = await LN.requestPermissions();
      if (p.display !== 'granted') throw new Error('denied');
      return;
    }
    if (!this.webSupported()) throw new Error('unsupported');
    const vapid = window.APP_CONFIG && APP_CONFIG.vapidKey;
    if (!vapid) throw new Error('novapid');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('denied');
    await loadScript('vendor/firebase-messaging-compat.js');
    const reg = await navigator.serviceWorker.register('sw.js');
    await navigator.serviceWorker.ready;
    const token = await firebase.messaging().getToken({ vapidKey: vapid, serviceWorkerRegistration: reg });
    if (!token) throw new Error('notoken');
    await Store.fs.doc(`${Store.base()}/devices/w${hashId(token)}`).set({ token, kind: 'web', ua: navigator.userAgent.slice(0, 120), updated: Date.now() });
  },

  async test() {
    if (NATIVE) {
      await LN.schedule({ notifications: [{ id: 999, title: 'Recurra', body: 'This is how your reminders will look.', schedule: { at: new Date(Date.now() + 3000), allowWhileIdle: true }, smallIcon: 'ic_stat_notify' }] });
      return 'Sent. It should appear in a few seconds.';
    }
    if (!this.webSupported() || Notification.permission !== 'granted') throw new Error('denied');
    const reg = await navigator.serviceWorker.register('sw.js');
    await navigator.serviceWorker.ready;
    await reg.showNotification('Recurra', { body: 'This is how your reminders will look.', icon: 'icons/icon-192.png', badge: 'icons/badge-96.png' });
    return 'Sent.';
  },

  refreshSoon(ms) {
    if (!NATIVE || !App.user) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.schedule().catch(e => console.warn('Reminders', e)), ms == null ? 2500 : ms);
  },

  // status of every prep for today and the forecast for tomorrow
  async statusItems() {
    const today = todayKey(), tomorrow = dayKey(addDays(Date.now(), 1));
    const todayItems = [], tomorrowItems = [];
    for (const p of App.preps) {
      let doc;
      if (p.id === App.prepId) doc = { d: Progress.days, next: Progress.meta.next, r: Progress.resetAt };
      else {
        try { const s = await Store.fs.doc(`${Store.prepPath(p.id)}/progress/_days`).get(); doc = s.exists ? s.data() : null; } catch (e) { doc = null; }
      }
      const st = prepStatus(doc, today, p.resetAt || 0);
      if (st) todayItems.push({ name: p.name, status: st });
      const nx = doc && doc.next;
      if (nx && nx.day === tomorrow && nx.count > 0) tomorrowItems.push({ name: p.name, status: { count: nx.count, mins: nx.mins, started: false } });
    }
    return { todayItems, tomorrowItems };
  },

  async schedule() {
    if (!LN) return;
    const pending = await LN.getPending();
    const old = (pending.notifications || []).filter(n => n.id >= 1000);
    if (old.length) await LN.cancel({ notifications: old.map(n => ({ id: n.id })) });
    const st = this.settings();
    if (!st.on || !st.hours.length) return;
    const perm = await LN.checkPermissions();
    if (perm.display !== 'granted') return;
    const { todayItems, tomorrowItems } = await this.statusItems();
    const todayText = reminderText(todayItems), tomorrowText = reminderText(tomorrowItems);
    if (!todayText && !tomorrowText) return;              // nothing to study anywhere yet
    const now = Date.now(), list = [];
    for (let d = 0; d < 14; d++) {
      for (const h of st.hours) {
        const at = new Date(addDays(now, d)); at.setHours(h, 0, 0, 0);
        if (at.getTime() <= now + 60000) continue;
        const body = d === 0 ? todayText : d === 1 && tomorrowText ? tomorrowText : 'Your daily review is ready whenever you are.';
        if (!body) continue;
        list.push({ id: 1000 + d * 24 + h, title: 'Recurra', body, schedule: { at, allowWhileIdle: true }, smallIcon: 'ic_stat_notify' });
      }
    }
    if (list.length) await LN.schedule({ notifications: list });
  },
};
