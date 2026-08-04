"""Screenshot the live pages to confirm crest overlays and the site logo."""
from __future__ import annotations

from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(r"d:\httpsmobilesportshalloffame")
OUT = ROOT / "scripts" / "_verify"
BASE = "http://127.0.0.1:8765"


def main() -> None:
    OUT.mkdir(exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 900})

        page.goto(f"{BASE}/index.html", wait_until="load")
        page.screenshot(path=OUT / "home.png")

        page.goto(f"{BASE}/hall-of-famers.html", wait_until="load")
        page.wait_for_selector('[data-letter="A"]', timeout=15000)

        # Cards only render once a letter is picked. Letter A holds the cards
        # from the reported screenshot.
        page.click('[data-letter="A"]')
        page.wait_for_selector(".hof-card", timeout=15000)
        page.wait_for_timeout(600)
        page.screenshot(path=OUT / "letter-a.png")

        overlays = page.eval_on_selector_all(
            ".hof-card", "els => els.map(e => ({name: e.querySelector('h3').textContent.trim(), crests: e.querySelectorAll('.hof-card-crest').length}))"
        )
        print("letter A cards:")
        for o in overlays:
            print(f"  {o['crests']} overlay  {o['name']}")

        # Modal on a photo that already has a burned-in crest.
        page.click(".hof-card-hit")
        page.wait_for_timeout(900)
        page.screenshot(path=OUT / "modal-first.png")
        state = page.evaluate(
            """() => {
                const m = document.querySelector('.hof-modal-media');
                const crest = m.querySelector('.hof-modal-crest');
                return {
                    videoShown: !m.querySelector('video').hidden,
                    imageShown: !m.querySelector('[data-hof-modal-image]').hidden,
                    crestHidden: crest.hidden,
                };
            }"""
        )
        print("modal state:", state)

        page.keyboard.press("Escape")

        # Sweep every letter and list which cards carry an overlay crest.
        overlaid = []
        for letter in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
            page.click(f'[data-letter="{letter}"]')
            page.wait_for_timeout(120)
            overlaid += page.eval_on_selector_all(
                ".hof-card",
                "els => els.filter(e => e.querySelector('.hof-card-crest'))"
                ".map(e => e.querySelector('h3').textContent.trim())",
            )
            doubled = page.eval_on_selector_all(
                ".hof-card",
                "els => els.filter(e => e.querySelectorAll('.hof-card-crest').length > 1).length",
            )
            if doubled:
                print(f"  !! {letter}: {doubled} cards with more than one overlay")
        print(f"\ncards with an overlay crest ({len(overlaid)}):")
        for name in overlaid:
            print(" ", name)

        for letter in ("S", "C", "B"):
            page.click(f'[data-letter="{letter}"]')
            page.wait_for_timeout(500)
            page.screenshot(path=OUT / f"letter-{letter.lower()}.png")

        # Modal in each media state. Search is ANDed with the letter filter,
        # so widen to ALL first.
        page.click('[data-letter="ALL"]')
        search_box = page.locator("[data-hof-search]")
        for label, term in (
            ("video", "Kenny Stabler"),
            ("photo-baked-crest", "Amos Otis"),
            ("video-overlay-crest", "Mark Barron"),
            ("no-media-fallback", "Ann Schilling"),
        ):
            search_box.fill(term)
            page.wait_for_timeout(400)
            page.click(".hof-card-hit")
            page.wait_for_timeout(1000)
            state = page.evaluate(
                """() => {
                    const m = document.querySelector('.hof-modal-media');
                    return {
                        video: !m.querySelector('video').hidden,
                        image: !m.querySelector('[data-hof-modal-image]').hidden,
                        fallback: !m.querySelector('[data-hof-modal-fallback]').hidden,
                        overlayCrest: !m.querySelector('.hof-modal-crest').hidden,
                    };
                }"""
            )
            print(f"{label:22} {term:16} {state}")
            page.locator(".hof-modal-media").screenshot(path=OUT / f"modal-{label}.png")
            page.keyboard.press("Escape")
            page.wait_for_timeout(250)

        browser.close()


if __name__ == "__main__":
    main()
