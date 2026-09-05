#!/usr/bin/env python3
"""tools/make-badge-5.py
Generate badge-5.png by:
  1. Loading badge-4.png as the style template (matches the brush-
     stroked scalloped edges and digit style of badges 1-4).
  2. Covering the existing "4" with a cream rectangle (the full
     central area must be cleared, not just a circle).
  3. Drawing a "5" in cream-yellow (matching the original "4" color)
     so the digit reads against the cream center.
  4. Hue-shifting the yellow/orange body to green (SUCCESS color).

Output: assets/art/badge-5.png (712x743 RGBA, transparent)
"""

import math
from PIL import Image, ImageDraw, ImageFont

W, H = 712, 743

# Load badge-4 as the style template
src = Image.open("assets/art/badge-4.png").convert("RGBA")
img = src.copy()
draw = ImageDraw.Draw(img)

# 1. Cover the existing "4" with a cream circle. The cream center
# in badge-4 is a roughly circular region (~200px radius) at center.
cx, cy = W // 2, H // 2 + 8
COVER_R = 220  # radius of the cream cover circle

# Use the cream color from badge-4. Sample a known cream pixel.
CREAM = (251, 247, 210, 255)
draw.ellipse(
    [cx - COVER_R, cy - COVER_R, cx + COVER_R, cy + COVER_R],
    fill=CREAM,
)

# 2. Draw "5" in the same digit color as the original "4"
# (cream-yellow so it reads against the cream center).
try:
    font = ImageFont.truetype(
        "/System/Library/Fonts/Supplemental/Arial Rounded MT Bold.ttf", 320
    )
except OSError:
    try:
        font = ImageFont.truetype(
            "/System/Library/Fonts/Helvetica.ttc", 320
        )
    except OSError:
        font = ImageFont.load_default()

text = "5"
bbox = draw.textbbox((0, 0), text, font=font)
text_w = bbox[2] - bbox[0]
text_h = bbox[3] - bbox[1]
text_x = cx - (bbox[0] + text_w // 2)
text_y = cy - (bbox[1] + text_h // 2) + 8

# Use a slightly darker cream-yellow so the digit reads against the
# cream center. badge-4 "4" is roughly (240, 214, 165) — we'll use
# (220, 200, 145) for contrast.
DIGIT_COLOR = (220, 200, 145, 255)
# White highlight on top-left
HIGHLIGHT = (255, 252, 230, 255)
# Soft green drop shadow for depth
DARK_GREEN = (62, 142, 96, 255)

# Layered draw: shadow → main → highlight
draw.text((text_x + 8, text_y + 10), text, fill=DARK_GREEN, font=font)
draw.text((text_x, text_y), text, fill=DIGIT_COLOR, font=font)
draw.text((text_x - 4, text_y - 4), text, fill=HIGHLIGHT, font=font)

# 3. Hue-shift the yellow body to green. Walk every pixel and map
# yellow-tinted pixels to green-tinted pixels.
pixels = img.load()
for y in range(H):
    for x in range(W):
        r, g, b, a = pixels[x, y]
        if a == 0 or a < 100:
            continue
        # Yellow/orange body: high R, mid G, low B
        if r > 200 and g > 130 and g < 240 and b < 110:
            # Map yellow → green
            lum = 0.299 * r + 0.587 * g + 0.114 * b
            base = (108, 194, 138)  # SUCCESS
            shade = min(1.0, lum / 220.0)
            new_r = int(base[0] * shade + (255 - 220) * (1 - shade))
            new_g = int(base[1] * shade)
            new_b = int(base[2] * shade + 50 * (1 - shade))
            new_r = min(255, max(0, new_r))
            new_g = min(255, max(0, new_g))
            new_b = min(255, max(0, new_b))
            pixels[x, y] = (new_r, new_g, new_b, a)

# Save
img.save("assets/art/badge-5.png", "PNG")
print(f"Wrote assets/art/badge-5.png ({W}x{H})")
