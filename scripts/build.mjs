// Builds the app into www/ (used for both the website and the Android app).
// Everything the app needs is copied in, so it also works offline and inside the Android app.
import { mkdirSync, rmSync, readFileSync, writeFileSync, copyFileSync, existsSync, cpSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = f => readFileSync(join(root, 'src', f), 'utf8');
const out = join(root, 'www');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'vendor'), { recursive: true });
mkdirSync(join(out, 'fonts'), { recursive: true });

// a QR code for the Android download (so a laptop visitor can scan it with their phone)
const REPO = (src('activity.js').match(/const REPO = '([^']+)'/) || [])[1] || '';
function apkQr() {
  const qrcode = createRequire(import.meta.url)('qrcode-generator'), q = qrcode(0, 'M');
  q.addData(`https://github.com/${REPO}/releases/download/android/recurra.apk`); q.make();
  const n = q.getModuleCount(); let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) d += `M${x} ${y}h1v1h-1z`;
  return `<svg viewBox="-2 -2 ${n + 4} ${n + 4}" shape-rendering="crispEdges"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/><path d="${d}" fill="#0f2233"/></svg>`;
}
const html = [
  src('head.html').replace('{{VERSION}}', pkg.version),
  '<style>\n', src('styles.css'), '</style>\n</head>\n<body>\n',
  src('body.html').replaceAll('{{LOGO}}', src('logo.svg').trim()).replaceAll('{{APKQR}}', apkQr()).replaceAll('{{VERSION}}', pkg.version),
  '<script>\n/* PART 1 — PURE LOGIC: imports, shuffling, spaced-repetition schedule, days, streaks, reminder wording */\n',
  src('mdparse.js'), src('core.js'), src('import.js'), src('remindlogic.js'), src('art.js'), src('charts.js'),
  '</script>\n<script>\n', src('progress.js'), '</script>\n<script>\n', src('reminders.js'), '</script>\n<script>\n', src('sound.js'), '</script>\n<script>\n', src('activity.js'), src('app.js'), src('syllabus.js'), src('bank.js'), src('admin.js'), src('social.js'), src('livetest.js'), src('call.js'), src('push.js'), src('ai.js'), src('help.js'), src('sky.js'), src('intro.js'), src('update.js'),
  '</script>\n</body>\n</html>\n',
].join('');
// every build gets an id; the website compares it with version.json to know a newer version is out
const BUILD_ID = Date.now().toString(36);
writeFileSync(join(out, 'index.html'), html.replaceAll('{{VERSION}}', pkg.version).replaceAll('{{BUILD_ID}}', BUILD_ID));
writeFileSync(join(out, 'version.json'), JSON.stringify({ build: BUILD_ID, version: pkg.version }));

// libraries (bundled, not loaded from the internet)
const nm = p => join(root, 'node_modules', p);
for (const part of ['app', 'auth', 'firestore', 'messaging']) copyFileSync(nm(`firebase/firebase-${part}-compat.js`), join(out, 'vendor', `firebase-${part}-compat.js`));
copyFileSync(nm('@capacitor/core/dist/capacitor.js'), join(out, 'vendor', 'capacitor.js'));
const AHN = '@fontsource-variable/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-';
copyFileSync(nm(AHN + 'latin-wght-normal.woff2'), join(out, 'fonts', 'ahn-latin.woff2'));
copyFileSync(nm(AHN + 'latin-ext-wght-normal.woff2'), join(out, 'fonts', 'ahn-latin-ext.woff2'));

// app files
cpSync(join(root, 'assets', 'icons'), join(out, 'icons'), { recursive: true });
cpSync(join(root, 'assets', 'fx'), join(out, 'fx'), { recursive: true });
copyFileSync(join(root, 'src', 'manifest.webmanifest'), join(out, 'manifest.webmanifest'));
writeFileSync(join(out, 'sw.js'), src('sw.js').replace('{{VERSION}}', pkg.version + '-' + BUILD_ID));
const cfg = existsSync(join(root, 'config.js')) ? 'config.js' : 'config.example.js';
copyFileSync(join(root, cfg), join(out, 'config.js'));
writeFileSync(join(out, '.nojekyll'), '');
console.log(`Built www/ (version ${pkg.version}, settings from ${cfg})`);

// Server jobs (test-account seeding) use exactly the same import and scheduling rules as the app
writeFileSync(join(root, 'reminder', 'applib.mjs'),
  '// Generated from src/mdparse.js, src/core.js and src/import.js by scripts/build.mjs. Edit those files, not this one.\n' +
  src('mdparse.js') + src('core.js') + src('import.js') +
  '\nexport { cleanSyllabus, cleanQuestions, cleanNotes, applyResult, dayKey, addDays, dayStart, sumDay, SCHEDULE };\n');

// The reminder job (reminder/remind.mjs) uses exactly the same wording rules as the app
writeFileSync(join(root, 'reminder', 'decide.mjs'),
  '// Generated from src/remindlogic.js by scripts/build.mjs. Edit that file, not this one.\n' +
  src('remindlogic.js') + `
// Date and hour in a person's own time zone
export function localDate(tz, now = new Date()) { return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'Asia/Kolkata' }).format(now); }
export function localHour(tz, now = new Date()) { return Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz || 'Asia/Kolkata', hour: '2-digit', hourCycle: 'h23' }).format(now)); }
export { prepStatus, reminderText };
`);
