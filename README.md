# Hifz Class Tracker

Classroom attendance and break tracker for hifz teachers. Pure client-side app — by default, all data stays in the browser's local storage on each device, no backend, no accounts. An optional cloud sync feature (below) can back a class up online.

## Live app

- **Web app / PWA:** https://rfydawood.github.io/hifz-class-tracker/
  Open on any tablet, then "Add to Home Screen" for an installable, offline-capable app. This is the recommended way to install — no security prompts, always up to date automatically.

## Native Android app (optional)

A fully native Android app, built with [Capacitor](https://capacitorjs.com/) (`capacitor-app/`), for teachers who want it to look like a Play Store–style app. The web app's HTML/CSS/JS is bundled directly inside the app at build time and runs in a plain WebView — no browser chrome, no address bar, no install-time website verification of any kind.

- **Firebase App Distribution** (installs through a Google-provided installer flow): https://console.firebase.google.com/project/hifz-class-tracker-dece7/appdistribution

**This replaced an earlier version built as a Trusted Web Activity** (a thin wrapper that loaded the live site, via [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap), in `android-app/`). That approach required a "digital asset links" file to live at the true root of the `rfydawood.github.io` domain to open without a browser address bar — but this project only controls the `/hifz-class-tracker/` subpath of that domain, not the root, so verification could never fully succeed there for free. `android-app/` is kept only for reference and is no longer built or distributed.

**Trade-off of going fully native:** unlike the old wrapper, this app's content is bundled at build time, so a code change no longer shows up automatically — it needs a new build pushed to Firebase App Distribution (see "Rebuilding the native app" below). The web app / PWA above is unaffected and still updates instantly.

## Optional cloud sync (class codes)

Off by default — nothing changes unless a teacher turns it on from the teacher menu → **Cloud sync**.

- Turning it on generates a random 10-character **class code** (e.g. `AB3XQ-7KLMN`) and starts backing that class's roster/settings/today's data up to Firestore in the background, in addition to the normal local save.
- On another device, entering that same code (teacher menu → Cloud sync → "Load a class using that code") pulls the class down — useful if a tablet is lost, reset, or a teacher wants it on a second device.
- **The code is the only "password."** There's no separate login — anyone who has the exact code can read and write that class's data, the same way anyone with a shared link could. Codes are long, random, and never listable/guessable from outside, but they should still be kept as private as a password. Turning sync off just stops syncing; it doesn't delete the cloud copy.
- Backend: Firebase project `hifz-class-tracker-dece7`, Firestore (`firestore.rules` in this repo — one document per class code, anonymous-auth-gated, not listable, with a size guard), Anonymous Authentication (silent, just used so Firestore rules can require *some* signed-in request). Both were provisioned via `firebase deploy --only firestore,auth` — see `firebase.json`.

## Repo layout

- `index.html` — the entire app (HTML/CSS/JS, no build step)
- `manifest.json`, `sw.js`, `icons/` — PWA support (installability + offline)
- `firebase.json`, `firestore.rules` — cloud sync backend config (see above)
- `capacitor-app/` — the current native Android app (Capacitor). Buildable from scratch; `node_modules/`, Gradle build output, and the built APK are intentionally **not** committed
- `android-app/` — the earlier Trusted Web Activity native wrapper (Bubblewrap). Legacy/reference only — no longer built or distributed (see above)
- `make_icons.py` — regenerates the app icons if the design ever changes

## Rebuilding the native app

The signing key (`android-app/android.keystore`, reused for the Capacitor app too so updates install cleanly over old installs) and its password are kept **local only**, never committed — anyone with them could push updates under this app's identity. They're backed up outside git; ask Rafaye if a rebuild is needed on a new machine.

To rebuild after code changes:
```
cd capacitor-app
cp ../index.html ../manifest.json ../sw.js www/ && cp -r ../icons www/   # pull in the latest web app
npx cap sync android
cd android
./gradlew.bat assembleRelease
# then zipalign + apksigner sign app-release-unsigned.apk with ../../android-app/android.keystore
# (see android-app/KEYSTORE_PASSWORD_KEEP_SAFE.txt), then
# firebase appdistribution:distribute <signed.apk> --app 1:726082000637:android:5627f387c8f7218644d094 --project hifz-class-tracker-dece7 --testers "..."
```
Remember to bump `versionCode`/`versionName` in `capacitor-app/android/app/build.gradle` each time.
