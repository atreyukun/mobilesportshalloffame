"""Bump the ?v= cache markers on the logo and crest across the site.

Filenames stay the same when the artwork is re-exported, so the marker is what
tells a browser to fetch the new file instead of its cached copy.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(r"d:\httpsmobilesportshalloffame")
PATTERN = re.compile(r"((?:logo|crest)\.png)\?v=(\d+)")


def main() -> None:
    new_version = int(sys.argv[1])
    targets = sorted(ROOT.glob("*.html")) + [ROOT / "styles.css", ROOT / "main.js"]
    changed = 0
    for path in targets:
        text = path.read_text(encoding="utf-8")
        updated = PATTERN.sub(rf"\1?v={new_version}", text)
        if updated != text:
            path.write_text(updated, encoding="utf-8", newline="")
            changed += 1
    print(f"logo/crest markers set to v={new_version} in {changed} files")


if __name__ == "__main__":
    main()
