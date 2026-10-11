// ---------- 1j. Icons and illustrations (drawn with the theme colours, so they follow light/night) ----------
const ICON = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  pause: '<path d="M9 6v12M15 6v12"/>',
  play: '<path d="M8 5.5v13l10-6.5z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  install: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14"/>',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/>',
};
const icon = (name, cls) => `<svg class="ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true">${ICON[name] || ''}</svg>`;

const ART = {
  // stacked study cards with the Recurra curve on top
  welcome: `<svg class="art" viewBox="0 0 220 150" aria-hidden="true">
    <ellipse cx="110" cy="138" rx="80" ry="8" fill="var(--sunken)"/>
    <rect x="52" y="34" width="116" height="84" rx="14" fill="var(--accent-soft)" transform="rotate(-9 110 76)"/>
    <rect x="52" y="34" width="116" height="84" rx="14" fill="var(--surface)" stroke="var(--line)" stroke-width="2" transform="rotate(5 110 76)"/>
    <rect x="52" y="30" width="116" height="84" rx="14" fill="var(--surface)" stroke="var(--line)" stroke-width="2"/>
    <path d="M70 52c5 16 9 26 16 28V54c7 11 12 16 19 17V54c7 5 12 7 18 7" fill="none" stroke="var(--accent)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="123" cy="61" r="5" fill="var(--accent)"/>
    <rect x="70" y="92" width="62" height="7" rx="3.5" fill="var(--sunken)"/><rect x="70" y="102" width="40" height="7" rx="3.5" fill="var(--sunken)"/>
    <circle cx="184" cy="30" r="5" fill="var(--miss-soft)"/><circle cx="30" cy="62" r="7" fill="var(--good-soft)"/><circle cx="192" cy="96" r="3.5" fill="var(--accent-soft)"/>
  </svg>`,
  // an empty card waiting for questions
  empty: `<svg class="art" viewBox="0 0 220 140" aria-hidden="true">
    <ellipse cx="110" cy="128" rx="74" ry="7" fill="var(--sunken)"/>
    <rect x="58" y="22" width="104" height="92" rx="14" fill="var(--surface)" stroke="var(--line)" stroke-width="2" stroke-dasharray="7 6"/>
    <circle cx="110" cy="68" r="20" fill="var(--accent-soft)"/>
    <path d="M110 58v20M100 68h20" stroke="var(--accent)" stroke-width="4" stroke-linecap="round"/>
    <path d="M178 34l4 4M182 34l-4 4M38 92l4 4M42 92l-4 4" stroke="var(--muted)" stroke-width="2" stroke-linecap="round" opacity=".6"/>
  </svg>`,
  // a note page with a highlighted line
  notes: `<svg class="art" viewBox="0 0 220 140" aria-hidden="true">
    <ellipse cx="110" cy="128" rx="70" ry="7" fill="var(--sunken)"/>
    <path d="M66 18h70l18 18v80H66z" fill="var(--surface)" stroke="var(--line)" stroke-width="2" stroke-linejoin="round"/>
    <path d="M136 18v18h18" fill="none" stroke="var(--line)" stroke-width="2" stroke-linejoin="round"/>
    <rect x="78" y="48" width="64" height="9" rx="4.5" fill="var(--miss-soft)"/>
    <rect x="78" y="66" width="56" height="6" rx="3" fill="var(--sunken)"/><rect x="78" y="80" width="62" height="6" rx="3" fill="var(--sunken)"/><rect x="78" y="94" width="40" height="6" rx="3" fill="var(--sunken)"/>
    <circle cx="168" cy="40" r="12" fill="var(--accent-soft)"/><path d="M168 33v8M168 45v1" stroke="var(--accent)" stroke-width="3" stroke-linecap="round"/>
  </svg>`,
  // finished for today: a calm sun with a check
  done: `<svg class="art art-done" viewBox="0 0 120 120" aria-hidden="true">
    <g stroke="var(--good)" stroke-width="3" stroke-linecap="round" opacity=".45">
      <path d="M60 8v10M60 102v10M8 60h10M102 60h10M23 23l7 7M90 90l7 7M23 97l7-7M90 30l7-7"/>
    </g>
    <circle cx="60" cy="60" r="32" fill="var(--good-soft)"/>
    <path class="draw" d="M46 61l10 10 19-21" fill="none" stroke="var(--good)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
};

const prefersReduced = () => !!window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- 1k. A little life on Today: a fresh study line each time, and a tiny animated scene ----------
// Original lines (no famous-person quotes: those are often misattributed). Several are research-backed tips.
const QUOTES = [
  'Small daily reviews beat big last-minute cramming.',
  'You don’t have to feel ready. Just answer the first question.',
  'Every “not yet” today is a “got it” next week.',
  'Forgetting is normal. Reviewing at the right moment is the trick.',
  'Ten focused minutes beat an hour of rereading.',
  'Progress is quiet. Keep showing up.',
  'Hard questions are where the learning happens.',
  'Testing yourself sticks better than rereading. That’s the whole idea here.',
  'One topic at a time. One day at a time.',
  'Mistakes here are free. Mistakes in the exam hall cost marks.',
  'Future you is going to be very grateful for today.',
  'Consistency beats intensity.',
  'Sleep turns today’s practice into tomorrow’s memory. Rest well tonight.',
  'A one-minute break makes the next block sharper.',
  'Confidence comes from practice, not from waiting.',
  'You remember what you pull out of your head, not what you put in front of your eyes.',
  'Start small. Motivation usually shows up after you begin.',
  'Each answer strengthens a path in your memory.',
  'Done beats perfect. Finish today’s review.',
  'Little by little, the syllabus gets smaller.',
  'After each answer, ask “why?”. Understanding lasts longer than facts.',
  'Mixing subjects trains your brain to tell them apart.',
  'Today’s effort is tomorrow’s easy question.',
  'Just this question. The rest can wait.',
  'Learning feels slow, until suddenly it doesn’t.',
  'If it feels a little hard, it’s working.',
  'Show up for five minutes. Stay if you can.',
  'The exam rewards what you’ve practised recalling.',
  'Opening the app was the hardest part. You’ve done it.',
  'Guessing right is luck. Knowing why is skill.',
  'Your brain is building something. Give it a few minutes a day.',
  'Steady beats stressed.',
];
// a different line each time the app opens (never the same twice in a row)
function pickQuote() {
  let last = -1; try { last = Number(localStorage.getItem('rc-quote')); } catch (e) {}
  let i = Math.floor(Math.random() * QUOTES.length);
  if (i === last) i = (i + 1) % QUOTES.length;
  try { localStorage.setItem('rc-quote', String(i)); } catch (e) {}
  return QUOTES[i];
}

const SCENES = {
  // two cats: the orange one grooms the grey one, who closes its eyes happily; a heart floats up
  cats: `<svg class="scene cats" viewBox="0 0 200 120" role="img" aria-label="Two cats, one grooming the other">
    <ellipse cx="102" cy="110" rx="78" ry="6" fill="var(--sunken)"/>
    <g class="tail tail-l"><path d="M54 98c-16-2-24-10-22-22 1-6 6-8 9-5" fill="none" stroke="#e48c3a" stroke-width="7" stroke-linecap="round"/></g>
    <ellipse cx="72" cy="88" rx="25" ry="21" fill="#f4a259"/>
    <ellipse cx="74" cy="94" rx="13" ry="12" fill="#ffe1bd"/>
    <path d="M60 74q4 4 0 9M68 70q4 5 0 10" stroke="#e48c3a" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <g class="head head-l">
      <path d="M64 46l2-17 12 11zM88 40l11-11 1 17z" fill="#f4a259"/>
      <path d="M67 42l1-8 5 5zM93 37l5-5v8z" fill="#ffb3b8"/>
      <circle cx="81" cy="54" r="18" fill="#f4a259"/>
      <path d="M70 45q3 3 0 6M90 44q-2 3 0 6" stroke="#e48c3a" stroke-width="2" fill="none" stroke-linecap="round"/>
      <g class="blink"><ellipse cx="75" cy="53" rx="2.3" ry="3.1" fill="#3a2a22"/><ellipse cx="88" cy="53" rx="2.3" ry="3.1" fill="#3a2a22"/></g>
      <path d="M80 60l3 0-1.5 2z" fill="#e8737f"/>
      <path d="M81.5 62q-2 3-5 2M81.5 62q2 3 5 2" stroke="#3a2a22" stroke-width="1.2" fill="none" stroke-linecap="round"/>
      <ellipse class="tongue" cx="100" cy="59" rx="4.2" ry="2.6" fill="#ff8fa0"/>
    </g>
    <g class="tail tail-r"><path d="M150 100c16-1 22-12 18-22-2-4-6-4-8-1" fill="none" stroke="#8d89bf" stroke-width="7" stroke-linecap="round"/></g>
    <ellipse cx="130" cy="90" rx="23" ry="19" fill="#aaa7d3"/>
    <ellipse cx="128" cy="96" rx="12" ry="11" fill="#ecebf8"/>
    <g class="head head-r">
      <path d="M108 50l1-16 12 10zM130 44l11-11 1 16z" fill="#aaa7d3"/>
      <path d="M111 46l1-7 5 4zM135 40l5-5v7z" fill="#ffb3b8"/>
      <circle cx="123" cy="60" r="17" fill="#aaa7d3"/>
      <g class="eyes-open"><ellipse cx="117" cy="59" rx="2.2" ry="3" fill="#2d2a44"/><ellipse cx="129" cy="59" rx="2.2" ry="3" fill="#2d2a44"/></g>
      <g class="eyes-shut" stroke="#2d2a44" stroke-width="1.8" fill="none" stroke-linecap="round"><path d="M114.5 59.5q2.5-3 5 0M126.5 59.5q2.5-3 5 0"/></g>
      <path d="M121.5 65l3 0-1.5 2z" fill="#e8737f"/>
      <path d="M123 67q-2 3-5 2M123 67q2 3 5 2" stroke="#2d2a44" stroke-width="1.2" fill="none" stroke-linecap="round"/>
      <ellipse cx="113" cy="66" rx="3.5" ry="2" fill="#ffb3c4" opacity=".7"/><ellipse cx="133" cy="66" rx="3.5" ry="2" fill="#ffb3c4" opacity=".7"/>
    </g>
    <path class="heart" d="M104 30c-3-5-10-2-7 4l7 6 7-6c3-6-4-9-7-4z" fill="#ff7a93"/>
  </svg>`,
  // two little robots in a friendly snowball fight
  bots: `<svg class="scene bots" viewBox="0 0 200 120" role="img" aria-label="Two small robots having a snowball fight">
    <path d="M0 104q50-10 100 0t100 0v16H0z" fill="var(--sunken)"/>
    <g class="flakes" fill="var(--t-sky-ink)" opacity=".35"><circle cx="30" cy="0" r="1.6"/><circle cx="80" cy="0" r="1.3"/><circle cx="120" cy="0" r="1.8"/><circle cx="170" cy="0" r="1.4"/><circle cx="58" cy="0" r="1.2"/><circle cx="146" cy="0" r="1.5"/></g>
    <g class="bot bot-a">
      <line x1="44" y1="38" x2="44" y2="30" stroke="#178f7c" stroke-width="2.4" stroke-linecap="round"/><circle cx="44" cy="28" r="3.4" fill="#ffc24a"/>
      <rect x="28" y="38" width="32" height="25" rx="8" fill="#2ec4a9"/>
      <rect x="32" y="43" width="24" height="13" rx="5" fill="#13303a"/>
      <g class="eyes"><circle cx="39" cy="49.5" r="2.6" fill="#7ff5e0"/><circle cx="49" cy="49.5" r="2.6" fill="#7ff5e0"/></g>
      <rect x="31" y="65" width="26" height="23" rx="7" fill="#26ad96"/>
      <circle cx="44" cy="76" r="3.5" fill="#ffc24a"/>
      <rect x="34" y="88" width="7" height="12" rx="3" fill="#178f7c"/><rect x="47" y="88" width="7" height="12" rx="3" fill="#178f7c"/>
      <g class="arm arm-a"><rect x="56" y="66" width="7" height="18" rx="3.5" fill="#178f7c"/></g>
    </g>
    <g class="bot bot-b">
      <line x1="156" y1="38" x2="156" y2="30" stroke="#2f6bc4" stroke-width="2.4" stroke-linecap="round"/><circle cx="156" cy="28" r="3.4" fill="#ff8fa0"/>
      <rect x="140" y="38" width="32" height="25" rx="8" fill="#5b9bf0"/>
      <rect x="144" y="43" width="24" height="13" rx="5" fill="#13233f"/>
      <g class="eyes"><circle cx="151" cy="49.5" r="2.6" fill="#a9d4ff"/><circle cx="161" cy="49.5" r="2.6" fill="#a9d4ff"/></g>
      <rect x="143" y="65" width="26" height="23" rx="7" fill="#4b88dd"/>
      <circle cx="156" cy="76" r="3.5" fill="#ff8fa0"/>
      <rect x="146" y="88" width="7" height="12" rx="3" fill="#2f6bc4"/><rect x="159" y="88" width="7" height="12" rx="3" fill="#2f6bc4"/>
      <g class="arm arm-b"><rect x="137" y="66" width="7" height="18" rx="3.5" fill="#2f6bc4"/></g>
    </g>
    <circle class="ball ball-1" cx="0" cy="0" r="6" fill="#fff" stroke="#7f98bb" stroke-width="1.8"/>
    <circle class="ball ball-2" cx="0" cy="0" r="6" fill="#fff" stroke="#7f98bb" stroke-width="1.8"/>
    <g class="puff puff-b" fill="#fff" stroke="#8fa6c4" stroke-width="1.4"><circle cx="150" cy="44" r="5"/><circle cx="158" cy="40" r="4"/><circle cx="163" cy="47" r="3.5"/></g>
    <g class="puff puff-a" fill="#fff" stroke="#8fa6c4" stroke-width="1.4"><circle cx="50" cy="44" r="5"/><circle cx="42" cy="40" r="4"/><circle cx="37" cy="47" r="3.5"/></g>
  </svg>`,
};
const sceneOrder = ['cats', 'bots'];
function pickScene() {
  let last = ''; try { last = localStorage.getItem('rc-scene') || ''; } catch (e) {}
  const name = sceneOrder[(sceneOrder.indexOf(last) + 1) % sceneOrder.length] || 'cats';   // take turns
  try { localStorage.setItem('rc-scene', name); } catch (e) {}
  return name;
}
