#!/usr/bin/env python3
# tools/resize-png.py — resize a PNG to a target width x height using PIL.
# Bypassed if the requested size matches the current size.

import argparse
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("ERROR: PIL not available; install with `pip3 install pillow`", file=sys.stderr)
    sys.exit(3)


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--in", dest="src", required=True)
    p.add_argument("--out", dest="dst", required=True)
    p.add_argument("--w", type=int, required=True)
    p.add_argument("--h", type=int, required=True)
    args = p.parse_args()

    src = Path(args.src)
    dst = Path(args.dst)
    if not src.exists():
        print(f"ERROR: input not found: {src}", file=sys.stderr)
        return 4

    img = Image.open(src)
    src_size = img.size
    if img.size == (args.w, args.h):
        # Already the right size — just copy to keep the workflow uniform.
        img.save(dst)
        print(f"OK {src_size[0]}x{src_size[1]} (no resize needed) -> {dst}")
        return 0
    # High-quality downscale for the wide strip; LANCZOS keeps grass blades
    # sharp instead of muddy.
    img.resize((args.w, args.h), Image.LANCZOS).save(dst)
    print(f"OK {src_size[0]}x{src_size[1]} -> {args.w}x{args.h} -> {dst}")
    return 0


if __name__ == "__main__":
    sys.exit(main())