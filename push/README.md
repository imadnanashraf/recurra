# Notifications when the app is closed (free, one-time setup, about 10 minutes)

Recurra already shows pop-ups, sounds and badges while it is open, and phone or computer
notifications while it is in the background. For notifications when the app is **fully closed**,
a tiny free "push sender" runs on Cloudflare. It costs ₹0 and needs no card.

The code is ready (`push/worker.js`). It only does three things:
1. checks who is asking (their Recurra sign-in),
2. checks they may notify that person (you are friends, or they invited you to their live test),
3. sends the notification to that person's phone or browser.

## What you do (once)

1. **Make a free Cloudflare account:** go to <https://dash.cloudflare.com/sign-up>, sign up with your email and confirm it. No card is asked.
2. **Turn on Workers:** in the Cloudflare dashboard, open **Workers & Pages** once. If it asks, choose your free `workers.dev` name (any name, for example `recurra`).
3. **Copy your Account ID:** it is shown on the right side of the **Workers & Pages** page (also under any domain's Overview). Keep it for step 5.
4. **Make an API token:** click your profile icon (top right) → **My Profile** → **API Tokens** → **Create Token** → use the template **Edit Cloudflare Workers** → for *Account Resources* pick your account, for *Zone Resources* pick **All zones** → **Continue to summary** → **Create Token**. Copy the token (it is shown only once).
5. **Give both to GitHub:** open the repo on GitHub → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:
   - Name `CLOUDFLARE_API_TOKEN`, value: the token from step 4.
   - Name `CLOUDFLARE_ACCOUNT_ID`, value: the Account ID from step 3.
6. **Start it:** GitHub → **Actions** → **Push sender** → **Run workflow**. A green tick means it is live; the app finds it by itself.
7. **Android app:** GitHub → **Actions** → **Build Android app** → **Run workflow**, then install the new `recurra.apk` over the old one. (This build also registers the Android app with Firebase for you.)
8. **On each phone or browser:** open Recurra → chat button → **Turn on** notifications when asked.

That's it. Nothing else to maintain. The free Cloudflare plan allows 100,000 requests a day, far more than needed.

## If something does not work

- *Push sender* job says "No workers.dev address found": do step 2 (open Workers & Pages once and pick a name), then run the job again.
- *Build Android app* shows a note "Could not get the Android Firebase settings": in the Firebase console, **Project settings → Your apps → Add app → Android**, package name `app.recurra`, then run *Build Android app* again.
- No notification on a laptop: the browser must allow notifications for the Recurra site, and the computer must be on. Phones need Recurra's notifications allowed in phone Settings.
