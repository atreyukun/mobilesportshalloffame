"""Tag inductees whose bios describe coaching, then add a Coaches browse chip."""
from __future__ import annotations

import json
import re
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data" / "inductees.json"

COACH_RE = re.compile(
    r"\b("
    r"head coach|assistant coach|coaching career|coached|"
    r"high school coach|college coach|collegiate coach|"
    r"football coach|basketball coach|golf coach|track coach|"
    r"volleyball coach|baseball coach|soccer coach|swimming coach|"
    r"cross country(?:/track)? coach|varsity .{0,24}coach|"
    r"coach of the year|as (?:a |the )?(?:head |assistant )?coach"
    r")\b",
    re.I,
)


def main() -> None:
    inductees = json.loads(DATA.read_text(encoding="utf-8"))
    tagged = []
    for p in inductees:
        blob = f"{p.get('summary', '')}\n{p.get('bio', '')}"
        if not COACH_RE.search(blob):
            continue
        sports = list(p.get("sports") or [])
        if "Coaches" not in sports:
            sports.append("Coaches")
            p["sports"] = sports
        tagged.append(p["name"])

    DATA.write_text(json.dumps(inductees, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"tagged {len(tagged)} coaches")
    for name in tagged:
        print(" -", name)


if __name__ == "__main__":
    main()
