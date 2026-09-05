#!/usr/bin/env python3
"""Flood-fill the background of a generated image to transparent, then trim.

Invoked by tools/cutout.mjs; see that file for the rationale. Summary: the
background is removed by a border-seeded flood fill so that same-colored pixels
*inside* the character (a panda's white belly against a white backdrop) survive.
"""

import argparse
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageFilter


def build_background_mask(rgb: np.ndarray, tolerance: float, mode: str):
    """Return (mask, ref): a bool mask True for background, and the backdrop color.

    Two strategies, because they fail in opposite ways:

    "flood" seeds from the image border and grows through near-backdrop pixels.
    Only pixels *connected* to the border are removed, so a white belly against
    a white backdrop survives. But it cannot reach an enclosed hole — the inside
    of a hollow frame stays opaque.

    "global" removes every pixel near the backdrop color wherever it sits. That
    empties hollow shapes correctly, and it is safe precisely when the backdrop
    is a chroma-key color that appears nowhere in the subject.
    """
    h, w, _ = rgb.shape
    arr = rgb.astype(np.int16)

    # Reference color = median of the border ring. Median rather than mean so a
    # character that runs off the edge of the frame biases the result less.
    border = np.concatenate([
        arr[0, :, :], arr[h - 1, :, :], arr[:, 0, :], arr[:, w - 1, :],
    ])
    ref = np.median(border, axis=0)

    dist = np.sqrt(((arr - ref) ** 2).sum(axis=2))
    eligible = dist <= tolerance

    if mode == "global":
        return eligible, ref

    mask = np.zeros((h, w), dtype=bool)
    queue = deque()

    def push(y, x):
        if 0 <= y < h and 0 <= x < w and eligible[y, x] and not mask[y, x]:
            mask[y, x] = True
            queue.append((y, x))

    for x in range(w):
        push(0, x)
        push(h - 1, x)
    for y in range(h):
        push(y, 0)
        push(y, w - 1)

    while queue:
        y, x = queue.popleft()
        push(y - 1, x)
        push(y + 1, x)
        push(y, x - 1)
        push(y, x + 1)

    return mask, ref


def despill(rgb: np.ndarray, alpha: np.ndarray, ref: np.ndarray) -> np.ndarray:
    """Pull the backdrop color out of soft edge pixels.

    A chroma-key backdrop bleeds into anti-aliased edges, leaving a green (or
    magenta) fringe that is very visible once the sprite sits on cream. Edge
    pixels are pixels with partial alpha; for those we blend toward the local
    achromatic value in proportion to how much backdrop they carry.
    """
    edge = (alpha > 0) & (alpha < 255)
    if not edge.any():
        return rgb
    out = rgb.astype(np.float32).copy()
    # How strongly the backdrop's dominant channel exceeds the other two tells
    # us how much spill to remove; a neutral pixel gets left alone.
    dom = int(np.argmax(ref))
    others = [c for c in range(3) for _ in (0,) if c != dom]
    px = out[edge]
    cap = px[:, others].max(axis=1)
    excess = np.clip(px[:, dom] - cap, 0, None)
    px[:, dom] -= excess
    out[edge] = px
    return np.clip(out, 0, 255).astype(np.uint8)


def trim_to_content(img: Image.Image, pad: int) -> Image.Image:
    """Crop to the alpha bounding box, then re-add `pad` transparent pixels.

    Trimming matters because generated art is rarely centered or consistently
    scaled; cropping to content lets the game size sprites by their real extent
    instead of by however much empty margin the model happened to leave.
    """
    bbox = img.getchannel("A").getbbox()
    if bbox is None:
        return img
    img = img.crop(bbox)
    if pad <= 0:
        return img
    padded = Image.new("RGBA", (img.width + pad * 2, img.height + pad * 2), (0, 0, 0, 0))
    padded.paste(img, (pad, pad))
    return padded


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="src", required=True)
    ap.add_argument("--out", dest="dst", required=True)
    ap.add_argument("--tolerance", type=float, default=42.0)
    ap.add_argument("--feather", type=float, default=1.0)
    ap.add_argument("--pad", type=int, default=8)
    ap.add_argument("--despill", action="store_true",
                    help="remove chroma backdrop bleed from soft edges")
    ap.add_argument("--mode", choices=("flood", "global"), default="flood",
                    help="flood: border-connected only (default); "
                         "global: every near-backdrop pixel, for hollow shapes")
    ap.add_argument("--no-trim", dest="trim", action="store_false")
    args = ap.parse_args()

    img = Image.open(args.src).convert("RGB")
    rgb = np.array(img)

    mask, ref = build_background_mask(rgb, args.tolerance, args.mode)

    coverage = mask.mean()
    # In "flood" mode, high coverage means the fill escaped into the subject —
    # fail loudly so a missing sprite is loud, not silent. In "global" mode a
    # hollow frame is *supposed* to be mostly transparent, so coverage itself
    # isn't a useful safety check; we rely on the user to pass sensible
    # tolerance for the chroma distance instead.
    if args.mode == "flood" and coverage > 0.97:
        print(f"ERROR: flood fill consumed {coverage:.1%} of the image; "
              f"lower --tolerance (currently {args.tolerance})", file=sys.stderr)
        return 2

    alpha = np.where(mask, 0, 255).astype(np.uint8)

    if args.feather > 0:
        # Soften the cut edge. Without this the boundary keeps a hard fringe of
        # background-colored pixels that reads as a halo once the sprite is
        # scaled up on the canvas.
        alpha = np.array(
            Image.fromarray(alpha).filter(ImageFilter.GaussianBlur(args.feather))
        )

    if args.despill:
        rgb = despill(rgb, alpha, ref)

    out = Image.fromarray(np.dstack([rgb, alpha]), mode="RGBA")

    if args.trim:
        out = trim_to_content(out, args.pad)

    out.save(args.dst, "PNG", optimize=True)
    print(f"OK {out.width}x{out.height} bg={coverage:.1%} -> {args.dst}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
