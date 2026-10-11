/* =====================================================================
   PUSH: notifications when the app is fully closed.
   The app asks a tiny free "push sender" (a Cloudflare Worker, see
   push/README.md) to notify a friend. The sender checks who you are (your
   Firebase sign-in), that the two of you are friends, and then sends the
   notification to that friend's phone or browser.
   Until the "Push sender" job has run (it saves the address in public/config), sending does nothing:
   pop-ups, sounds and in-app badges still work as before.
   ===================================================================== */
const Push = {
  remote: '',
  url() { return this.remote || (window.APP_CONFIG && APP_CONFIG.pushUrl) || ''; },
  // the sender's address is published by the "Push sender" GitHub job in public/config
  // looked up again every 10 minutes, so phones that were already open when notifications were switched on pick it up too
  loadedAt: 0,
  async load() {
    if (this.remote && Date.now() - this.loadedAt < 10 * 60e3) return this.remote;
    try { const d = await Store.fs.doc('public/config').get(); if (d.exists) { this.remote = (d.data() || {}).pushUrl || ''; this.loadedAt = Date.now(); } } catch (e) {}
    return this.url();
  },
  // this phone or browser can receive pushes: save its token (Android app, or browser with notifications allowed)
  async register() {
    if (!App.authUser || App.viewAs) return;
    this.load();                                     // (the sender's address is only needed to send)
    try {
      if (NATIVE) {
        if (!(window.APP_CONFIG && APP_CONFIG.androidPush)) return;         // this app was built without Firebase for Android
        const PN = window.capacitorExports && capacitorExports.registerPlugin('PushNotifications');
        if (!PN) return;
        try { await PN.createChannel({ id: 'messages', name: 'Messages', description: 'Messages and friend requests', importance: 4, visibility: 1 }); await PN.createChannel({ id: 'tests', name: 'Live tests', description: 'Invites to live tests', importance: 5, visibility: 1 }); await PN.createChannel({ id: 'calls_ring', name: 'Calls', description: 'Voice and video calls from friends (rings)', importance: 5, visibility: 1, vibration: true, sound: 'ring' }); try { await PN.deleteChannel({ id: 'calls' }); } catch (e) {} } catch (e) {}
        const perm = await PN.requestPermissions(); if (perm.receive !== 'granted') return;
        PN.addListener('registration', t => { if (t && t.value) Store.fs.doc(`users/${meUid()}/devices/a${hashId(t.value)}`).set({ token: t.value, kind: 'android', updated: Date.now() }).catch(() => {}); });
        PN.addListener('pushNotificationActionPerformed', a => { const w = a && a.notification && a.notification.data && a.notification.data.where; if (w) Route.set(w); });
        await PN.register();
        return;
      }
      const vapid = window.APP_CONFIG && APP_CONFIG.vapidKey;
      if (!vapid || !('PushManager' in window) || Notification.permission !== 'granted') return;
      await loadScript('vendor/firebase-messaging-compat.js');
      const reg = await navigator.serviceWorker.register('sw.js'); await navigator.serviceWorker.ready;
      const token = await firebase.messaging().getToken({ vapidKey: vapid, serviceWorkerRegistration: reg });
      if (token) await Store.fs.doc(`users/${meUid()}/devices/w${hashId(token)}`).set({ token, kind: 'web', ua: navigator.userAgent.slice(0, 120), updated: Date.now() });
    } catch (e) { console.warn('push register', e); }
  },
  // ask the sender to notify one person; never waits, never fails loudly
  async send(to, type, { title, body, where, tag, room } = {}) {
    if (!to || !App.authUser) return;
    const url = this.url() || await this.load(); if (!url) return;
    try {
      const token = await App.fb.auth.currentUser.getIdToken();
      fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
        body: JSON.stringify({ to, type, title: String(title || 'Recurra').slice(0, 60), body: String(body || '').slice(0, 160), where: where || '', tag: tag || type, room: room || '' }) }).catch(() => {});
    } catch (e) {}
  },
};
