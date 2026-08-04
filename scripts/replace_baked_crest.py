"""Cover the old burned-in crest on each inductee photo with the new mark.

The two marks share a silhouette, so the new logo is scaled up just enough to
fully hide the old one (including its soft edge) and pasted over it. Run
find_baked_crest.py first to produce crest_locations.json.

    python scripts/replace_baked_crest.py --preview   # sample comparisons only
    python scripts/replace_baked_crest.py             # rewrite the photos
"""
from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(r"d:\httpsmobilesportshalloffame")
TEMPLATE = ROOT / "scripts" / "crest_template.npz"
LOCATIONS = ROOT / "scripts" / "crest_locations.json"
NEW_LOGO = ROOT / "assets" / "logo.png"
BACKUP = ROOT / "scripts" / "_photo_backup"
PREVIEW = ROOT / "scripts" / "_preview"

# The old mark has a soft outer edge that is not part of its solid silhouette,
# so require the new logo to cover a slightly grown version of it.
HALO = 3
ALPHA_SOLID = 160
JPEG_QUALITY = 92
# Above this grey difference the recorded spot no longer holds the old mark.
STALE_LIMIT = 25.0


def dilate(mask: np.ndarray, radius: int) -> np.ndarray:
    out = mask.copy()
    for _ in range(radius):
        grown = out.copy()
        grown[1:, :] |= out[:-1, :]
        grown[:-1, :] |= out[1:, :]
        grown[:, 1:] |= out[:, :-1]
        grown[:, :-1] |= out[:, 1:]
        out = grown
    return out


def old_mask_at(size: tuple[int, int]) -> np.ndarray:
    mask = np.load(TEMPLATE)["mask"]
    resized = Image.fromarray(mask.astype(np.uint8) * 255).resize(size, Image.LANCZOS)
    return dilate(np.asarray(resized) > 110, HALO)


def stamp(alpha: np.ndarray, shape: tuple[int, int], x: int, y: int) -> np.ndarray:
    """Place `alpha` at (x, y) on a blank canvas of `shape`, cropping overflow."""
    canvas = np.zeros(shape, dtype=bool)
    h, w = alpha.shape
    sx, sy = max(0, -x), max(0, -y)
    dx, dy = max(0, x), max(0, y)
    cw = min(w - sx, shape[1] - dx)
    ch = min(h - sy, shape[0] - dy)
    if cw > 0 and ch > 0:
        canvas[dy : dy + ch, dx : dx + cw] = alpha[sy : sy + ch, sx : sx + cw]
    return canvas


def place_new_logo(target: np.ndarray, loc: dict, logo: Image.Image, shape):
    """Smallest scale and position of the new logo that fully hides the old one.

    Works in image coordinates so that a logo overhanging the photo edge is
    cropped honestly rather than silently shifted.
    """
    logo_w, logo_h = logo.size
    box_h, box_w = target.shape
    old = stamp(target, shape, loc["x"], loc["y"])
    nudge = max(6, round(box_w * 0.12))

    for step in range(0, 61):
        scale = 1.0 + step * 0.02
        h = max(1, round(box_h * scale))
        w = max(1, round(h * logo_w / logo_h))
        candidate = logo.resize((w, h), Image.LANCZOS)
        alpha = np.asarray(candidate)[:, :, 3] >= ALPHA_SOLID
        base_x = loc["x"] + (box_w - w) // 2
        base_y = loc["y"] + (box_h - h) // 2

        for dy in range(-nudge, nudge + 1, 2):
            for dx in range(-nudge, nudge + 1, 2):
                x, y = base_x + dx, base_y + dy
                if (old & ~stamp(alpha, shape, x, y)).any():
                    continue
                return candidate, x, y, scale
    raise RuntimeError(f"no covering placement for {box_w}x{box_h} crest")


def still_has_old_crest(before: Image.Image, loc: dict) -> float:
    """Grey difference between the recorded crest area and the old mark.

    Guards against stamping a photo twice: once replaced, the score jumps.
    """
    data = np.load(TEMPLATE)
    mask, patch = data["mask"], data["patch"]
    size = (loc["w"], loc["h"])
    m = np.asarray(
        Image.fromarray(mask.astype(np.uint8) * 255).resize(size, Image.LANCZOS)
    ) > 127
    ref = np.asarray(
        Image.fromarray(patch).convert("L").resize(size, Image.LANCZOS), np.float32
    )
    area = np.asarray(
        before.convert("L").crop(
            (loc["x"], loc["y"], loc["x"] + loc["w"], loc["y"] + loc["h"])
        ),
        np.float32,
    )
    if area.shape != ref.shape or not m.any():
        return 999.0
    return float(np.abs(area[m] - ref[m]).mean())


def process(rel: str, loc: dict, logo: Image.Image, write: bool):
    path = ROOT / rel
    before = Image.open(path).convert("RGB")
    shape = (before.height, before.width)
    target = old_mask_at((loc["w"], loc["h"]))
    layer, x, y, scale = place_new_logo(target, loc, logo, shape)

    after = before.convert("RGBA")
    # alpha_composite has no negative-offset support, so pad through a full layer.
    full = Image.new("RGBA", before.size, (0, 0, 0, 0))
    full.paste(layer, (x, y), layer)
    after.alpha_composite(full)
    after = after.convert("RGB")

    # Every pixel of the old silhouette must sit under solid new artwork.
    old = stamp(target, shape, loc["x"], loc["y"])
    solid = stamp(np.asarray(layer)[:, :, 3] >= ALPHA_SOLID, shape, x, y)
    leftover = int((old & ~solid).sum())

    if write:
        BACKUP.mkdir(parents=True, exist_ok=True)
        backup = BACKUP / Path(rel).name
        if not backup.exists():
            shutil.copy2(path, backup)
        after.save(path, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
    return before, after, scale, leftover


def comparison(before: Image.Image, after: Image.Image, loc: dict, label: str):
    """Side-by-side zoom on the crest area."""
    pad = 26
    box = (
        max(0, loc["x"] - pad),
        max(0, loc["y"] - pad),
        min(before.width, loc["x"] + loc["w"] + pad),
        min(before.height, loc["y"] + loc["h"] + pad),
    )
    b, a = before.crop(box), after.crop(box)
    w = 300
    h = round(b.height * w / b.width)
    b, a = b.resize((w, h), Image.LANCZOS), a.resize((w, h), Image.LANCZOS)
    sheet = Image.new("RGB", (w * 2 + 12, h + 22), "black")
    sheet.paste(b, (0, 20))
    sheet.paste(a, (w + 12, 20))
    ImageDraw.Draw(sheet).text((2, 5), f"{label}   before | after", fill="#ffcc00")
    return sheet


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--preview", action="store_true", help="sample only, no writes")
    args = ap.parse_args()

    locations = json.loads(LOCATIONS.read_text(encoding="utf-8"))
    logo = Image.open(NEW_LOGO).convert("RGBA")
    logo = logo.crop(logo.getbbox())

    items = sorted(locations.items())
    if args.preview:
        # A spread of positions and sizes: right, left, oversized, undersized.
        wanted = [
            "assets/hof/buddy-aydelette.jpg",
            "assets/hof/jon-lieber.jpg",
            "assets/hof/lance-johnson.jpg",
            "assets/hof/jimmy-green.jpg",
            "assets/hof/ozzie-smith.jpg",
            "assets/hof/sam-pettaway.jpg",
        ]
        items = [(k, locations[k]) for k in wanted if k in locations]
        PREVIEW.mkdir(parents=True, exist_ok=True)

    scales, problems, skipped = [], [], 0
    for rel, loc in items:
        present = still_has_old_crest(Image.open(ROOT / rel).convert("RGB"), loc)
        if present > STALE_LIMIT:
            skipped += 1
            print(
                f"  {Path(rel).stem:26} old crest not at recorded spot "
                f"(score {present:.1f}) - already replaced, skipping"
            )
            continue
        before, after, scale, leftover = process(rel, loc, logo, write=not args.preview)
        scales.append(scale)
        name = Path(rel).stem
        flag = f"  LEFTOVER {leftover}px" if leftover else ""
        if leftover:
            problems.append((name, leftover))
        print(
            f"  {name:26} crest {loc['w']}x{loc['h']}  "
            f"new logo scale {scale:.2f}{flag}"
        )
        if args.preview:
            comparison(before, after, loc, name).save(PREVIEW / f"{name}.png")

    if scales:
        print(
            f"\n{len(scales)} photos updated, "
            f"cover scale {min(scales):.2f}-{max(scales):.2f}"
        )
    if skipped:
        print(f"{skipped} photos skipped (no old crest at the recorded location)")
    if problems:
        print(f"photos with uncovered old-crest pixels: {problems}")
    if scales and not args.preview:
        print(f"originals copied to {BACKUP}")


if __name__ == "__main__":
    main()
