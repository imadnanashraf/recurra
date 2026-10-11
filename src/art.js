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

// Little 3D scenes for Today. Characters: Microsoft Fluent Emoji 3D (MIT licence, see fx/LICENSE-fluent-emoji.txt).
// Each actor is a <span> placed on a stage (x = left %, b = bottom %, w = width in % of stage width); CSS moves it.
const fxImg = (n, cls = '') => `<img class="${cls}" src="fx/${n}.webp" alt="" draggable="false" decoding="async">`;
function actor(cls, x, b, w, inner, shadow = true) {
  const pos = `--x:${x}%;--b:${b}%;--w:${w}`;
  return (shadow ? `<i class="sh ${cls}-sh" style="${pos}"></i>` : '') + `<span class="ac ${cls}" style="${pos}">${inner}</span>`;
}
// A character with real moving parts: legs, arms, body (and tail / tongue for cats) drawn in CSS, with a 3D face on top.
// faces: first is the normal face, the rest swap in during the scene (classes f1, f2, ...). flip = faces left.
function rig(cls, kind, x, b, w, faces, flip = false) {
  const head = faces.map((f, i) => fxImg(f, i ? 'swap f' + i : '')).join('');
  const extra = kind === 'cat' ? '<i class="tail"></i>' : '';
  const tongue = kind === 'cat' ? '<i class="tongue"></i>' : '';
  return `<i class="sh ${cls}-sh" style="--x:${x}%;--b:${b}%;--w:${w}"></i>` +
    `<span class="rig ${kind} ${cls}" style="--x:${x}%;--b:${b}%;--w:${w}"><span class="pose${flip ? ' flip' : ''}">` +
    `${extra}<i class="leg l1"></i><i class="leg l2"></i><i class="body"></i><i class="arm al"></i><i class="arm ar"></i>` +
    `<span class="head">${head}</span>${tongue}</span></span>`;
}
// Pixel art drawn from text grids: each character is one pixel, '.' is empty. One <path> per colour keeps it light.
function pix(rows, pal, ox = 0, oy = 0) {
  const paths = {};
  rows.forEach((r, y) => [...r].forEach((c, x) => { if (pal[c]) (paths[c] = paths[c] || []).push(`M${ox + x} ${oy + y}h1v1h-1z`); }));
  return Object.entries(paths).map(([c, d]) => `<path fill="${pal[c]}" d="${d.join('')}"/>`).join('');
}
const PAL = { K: '#3a2a3a', O: '#f6a43c', L: '#ffe2a8', P: '#ff7f9c', W: '#ffffff', G: '#5fd38d', g: '#2fa866', Y: '#ffd23f', y: '#e8a400', B: '#c8743a', b: '#8c4a22', C: '#ffffff', c: '#d7e9ff', H: '#7ccf6b', h: '#57b04f' };
const RETRO = {
  catTop: ['........K...K.', '.......KOK.KOK', '.......KOOKOOK', 'KK.....KOOOOOK', 'KOK....KOKOOKO', '.KOK...KOOPPOK', '..KO.KKKOOOOK.', '..KKOOOOOOOOK.', '...KOOLLLLOOK.', '...KOOOOOOOOK.'],
  legsA: ['...KOK...KOK..', '...KK.....KK..'],
  legsB: ['.....KOKKOK...', '.....KK..KK...'],
  slime: ['...KKKK...', '..KGGGGK..', '.KGWKGWKK.', '.KGGGGGGGK', 'KGGGGGGGGK', 'KgGGGGGGgK', '.KKKKKKKK.'],
  coin: ['.KKKK.', 'KYYYYK', 'KYWYyK', 'KYWYyK', 'KYYYyK', '.KKKK.'],
  cloud: ['....CCCC......', '..CCCCCCCC.CC.', '.CCCCCCCCCCCCC', 'CCCCCCCCCCCCCC', '.cccccccccccc.'],
  hill: ['......HH......', '....HHHHHH....', '...HHHHhHHH...', '..HHHHHHHHHH..', '.HHhHHHHHHhHH.', 'HHHHHHHHHHHHHH'],
};
function retroScene() {
  const world = x => `<g transform="translate(${x} 0)">${pix(RETRO.slime, PAL, 90, 41)}</g>`;
  const coin = (x, cls) => `<g class="${cls}" style="transform-origin:${x + 3}px 15px"><g class="rt-spin" style="transform-origin:${x + 3}px 15px">${pix(RETRO.coin, PAL, x, 12)}</g></g>`;
  return `<svg class="retro" viewBox="10 8 120 52" shape-rendering="crispEdges" aria-hidden="true">
    <defs><clipPath id="rtClip"><rect x="10" y="8" width="120" height="52" rx="6"/></clipPath>
      <linearGradient id="rtSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fd0ff"/><stop offset="1" stop-color="#d8f1ff"/></linearGradient>
      <pattern id="rtBrick" width="16" height="12" patternUnits="userSpaceOnUse"><rect width="16" height="12" fill="#c8743a"/><rect width="16" height="2" fill="#7bd06a"/><rect y="2" width="16" height="1" fill="#4fa847"/>
        <rect y="7" width="16" height="1" fill="#8c4a22"/><rect x="7" y="3" width="1" height="4" fill="#8c4a22"/><rect x="15" y="8" width="1" height="4" fill="#8c4a22"/><rect x="3" y="4" width="2" height="1" fill="#e39a5a"/></pattern></defs>
    <g clip-path="url(#rtClip)">
      <rect x="10" y="8" width="120" height="52" fill="url(#rtSky)"/>
      <g class="rt-clouds">${pix(RETRO.cloud, PAL, 18, 13)}${pix(RETRO.cloud, PAL, 92, 10)}${pix(RETRO.cloud, PAL, 178, 13)}${pix(RETRO.cloud, PAL, 252, 10)}</g>
      <g class="rt-hills">${pix(RETRO.hill, PAL, 10, 42)}${pix(RETRO.hill, PAL, 84, 42)}${pix(RETRO.hill, PAL, 170, 42)}${pix(RETRO.hill, PAL, 244, 42)}</g>
      <g class="rt-world">${world(0)}${world(160)}<rect y="48" width="320" height="12" fill="url(#rtBrick)"/>${coin(140, 'rt-coin')}${coin(300, '')}</g>
      <g class="rt-cat"><g>${pix(RETRO.catTop, PAL, 30, 36)}</g><g class="rt-la">${pix(RETRO.legsA, PAL, 30, 46)}</g><g class="rt-lb">${pix(RETRO.legsB, PAL, 30, 46)}</g></g>
      <text class="rt-plus" x="45" y="19" font-size="8" font-weight="800" fill="#fff" stroke="#3a2a3a" stroke-width="1.6" paint-order="stroke" font-family="monospace" shape-rendering="auto">+1</text>
    </g>
    <rect x="11" y="9" width="118" height="50" rx="5.5" fill="none" stroke="rgba(30,50,90,.18)" stroke-width="2" shape-rendering="auto"/>
  </svg>`;
}
const SCENES = {
  snow: { label: 'A robot and a polar bear walk in and have a snowball fight', html: () =>
    rig('sf-robot', 'robot', 6, 6, 30, ['robot']) + rig('sf-bear', 'bear', 64, 6, 30, ['polar_bear'], true) +
    `<i class="ball sf-b1"><i></i></i><i class="ball sf-b2"><i></i></i><i class="ball sf-b3"><i></i></i>` +
    actor('sf-puff1', 66, 52, 14, fxImg('cloud'), false) + actor('sf-puff2', 12, 52, 14, fxImg('cloud'), false) +
    actor('sf-dizzy', 80, 30, 13, fxImg('dizzy'), false) +
    actor('flake f1', 30, 100, 5, fxImg('snowflake'), false) + actor('flake f2', 52, 100, 4, fxImg('snowflake'), false) + actor('flake f3', 64, 100, 3.5, fxImg('snowflake'), false) },
  cats: { label: 'Two cats walk up, one licks the other a bit too much and gets a slap', html: () =>
    rig('cf-left', 'cat', 18, 6, 30, ['grinning_cat', 'weary_cat', 'cat_with_tears_of_joy']) +
    rig('cf-right', 'cat', 50, 6, 30, ['grinning_cat_with_smiling_eyes', 'smiling_cat_with_heart_eyes', 'pouting_cat', 'cat_with_tears_of_joy'], true) +
    actor('cf-pow', 30, 56, 16, fxImg('collision'), false) + actor('cf-heart', 44, 84, 10, fxImg('red_heart'), false) },
  retro: { label: 'A pixel cat runs through a little game level, hops over a slime and grabs a coin', html: () => retroScene() },
  panda: { label: 'A panda dozing over a book until the alarm rings', html: () =>
    actor('pa-panda', 28, 34, 40, fxImg('panda'), false) + actor('pa-book', 34, 0, 28, fxImg('open_book')) +
    actor('pa-zzz', 64, 72, 14, fxImg('zzz'), false) + actor('pa-alarm', 76, 6, 18, fxImg('alarm_clock')) +
    actor('pa-bulb', 42, 90, 14, fxImg('light_bulb'), false) },
  hamster: { label: 'A hamster stuffing a whole cookie into its cheeks', html: () =>
    actor('ha-ham', 14, 8, 38, fxImg('hamster')) + actor('ha-cookie', 60, 8, 24, fxImg('cookie')) +
    actor('ha-spark', 44, 78, 14, fxImg('sparkles'), false) },
  penguin: { label: 'A penguin belly-sliding in while a chick cheers', html: () =>
    `<i class="ice"></i>` + actor('pe-dash', 12, 12, 16, fxImg('dashing_away'), false) + actor('pe-peng', 34, 8, 30, fxImg('penguin')) +
    actor('pe-chick', 70, 8, 24, fxImg('baby_chick')) + actor('pe-spark', 74, 72, 14, fxImg('sparkles'), false) },
  ghost: { label: 'A ghost says boo from behind a laptop and the cat laughs', html: () =>
    actor('gh-ghost', 48, 22, 26, fxImg('ghost'), false) + actor('gh-laptop', 42, 4, 36, fxImg('laptop')) +
    actor('gh-cat', 6, 8, 32, fxImg('grinning_cat') + fxImg('weary_cat', 'swap s1') + fxImg('cat_with_tears_of_joy', 'swap s2')) },
  owl: { label: 'A wise owl teaching a happy student', html: () =>
    actor('ow-books', 10, 4, 22, fxImg('books')) + actor('ow-owl', 9, 40, 24, fxImg('owl') + fxImg('graduation_cap', 'cap'), false) +
    actor('ow-kid', 56, 6, 34, fxImg('student')) + actor('ow-star', 74, 80, 13, fxImg('glowing_star'), false) },
  ninja: { label: 'A little ninja teleporting around a confused chick', html: () =>
    actor('nj-ninja', 8, 8, 32, fxImg('ninja')) + actor('nj-chick', 46, 8, 26, fxImg('baby_chick')) +
    actor('nj-puff1', 10, 20, 26, fxImg('cloud'), false) + actor('nj-puff2', 66, 20, 26, fxImg('cloud'), false) },
};
const sceneOrder = Object.keys(SCENES);
function sceneHtml(name) {
  const s = SCENES[name] || SCENES.snow;
  return `<span class="stage st-${name}" role="img" aria-label="${s.label}">${s.html()}</span>`;
}
function nextScene(cur) { return sceneOrder[(sceneOrder.indexOf(cur) + 1) % sceneOrder.length]; }
function pickScene() {   // a different scene on each open, taking turns through all of them
  let last = ''; try { last = localStorage.getItem('rc-scene') || ''; } catch (e) {}
  const name = sceneOrder.includes(last) ? nextScene(last) : sceneOrder[Math.floor(Math.random() * sceneOrder.length)];
  try { localStorage.setItem('rc-scene', name); } catch (e) {}
  return name;
}
