"""Check the reorganised nav, the new pages, and the contact inquiry form."""
from __future__ import annotations

import re
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(r"d:\httpsmobilesportshalloffame")
OUT = ROOT / "scripts" / "_verify"
BASE = "http://127.0.0.1:8765"

PAGES = [
    "index.html",
    "about.html",
    "remembering-the-past.html",
    "honoring-the-present.html",
    "welcoming-the-future.html",
    "board-members.html",
    "our-vision.html",
    "partners.html",
    "sponsors.html",
    "hall-of-famers.html",
    "news-events.html",
    "contact.html",
    "privacy-policy.html",
    "refund-policy.html",
]

EXPECTED_NAV = [
    "Home",
    "Our Mission",
    "A Shared Vision",
    "Hall of Famers",
    "News & Events",
    "Contact",
]


def scroll_through(page) -> None:
    """Walk down the page so the scroll-reveal sections become visible."""
    height = page.evaluate("document.body.scrollHeight")
    for y in range(0, height, 400):
        page.evaluate(f"window.scrollTo(0, {y})")
        page.wait_for_timeout(80)
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(400)


def main() -> None:
    OUT.mkdir(exist_ok=True)
    failures: list[str] = []

    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": 1360, "height": 900})
        page.on("pageerror", lambda err: failures.append(f"JS error: {err}"))

        for name in PAGES:
            response = page.goto(f"{BASE}/{name}", wait_until="load")
            if not response or response.status != 200:
                failures.append(f"{name}: HTTP {response.status if response else '?'}")
                continue

            top = page.eval_on_selector_all(
                ".nav-links > li",
                "els => els.map(e => (e.querySelector('.nav-dropdown-trigger') || e.querySelector('a')).textContent.trim())",
            )
            if top != EXPECTED_NAV:
                failures.append(f"{name}: nav is {top}")

            submenus = page.eval_on_selector_all(
                ".nav-submenu",
                "els => els.map(e => Array.from(e.querySelectorAll('a')).map(a => a.textContent.trim()))",
            )
            if submenus != [
                [
                    "Our Mission",
                    "Remembering the Past",
                    "Honoring the Present",
                    "Welcoming the Future",
                    "Board Members",
                ],
                ["A Shared Vision", "Partners", "Sponsors"],
            ]:
                failures.append(f"{name}: submenus are {submenus}")

            # Every internal link on the page must resolve to a real file.
            hrefs = page.eval_on_selector_all(
                "a[href]",
                "els => els.map(e => e.getAttribute('href'))",
            )
            for href in hrefs:
                if href.startswith(("http", "mailto:", "tel:", "#")):
                    continue
                target = href.split("#")[0].split("?")[0]
                if target and not (ROOT / target).exists():
                    failures.append(f"{name}: dead link {href}")

            body = page.inner_text("body")
            if re.search(r"\bfoundation\b", body, re.I):
                hit = re.search(r".{60}foundation.{60}", body, re.I | re.S)
                failures.append(f"{name}: says 'foundation' — {hit.group(0)!r}")

        # Dropdowns open on click.
        page.goto(f"{BASE}/index.html", wait_until="load")
        triggers = page.query_selector_all(".nav-dropdown-trigger")
        triggers[0].click()
        page.wait_for_timeout(300)
        if not page.is_visible(".nav-item--dropdown.is-open .nav-submenu"):
            failures.append("index.html: Our Mission dropdown did not open")
        page.screenshot(path=OUT / "nav-mission-open.png")
        triggers[1].click()
        page.wait_for_timeout(300)
        if not page.is_visible(".nav-item--dropdown.is-open .nav-submenu"):
            failures.append("index.html: A Shared Vision dropdown did not open")
        page.screenshot(path=OUT / "nav-vision-open.png")

        # New pages.
        for name in ("board-members.html", "partners.html", "sponsors.html"):
            page.goto(f"{BASE}/{name}", wait_until="load")
            page.wait_for_timeout(700)
            scroll_through(page)
            page.screenshot(path=OUT / name.replace(".html", ".png"), full_page=True)

        # Contact page inquiry form: validation, then the composed mail link.
        page.goto(f"{BASE}/contact.html", wait_until="load")
        page.wait_for_timeout(700)
        scroll_through(page)
        page.screenshot(path=OUT / "contact.png", full_page=True)

        page.click(".inquiry-form button[type=submit]")
        page.wait_for_timeout(300)
        if page.evaluate("document.querySelector('#inquiry-name').validity.valid"):
            failures.append("contact.html: empty form passed validation")

        page.fill("#inquiry-name", "Test Person")
        page.fill("#inquiry-email", "test@example.com")
        page.fill("#inquiry-phone", "251-555-0100")
        page.select_option("#inquiry-topic", label="Sponsorship")
        page.fill("#inquiry-message", "We would like sponsorship details.")

        # Chromium reports the handoff to the mail client as a mailto request.
        mail_urls: list[str] = []
        page.on("request", lambda r: r.url.startswith("mailto:") and mail_urls.append(r.url))
        page.click(".inquiry-form button[type=submit]")
        page.wait_for_timeout(800)
        composed = mail_urls[0] if mail_urls else None
        print("composed mail link:", composed)
        if not composed or not composed.startswith("mailto:jgottfried9@gmail.com?"):
            failures.append(f"contact.html: bad mail link {composed!r}")
        else:
            for fragment in ("Sponsorship", "Test%20Person", "test%40example.com", "251-555-0100"):
                if fragment not in composed:
                    failures.append(f"contact.html: mail link missing {fragment}")

        status = page.inner_text(".form-status")
        print("status text:", status)
        if "email app" not in status:
            failures.append("contact.html: no confirmation shown")
        page.screenshot(path=OUT / "contact-form-filled.png", full_page=True)

        browser.close()

    print()
    if failures:
        print(f"{len(failures)} problem(s):")
        for f in failures:
            print(f"  - {f}")
    else:
        print(f"All {len(PAGES)} pages OK: nav, links, no 'foundation', inquiry form works.")


if __name__ == "__main__":
    main()
