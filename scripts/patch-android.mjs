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
// the version name carries the phone-level version ("2.0.0-n1"): the app compares it with the newest build to know if a new APK is needed
const nativeLevel = Number(pkg.nativeLevel || 1);
g = g.replace(/versionCode \d+/, `versionCode ${versionCode}`).replace(/versionName "[^"]*"/, `versionName "${pkg.version}-n${nativeLevel}"`);
if (!g.includes('signingConfigs')) {
  g = g.replace(/buildTypes \{/, `signingConfigs {
        release {
            if (System.getenv("KEYSTORE_FILE")) {
                storeFile file(System.getenv("KEYSTORE_FILE"))
                storePassword System.getenv("KEYSTORE_PASSWORD")
                keyAlias System.getenv("KEY_ALIAS") ?: "recurra"
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
    <item><color android:color="#F4F7FB"/></item>
    <item><bitmap android:gravity="center" android:src="@mipmap/ic_launcher"/></item>
</layer-list>
`);
// 4. notifications when the app is closed: Firebase settings (from the Android workflow), icon, and a flag for the app
const gs = process.env.GOOGLE_SERVICES_FILE;
let push = false;
if (gs && existsSync(gs)) {
  cpSync(gs, join(app, 'google-services.json'));
  const cfgFile = join(root, 'www', 'config.js');
  if (existsSync(cfgFile)) writeFileSync(cfgFile, readFileSync(cfgFile, 'utf8') + '\nwindow.APP_CONFIG.androidPush = true;\n');
  const mf = join(app, 'src', 'main', 'AndroidManifest.xml');
  let m = readFileSync(mf, 'utf8');
  if (!m.includes('default_notification_icon')) m = m.replace(/<application([^>]*)>/, `<application$1>
        <meta-data android:name="com.google.firebase.messaging.default_notification_icon" android:resource="@drawable/ic_stat_notify" />
        <meta-data android:name="com.google.firebase.messaging.default_notification_color" android:resource="@color/notify_color" />
        <meta-data android:name="com.google.firebase.messaging.default_notification_channel_id" android:value="messages" />`);
  writeFileSync(mf, m);
  push = true;
}
// 6. which build this app code is (for background updates)
{
  const cfgFile = join(root, 'www', 'config.js');
  if (existsSync(cfgFile)) writeFileSync(cfgFile, readFileSync(cfgFile, 'utf8') + `\nwindow.APP_CONFIG.webBuild = ${versionCode};\nwindow.APP_CONFIG.nativeLevel = ${nativeLevel};\n`);
}
// 5. voice and video calls: camera and microphone
{
  const mf = join(app, 'src', 'main', 'AndroidManifest.xml');
  let m = readFileSync(mf, 'utf8');
  const perms = ['android.permission.CAMERA', 'android.permission.RECORD_AUDIO', 'android.permission.MODIFY_AUDIO_SETTINGS'];
  for (const p of perms) if (!m.includes(p)) m = m.replace(/<application/, `<uses-permission android:name="${p}" />\n    <application`);
  if (!m.includes('android.hardware.camera')) m = m.replace(/<application/, `<uses-feature android:name="android.hardware.camera" android:required="false" />\n    <uses-feature android:name="android.hardware.microphone" android:required="false" />\n    <application`);
  writeFileSync(mf, m);
}
console.log(`Android patched: version ${pkg.version}-n${nativeLevel} (${versionCode}), signing ${process.env.KEYSTORE_FILE ? 'release key' : 'NOT SET (debug only)'}, closed-app notifications ${push ? 'ON' : 'off'}`);
