"""Checks every store image's size and format. Run from the repo root:
    python scripts/store_check.py      (or: npm run store:check)
Exits non-zero if anything is missing or the wrong size/mode."""
import os, sys, glob
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SA = os.path.join(ROOT, 'store-assets')
EXPECT = {  # path glob -> (width, height, allowed modes, minimum count)
    'play/icon-512.png': (512, 512, {'RGBA'}, 1),
    'play/feature-graphic.png': (1024, 500, {'RGB', 'RGBA'}, 1),
    'ios/icon-1024.png': (1024, 1024, {'RGB'}, 1),
    'play/phone/*.png': (1080, 1920, {'RGB', 'RGBA'}, 4),
    'play/tablet-7in/*.png': (1920, 1200, {'RGB', 'RGBA'}, 4),
    'play/tablet-10in/*.png': (2560, 1600, {'RGB', 'RGBA'}, 4),
    'ios/iphone-6.9in/*.png': (1320, 2868, {'RGB', 'RGBA'}, 4),
    'ios/ipad-13in/*.png': (2752, 2064, {'RGB', 'RGBA'}, 4),
}
bad = 0
for pattern, (w, h, modes, n) in EXPECT.items():
    files = sorted(glob.glob(os.path.join(SA, pattern)))
    if len(files) < n:
        print(f'MISSING  {pattern}: {len(files)} file(s), need {n}'); bad += 1
    for f in files:
        im = Image.open(f)
        ok = im.size == (w, h) and im.mode in modes and im.format == 'PNG'
        bad += not ok
        print(f"{'ok' if ok else 'WRONG':8} {os.path.relpath(f, SA).replace(os.sep, '/'):36} {im.size[0]}x{im.size[1]} {im.mode}")
print('all good' if not bad else f'{bad} problem(s)')
sys.exit(1 if bad else 0)
