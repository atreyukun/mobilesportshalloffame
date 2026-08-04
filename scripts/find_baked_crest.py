"""Locate the old burned-in crest in each inductee photo.

Coarse search on a quarter-scale image, then refine at full resolution. Only the
crest's silhouette pixels are compared, so the photo behind it does not matter.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(r"d:\httpsmobilesportshalloffame")
CACHE = ROOT / "scripts" / "crest_template.npz"
COARSE = 4
# Most photos carry the crest at its native size, but a few were saved at other
# resolutions, so sweep widely and then refine around the best scale.
COARSE_SCALES = [round(0.5 + 0.1 * i, 2) for i in range(26)]
# Mean absolute grey difference over the crest silhouette. Photos that carry the
# crest at its native size score under 3; rescaled copies blur and score higher.
# The three photos with no crest at all score above 45.
MATCH_LIMIT = 25.0


def load_template():
    data = np.load(CACHE)
    mask = data["mask"]
    patch = data["patch"]
    grey = patch.astype(np.float32) @ np.array([0.299, 0.587, 0.114], np.float32)
    return mask, grey


def scaled(mask: np.ndarray, grey: np.ndarray, scale: float):
    h, w = mask.shape
    size = (max(1, round(w * scale)), max(1, round(h * scale)))
    m = np.asarray(
        Image.fromarray(mask.astype(np.uint8) * 255).resize(size, Image.LANCZOS)
    ) > 127
    g = np.asarray(
        Image.fromarray(grey.astype(np.uint8)).resize(size, Image.LANCZOS)
    ).astype(np.float32)
    return m, g


def match_at(img: np.ndarray, mask: np.ndarray, grey: np.ndarray, budget: int = 900):
    """Best (score, x, y) for this template size over the whole image."""
    th, tw = mask.shape
    ih, iw = img.shape
    if th > ih or tw > iw:
        return None
    ys, xs = np.nonzero(mask)
    if len(ys) > budget:
        pick = np.linspace(0, len(ys) - 1, budget).astype(int)
        ys, xs = ys[pick], xs[pick]
    ref = grey[ys, xs]

    windows = np.lib.stride_tricks.sliding_window_view(img, (th, tw))
    samples = windows[:, :, ys, xs]
    score = np.abs(samples - ref).mean(axis=2)
    flat = int(np.argmin(score))
    y, x = divmod(flat, score.shape[1])
    return float(score[y, x]), x, y


def locate(path: Path, mask: np.ndarray, grey: np.ndarray):
    im = Image.open(path).convert("RGB")
    full = np.asarray(im.convert("L"), dtype=np.float32)
    small = np.asarray(
        im.convert("L").resize((im.width // COARSE, im.height // COARSE), Image.LANCZOS),
        dtype=np.float32,
    )

    def refine(scale: float, cx: int, cy: int):
        fm, fg = scaled(mask, grey, scale)
        fh, fw = fm.shape
        pad = COARSE * 3
        x0 = max(0, cx * COARSE - pad)
        y0 = max(0, cy * COARSE - pad)
        x1 = min(full.shape[1], x0 + fw + 2 * pad)
        y1 = min(full.shape[0], y0 + fh + 2 * pad)
        fine = match_at(full[y0:y1, x0:x1], fm, fg, budget=1500)
        if fine is None:
            return None
        fscore, fx, fy = fine
        return (fscore, x0 + fx, y0 + fy, scale, fw, fh)

    # Coarse sweep to find the rough scale and position.
    coarse_best = None
    for scale in COARSE_SCALES:
        cm, cg = scaled(mask, grey, scale / COARSE)
        hit = match_at(small, cm, cg, budget=400)
        if hit is None:
            continue
        if coarse_best is None or hit[0] < coarse_best[0]:
            coarse_best = (hit[0], hit[1], hit[2], scale)
    if coarse_best is None:
        return None

    # Then a fine scale sweep around it, at full resolution.
    _, cx, cy, cscale = coarse_best
    best = None
    for step in range(-5, 6):
        scale = round(cscale + step * 0.02, 3)
        if scale <= 0:
            continue
        cand = refine(scale, cx, cy)
        if cand and (best is None or cand[0] < best[0]):
            best = cand
    return best


def main() -> None:
    mask, grey = load_template()
    data = json.loads((ROOT / "data" / "inductees.json").read_text(encoding="utf-8"))
    photos = sorted({p["image"] for p in data if p.get("image")})

    found, missing = {}, []
    for rel in photos:
        best = locate(ROOT / rel, mask, grey)
        if best is None:
            missing.append((999.0, rel))
            continue
        score, x, y, scale, w, h = best
        entry = {"x": x, "y": y, "w": w, "h": h, "scale": scale, "score": score}
        if score <= MATCH_LIMIT:
            found[rel] = entry
            print(f"  {score:6.2f}  {rel}  at ({x},{y}) {w}x{h} scale {scale}")
        else:
            missing.append((score, rel))
            print(f"  SKIP {score:6.2f}  {rel}  (best guess ({x},{y}) {w}x{h})")

    print(f"\nlocated: {len(found)}   not located: {len(missing)}")
    for score, rel in sorted(missing):
        print(f"  {score:6.2f}  {rel}")

    (ROOT / "scripts" / "crest_locations.json").write_text(
        json.dumps(found, indent=2), encoding="utf-8"
    )


if __name__ == "__main__":
    main()
