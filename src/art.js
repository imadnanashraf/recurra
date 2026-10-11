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
