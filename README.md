# Hifz Class Tracker

Classroom attendance and break tracker for hifz teachers. Pure client-side app — all data stays in the browser's local storage on each device, no backend, no accounts.

## Live app

- **Web app / PWA:** https://rfydawood.github.io/hifz-class-tracker/
  Open on any tablet, then "Add to Home Screen" for an installable, offline-capable app. This is the recommended way to install — no security prompts, always up to date automatically.

## Native Android app (optional)

A thin native wrapper (Trusted Web Activity, built with [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap)) around the same live site, for teachers who want it to look like a Play Store–style app.

- **Direct APK download:** https://github.com/rfydawood/hifz-class-tracker/releases/latest
- **Firebase App Distribution** (installs through Google Play's installer, more reliable than a raw APK download): https://console.firebase.google.com/project/hifz-class-tracker-dece7/appdistribution

Because the wrapper just loads the live site, pushing changes to `index.html` updates everyone instantly — no new APK needed, for either install method. A new APK build is only needed if the app's name, icon, or native permissions change.

## Repo layout

- `index.html` — the entire app (HTML/CSS/JS, no build step)
- `manifest.json`, `sw.js`, `icons/` — PWA support (installability + offline)
- `.well-known/assetlinks.json` — lets the native Android app open full-screen with no browser address bar
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
