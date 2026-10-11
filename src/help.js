/* =====================================================================
   HELP: short tutorials and frequent questions, in easy English.
   Search box on top; each item opens in place. Opened from Settings.
   ===================================================================== */
const HELP = [
  { group: 'Start here', icon: '🚀', items: [
    { q: 'What is Recurra?', a: `<p>Recurra helps you <b>remember</b> what you study. You add MCQs and short notes; the app shows each question again <b>just before you would forget it</b>. A few minutes a day is enough.</p>` },
    { q: 'Make your first prep', a: `<p>A <b>prep</b> is one exam you prepare for (for example “JKSSB SI Telecom”).</p><ol><li>Tap the prep name at the top.</li><li>Create a new prep: give it a name and (if you know it) the exam date. The date drives the countdown.</li><li>You can have several preps and switch between them at the top.</li></ol>` },
    { q: 'Add your subjects', a: `<ol><li>Today → <b>Add questions or notes</b>.</li><li>Tap <b>Syllabus</b>, then <b>Add a subject</b>: name and a short code (like CN).</li><li>Or import your whole syllabus with AI (see “Add your syllabus”).</li></ol><p>Every MCQ and note belongs to one subject, so add subjects first.</p>` },
    { q: 'Add MCQs with AI (free)', a: `<ol><li>Today → <b>Add questions or notes</b> → <b>MCQs</b>.</li><li><b>Pick the subject</b> (and a topic if you like).</li><li>Tap <b>Copy AI prompt</b>. Tap <b>Show prompt</b> if you want to read it first.</li><li>Open ChatGPT, Claude or Gemini, paste the prompt and attach your notes (PDF, photo or text; Hinglish is fine).</li><li>Copy the JSON it replies with, paste it in Recurra, tap <b>Check</b>, then <b>Add</b>.</li></ol><p>Nothing is saved until you tap Add.</p>` },
    { q: 'Add revision notes', a: `<p>Same steps as MCQs, but tap <b>Revision notes</b> first. Notes are short: the key difference, 3–6 points, a memory trick and the exam trap. Read them in the <b>Notes</b> tab like a small book.</p>` },
    { q: 'Add your syllabus (optional)', a: `<ol><li>Add → <b>Syllabus</b> → Copy AI prompt → attach your official syllabus PDF → paste the reply → Check → Add.</li><li>Or type topics yourself: Syllabus tab → <b>Edit</b> on a subject, one topic per line.</li></ol><p>With topics, the <b>Syllabus</b> tab shows how much you have covered.</p>` },
  ] },
  { group: 'Studying every day', icon: '📚', items: [
    { q: 'Your daily review (Today)', a: `<p>Today shows how many questions are waiting: <b>to revise</b> (old ones coming back) and <b>new</b>. Tap <b>Start</b>.</p><ul><li>Answer right → it comes back later (after days, then weeks).</li><li>Answer wrong → it comes back <b>tomorrow</b> and stays high priority.</li><li>Busy day? <b>Pause today</b>: no reminders, and your streak is safe.</li></ul>` },
    { q: 'Practice a subject or a topic', a: `<p><b>Practice</b> tab → pick a subject → pick “Whole subject” or one topic. The questions you know least come first.</p>` },
    { q: 'Question bank: see every MCQ', a: `<p>Practice → <b>Question bank</b>. Browse by subject and topic, search any word, or see your <b>Weakest</b> questions. Open one to see the answer, explanation, memory hint, trap, and how you did.</p>` },
    { q: 'Syllabus tab: mark topics studied', a: `<p>Tap the circle next to a topic when you have studied it. The outer ring is “studied”, the inner ring is “strong in memory”. Topics with no questions show <b>No Qs</b>; tap <b>Fill empty topics</b> to make questions for them.</p><p><b>Others</b> holds questions that did not match a syllabus topic; tap one to make it a real topic.</p>` },
    { q: 'Progress and calendar', a: `<p>The <b>Progress</b> tab shows questions answered per day, how often you are right first time, and memory strength per subject. <b>Calendar</b> shows every day you studied and your streak.</p>` },
  ] },
  { group: 'Friends and chat', icon: '💬', items: [
    { q: 'Find and add a friend', a: `<ol><li>Tap the <b>chat button</b> at the top (next to your photo).</li><li>Search their <b>@username</b>, their name, or their <b>exact email</b>.</li><li>Tap <b>Add friend</b>. When they accept, you can chat.</li></ol><p>Your own @username is shown at the top of Friends; share it with friends.</p>` },
    { q: 'Chatting', a: `<ul><li>Messages arrive live. ✓ = sent, ✓✓ = seen.</li><li>You see when a friend is <b>online</b> or <b>typing…</b></li><li><b>Double-tap</b> a message for ❤️, or tap it to choose a reaction, copy it, or delete your own.</li><li>Tap a friend’s photo to see it large.</li><li>⋯ at the top: remove or block a friend.</li></ul>` },
    { q: 'Share MCQs, notes or your syllabus', a: `<ol><li>In a chat, tap <b>+</b>.</li><li>Choose MCQs, notes or your syllabus (a whole subject or one topic), or <b>Ask for…</b> to request them.</li><li>Your friend taps <b>Add to my prep</b>, picks their subject, sees what is new or merged, and adds it.</li></ol><p>They get their own copy. Your answers and progress are never shared.</p>` },
  ] },
  { group: 'Live tests', icon: '🏁', items: [
    { q: 'Start a live test with friends', a: `<ol><li>Open the <b>Tests</b> tab → <b>Start a new live test</b>.</li><li>Pick up to 4 friends, the subject or topic (or mixed), 10/20/30 questions and the time.</li><li>Tap <b>Invite</b>. When your friends are in the lobby, tap <b>Start</b>.</li></ol><p>Everyone gets the same questions, each in a different order with shuffled options.</p>` },
    { q: 'Join a test you are invited to', a: `<p>You get a pop-up (and a notification if they are on). The <b>Tests</b> tab shows a red badge; open it and tap <b>Join</b>.</p>` },
    { q: 'Results, history and badges', a: `<p>At the end you see the podium, everyone’s score and time, and the <b>trap questions</b> most of you got wrong, with explanations. You can add the questions you got wrong to your prep. The Tests tab keeps your history: score chart, head-to-head with each friend, and badges.</p>` },
  ] },
  { group: 'Account and settings', icon: '⚙️', items: [
    { q: 'Change name, username or photo', a: `<p>Tap your photo (top right) → Settings → Profile → <b>Edit name or username</b>, or <b>Change photo</b>.</p>` },
    { q: 'Reminders and notifications', a: `<p>Settings → <b>Daily reminders</b>: pick the hours. On the Android app they come from the phone itself. For messages and test invites, tap <b>Turn on</b> in Friends when asked.</p>` },
    { q: 'Sounds', a: `<p>Soft sounds play for new messages, friend requests and live tests. Turn them off in Settings → <b>Sounds</b>.</p>` },
    { q: 'Use it on phone and laptop', a: `<p>Sign in with the same account everywhere: website on a laptop, the Android app on the phone. Everything syncs by itself.</p>` },
    { q: 'Install the app', a: `<p>On Android, install the Recurra app (ask the admin for the link). On a laptop, Settings → <b>Install</b> (when your browser offers it) puts Recurra on your desktop.</p>` },
  ] },
  { group: 'Frequent questions', icon: '❓', faq: true, items: [
    { q: 'How does the app decide which questions I see?', a: `<p>Each question has a memory level. Right answers raise it, so the question comes back after a longer gap (1 day, 3 days, a week, two weeks…). A wrong answer brings it back tomorrow. Questions you keep getting wrong stay high priority, but nothing disappears for good.</p>` },
    { q: 'Why are the options in a different order each time?', a: `<p>So you learn the answer, not its position. The app checks the answer by its text, never by A/B/C/D.</p>` },
    { q: 'I pasted and it said “Nothing was added”. Why?', a: `<p>Something in the paste was meant for <b>another subject</b>, or it was the wrong kind (for example MCQs pasted under Syllabus). Read the red message: it says what to switch. Nothing is half-added.</p>` },
    { q: 'What do “merged” and “similar” mean?', a: `<p><b>Merged</b>: you already had that question; only the missing parts (like an explanation) were added. <b>Similar</b>: a reworded question with the same answer; it is skipped unless you tap <b>Add anyway</b>.</p>` },
    { q: 'Can my friends or the admin see my progress or chats?', a: `<p>No one sees your progress. Chats can be read only by you and that friend; the admin cannot read them.</p>` },
    { q: 'I forgot my password', a: `<p>On the sign-in screen tap <b>Forgot password?</b> and we email you a link.</p>` },
    { q: 'Does it work without internet?', a: `<p>Yes for studying: answers are saved on your device and sync when you are back online. Chat and live tests need internet.</p>` },
    { q: 'Why did I not get a notification?', a: `<p>Check that notifications are allowed for Recurra in your phone or browser settings, and that “Sounds/Notifications” are on. If the app is fully closed, messages may arrive when you next open it.</p>` },
    { q: 'How do I start again from zero?', a: `<p>Tap the prep name at the top → <b>Reset progress</b>. Your questions and notes stay; only your answers are cleared.</p>` },
    { q: 'What happens if I delete my account?', a: `<p>You are signed out at once. Everything is erased for good after 30 days. Before that, the admin can restore it if you ask.</p>` },
    { q: 'Is it free?', a: `<p>Yes. No ads, no payments.</p>` },
  ] },
];
const HelpUI = { q: '', open: null };
MODES.help = () => { HelpUI.q = ''; HelpUI.open = null; $('helpSearch').value = ''; renderHelp(); show('help'); };
function renderHelp() {
  const q = HelpUI.q.trim().toLowerCase(), words = q.split(/\s+/).filter(Boolean);
  const hit = it => !words.length || words.every(w => (it.q + ' ' + it.a.replace(/<[^>]+>/g, ' ')).toLowerCase().includes(w));
  let n = 0;
  const html = HELP.map((g, gi) => {
    const items = g.items.map((it, ii) => ({ ...it, key: gi + '-' + ii })).filter(hit); n += items.length;
    if (!items.length) return '';
    return `<section class="help-group${g.faq ? ' faq' : ''}"><h3><span>${g.icon}</span>${esc(g.group)}</h3>${items.map(it => `<details class="help-item" ${HelpUI.open === it.key || (words.length && items.length <= 3) ? 'open' : ''} data-key="${it.key}"><summary>${esc(it.q)}</summary><div class="help-a">${it.a}</div></details>`).join('')}</section>`;
  }).join('');
  $('helpList').innerHTML = n ? html : `<div class="empty-state small">${ART.empty}<strong>Nothing found</strong><p>Try another word, like “share”, “test” or “password”.</p></div>`;
}
$('helpSearch').addEventListener('input', () => { HelpUI.q = $('helpSearch').value; renderHelp(); });
$('helpList').addEventListener('toggle', e => { const d = e.target; if (d.open && d.dataset.key) HelpUI.open = d.dataset.key; }, true);
