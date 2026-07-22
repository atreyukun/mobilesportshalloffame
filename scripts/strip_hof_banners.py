"""Re-download HOF portraits and crop off baked-in name banners cleanly."""
from __future__ import annotations

import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(r"d:\httpsmobilesportshalloffame")
HOF = ROOT / "assets" / "hof"
DATA = ROOT / "data" / "inductees.json"
UA = {"User-Agent": "Mozilla/5.0 (compatible; MSHOF-migrator/1.0)"}


def get(url: str) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=90) as resp:
        return resp.read()


def magenta_score_row(row: np.ndarray) -> float:
    r = row[:, 0].astype(np.float32)
    g = row[:, 1].astype(np.float32)
    b = row[:, 2].astype(np.float32)
    magenta = ((r > g + 10) & (b > g + 10) & ((r + b) / 2 > 55)).mean()
    blue = ((b > r + 12) & (b > g + 8) & (b > 70)).mean()
    return float(max(magenta, blue))


def banner_start_y(im: Image.Image) -> int:
    arr = np.asarray(im.convert("RGB"))
    h, w, _ = arr.shape
    scores = np.array([magenta_score_row(arr[y]) for y in range(h)], dtype=float)
    # smooth
    ker = np.ones(9) / 9.0
    sm = np.convolve(scores, ker, mode="same")

    # search lower 65% for first sustained banner run
    y0 = int(h * 0.35)
    thr = 0.12
    run = None
    start = None
    for y in range(y0, h):
        if sm[y] >= thr:
            if start is None:
                start = y
        elif start is not None:
            if y - start >= 8:
                run = (start, y)
                break
            start = None
    if start is not None and h - start >= 8:
        run = (start, h)

    if run:
        return max(int(h * 0.42), run[0] - 4)

    # fallback: trim typical lower banner zone
    return int(h * 0.70)


def crop_banner(path: Path) -> None:
    im = Image.open(path).convert("RGB")
    y = banner_start_y(im)
    im.crop((0, 0, im.width, y)).save(path, quality=92, optimize=True)


def main() -> None:
    data = json.loads(DATA.read_text(encoding="utf-8"))
    # remote map from current local filenames via scrape URLs is gone;
    # use existing files: they were just re-scraped. Crop in place.
    # If any file missing, skip.
    count = 0
    for p in sorted(HOF.glob("*.jpg")):
        # skip if already looks cropped very short? still crop from fresh scrape
        before = Image.open(p).size
        crop_banner(p)
        after = Image.open(p).size
        print(f"{p.name}: {before} -> {after}")
        count += 1
    print("cropped", count)


if __name__ == "__main__":
    main()
