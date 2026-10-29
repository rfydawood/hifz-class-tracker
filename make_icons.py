from PIL import Image, ImageDraw

LEAF = (15, 123, 123, 255)      # #0F7B7B
INK  = (31, 46, 54, 255)        # #1F2E36
GOLD = (242, 181, 58, 255)      # #F2B53A, the minute hand and centre dot
WHITE = (255, 255, 255, 255)

def rounded_square(size, color, radius_frac=0.225):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = int(size * radius_frac)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=color)
    return img

def ring_layer(size, scale=1.0):
    """The BreakLog mark: a white open ring with its top-right quarter missing,
    and clock hands inside - a white hour hand and a gold minute hand, both
    pointing toward the gap, on a gold centre dot. Drawn on a 100-unit grid
    (ring radius 24, stroke 10), 4x up and scaled down for smooth edges;
    returns a transparent RGBA layer."""
    ss = 4
    big = size * ss
    layer = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    u = big / 100 * scale          # one grid unit
    c = big / 2
    def pt(x, y):                  # grid offset from the centre -> pixels
        return (c + x * u, c + y * u)
    outer = 29 * u                 # radius 24 + half the stroke
    box = [c - outer, c - outer, c + outer, c + outer]
    # PIL angles run clockwise from 3 o'clock; the gap is 12 to 3 o'clock
    d.arc(box, start=0, end=270, fill=WHITE, width=int(round(10 * u)))
    def hand(x, y, width, color):  # a line with round ends
        r = width * u / 2
        d.line([pt(0, 0), pt(x, y)], fill=color, width=int(round(width * u)))
        ex, ey = pt(x, y)
        d.ellipse([ex - r, ey - r, ex + r, ey + r], fill=color)
    hand(-8, -5.5, 5.5, WHITE)     # hour hand
    hand(11, -11, 4.5, GOLD)       # minute hand
    cx, cy = pt(0, 0)
    r = 4.2 * u
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=GOLD)
    return layer.resize((size, size), Image.LANCZOS)

def make_icon(size, maskable=False, filename=None):
    if maskable:
        # full-bleed square, no rounding (OS applies its own mask), mark kept in safe zone
        img = Image.new('RGBA', (size, size), LEAF)
    else:
        img = rounded_square(size, LEAF)
    img.alpha_composite(ring_layer(size))
    if filename:
        img.save(filename)
    return img

def make_apple_touch(size=180, filename=None):
    # opaque background (iOS ignores alpha and would show black otherwise)
    img = Image.new('RGBA', (size, size), LEAF)
    img.alpha_composite(ring_layer(size))
    if filename:
        img.convert('RGB').save(filename)
    return img

def make_icon_transparent_fg(size, filename=None):
    """Adaptive-icon foreground layer: the mark only, transparent background.
    Android shows the middle 72/108 of this layer, so the mark is drawn at
    that fraction to match the other launcher icons."""
    img = ring_layer(size, scale=72 / 108)
    if filename:
        img.save(filename)
    return img

def circle_mask(img):
    size = img.size[0]
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, size - 1, size - 1], fill=255)
    out = img.copy()
    out.putalpha(mask)
    return out

def make_splash(w, h, filename=None):
    """Centered brand icon on a plain white field - a calm loading screen,
    not full-bleed art, replacing Capacitor's stock blue X."""
    img = Image.new('RGB', (w, h), (255, 255, 255))
    icon_size = int(min(w, h) * 0.42)
    icon = make_icon(icon_size, maskable=False)
    img.paste(icon, ((w - icon_size) // 2, (h - icon_size) // 2), icon)
    if filename:
        img.save(filename)
    return img

def make_ios_app_icon(size=1024, filename=None):
    """App Store / Xcode icon: full-bleed, opaque RGB (Apple rejects alpha;
    iOS rounds the corners itself). Same artwork as the apple-touch icon,
    drawn at full size rather than upscaled."""
    img = make_apple_touch(size).convert('RGB')
    if filename:
        img.save(filename)
    return img

APP_BG = (0xE3, 0xEA, 0xEC)  # #E3EAEC, the app's background (capacitor.config.json)

def make_ios_splash(size=2732, filename=None):
    """iOS launch image: the app background colour with the rounded icon in
    the middle. LaunchScreen.storyboard scales it to fill the screen, so the
    icon is kept small (about a fifth of the square)."""
    img = Image.new('RGB', (size, size), APP_BG)
    icon_size = int(size * 0.2)
    icon = make_icon(icon_size, maskable=False)
    img.paste(icon, ((size - icon_size) // 2, (size - icon_size) // 2), icon)
    if filename:
        img.save(filename)
    return img

out = "icons"
make_icon(192, maskable=False, filename=f"{out}/icon-192.png")
make_icon(512, maskable=False, filename=f"{out}/icon-512.png")
make_icon(192, maskable=True, filename=f"{out}/icon-maskable-192.png")
make_icon(512, maskable=True, filename=f"{out}/icon-maskable-512.png")
make_apple_touch(180, filename=f"{out}/apple-touch-icon.png")
make_icon(32, maskable=False, filename="favicon.png")

# Android launcher icons + splash - see capacitor-app/android/app/src/main/res/.
# Android's own slots, regenerated from the same drawing functions above so
# there is exactly one place this artwork is defined.
android_res = "capacitor-app/android/app/src/main/res"
launcher_sizes = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
foreground_sizes = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}
for density, size in launcher_sizes.items():
    square = make_icon(size, maskable=False)
    square.save(f"{android_res}/mipmap-{density}/ic_launcher.png")
    circle_mask(make_icon(size, maskable=True)).save(f"{android_res}/mipmap-{density}/ic_launcher_round.png")
for density, size in foreground_sizes.items():
    make_icon_transparent_fg(size, filename=f"{android_res}/mipmap-{density}/ic_launcher_foreground.png")

splash_sizes = {
    "drawable/splash.png": (480, 320),
    "drawable-land-mdpi/splash.png": (480, 320),
    "drawable-land-hdpi/splash.png": (800, 480),
    "drawable-land-xhdpi/splash.png": (1280, 720),
    "drawable-land-xxhdpi/splash.png": (1600, 960),
    "drawable-land-xxxhdpi/splash.png": (1920, 1280),
    "drawable-port-mdpi/splash.png": (320, 480),
    "drawable-port-hdpi/splash.png": (480, 800),
    "drawable-port-xhdpi/splash.png": (720, 1280),
    "drawable-port-xxhdpi/splash.png": (960, 1600),
    "drawable-port-xxxhdpi/splash.png": (1280, 1920),
}
for rel, (w, h) in splash_sizes.items():
    make_splash(w, h, filename=f"{android_res}/{rel}")

# iOS (capacitor-app/ios/App/App/Assets.xcassets/).
ios_assets = "capacitor-app/ios/App/App/Assets.xcassets"
make_ios_app_icon(1024, filename=f"{ios_assets}/AppIcon.appiconset/AppIcon-512@2x.png")
for name in ("splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"):
    make_ios_splash(2732, filename=f"{ios_assets}/Splash.imageset/{name}")

print("done")
