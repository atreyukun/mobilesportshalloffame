"""Crop baked-in HOF name banners from portrait images."""
from __future__ import annotations

from pathlib import Path
import numpy as np
from PIL import Image

HOF = Path(r"d:\httpsmobilesportshalloffame\assets\hof")


def find_banner_top(arr: np.ndarray) -> int | None:
    """Return y index where baked-in name banner starts, or None."""
    h, w, _ = arr.shape
    y0 = int(h * 0.30)
    scores = np.zeros(h, dtype=float)
    for y in range(y0, h):
        row = arr[y].astype(np.float32)
        r, g, b = row[:, 0], row[:, 1], row[:, 2]
        magenta = ((r > g + 12) & (b > g + 12)).mean()
        blue = ((b > r + 12) & (b > g + 8)).mean()
        # dark uniform bar (fallback)
        std = row.std()
        mean = row.mean()
        dark_flat = 1.0 if (std < 28 and 40 < mean < 140) else 0.0
        scores[y] = max(magenta, blue, 0.55 * dark_flat)

    # smooth
    ker = np.ones(7) / 7.0
    sm = np.convolve(scores, ker, mode="same")
    thr = 0.18
    # longest run above threshold in lower/mid image
    best = None
    run_start = None
    for y in range(y0, h):
        if sm[y] >= thr:
            if run_start is None:
                run_start = y
        elif run_start is not None:
            run = (run_start, y)
            if best is None or (run[1] - run[0]) > (best[1] - best[0]):
                best = run
            run_start = None
    if run_start is not None:
        run = (run_start, h)
        if best is None or (run[1] - run[0]) > (best[1] - best[0]):
            best = run

    if not best:
        return None
    length = best[1] - best[0]
    # banner should be a noticeable strip but not half the photo
    if length < h * 0.035 or length > h * 0.22:
        return None
    # small padding above banner
    return max(0, best[0] - 2)


def process(path: Path) -> str:
    im = Image.open(path).convert("RGB")
    arr = np.asarray(im)
    h = arr.shape[0]
    top = find_banner_top(arr)
    if top is None or top < h * 0.45:
        # conservative fallback — keep most of the portrait, trim lower banner zone
        top = int(h * 0.78)
        mode = "fallback"
    else:
        mode = "detected"
    cropped = im.crop((0, 0, im.width, top))
    cropped.save(path, quality=92, optimize=True)
    return f"{path.name}: {mode} crop@{top}/{h}"


def main() -> None:
    files = sorted(HOF.glob("*.jpg")) + sorted(HOF.glob("*.png")) + sorted(HOF.glob("*.jpeg"))
    for f in files:
        try:
            print(process(f))
        except Exception as e:
            print(f"{f.name}: ERR {e}")


if __name__ == "__main__":
    main()
