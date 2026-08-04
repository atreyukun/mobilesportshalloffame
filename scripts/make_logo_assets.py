"""Build transparent logo/crest PNGs from the source logo artwork.

Only the outer white page background is removed (flood fill from the image
border), so the light silver shield inside the mark stays opaque.

Defaults write the live site assets. Pass --source/--out-dir to try a different
version of the logo without touching them.
"""
from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(r"d:\httpsmobilesportshalloffame")
SOURCE = ROOT / "assets" / "New_Mobile_HoF3.jpg"
# Widths cover ~3x device pixel ratio at the largest place each asset is used
# (logo in the home hero, crest overlay in the inductee modal).
WIDTHS = [("logo.png", 560), ("crest.png", 300)]
FAVICON_SIZES = [16, 32, 48, 64, 128, 256]

# A pixel joins the background only if it is this close to pure white.
WHITE_MIN = 244


def is_white(px: tuple[int, int, int, int]) -> bool:
    r, g, b = px[0], px[1], px[2]
    return r >= WHITE_MIN and g >= WHITE_MIN and b >= WHITE_MIN


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=SOURCE)
    parser.add_argument("--out-dir", type=Path, default=ROOT / "assets")
    args = parser.parse_args()
    args.out_dir.mkdir(parents=True, exist_ok=True)
    outputs = [(args.out_dir / name, width) for name, width in WIDTHS]
    favicon = args.out_dir / "favicon.ico"

    im = Image.open(args.source).convert("RGBA")
    w, h = im.size
    px = im.load()

    background = bytearray(w * h)
    queue: deque[tuple[int, int]] = deque()

    for x in range(w):
        for y in (0, h - 1):
            if is_white(px[x, y]) and not background[y * w + x]:
                background[y * w + x] = 1
                queue.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if is_white(px[x, y]) and not background[y * w + x]:
                background[y * w + x] = 1
                queue.append((x, y))

    while queue:
        x, y = queue.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not background[ny * w + nx]:
                if is_white(px[nx, ny]):
                    background[ny * w + nx] = 1
                    queue.append((nx, ny))

    for y in range(h):
        row = y * w
        for x in range(w):
            if background[row + x]:
                r, g, b, _ = px[x, y]
                px[x, y] = (r, g, b, 0)

    # Feather the cut edge so the mark does not look stair-stepped on dark backgrounds.
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            if px[x, y][3] != 255:
                continue
            neighbours = (
                px[x + 1, y][3],
                px[x - 1, y][3],
                px[x, y + 1][3],
                px[x, y - 1][3],
            )
            if 0 in neighbours and is_white(px[x, y]):
                r, g, b, _ = px[x, y]
                px[x, y] = (r, g, b, 140)

    cropped = im.crop(im.getbbox())
    for out, width in outputs:
        cw, ch = cropped.size
        resized = cropped.resize((width, round(ch * width / cw)), Image.LANCZOS)
        resized.save(out, "PNG", optimize=True)
        print(out.name, resized.size, f"{out.stat().st_size // 1024} KB")

    # Favicons must be square, so pad the mark rather than stretch it.
    cw, ch = cropped.size
    side = max(cw, ch)
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    square.paste(cropped, ((side - cw) // 2, (side - ch) // 2))
    square.save(favicon, sizes=[(s, s) for s in FAVICON_SIZES])
    print(favicon.name, FAVICON_SIZES, f"{favicon.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
