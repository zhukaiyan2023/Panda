#!/usr/bin/env python3
"""tools/make-badge-678.py

Generate badge-6.png, badge-7.png, badge-8.png by templating off
badge-4.png (matches the brush-stroked scalloped edges and digit
style of badges 1-5), following the same recipe as
tools/make-badge-5.py:

  1. Cover the existing "4" with a cream ellipse (the central area
     must be cleared so the new digit reads cleanly).
  2. Draw the new digit in cream-yellow so it reads against the
     cream center.
  3. Hue-shift the yellow body to the target accent color so the
     badge matches the card's accent band (levelPicker.js maps
     L6→PINK, L7→BLUE, L8→ORANGE).

Outputs (overwrites):
  assets/art/badge-6.png
  assets/art/badge-7.png
  assets/art/badge-8.png
"""

from PIL import Image, ImageDraw, ImageFont

W, H = 712, 743

# Same target size / format / coverage as badge-5.py so the badges sit
# identically inside the level card (levelPicker.js badge sprite is
# 78px on a 380px card, 58px on a 250px card).
CREAM = (251, 247, 210, 255)
COVER_R = 220
DIGIT_COLOR = (220, 200, 145, 255)
HIGHLIGHT = (255, 252, 230, 255)

# Yellow detection: matches the body of badge-4.png (high R, mid G,
# low B). Pixels matching this shape get hue-shifted to the target.
def is_yellow_body(r, g, b, a):
    if a < 100:
        return False
    return r > 200 and 130 < g < 240 and b < 110


def load_font():
    # Real macOS name is "Arial Rounded Bold.ttf" (not "Arial Rounded MT Bold"
    # — that name only exists on Windows). Falls back to Helvetica and then
    # PIL's bitmap default if neither is available. Note: silently falling
    # back to the bitmap default shrinks the digit to ~25% of its intended
    # size — callers should verify which font actually loaded if the badges
    # look wrong.
    for path in (
        "/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ):
        try:
            return ImageFont.truetype(path, 700)
        except OSError:
            continue
    return ImageFont.load_default()


def draw_digit(draw, font, text, cx, cy):
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    text_x = cx - (bbox[0] + text_w // 2)
    text_y = cy - (bbox[1] + text_h // 2) + 8
    # Shadow uses the target body color so the digit still has
    # dimensional depth after the yellow→target hue shift below.
    # The shadow is drawn before the main digit (same layered order
    # as badge-5.py).
    yield (text_x + 8, text_y + 10, text, font, "shadow")
    yield (text_x, text_y, text, font, "main")
    yield (text_x - 4, text_y - 4, text, font, "highlight")


def hue_shift_yellow_to(img, target):
    """Map yellow-body pixels to `target` while preserving luminance."""
    pixels = img.load()
    for y in range(H):
        for x in range(W):
            r, g, b, a = pixels[x, y]
            if not is_yellow_body(r, g, b, a):
                continue
            lum = 0.299 * r + 0.587 * g + 0.114 * b
            # Map source yellow luminance onto target hue by
            # interpolating between the target's saturated color
            # and a near-white highlight, modulated by luminance.
            shade = min(1.0, lum / 220.0)
            new_r = int(target[0] * shade + 255 * (1 - shade))
            new_g = int(target[1] * shade + 252 * (1 - shade))
            new_b = int(target[2] * shade + 230 * (1 - shade))
            new_r = min(255, max(0, new_r))
            new_g = min(255, max(0, new_g))
            new_b = min(255, max(0, new_b))
            pixels[x, y] = (new_r, new_g, new_b, a)


# accent colors mirror levelPicker.js CARD_ACCENT[6/7/8]
BADGES = [
    (6, "PINK",   (255, 143, 171)),
    (7, "BLUE",   (124, 199, 255)),
    (8, "ORANGE", (255, 138, 61)),
]


def make_badge(num, name, target_rgb):
    src = Image.open("assets/art/badge-4.png").convert("RGBA")
    img = src.copy()
    draw = ImageDraw.Draw(img)

    cx, cy = W // 2, H // 2 + 8
    # 1. Cover the existing "4" with a cream ellipse.
    draw.ellipse(
        [cx - COVER_R, cy - COVER_R, cx + COVER_R, cy + COVER_R],
        fill=CREAM,
    )

    # 2. Draw the new digit.
    #
    # Contrast stack (the cream-yellow fill alone disappears against the
    # cream center — see user feedback 2026-08-16 "颜色和背景色的冲突").
    # The shadow must be DARK enough to read against the cream center
    # AND must NOT match the yellow-body detector (r>200, 130<g<240,
    # b<110) so the hue shift below leaves it dark, not pastel-tinted.
    # DARK_GREEN works for badge-5 because it's outside that detector
    # (g=142, b=96 — b<110 yes but r=62 fails the r>200 gate). For other
    # target hues we use a much darker dim than the original -50 — the
    # cream fill (220, 200, 145) and the dimmed-target shadow need a
    # brightness gap of ~60 to read at 78px display size.
    font = load_font()
    shadow_color = tuple(max(0, int(c * 0.35)) for c in target_rgb) + (255,)
    text = str(num)
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    text_x = cx - (bbox[0] + text_w // 2)
    text_y = cy - (bbox[1] + text_h // 2) + 8

    # Shadow drawn first (so it sits behind the fill), with a larger
    # offset than badge-5.py — the cream fill is the only thing that
    # sits on the cream center, and a bigger shadow offset gives the
    # eye a clearer anchor.
    draw.text((text_x + 12, text_y + 14), text, fill=shadow_color, font=font)
    draw.text((text_x, text_y), text, fill=DIGIT_COLOR, font=font)
    draw.text((text_x - 4, text_y - 4), text, fill=HIGHLIGHT, font=font)

    # 3. Hue-shift the yellow body to the target color.
    hue_shift_yellow_to(img, target_rgb)

    out = f"assets/art/badge-{num}.png"
    img.save(out, "PNG")
    print(f"Wrote {out} ({W}x{H}, target={name})")


if __name__ == "__main__":
    for num, name, target in BADGES:
        make_badge(num, name, target)