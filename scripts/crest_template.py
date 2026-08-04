"""Extract the old burned-in crest as an RGB template plus silhouette mask.

The old mark was composited onto every archive photo at the same size, so pixels
that agree across several different subjects are the crest itself. Taking the
largest connected run of agreeing pixels discards coincidental matches in flat
backgrounds.
"""
from __future__ import annotations

from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(r"d:\httpsmobilesportshalloffame")
HOF = ROOT / "assets" / "hof"

# Subjects differ, backgrounds differ, but all carry the crest.
REFS = [
    "buddy-aydelette.jpg",
    "henry-hank-aaron.jpg",
    "karen-mayson-bahnsen.jpg",
    "kenny-stabler.jpg",
    "terry-adams.jpg",
    "tommie-agee.jpg",
    "amos-otis.jpg",
]
AGREE_TOLERANCE = 12
CACHE = ROOT / "scripts" / "crest_template.npz"


def largest_component(mask: np.ndarray) -> np.ndarray:
    """Flood fill from every unvisited true pixel; keep the biggest blob."""
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    best = np.zeros_like(mask, dtype=bool)
    best_size = 0
    for sy in range(h):
        for sx in range(w):
            if not mask[sy, sx] or seen[sy, sx]:
                continue
            blob = []
            queue = deque([(sy, sx)])
            seen[sy, sx] = True
            while queue:
                y, x = queue.popleft()
                blob.append((y, x))
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        queue.append((ny, nx))
            if len(blob) > best_size:
                best_size = len(blob)
                best = np.zeros_like(mask, dtype=bool)
                ys, xs = zip(*blob)
                best[list(ys), list(xs)] = True
    return best


def build() -> tuple[np.ndarray, np.ndarray]:
    stack = []
    size = None
    for name in REFS:
        im = Image.open(HOF / name).convert("RGB")
        if size is None:
            size = im.size
        elif im.size != size:
            raise SystemExit(f"{name} is {im.size}, expected {size}")
        stack.append(np.asarray(im, dtype=np.int16))
    arr = np.stack(stack)

    spread = arr.max(axis=0) - arr.min(axis=0)
    agree = spread.max(axis=2) <= AGREE_TOLERANCE
    print(f"agreeing pixels: {agree.sum()} of {agree.size}")

    crest = largest_component(agree)
    ys, xs = np.nonzero(crest)
    box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    print(f"crest bbox {box}  filled pixels {crest.sum()}")

    template = arr.mean(axis=0).astype(np.uint8)
    return crest, template


def main() -> None:
    crest, template = build()
    ys, xs = np.nonzero(crest)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1

    mask = crest[y0:y1, x0:x1]
    patch = template[y0:y1, x0:x1]
    np.savez_compressed(CACHE, mask=mask, patch=patch, origin=np.array([x0, y0]))
    print(f"saved template {patch.shape} to {CACHE.name}")

    # Visual check: the crest on its own, and its silhouette.
    rgba = np.dstack([patch, np.where(mask, 255, 0).astype(np.uint8)])
    Image.fromarray(rgba, "RGBA").resize(
        (patch.shape[1] * 2, patch.shape[0] * 2), Image.NEAREST
    ).save(ROOT / "scripts" / "_old_crest.png")
    Image.fromarray(np.where(mask, 255, 0).astype(np.uint8)).resize(
        (patch.shape[1] * 2, patch.shape[0] * 2), Image.NEAREST
    ).save(ROOT / "scripts" / "_old_crest_mask.png")


if __name__ == "__main__":
    main()
