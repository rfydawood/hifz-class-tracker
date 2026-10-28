"""Store icons for Google Play and the App Store, drawn by the same
functions as every other app icon (make_icons.py), so the artwork lives in
one place. Run from the repo root:  python scripts/store_icons.py

- store-assets/play/icon-512.png   512x512, 32-bit RGBA (Play rounds the corners itself)
- store-assets/ios/icon-1024.png   1024x1024, RGB with no alpha (App Store rejects alpha)
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(ROOT, 'make_icons.py'), encoding='utf8').read()
# only the drawing functions - the rest of make_icons.py writes the app's icon files
ns = {}
exec(src.split('\nout = "icons"')[0], ns)

play = ns['make_apple_touch'](512).convert('RGBA')        # full-bleed square, same glyph as the iOS home-screen icon
play.save(os.path.join(ROOT, 'store-assets/play/icon-512.png'))

ios = ns['make_apple_touch'](1024).convert('RGB')
ios.save(os.path.join(ROOT, 'store-assets/ios/icon-1024.png'))

for rel in ('store-assets/play/icon-512.png', 'store-assets/ios/icon-1024.png'):
    im = Image.open(os.path.join(ROOT, rel))
    print(rel, im.size, im.mode)
assert Image.open(os.path.join(ROOT, 'store-assets/ios/icon-1024.png')).mode == 'RGB'
