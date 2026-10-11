// Builds the app into www/ (used for both the website and the Android app).
// Everything the app needs is copied in, so it also works offline and inside the Android app.
import { mkdirSync, rmSync, readFileSync, writeFileSync, copyFileSync, existsSync, cpSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = f => readFileSync(join(root, 'src', f), 'utf8');
const out = join(root, 'www');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'vendor'), { recursive: true });
mkdirSync(join(out, 'fonts'), { recursive: true });

const html = [
  src('head.html').replace('{{VERSION}}', pkg.version),
  '<style>\n', src('styles.css'), '</style>\n</head>\n<body>\n',
  src('body.html').replaceAll('{{LOGO}}', src('logo.svg').trim()),
  '<script>\n/* PART 1 — PURE LOGIC: imports, shuffling, spaced-repetition schedule, days, streaks, reminder wording */\n',
  src('mdparse.js'), src('core.js'), src('import.js'), src('remindlogic.js'),
  '</script>\n<script>\n', src('progress.js'), '</script>\n<script>\n', src('reminders.js'), '</script>\n<script>\n', src('app.js'),
  '</script>\n</body>\n</html>\n',
].join('');
writeFileSync(join(out, 'index.html'), html);

// libraries (bundled, not loaded from the internet)
const nm = p => join(root, 'node_modules', p);
for (const part of ['app', 'auth', 'firestore', 'messaging']) copyFileSync(nm(`firebase/firebase-${part}-compat.js`), join(out, 'vendor', `firebase-${part}-compat.js`));
copyFileSync(nm('@capacitor/core/dist/capacitor.js'), join(out, 'vendor', 'capacitor.js'));
const AHN = '@fontsource-variable/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-';
copyFileSync(nm(AHN + 'latin-wght-normal.woff2'), join(out, 'fonts', 'ahn-latin.woff2'));
copyFileSync(nm(AHN + 'latin-ext-wght-normal.woff2'), join(out, 'fonts', 'ahn-latin-ext.woff2'));

// app files
cpSync(join(root, 'templates'), join(out, 'templates'), { recursive: true });
cpSync(join(root, 'assets', 'icons'), join(out, 'icons'), { recursive: true });
copyFileSync(join(root, 'src', 'manifest.webmanifest'), join(out, 'manifest.webmanifest'));
writeFileSync(join(out, 'sw.js'), src('sw.js').replace('{{VERSION}}', pkg.version + '-' + Date.now().toString(36)));
const cfg = existsSync(join(root, 'config.js')) ? 'config.js' : 'config.example.js';
copyFileSync(join(root, cfg), join(out, 'config.js'));
writeFileSync(join(out, '.nojekyll'), '');
console.log(`Built www/ (version ${pkg.version}, settings from ${cfg})`);

// The reminder job (reminder/remind.mjs) uses exactly the same wording rules as the app
writeFileSync(join(root, 'reminder', 'decide.mjs'),
  '// Generated from src/remindlogic.js by scripts/build.mjs. Edit that file, not this one.\n' +
  src('remindlogic.js') + `
// Date and hour in a person's own time zone
export function localDate(tz, now = new Date()) { return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'Asia/Kolkata' }).format(now); }
export function localHour(tz, now = new Date()) { return Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz || 'Asia/Kolkata', hour: '2-digit', hourCycle: 'h23' }).format(now)); }
export { prepStatus, reminderText };
`);
