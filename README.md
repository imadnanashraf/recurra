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

## Syllabus (optional)

- A prep's syllabus is its subjects (name, short code, part) and, optionally, each subject's **topics**.
  Subjects can be added by hand (Add questions or notes → Subjects) or imported; topics are typed one per line on the
  **Syllabus** tab or imported from the official syllabus with the AI prompt. Importing adds new topics and keeps yours.
- Questions and notes are matched to topics automatically by their topic name (nothing extra to do). Topics with no
  questions show as gaps; **Fill the gaps** copies an AI prompt for exactly those topics.
- One tap on a topic's circle marks it studied. Rings show % studied (outer) and % strong in memory (inner).

## Friends and chat

- **Your profile:** first name, last name and a unique **@username** (small letters, numbers, `_` or `.`, 3 to 20 characters). Everyone picks one once; change it in Settings → Profile.
- **Find friends** with the chat button at the top: type a @username, a name, or their **exact** email. Emails are never shown; the app stores only a one-way fingerprint (SHA-256) of each email, so it can match an exact email but cannot list them.
- A **friend request** must be accepted before you can chat. You can remove or block a friend any time (⋯ in the chat).
- **Chats are live:** messages, "Seen", requests and the unread badge update on their own. Tap your own message to delete it.
- **Private:** the database rules let only the two friends read a chat. The admin cannot read chats; the activity log only notes things like "sent a friend request".
- **Sharing:** the **+** in a chat shares MCQs or notes (a whole subject or one topic, up to 300), your syllabus, or **asks** your friend for one. Nothing is copied until the receiver taps **Add to my prep**; they pick the subject (the same checks as a normal paste) and get their own copy. Progress is never shared.
- **Merging:** the same question (same subject and question text) or the same note (same title) is never added twice. From a friend, *your* version is kept and only missing parts are filled in (note points are combined); you can choose **Use theirs**. Reworded questions with the same answer are shown as "similar" and skipped unless you choose **Add anyway**. A shared syllabus is merged into yours by subject name, keeping your names.
- **Live tests:** start one from Friends (🏁 Live test) or the **+** in a chat. Invite up to 4 friends, pick a subject or topic (or mixed), 10/20/30 questions and a time limit. Everyone gets the same questions, each in their own order with shuffled options. A live race bar and short pop-ups ("⚡ You're faster than Faria!", "🏁 Ali finished: 17/20") keep it fun. Results show a podium, scores and times, and the **trap questions** most people got wrong, with explanations. Questions you got wrong can be added to your prep, and answers to questions already in your prep count toward your revision.
- **Test history** (Progress → Live tests, or 🏆 My tests in Friends): every test is saved: your score chart, wins, head-to-head against each friend, and badges.
- **Notifications:** while the app is open or in the background you get pop-ups, soft sounds (Settings → Sounds) and phone/computer notifications. For notifications when the app is **fully closed**, set up the free push sender once: see [push/README.md](push/README.md).
- **Help:** Settings → Help and questions (tutorials and FAQ in easy English).
- When an account is erased, its username, profile, friendships, chats and live tests are erased too.

## Admin, activity log and deleting accounts

- **Superadmin:** only `adnan.ashraf19@gmail.com` (with a verified email). An **Admin** tab appears for that account:
  people (status, last seen, device, IP, place), each person's preps and activity, and actions:
  open their account, send a password reset email, rename, turn sign-in off/on, delete in 30 days, cancel deletion, delete now.
- **Activity log:** sign-ins, app opens, preps, imports, study sessions, pauses, reminders, account and admin actions,
  each with website / installed app / Android app, device, IP address and rough place (from ipapi.co). Filter by person, kind, place, dates or text. Kept for one year.
- **Passwords:** anyone can change their own password in Settings (current password + new one, no email). The admin can set
  someone's password on their page; the account job applies it (under a minute with a GitHub key saved in Settings → Admin,
  otherwise within 10 minutes), deletes it from the database straight away and signs that person out everywhere.
  Passwords themselves are kept only by Firebase Authentication as salted scrypt hashes; the app never stores or sees them.
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
