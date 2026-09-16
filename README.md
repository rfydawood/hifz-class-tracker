# Hifz Class Tracker

Classroom attendance and break tracker for hifz teachers. Pure client-side app — by default, all data stays in the browser's local storage on each device, no backend, no accounts. An optional cloud sync feature (below) can back a class up online.

## Live app

- **Web app / PWA:** https://rfydawood.github.io/hifz-class-tracker/
  Open on any tablet, then "Add to Home Screen" for an installable, offline-capable app. This is the recommended way to install — no security prompts, always up to date automatically.

## Native Android app (optional)

A thin native wrapper (Trusted Web Activity, built with [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap)) around the same live site, for teachers who want it to look like a Play Store–style app.

- **Direct APK download:** https://github.com/rfydawood/hifz-class-tracker/releases/latest
- **Firebase App Distribution** (installs through Google Play's installer, more reliable than a raw APK download): https://console.firebase.google.com/project/hifz-class-tracker-dece7/appdistribution

Because the wrapper just loads the live site, pushing changes to `index.html` updates everyone instantly — no new APK needed, for either install method. A new APK build is only needed if the app's name, icon, or native permissions change.

## Optional cloud sync (class codes)

Off by default — nothing changes unless a teacher turns it on from the teacher menu → **Cloud sync**.

- Turning it on generates a random 10-character **class code** (e.g. `AB3XQ-7KLMN`) and starts backing that class's roster/settings/today's data up to Firestore in the background, in addition to the normal local save.
- On another device, entering that same code (teacher menu → Cloud sync → "Load a class using that code") pulls the class down — useful if a tablet is lost, reset, or a teacher wants it on a second device.
- **The code is the only "password."** There's no separate login — anyone who has the exact code can read and write that class's data, the same way anyone with a shared link could. Codes are long, random, and never listable/guessable from outside, but they should still be kept as private as a password. Turning sync off just stops syncing; it doesn't delete the cloud copy.
- Backend: Firebase project `hifz-class-tracker-dece7`, Firestore (`firestore.rules` in this repo — one document per class code, anonymous-auth-gated, not listable, with a size guard), Anonymous Authentication (silent, just used so Firestore rules can require *some* signed-in request). Both were provisioned via `firebase deploy --only firestore,auth` — see `firebase.json`.

## Repo layout

- `index.html` — the entire app (HTML/CSS/JS, no build step)
- `manifest.json`, `sw.js`, `icons/` — PWA support (installability + offline)
- `.well-known/assetlinks.json` — lets the native Android app open full-screen with no browser address bar
- `firebase.json`, `firestore.rules` — cloud sync backend config (see above)
- `android-app/` — the native Android wrapper project (Gradle/Bubblewrap). Buildable from scratch; the signing key and built APK are intentionally **not** committed (see below)
- `make_icons.py` — regenerates the app icons if the design ever changes

## Rebuilding the native app

The signing key (`android-app/android.keystore`) and its password are kept **local only**, never committed — anyone with them could push updates under this app's identity. They're backed up outside git; ask Rafaye if a rebuild is needed on a new machine.

To rebuild after code changes:
```
cd android-app
node generate.js          # regenerates the project from the live manifest.json
./gradlew.bat assembleRelease
# then zipalign + apksigner sign with android.keystore (see KEYSTORE_PASSWORD_KEEP_SAFE.txt)
```
