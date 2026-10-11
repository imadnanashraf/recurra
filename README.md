# Recurra

Daily revision for exams and interviews, built on what learning research supports:
testing yourself (retrieval practice), spacing reviews just before you would forget, mixing subjects,
"recall first, then check", rating how sure you were, short blocks with a one-minute break, and a calm, low-distraction screen.

- **Website:** `https://<your-github-name>.github.io/<repo>/`
- **Android app:** `https://github.com/<your-github-name>/<repo>/releases/download/android/recurra.apk`
- Both use the same account, so progress syncs between them.
- Cost: ₹0 (GitHub, Firebase free plan, APK shared directly).

## Using it

1. Create an account (or sign in), then create a **prep** (one exam or goal): empty, or from a syllabus file. Every account starts blank; your preps, questions and progress are saved to your account only.
2. Home → **Add questions or notes** → **Copy AI prompt** → paste it into ChatGPT, Claude or Gemini together with your notes (English or Hinglish) → paste the JSON reply back → **Check** → **Add**.
3. Every day: open the app and press **Start**. The app decides what to ask.
4. Settings → **Daily reminders**: pick your hours. On Android the phone schedules them itself. In a laptop browser they arrive as browser notifications.

## Admin, activity log and deleting accounts

- **Superadmin:** only `adnan.ashraf19@gmail.com` (with a verified email). An **Admin** tab appears for that account:
  people (status, last seen, device, IP, place), each person's preps and activity, and actions:
  open their account, send a password reset email, rename, turn sign-in off/on, delete in 30 days, cancel deletion, delete now.
- **Activity log:** sign-ins, app opens, preps, imports, study sessions, pauses, reminders, account and admin actions,
  each with website / installed app / Android app, device, IP address and rough place (from ipapi.co). Filter by person, kind, place, dates or text. Kept for one year.
- **Deleting an account** (Settings → Delete account): the person is signed out and locked out at once; everything is erased after 30 days.
  The admin can cancel within those 30 days, or delete at once.
- The database rules (`firestore.rules`) enforce all of this. The **Database rules** job publishes them when the file changes;
  the hourly **Accounts** job turns logins off/on and erases accounts whose time is up.

## Test account

`adnan.ashraf19+test@gmail.com` holds a demo prep (4 subjects, 32 questions, 6 notes) and a month of study history, so every screen has data.
The password is random and never stored anywhere: sign in once with **Forgot password?** (the email arrives in the normal Gmail inbox, because Gmail delivers "+test" addresses to the same mailbox) and set your own.
To reset the demo to fresh, edit `samples/demo-prep.json` or run the **Test account** job again.

## Installing the Android app (you and friends)

1. On the phone, open the APK link above and download `recurra.apk`.
2. Open the file. If Android asks, allow "Install unknown apps" for your browser or file manager, then tap **Install**.
3. To update later, download the same link again and install over the old one. Your data stays in your account.

## How this repo works

| Folder or file | What it is |
|---|---|
| `src/` | The app (HTML, CSS, JavaScript). `scripts/build.mjs` joins it into `www/`. |
| `assets/` | App icons. |
| `samples/` | Example syllabus files you can paste in with **From a syllabus or prep file**. Not shown in the app. |
| `reminder/` | Server jobs: the hourly reminder for browser notifications, and the test-account seeding (`seed-demo.mjs`). |
| `config.js` | Your Firebase settings (public by design; data is protected by `firestore.rules`). |
| `.github/workflows/web.yml` | Publishes the website on every change. |
| `.github/workflows/android.yml` | Builds the signed APK and publishes it to the fixed download link. |
| `.github/workflows/remind.yml` | Runs every hour and sends browser reminders at each person's chosen hours. |

## One-time setup (already done for this repo, except where noted)

1. **Firebase:** project with Email/Password sign-in, Firestore in production mode with `firestore.rules`, and the web app settings in `config.js`.
2. **GitHub Pages:** repo Settings → Pages → Source: **GitHub Actions**.
3. **Secrets:** repo Settings → Secrets and variables → Actions:
   - `FIREBASE_SERVICE_ACCOUNT`: the Firebase service-account JSON (for reminders).
   - `ANDROID_KEYSTORE_BASE64` and `ANDROID_KEYSTORE_PASSWORD`: the app signing key. Keep a private copy of the key: losing it means friends must uninstall once to get updates.
4. **Browser reminders (optional):** Firebase console → Project settings → Cloud Messaging → Web Push certificates → **Generate key pair**. Put the key in `config.js` as `vapidKey: "..."`.
5. **Firebase → Authentication → Settings → Authorized domains** must include `<your-github-name>.github.io`.

## Building locally (optional)

```
npm ci
npm run build              # website into www/
npm run android:prepare    # Android project (needs Android Studio / JDK 21 to build the APK)
```

## Credits

Characters in the Today scenes: [Microsoft Fluent Emoji](https://github.com/microsoft/fluentui-emoji) (MIT licence, copy in `assets/fx/`).
