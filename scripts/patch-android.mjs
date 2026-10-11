// Runs after "npx cap add android": sets the app version, release signing, icons and splash screen.
// Signing details come from environment variables (GitHub secrets), never from files in the repo.
import { readFileSync, writeFileSync, cpSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = join(root, 'android', 'app');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const versionCode = Number(process.env.BUILD_NUMBER || 1);

// 1. version + signing
let g = readFileSync(join(app, 'build.gradle'), 'utf8');
g = g.replace(/versionCode \d+/, `versionCode ${versionCode}`).replace(/versionName "[^"]*"/, `versionName "${pkg.version}"`);
if (!g.includes('signingConfigs')) {
  g = g.replace(/buildTypes \{/, `signingConfigs {
        release {
            if (System.getenv("KEYSTORE_FILE")) {
                storeFile file(System.getenv("KEYSTORE_FILE"))
                storePassword System.getenv("KEYSTORE_PASSWORD")
                keyAlias System.getenv("KEY_ALIAS") ?: "dailyprep"
                keyPassword System.getenv("KEYSTORE_PASSWORD")
            }
        }
    }
    buildTypes {`);
  g = g.replace(/release \{\n(\s+)minifyEnabled false/, `release {\n$1if (System.getenv("KEYSTORE_FILE")) { signingConfig signingConfigs.release }\n$1minifyEnabled false`);
}
writeFileSync(join(app, 'build.gradle'), g);

// 2. icons, notification icon, colours
const res = join(app, 'src', 'main', 'res');
cpSync(join(root, 'assets', 'android-res'), res, { recursive: true });

// 3. calm splash screen: background colour + the app icon (replaces the Capacitor logo)
for (const d of readdirSync(res)) {
  const f = join(res, d, 'splash.png');
  if (d.startsWith('drawable') && existsSync(f)) rmSync(f);
}
writeFileSync(join(res, 'drawable', 'splash.xml'), `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item><color android:color="#EEF2F1"/></item>
    <item><bitmap android:gravity="center" android:src="@mipmap/ic_launcher"/></item>
</layer-list>
`);
console.log(`Android patched: version ${pkg.version} (${versionCode}), signing ${process.env.KEYSTORE_FILE ? 'release key' : 'NOT SET (debug only)'}`);
