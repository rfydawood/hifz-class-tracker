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

out = "icons"
make_icon(192, maskable=False, filename=f"{out}/icon-192.png")
make_icon(512, maskable=False, filename=f"{out}/icon-512.png")
make_icon(192, maskable=True, filename=f"{out}/icon-maskable-192.png")
make_icon(512, maskable=True, filename=f"{out}/icon-maskable-512.png")
make_apple_touch(180, filename=f"{out}/apple-touch-icon.png")
make_icon(32, maskable=False, filename="favicon.png")
print("done")
