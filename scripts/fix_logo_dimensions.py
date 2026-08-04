"""Sync the logo <img> width/height attributes with the current logo.png.

The attributes still described the old wide wordmark, which reserves the wrong
box and shifts layout while the near-square crest loads.
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(r"d:\httpsmobilesportshalloffame")

NAV_HEIGHT = 58
HERO_HEIGHT = 168


def main() -> None:
    w, h = Image.open(ROOT / "assets" / "logo.png").size
    nav_w = round(w * NAV_HEIGHT / h)
    hero_w = round(w * HERO_HEIGHT / h)
    print(f"logo {w}x{h} -> nav {nav_w}x{NAV_HEIGHT}, hero {hero_w}x{HERO_HEIGHT}")

    replacements = [
        (
            'class="logo-img logo-img--nav" width="200" height="52"',
            f'class="logo-img logo-img--nav" width="{nav_w}" height="{NAV_HEIGHT}"',
        ),
        (
            'class="hero-logo hero-animate hero-animate--1" width="160" height="168"',
            f'class="hero-logo hero-animate hero-animate--1" '
            f'width="{hero_w}" height="{HERO_HEIGHT}"',
        ),
    ]

    changed = 0
    for path in sorted(ROOT.glob("*.html")):
        text = original = path.read_text(encoding="utf-8")
        for old, new in replacements:
            text = text.replace(old, new)
        if text != original:
            path.write_text(text, encoding="utf-8", newline="")
            changed += 1
            print("updated", path.name)
    print(f"files updated: {changed}")


if __name__ == "__main__":
    main()
