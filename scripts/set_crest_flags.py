"""Flag the inductee photos that do NOT already have the crest burned in.

Verified by eye from the contact sheets produced by detect_baked_crest.py.
Only flagged entries get the crest overlay drawn on their card, which keeps the
already-crested scrape photos from showing two crests.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(r"d:\httpsmobilesportshalloffame")
DATA = ROOT / "data" / "inductees.json"

# Every archive photo scraped from the old site carries the crest already,
# either top-left or top-right. Only these three were supplied separately.
NEEDS_OVERLAY = {
    "assets/hof/jason-caffey.jpg",
    "assets/hof/mark-barron.jpg",
    "assets/hof/tommy-aaron.jpg",
}


def main() -> None:
    data = json.loads(DATA.read_text(encoding="utf-8"))
    flagged = 0
    seen = set()
    for person in data:
        person.pop("showCrest", None)
        image = person.get("image")
        if not image:
            person.pop("crest", None)
            continue
        # Strip any stray cache-buster so paths compare cleanly.
        clean = image.split("?", 1)[0]
        if clean != image:
            person["image"] = clean
        seen.add(clean)
        if clean in NEEDS_OVERLAY:
            person["crest"] = True
            flagged += 1
        else:
            person.pop("crest", None)

    missing = NEEDS_OVERLAY - seen
    if missing:
        raise SystemExit(f"paths not found in data: {sorted(missing)}")

    DATA.write_text(
        json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"flagged {flagged} of {len(NEEDS_OVERLAY)} target photos")


if __name__ == "__main__":
    main()
