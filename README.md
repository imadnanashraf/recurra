# SI Telecom Prep

Your free study app for the JKSSB SI Telecommunication exam.
- **App:** GitHub Pages (free link, works on laptop and phone)
- **Sync between devices:** Firebase (free plan)
- **Reminders:** GitHub runs a check 4 times a day and notifies your phone through the free ntfy app
- **Questions:** the `.md` files in `data/`, which Claude writes for you

Setup takes about 20 minutes, once. Do it on a laptop.

---

## A. Firebase (sync)

1. Go to https://console.firebase.google.com → **Create a project**. Name: `si-telecom`. Turn **off** Google Analytics. Create.
2. Left menu **Build → Authentication → Get started**. Choose **Email/Password**, switch on the first toggle, **Save**.
   Then open the **Users** tab → **Add user** → enter your email and a password. Copy the **User UID** shown in the list (you need it in B4).
3. Left menu **Build → Firestore Database → Create database**. Location: **asia-south1 (Mumbai)**. Start in **production mode**. Create.
4. In Firestore open the **Rules** tab. Replace everything with the contents of `firestore.rules` from this folder. **Publish**.
5. Click the gear ⚙ → **Project settings**. Under **Your apps**, click the web icon `</>`. Nickname `si-telecom`, do **not** tick Hosting, **Register app**.
   It shows a `firebaseConfig = { ... }` block. Open `config.js` in this folder and replace `null` with that `{ ... }` block. Save.
6. Still in Project settings, open the **Service accounts** tab → **Generate new private key** → it downloads a `.json` file. Keep it private (it is only for reminders, step B4).

## B. GitHub (the app's home)

1. Sign in at https://github.com (create a free account if needed). Click **+ → New repository**. Name: `si-telecom`. **Public**. Create.
2. On the new repo page click **uploading an existing file**. Drag in **everything** from this folder (including `config.js`). Click **Commit changes**.
   Check that the repo shows a `.github` folder. If it is missing (some computers hide it), click **Add file → Create new file**, type the name `.github/workflows/remind.yml`, paste the contents of that file from this folder, and commit.
3. Repo **Settings → Pages**. Source: **Deploy from a branch**. Branch: **main**, folder **/ (root)**. **Save**.
   After about a minute your app is live at `https://YOUR-USERNAME.github.io/si-telecom/`.
4. Repo **Settings → Secrets and variables → Actions → New repository secret**. Add three secrets:
   - `FIREBASE_SERVICE_ACCOUNT` → open the `.json` file from A6 in a text editor, copy **all** of it, paste
   - `USER_UID` → the User UID from A2
   - `NTFY_TOPIC` → make up a hard-to-guess name, letters and dashes only, e.g. `si-telecom-k7p2x9q4m` (anyone who knows it can see your reminders)
5. Back in Firebase: **Authentication → Settings → Authorized domains → Add domain** → `YOUR-USERNAME.github.io`.

## C. Phone notifications

1. Install **ntfy** from the Play Store or App Store.
2. Tap **+**, enter the same topic name as `NTFY_TOPIC`, keep the server as `ntfy.sh`, **Subscribe**. Allow notifications.
3. Test: on GitHub open the repo's **Actions** tab → **Study reminder** → **Run workflow**. Within a minute your phone should get "… questions waiting today". (If you already finished today's review, it sends nothing. That is correct.)

## D. Use it

- Open your app link on the laptop and on the phone. Sign in once on each with the email and password from A2.
- On the phone: browser menu → **Add to Home screen**, so it opens like an app.
- Every day: open it, press **Start**. That's all.

---

## Adding new questions from Claude

Claude gives you a file like `CN.md` (for Computer Science & Networking).
1. On GitHub, open the repo → `data` → `mcq` (or `notes` for revision notes).
2. **Add file → Upload files** → drop the file in. A file with the same name is replaced. **Commit changes**.
3. Wait about a minute, then refresh the app. New questions appear in your next review by themselves.

Never edit a question's ID (like `CN-TL-001`); your progress is saved under it.

## Good to know

- Reminders: 11:51 am, 3:51 pm, 7:51 pm and 9:51 pm India time. To change them, edit the `cron` line in `.github/workflows/remind.yml` (times there are UTC, India = UTC + 5:30). GitHub may run them a few minutes late.
- GitHub pauses scheduled jobs in a repo that has had no commits for 60 days. Uploading new question files keeps it active.
- Everything here is on free plans. Daily use is far below Firebase's free limits.
- Without internet the app still works and saves on the device; it syncs when you are back online.
# si-telecom
