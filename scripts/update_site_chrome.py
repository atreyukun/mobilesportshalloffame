"""Rewrite the shared nav and footer links across every page.

The header and footer are copied into each HTML file, so they are generated here
from one definition to keep them identical. Page body copy is not touched.
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(r"d:\httpsmobilesportshalloffame")

NAV = """      <ul class="nav-links">
        <li><a href="index.html">Home</a></li>
        <li class="nav-item--dropdown">
          <button type="button" class="nav-dropdown-trigger" aria-expanded="false">Our Mission</button>
          <ul class="nav-submenu">
            <li><a href="about.html" class="nav-submenu-link">Our Mission</a></li>
            <li><a href="remembering-the-past.html" class="nav-submenu-link">Remembering the Past</a></li>
            <li><a href="honoring-the-present.html" class="nav-submenu-link">Honoring the Present</a></li>
            <li><a href="welcoming-the-future.html" class="nav-submenu-link">Welcoming the Future</a></li>
            <li><a href="board-members.html" class="nav-submenu-link">Board Members</a></li>
          </ul>
        </li>
        <li class="nav-item--dropdown">
          <button type="button" class="nav-dropdown-trigger" aria-expanded="false">A Shared Vision</button>
          <ul class="nav-submenu">
            <li><a href="our-vision.html" class="nav-submenu-link">A Shared Vision</a></li>
            <li><a href="partners.html" class="nav-submenu-link">Partners</a></li>
            <li><a href="sponsors.html" class="nav-submenu-link">Sponsors</a></li>
          </ul>
        </li>
        <li><a href="hall-of-famers.html">Hall of Famers</a></li>
        <li><a href="news-events.html">News &amp; Events</a></li>
        <li><a href="contact.html">Contact</a></li>
      </ul>"""

FOOTER_EXPLORE = """        <h4>Explore</h4>
        <a href="about.html">Our Mission</a>
        <a href="hall-of-famers.html">Hall of Famers</a>
        <a href="news-events.html">News &amp; Events</a>
        <a href="contact.html">Contact</a>"""

NAV_BLOCK = re.compile(
    r'^      <ul class="nav-links">.*?^      </ul>', re.DOTALL | re.MULTILINE
)
EXPLORE_BLOCK = re.compile(
    r"^        <h4>Explore</h4>.*?(?=^      </div>)", re.DOTALL | re.MULTILINE
)


def nav_for(filename: str) -> str:
    """The canonical nav with the current page marked."""
    nav = NAV
    target = f'<a href="{filename}"'
    if target in nav:
        nav = nav.replace(target, f'{target} aria-current="page"', 1)
    return nav


def main() -> None:
    for path in sorted(ROOT.glob("*.html")):
        text = original = path.read_text(encoding="utf-8")

        if not NAV_BLOCK.search(text):
            print(f"  !! {path.name}: no nav block found")
            continue
        text = NAV_BLOCK.sub(lambda _: nav_for(path.name), text, count=1)

        if EXPLORE_BLOCK.search(text):
            text = EXPLORE_BLOCK.sub(FOOTER_EXPLORE + "\n", text, count=1)
        else:
            print(f"  !! {path.name}: no footer Explore block found")

        # The organisation is not referred to as a foundation any more.
        text = text.replace(
            "The Mobile Sports Hall of Fame Foundation<br />",
            "The Mobile Sports Hall of Fame<br />",
        )
        text = text.replace(
            "© Mobile Sports Hall of Fame Foundation",
            "© Mobile Sports Hall of Fame",
        )

        if text != original:
            path.write_text(text, encoding="utf-8", newline="")
            print(f"  updated {path.name}")


if __name__ == "__main__":
    main()
