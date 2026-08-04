"""Build transparent logo/crest PNGs from the source logo JPEG.

Only the outer white page background is removed (flood fill from the image
border), so the light silver shield inside the mark stays opaque.
"""
from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(r"d:\httpsmobilesportshalloffame")
SOURCE = ROOT / "assets" / "New_Mobile_HoF2.jpg"
# Widths cover ~3x device pixel ratio at the largest place each asset is used
# (logo in the home hero, crest overlay in the inductee modal).
OUTPUTS = [
    (ROOT / "assets" / "logo.png", 560),
    (ROOT / "assets" / "crest.png", 300),
]

# A pixel joins the background only if it is this close to pure white.
WHITE_MIN = 244


def is_white(px: tuple[int, int, int, int]) -> bool:
    r, g, b = px[0], px[1], px[2]
    return r >= WHITE_MIN and g >= WHITE_MIN and b >= WHITE_MIN


def main() -> None:
    im = Image.open(SOURCE).convert("RGBA")
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
    for out, width in OUTPUTS:
        cw, ch = cropped.size
        resized = cropped.resize((width, round(ch * width / cw)), Image.LANCZOS)
        resized.save(out, "PNG", optimize=True)
        print(out.name, resized.size, f"{out.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
