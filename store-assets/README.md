# Store images

Everything Google Play and the Apple App Store ask for, made from the real app
with a made-up practice class. Every name in these images is fictional:
teacher "Ustadh Kareem" (`teacher@example.com`), classes "Morning Hifz Class",
"Evening Revision Class" and "Weekend Tajweed Class", and students with
ordinary first names and a last initial (Bilal R., Hamza T., ...). No real
person, school or account appears, and nothing comes from the live Firebase
project - the screenshots are taken against the local emulators only.

The app's name on the store graphics is **BreakLog**.

## Files

### Google Play (`play/`)

| File | Size | Store slot |
|---|---|---|
| `play/icon-512.png` | 512 x 512, 32-bit PNG (RGBA) | App icon |
| `play/feature-graphic.png` | 1024 x 500 PNG | Feature graphic |
| `play/phone/1-log.png` ... `5-settings.png` (5) | 1080 x 1920 | Phone screenshots |
| `play/tablet-7in/1-log.png` ... `5-settings.png` (5) | 1920 x 1200 | 7-inch tablet screenshots |
| `play/tablet-10in/1-log.png` ... `5-settings.png` (5) | 2560 x 1600 | 10-inch tablet screenshots |

### Apple App Store (`ios/`)

| File | Size | Store slot |
|---|---|---|
| `ios/icon-1024.png` | 1024 x 1024 PNG, RGB, no alpha | App Store icon |
| `ios/iphone-6.9in/1-log.png` ... `5-settings.png` (5) | 1320 x 2868 portrait | iPhone 6.9" display |
| `ios/ipad-13in/1-log.png` ... `5-settings.png` (5) | 2752 x 2064 landscape | iPad 13" display |

All screenshots are PNG without transparency (RGB), which both stores accept.

### The five screens (same order in every set)

1. `1-log` - Log tab: class running since 8:02, 8 in class, 3 out on breaks (one over its limit), one absent, one tardy.
2. `2-reports` - Reports, "This week": totals, minutes out by student, where the time went, worth a look.
3. `3-roster` - Roster with this week's numbers per student.
4. `4-classes` - Profile: the teacher's account and "My classes" (three classes). On phones it is scrolled down to show the classes.
5. `5-settings` - Settings: the schedule (Friday early dismissal, a one-off parents' morning) and break limits.

Pick any 4 or more per set; the stores allow up to 8 (Play) / 10 (Apple).

The pictured day is the most recent Thursday before the run, at 10:47 am, so the
date shown in the screenshots changes when they are regenerated.

## Regenerating

From the repo root, after `npm ci`:

```
npm run store:images    # icons (scripts/store_icons.py) + feature graphic (scripts/store-feature-graphic.mjs)
npm run store:screens   # all screenshots (scripts/store-screens.mjs, inside the emulators)
npm run store:check     # checks every file's size and format (scripts/store_check.py)
```

- `store:images` needs Python with Pillow, and internet for the Manrope font.
  The icons are drawn by the same functions as every other app icon
  (`make_icons.py`), so they always match.
- `store:screens` starts its own Firestore + Auth emulators on ports 8187 /
  9187 / 9188 / 4487 / 4587 (`firebase.store-screens.json`) and serves the app
  on 5187, so it can run while the normal e2e suite uses the default ports. It
  serves `index.html` with the emulator ports swapped in memory; the file on
  disk is never changed. It signs in with a made-up Google account, creates
  the class through the real setup screen, then seeds 8 past class days and
  today through the same test hooks the e2e tests use.
- To redo one device only: `STORE_ONLY=play-phone npm run store:screens`
  (keys: `play-phone`, `play-tablet-7`, `play-tablet-10`, `ios-iphone-69`, `ios-ipad-13`).
