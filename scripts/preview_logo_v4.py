"""Render the site with a candidate logo swapped in, for a side-by-side look.

Nothing on disk changes: the browser is told to serve the candidate PNGs in
place of assets/logo.png and assets/crest.png.
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright

ROOT = Path(r"d:\httpsmobilesportshalloffame")
OUT = ROOT / "scripts" / "_verify"
CANDIDATE = OUT / "v4"
BASE = "http://127.0.0.1:8765"

SHOTS = ("header", "hero", "footer", "modal-crest", "modal-empty")


def capture(page, tag: str) -> None:
    page.goto(f"{BASE}/index.html", wait_until="load")
    page.wait_for_timeout(900)

    page.screenshot(path=OUT / f"{tag}-header.png", clip={"x": 0, "y": 0, "width": 1360, "height": 88})
    page.screenshot(path=OUT / f"{tag}-hero.png", clip={"x": 0, "y": 0, "width": 1360, "height": 620})

    footer = page.query_selector(".site-footer")
    footer.scroll_into_view_if_needed()
    page.wait_for_timeout(500)
    footer.screenshot(path=OUT / f"{tag}-footer.png")

    # Crest overlay in a modal: Tommy Aaron's photo is one of the few without the
    # mark already burned in, so main.js overlays crest.png on top.
    page.goto(f"{BASE}/hall-of-famers.html", wait_until="load")
    page.wait_for_selector('[data-letter="A"]', timeout=15000)
    page.fill("[data-hof-search]", "Tommy Aaron")
    page.wait_for_timeout(600)
    page.click(".hof-card-hit")
    page.wait_for_timeout(900)
    media = page.query_selector(".hof-modal-media")
    media.screenshot(path=OUT / f"{tag}-modal-crest.png")
    page.keyboard.press("Escape")
    page.wait_for_timeout(400)

    # An inductee with no photo at all: the empty tile draws the mark in CSS.
    page.fill("[data-hof-search]", "Ann Schilling")
    page.wait_for_timeout(600)
    card = page.query_selector(".hof-card-hit")
    if card:
        card.click()
        page.wait_for_timeout(900)
        media = page.query_selector(".hof-modal-media")
        media.screenshot(path=OUT / f"{tag}-modal-empty.png")


def label(text: str, width: int) -> Image.Image:
    band = Image.new("RGB", (width, 34), (238, 238, 240))
    draw = ImageDraw.Draw(band)
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 18)
    except OSError:
        font = ImageFont.load_default()
    draw.text((12, 8), text, fill=(20, 20, 25), font=font)
    return band


def compare(name: str) -> None:
    before = Image.open(OUT / f"current-{name}.png").convert("RGB")
    after = Image.open(OUT / f"candidate-{name}.png").convert("RGB")
    width = max(before.width, after.width)
    top, bottom = label("CURRENT — dark text", width), label("NEW — white text", width)

    height = top.height + before.height + bottom.height + after.height + 12
    sheet = Image.new("RGB", (width, height), (255, 255, 255))
    y = 0
    for part in (top, before, bottom, after):
        sheet.paste(part, (0, y))
        y += part.height + (6 if part in (before,) else 0)
    sheet.save(OUT / f"compare-{name}.png")
    print(f"compare-{name}.png {sheet.size}")


def main() -> None:
    with sync_playwright() as pw:
        browser = pw.chromium.launch()

        page = browser.new_page(viewport={"width": 1360, "height": 900})
        capture(page, "current")
        page.close()

        page = browser.new_page(viewport={"width": 1360, "height": 900})
        page.route("**/logo.png*", lambda r: r.fulfill(path=str(CANDIDATE / "logo.png")))
        page.route("**/crest.png*", lambda r: r.fulfill(path=str(CANDIDATE / "crest.png")))
        capture(page, "candidate")
        page.close()

        browser.close()

    for name in SHOTS:
        if (OUT / f"current-{name}.png").exists() and (OUT / f"candidate-{name}.png").exists():
            compare(name)


if __name__ == "__main__":
    main()
