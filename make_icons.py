from PIL import Image, ImageDraw
import math

LEAF = (15, 123, 123, 255)      # #0F7B7B
INK  = (31, 46, 54, 255)        # #1F2E36
GOLD = (211, 154, 34, 255)      # #D39A22
WHITE = (255, 255, 255, 255)

def rounded_square(size, color, radius_frac=0.225):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = int(size * radius_frac)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=color)
    return img

def draw_book(d, cx, cy, half_w, half_h):
    """Open book glyph, drawn in white, centered at (cx, cy)."""
    spine_top = (cx, cy - half_h * 0.55)
    spine_bot = (cx, cy + half_h * 0.85)
    # left page
    left = [
        (cx, cy - half_h * 0.55),
        (cx - half_w, cy - half_h * 0.85),
        (cx - half_w, cy + half_h * 0.55),
        (cx, cy + half_h * 0.85),
    ]
    # right page
    right = [
        (cx, cy - half_h * 0.55),
        (cx + half_w, cy - half_h * 0.85),
        (cx + half_w, cy + half_h * 0.55),
        (cx, cy + half_h * 0.85),
    ]
    lw = max(2, int(half_w * 0.11))
    d.line(left + [left[0]], fill=WHITE, width=lw, joint='curve')
    d.line(right + [right[0]], fill=WHITE, width=lw, joint='curve')
    d.line([spine_top, spine_bot], fill=WHITE, width=lw)
    # a couple of "text" strokes on each page
    for t in (0.05, 0.28):
        y = cy - half_h * 0.15 + half_h * t * 1.4
        d.line([(cx - half_w * 0.72, y), (cx - half_w * 0.18, y)], fill=WHITE, width=max(2, int(half_w * 0.07)))
        d.line([(cx + half_w * 0.18, y), (cx + half_w * 0.72, y)], fill=WHITE, width=max(2, int(half_w * 0.07)))

def make_icon(size, maskable=False, filename=None):
    if maskable:
        # full-bleed square, no rounding (OS applies its own mask), glyph kept in safe zone
        img = Image.new('RGBA', (size, size), LEAF)
        d = ImageDraw.Draw(img)
        scale = 0.34
    else:
        img = rounded_square(size, LEAF)
        d = ImageDraw.Draw(img)
        scale = 0.30
    cx = cy = size / 2
    half_w = size * scale
    half_h = size * scale
    draw_book(d, cx, cy, half_w, half_h)
    # small gold bookmark accent, top-right of spine
    bm_w = size * 0.06
    bm_h = size * 0.16
    bx = cx
    by = cy - half_h * 0.55
    d.polygon([
        (bx, by - bm_h * 0.1),
        (bx + bm_w, by - bm_h * 0.1),
        (bx + bm_w, by + bm_h),
        (bx, by + bm_h * 0.65),
        (bx - bm_w, by + bm_h),
        (bx - bm_w, by - bm_h * 0.1),
    ], fill=GOLD)
    if filename:
        img.save(filename)
    return img

def make_apple_touch(size=180, filename=None):
    # opaque background (iOS ignores alpha and would show black otherwise)
    img = Image.new('RGBA', (size, size), LEAF)
    d = ImageDraw.Draw(img)
    draw_book(d, size / 2, size / 2, size * 0.30, size * 0.30)
    bm_w = size * 0.06
    bm_h = size * 0.16
    bx = size / 2
    by = size / 2 - size * 0.30 * 0.55
    d.polygon([
        (bx, by - bm_h * 0.1),
        (bx + bm_w, by - bm_h * 0.1),
        (bx + bm_w, by + bm_h),
        (bx, by + bm_h * 0.65),
        (bx - bm_w, by + bm_h),
        (bx - bm_w, by - bm_h * 0.1),
    ], fill=GOLD)
    if filename:
        img.convert('RGB').save(filename)
    return img

def make_icon_transparent_fg(size, filename=None):
    """Adaptive-icon foreground layer: glyph only, transparent background,
    same safe-zone scale as the maskable web icon so it isn't clipped."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    scale = 0.34
    cx = cy = size / 2
    half_w = half_h = size * scale
    draw_book(d, cx, cy, half_w, half_h)
    bm_w = size * 0.06
    bm_h = size * 0.16
    bx = cx
    by = cy - half_h * 0.55
    d.polygon([
        (bx, by - bm_h * 0.1),
        (bx + bm_w, by - bm_h * 0.1),
        (bx + bm_w, by + bm_h),
        (bx, by + bm_h * 0.65),
        (bx - bm_w, by + bm_h),
        (bx - bm_w, by - bm_h * 0.1),
    ], fill=GOLD)
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

print("done")
