"""Record which side of each photo the burned-in crest sits on.

The bio modal crops photos horizontally to fit its near-square media box, which
cuts into a crest sitting at the photo's edge. Knowing the side lets the modal
anchor the crop away from it.
"""
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

ROOT = Path(r"d:\httpsmobilesportshalloffame")
DATA = ROOT / "data" / "inductees.json"
LOCATIONS = ROOT / "scripts" / "crest_locations.json"


def main() -> None:
    locations = json.loads(LOCATIONS.read_text(encoding="utf-8"))
    sides = {}
    for rel, loc in locations.items():
        width = Image.open(ROOT / rel).width
        centre = loc["x"] + loc["w"] / 2
        sides[rel] = "left" if centre < width / 2 else "right"

    data = json.loads(DATA.read_text(encoding="utf-8"))
    tally = {"left": 0, "right": 0}
    for person in data:
        image = person.get("image")
        side = sides.get(image) if image else None
        if side:
            person["crestSide"] = side
            tally[side] += 1
        else:
            person.pop("crestSide", None)

    DATA.write_text(
        json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"crest on left: {tally['left']}, on right: {tally['right']}")


if __name__ == "__main__":
    main()
