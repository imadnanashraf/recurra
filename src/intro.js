/* =====================================================================
   INTRO: a tiny picture above the heading of each tab that plays ONCE
   (about one second) when you arrive on that tab, then stays still.
   Coming back to the same tab while you are on it does not replay it.
   Pure SVG + CSS, no images, and nothing moves with "reduce motion".
   ===================================================================== */
const Intro = { last: '' };
const INTRO_ART = {
  // Practice: an arrow flies into the target
  practice: `<circle cx="40" cy="22" r="17" class="i-soft"/><circle cx="40" cy="22" r="11" class="i-ring"/><circle cx="40" cy="22" r="4.5" class="i-fill"/>
    <g class="i-arrow"><path d="M40 22 L84 8" class="i-line"/><path d="M84 8 l8 -1 -3 6z M84 8 l-2 -6 7 1z" class="i-fill2"/></g><circle cx="40" cy="22" r="11" class="i-hit"/>`,
  // Syllabus: three ticks draw in, one after another
  syllabus: `<rect x="6" y="4" width="64" height="36" rx="7" class="i-soft"/>
    ${[0, 1, 2].map(i => `<path d="M14 ${13 + i * 10} l3 3 6 -6" class="i-tick d${i}"/><rect x="28" y="${11 + i * 10}" width="${34 - i * 8}" height="4" rx="2" class="i-bar d${i}"/>`).join('')}`,
  // Notes: a page with lines writing themselves, and a pencil
  notes: `<rect x="10" y="3" width="44" height="38" rx="5" class="i-soft"/>
    ${[0, 1, 2].map(i => `<path d="M18 ${14 + i * 9} h${28 - i * 8}" class="i-write d${i}"/>`).join('')}
    <g class="i-pencil"><path d="M60 34 l18 -18 5 5 -18 18 -7 2z" class="i-fill2"/><path d="M60 34 l-2 7 7 -2z" class="i-fill"/></g>`,
  // Progress: bars grow, then a line draws over them
  progress: `${[0, 1, 2, 3].map(i => `<rect x="${10 + i * 16}" y="${30 - (i + 1) * 6}" width="10" height="${(i + 1) * 6 + 10}" rx="3" class="i-grow d${i}"/>`).join('')}
    <path d="M15 26 L31 20 L47 14 L63 6" class="i-trend"/><circle cx="63" cy="6" r="3.5" class="i-fill2 i-pop"/>`,
  // Tests: a flag waves, then a little racing line
  tests: `<path d="M18 40 V4" class="i-line"/><path d="M18 5 q10 -4 20 0 t20 0 v16 q-10 -4 -20 0 t-20 0z" class="i-flag"/>
    <path d="M44 34 h40" class="i-race"/><circle cx="84" cy="34" r="3.5" class="i-fill i-pop"/>`,
  // Friends: two chat bubbles pop in
  chat: `<path d="M6 8 q0 -5 5 -5 h30 q5 0 5 5 v14 q0 5 -5 5 h-22 l-8 7 v-7 q-5 0 -5 -5z" class="i-bub b1"/>
    <path d="M86 18 q0 -5 -5 -5 h-30 q-5 0 -5 5 v14 q0 5 5 5 h22 l8 7 v-7 q5 0 5 -5z" class="i-bub b2"/>
    <circle cx="58" cy="25" r="2.4" class="i-dot d0"/><circle cx="66" cy="25" r="2.4" class="i-dot d1"/><circle cx="74" cy="25" r="2.4" class="i-dot d2"/>`,
  // Help: a light bulb switches on
  help: `<circle cx="40" cy="18" r="15" class="i-glow"/><path d="M40 4 a13 13 0 0 1 7 24 v5 h-14 v-5 a13 13 0 0 1 7 -24z" class="i-bulb"/>
    <rect x="34" y="35" width="12" height="4" rx="2" class="i-fill2"/>`,
  // Settings: a gear turns a little and settles
  settings: `<g class="i-gear"><circle cx="40" cy="22" r="11" class="i-fill2"/>${[0, 45, 90, 135, 180, 225, 270, 315].map(a => `<rect x="37" y="5" width="6" height="8" rx="1.5" class="i-fill2" transform="rotate(${a} 40 22)"/>`).join('')}<circle cx="40" cy="22" r="4.5" class="i-hole"/></g>`,
};
// which picture each screen uses
const INTRO_FOR = { picker: 'practice', bank: 'practice', syllabus: 'syllabus', notes: 'notes', progress: 'progress', calendar: 'progress', room: 'tests', chat: 'chat', help: 'help', settings: 'settings' };
function playIntro(id) {
  const kind = INTRO_FOR[id];
  if (!kind) { Intro.last = id; return; }
  const sec = $(id); if (!sec) return;
  let el = sec.querySelector(':scope > .intro');
  if (!el) {
    el = document.createElement('div'); el.className = 'intro'; el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `<svg viewBox="0 0 96 44" class="i-${kind}">${INTRO_ART[kind]}</svg>`;
    sec.prepend(el);
  }
  if (Intro.last === id) return;          // same screen again (a refresh): don't replay
  Intro.last = id;
  el.classList.remove('play'); void el.offsetWidth; el.classList.add('play');
}
