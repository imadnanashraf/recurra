/* =====================================================================
   CALLS: one-to-one voice and video calls with a friend.
   The sound and picture go straight from one phone to the other (WebRTC,
   free). Firestore is only used to "ring" and to exchange the connection
   details (calls/{id} and calls/{id}/ice). No relay server: if the two
   phones cannot reach each other, the call ends by itself with a clear
   message instead of hanging.
   Timers: rings for 40 s → missed · 20 s to connect → "couldn't connect" ·
   line lost for 10 s during a call → ends.
   ===================================================================== */
const RING_MS = 40e3, CONNECT_MS = 20e3, DROP_MS = 10e3;
const ICE = { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }] };
const Call = { cur: null, inUnsub: null, seen: new Set(), ringer: null };
const canCall = () => typeof RTCPeerConnection === 'function' && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
const CI = {                      // call screen icons (white line drawings)
  phone: '<path d="M6.6 3.5l2.6 3.1c.5.6.5 1.4 0 2L7.9 10a12.5 12.5 0 0 0 6.1 6.1l1.4-1.3c.6-.5 1.4-.5 2 0l3.1 2.6c.6.5.7 1.4.1 2l-1.6 1.7c-.8.8-2 1-3 .6A19 19 0 0 1 3.3 7.3c-.4-1-.2-2.2.6-3l1.7-1.6c.6-.6 1.5-.5 2 .1z"/>',
  video: '<rect x="2.5" y="6" width="13" height="12" rx="3"/><path d="M15.5 10.5l6-3.5v10l-6-3.5z"/>',
  mic: '<path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  flip: '<path d="M4 12a8 8 0 0 1 13.7-5.6L20 9M20 4v5h-5M20 12a8 8 0 0 1-13.7 5.6L4 15M4 20v-5h5"/>',
  slash: '<path d="M4 4l16 16"/>',
};
const ci = (k, extra = '') => `<svg viewBox="0 0 24 24" aria-hidden="true">${CI[k]}${extra}</svg>`;
const fmtDur = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const ENDED = ['ended', 'declined', 'missed', 'busy', 'failed', 'cancelled'];

// ---- ringing sounds (made in the browser; the ring plays even if app sounds are off) ----
function ringStart(kind) {
  ringStop();
  const tick = () => {
    if (document.hidden) return;
    try { Sound.tones(kind === 'in' ? [[880, 0, .25, 'sine', .12], [1100, .3, .25, 'sine', .12], [880, .6, .25, 'sine', .1]] : [[440, 0, .9, 'sine', .05], [480, 0, .9, 'sine', .04]]); } catch (e) {}
    if (kind === 'in' && navigator.vibrate) try { navigator.vibrate([300, 200, 300]); } catch (e) {}
  };
  tick(); Call.ringer = setInterval(tick, kind === 'in' ? 2200 : 3000);
}
function ringStop() { clearInterval(Call.ringer); Call.ringer = null; try { if (navigator.vibrate) navigator.vibrate(0); } catch (e) {} }

// ---- camera and microphone ----
async function getMedia(kind) {
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: kind === 'video' ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } : false });
  } catch (e) {
    const what = kind === 'video' ? 'camera and microphone' : 'microphone';
    throw new Error(/NotAllowed|Permission|Security/i.test(e && e.name || '') ? `Allow the ${what} for Recurra to call (in your ${NATIVE ? 'phone' : 'browser'} settings), then try again.`
      : /NotFound|Overconstrained/i.test(e && e.name || '') ? `No ${kind === 'video' ? 'camera' : 'microphone'} found on this device.` : `Could not start the ${what}.`);
  }
}

// ---- one call ----
function newPeer(c) {
  const pc = new RTCPeerConnection(ICE);
  c.stream.getTracks().forEach(t => pc.addTrack(t, c.stream));
  pc.onicecandidate = e => { if (e.candidate) Store.fs.collection(`calls/${c.id}/ice`).doc().set({ from: meUid(), c: e.candidate.toJSON(), at: Date.now() }).catch(() => {}); };
  pc.ontrack = e => { c.remote = e.streams[0] || new MediaStream([e.track]); paintCall(); };
  pc.onconnectionstatechange = () => onLine(c);
  pc.oniceconnectionstatechange = () => onLine(c);
  c.iceUnsub = Store.fs.collection(`calls/${c.id}/ice`).onSnapshot(s => {
    s.docs.forEach(d => {
      if (c.iceDone.has(d.id)) return; const v = d.data() || {};
      if (v.from === meUid() || !v.c) return;
      c.iceDone.add(d.id);
      if (pc.remoteDescription) pc.addIceCandidate(v.c).catch(() => {}); else c.icePending.push(v.c);
    });
  }, () => {});
  return pc;
}
const flushIce = c => { c.icePending.splice(0).forEach(x => c.pc.addIceCandidate(x).catch(() => {})); };
function onLine(c) {
  if (Call.cur !== c || !c.pc) return;
  const st = c.pc.connectionState || c.pc.iceConnectionState;
  if (st === 'connected' || st === 'completed') {
    clearTimeout(c.connectTimer); clearTimeout(c.dropTimer); c.dropTimer = null;
    if (!c.startedAt) { c.startedAt = Date.now(); Sound.play('join'); clearInterval(c.clock); c.clock = setInterval(paintClock, 1000); }
    c.state = 'live'; paintCall();
  } else if (st === 'disconnected' && c.startedAt) {
    c.state = 'weak'; paintCall();
    if (!c.dropTimer) c.dropTimer = setTimeout(() => endCall('dropped'), DROP_MS);
  } else if (st === 'failed') endCall(c.startedAt ? 'dropped' : 'failed');
}
function startConnectTimer(c) {
  c.state = 'connecting'; paintCall();
  clearTimeout(c.connectTimer);
  c.connectTimer = setTimeout(() => { if (Call.cur === c && !c.startedAt) endCall('failed'); }, CONNECT_MS);
}
function watchCall(c) {
  c.docUnsub = Store.fs.doc(`calls/${c.id}`).onSnapshot(async s => {
    if (Call.cur !== c) return;
    const d = s.data() || {};
    if (c.role === 'caller' && d.answer && !c.answered) {
      c.answered = true; ringStop(); clearTimeout(c.ringTimer);
      try { await c.pc.setRemoteDescription(d.answer); flushIce(c); } catch (e) { return endCall('failed'); }
      startConnectTimer(c);
    }
    if (ENDED.includes(d.status) && d.endedBy !== meUid())
      endCall(c.role === 'callee' && !c.startedAt && ['missed', 'cancelled', 'ended'].includes(d.status) ? 'missed-in' : d.status, true);
  }, () => {});
}
function setCall(fields) { const c = Call.cur; if (!c) return Promise.resolve(); return Store.fs.doc(`calls/${c.id}`).set({ ...fields, upd: Date.now() }, { merge: true }).catch(() => {}); }

async function startCall(fid, kind) {
  if (!canCall()) return toast('Calls are not supported on this browser.');
  if (Call.cur) return toast('You are already in a call.');
  const f = friendship(fid); if (!f || f.status !== 'accepted') return;
  const other = otherOf(f);
  const c = Call.cur = { id: Store.fs.collection('calls').doc().id, role: 'caller', kind, fid, other, state: 'starting', iceDone: new Set(), icePending: [] };
  paintCall();
  try { c.stream = await getMedia(kind); } catch (e) { Call.cur = null; closeCallView(); return toast(e.message); }
  if (Call.cur !== c) { c.stream.getTracks().forEach(t => t.stop()); return; }
  c.pc = newPeer(c);
  try {
    const offer = await c.pc.createOffer(); await c.pc.setLocalDescription(offer);
    await Store.fs.doc(`calls/${c.id}`).set({ users: [meUid(), other].sort(), pair: fid, from: meUid(), to: other, kind, status: 'ringing', offer: { type: offer.type, sdp: offer.sdp }, at: Date.now(), upd: Date.now() });
  } catch (e) { console.warn(e); return endCall('failed'); }
  c.state = 'ringing'; paintCall(); ringStart('out'); watchCall(c);
  Push.send(other, 'call', { title: displayName(), body: kind === 'video' ? '🎥 Video call… open Recurra to answer' : '📞 Voice call… open Recurra to answer', where: '#chat=' + fid, tag: 'call-' + c.id });
  c.ringTimer = setTimeout(() => { if (Call.cur === c && !c.answered) endCall('missed'); }, RING_MS);
}

// ---- incoming ----
function watchIncoming() {
  stopIncoming();
  if (!App.authUser || App.viewAs || !canCall()) return;
  Call.inUnsub = Store.fs.collection('calls').where('users', 'array-contains', meUid()).where('status', '==', 'ringing').onSnapshot(s => {
    s.docs.forEach(d => {
      const v = d.data() || {}, id = d.id;
      if (v.to !== meUid() || Call.seen.has(id) || Date.now() - (v.at || 0) > RING_MS + 5e3) return;
      Call.seen.add(id);
      if (Call.cur) { Store.fs.doc(`calls/${id}`).set({ status: 'busy', endedBy: meUid(), endedAt: Date.now(), upd: Date.now() }, { merge: true }).catch(() => {}); return; }
      const c = Call.cur = { id, role: 'callee', kind: v.kind === 'video' ? 'video' : 'audio', fid: v.pair, other: v.from, offer: v.offer, state: 'incoming', iceDone: new Set(), icePending: [] };
      loadPerson(v.from).then(() => { paintCall(); Notify.show(friendName(v.from), v.kind === 'video' ? '🎥 Video call' : '📞 Voice call', 'call-' + id, '#chat=' + v.pair); });
      paintCall(); ringStart('in'); watchCall(c);
      c.ringTimer = setTimeout(() => { if (Call.cur === c && c.state === 'incoming') endCall('missed-in', true); }, RING_MS + 2e3 - (Date.now() - (v.at || Date.now())));
    });
  }, e => console.warn('calls', e));
}
function stopIncoming() { if (Call.inUnsub) { try { Call.inUnsub(); } catch (e) {} Call.inUnsub = null; } }
async function acceptCall() {
  const c = Call.cur; if (!c || c.role !== 'callee' || c.state !== 'incoming') return;
  ringStop(); clearTimeout(c.ringTimer); c.state = 'starting'; paintCall();
  try { c.stream = await getMedia(c.kind); } catch (e) { toast(e.message); return endCall('declined'); }
  if (Call.cur !== c) { c.stream.getTracks().forEach(t => t.stop()); return; }
  c.pc = newPeer(c);
  try {
    await c.pc.setRemoteDescription(c.offer); flushIce(c);
    const ans = await c.pc.createAnswer(); await c.pc.setLocalDescription(ans);
    await setCall({ status: 'accepted', answer: { type: ans.type, sdp: ans.sdp }, acceptedAt: Date.now() });
  } catch (e) { console.warn(e); return endCall('failed'); }
  startConnectTimer(c);
}

// ---- hanging up (any reason) ----
const END_TEXT = { ended: 'Call ended', declined: 'Declined', missed: 'No answer', 'missed-in': 'Missed call', busy: 'Busy on another call', failed: 'Couldn’t connect. Try again on Wi-Fi.', dropped: 'Call dropped: the connection was lost.', cancelled: 'Call cancelled' };
async function endCall(reason, fromOther) {
  const c = Call.cur; if (!c || c.ending) return; c.ending = true;
  ringStop(); [c.ringTimer, c.connectTimer, c.dropTimer].forEach(clearTimeout); clearInterval(c.clock);
  const dur = c.startedAt ? Math.round((Date.now() - c.startedAt) / 1000) : 0;
  const status = reason === 'missed-in' ? 'missed' : reason === 'dropped' ? 'ended' : reason;
  if (!fromOther && c.id && c.role) setCall({ status, endedBy: meUid(), endedAt: Date.now(), dur });
  try { if (c.iceUnsub) c.iceUnsub(); if (c.docUnsub) c.docUnsub(); } catch (e) {}
  try { if (c.stream) c.stream.getTracks().forEach(t => t.stop()); if (c.pc) c.pc.close(); } catch (e) {}
  // the caller writes one line in the chat: "Voice call · 2:31", "Missed video call", …
  if (c.role === 'caller' && c.pc) {
    const word = c.kind === 'video' ? 'video call' : 'voice call', Word = word[0].toUpperCase() + word.slice(1);
    const result = dur ? 'done' : reason === 'failed' ? 'failed' : reason === 'declined' || reason === 'busy' ? 'declined' : 'missed';
    const text = dur ? `${Word} · ${fmtDur(dur)}` : result === 'failed' ? `${Word} couldn’t connect` : result === 'declined' ? `${Word} declined` : `Missed ${word}`;
    const keep = Social.open; Social.open = c.fid;            // sendMessage writes to the chat that is "open"; it reads it straight away
    sendMessage({ kind: 'call', text, callKind: c.kind, result, dur, preview: (c.kind === 'video' ? '🎥 ' : '📞 ') + text }).catch(() => {});
    Social.open = keep;
  }
  if (c.role) Activity.log('call', { with: '@' + ((Social.people[c.other] || {}).username || ''), kind: c.kind, result: END_TEXT[reason] || reason, dur: dur ? fmtDur(dur) : '' });
  c.state = 'ended'; c.endText = dur ? `${END_TEXT.ended} · ${fmtDur(dur)}` : (END_TEXT[reason] || 'Call ended');
  paintCall(); if (reason !== 'ended') Sound.play('nudge');
  setTimeout(() => { if (Call.cur === c) { Call.cur = null; closeCallView(); } }, reason === 'ended' || reason === 'cancelled' ? 1400 : 2600);
}
addEventListener('pagehide', () => { if (Call.cur && Call.cur.state !== 'ended') { const c = Call.cur; Store.fs.doc(`calls/${c.id}`).set({ status: c.state === 'incoming' ? 'declined' : 'ended', endedBy: meUid(), endedAt: Date.now(), upd: Date.now() }, { merge: true }).catch(() => {}); } });

// ---- the call screen ----
function closeCallView() { const v = $('callView'); v.hidden = true; v.innerHTML = ''; document.body.classList.remove('in-call'); }
function paintClock() { const c = Call.cur, el = $('cvStatus'); if (c && c.startedAt && el && c.state === 'live') el.textContent = fmtDur((Date.now() - c.startedAt) / 1000); }
function paintCall() {
  const c = Call.cur, v = $('callView'); if (!c) return closeCallView();
  v.hidden = false; document.body.classList.add('in-call');
  const p = Social.people[c.other] || { uid: c.other }, name = friendName(c.other) || 'Your friend', video = c.kind === 'video';
  const status = { starting: video ? 'Starting camera…' : 'Starting…', ringing: 'Ringing…', incoming: video ? 'Video call' : 'Voice call', connecting: 'Connecting…', weak: 'Reconnecting…', live: c.startedAt ? fmtDur((Date.now() - c.startedAt) / 1000) : 'Connected', ended: c.endText || 'Call ended' }[c.state] || '';
  const showVideo = video && c.state !== 'ended';
  const key = [c.state, c.kind, !!c.remote, !!c.stream, c.muted, c.camOff, c.facing].join('|');
  if (v.dataset.key === key) { const st = $('cvStatus'); if (st) st.textContent = status; return; }
  v.dataset.key = key;
  const remoteLive = showVideo && c.remote && c.state === 'live';
  v.className = `call-view ${video ? 'is-video' : 'is-audio'} st-${c.state}${remoteLive ? ' has-remote' : ''}`;
  const btn = (id, ic, label, cls = '') => `<button class="cv-btn ${cls}" type="button" id="${id}" aria-label="${label}"><span>${ic}</span><small>${label}</small></button>`;
  const controls = c.state === 'incoming'
    ? btn('cvDecline', ci('phone'), 'Decline', 'end') + btn('cvAccept', ci(video ? 'video' : 'phone'), 'Accept', 'ok')
    : c.state === 'ended' ? ''
    : btn('cvMute', ci('mic', c.muted ? CI.slash : ''), c.muted ? 'Unmute' : 'Mute', c.muted ? 'on' : '') + (video ? btn('cvCam', ci('video', c.camOff ? CI.slash : ''), c.camOff ? 'Camera on' : 'Camera off', c.camOff ? 'on' : '') + btn('cvFlip', ci('flip'), 'Flip') : '') + btn('cvEnd', ci('phone'), 'End', 'end');
  v.innerHTML = `
    ${showVideo ? `<video id="cvRemote" class="cv-remote" autoplay playsinline></video>${c.stream ? `<video id="cvLocal" class="cv-local${c.facing === 'environment' ? '' : ' mirror'}" autoplay playsinline muted></video>` : ''}` : '<audio id="cvAudio" autoplay></audio>'}
    <div class="cv-who">
      <div class="cv-av${c.state === 'incoming' || c.state === 'ringing' ? ' pulse' : ''}">${pAvatar(p, 'big')}</div>
      <h2>${esc(name)}</h2>
      <p id="cvStatus" class="cv-status${c.state === 'ended' ? ' end' : ''}" aria-live="polite">${esc(status)}</p>
    </div>
    <div class="cv-controls">${controls}</div>`;
  if (showVideo) {
    const loc = $('cvLocal'), rem = $('cvRemote');
    if (c.stream && loc) loc.srcObject = c.stream;
    if (c.remote) rem.srcObject = c.remote;
  } else if (c.remote) $('cvAudio').srcObject = c.remote;
  const on = (id, fn) => { const b = $(id); if (b) b.onclick = fn; };
  on('cvAccept', acceptCall);
  on('cvDecline', () => endCall('declined'));
  on('cvEnd', () => endCall(c.state === 'ringing' || c.state === 'starting' ? 'cancelled' : 'ended'));
  on('cvMute', () => { c.muted = !c.muted; c.stream && c.stream.getAudioTracks().forEach(t => { t.enabled = !c.muted; }); paintCall(); });
  on('cvCam', () => { c.camOff = !c.camOff; c.stream && c.stream.getVideoTracks().forEach(t => { t.enabled = !c.camOff; }); paintCall(); });
  on('cvFlip', flipCamera);
}
async function flipCamera() {
  const c = Call.cur; if (!c || !c.stream || !c.pc) return;
  const facing = c.facing === 'environment' ? 'user' : 'environment';
  try {
    const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: facing }, width: { ideal: 640 }, height: { ideal: 480 } } });
    const nt = s.getVideoTracks()[0], old = c.stream.getVideoTracks()[0];
    const sender = c.pc.getSenders().find(x => x.track && x.track.kind === 'video');
    if (sender) await sender.replaceTrack(nt);
    if (old) { c.stream.removeTrack(old); old.stop(); }
    nt.enabled = !c.camOff; c.stream.addTrack(nt); c.facing = facing; c.vkey = Date.now(); $('callView').dataset.key = ''; paintCall();
  } catch (e) { toast('This device has only one camera.'); }
}

// ---- in the chat: call buttons and the call history line ----
MSG_KINDS.call = m => {
  const miss = m.result !== 'done', video = m.callKind === 'video';
  return `<div class="call-log${miss ? ' miss' : ''}"><span class="cl-ic">${video ? '🎥' : '📞'}</span><div><b>${esc(m.text || 'Call')}</b><small>${m.result === 'done' ? 'Tap to call again' : m.result === 'failed' ? 'Try again on Wi-Fi' : 'Tap to call back'}</small></div><button class="cl-call" type="button" data-callback="${video ? 'video' : 'audio'}" aria-label="Call again">${ci(video ? 'video' : 'phone')}</button></div>`;
};
$('msgList').addEventListener('click', e => { const b = e.target.closest('[data-callback]'); if (b && Social.open) { e.stopPropagation(); startCall(Social.open, b.dataset.callback); } });
function paintCallButtons() {
  const f = friendship(Social.open), box = $('threadCalls'); if (!box) return;
  box.hidden = !canCall() || !f || f.status !== 'accepted';
}
$('callAudio').addEventListener('click', () => Social.open && startCall(Social.open, 'audio'));
$('callVideo').addEventListener('click', () => Social.open && startCall(Social.open, 'video'));
