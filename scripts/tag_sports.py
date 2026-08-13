"""Infer sports tags from inductee summary/bio and write into data/inductees.json."""
from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

DATA = Path(r"d:\httpsmobilesportshalloffame\data\inductees.json")

# Order matters for display; patterns are OR'd within a sport.
SPORTS: list[tuple[str, list[str]]] = [
    (
        "Baseball",
        [
            r"\bbaseball\b",
            r"\bMLB\b",
            r"\bNegro League",
            r"\bmajor league\b",
            r"\bWorld Series\b",
            r"\bCy Young\b",
            r"\bpitcher\b",
            r"\bcatcher\b",
            r"\bshortstop\b",
            r"\bfirst baseman\b",
            r"\boutfielder\b",
            r"\bhome run",
            r"\bBayBears\b",
            r"\bSouthern League\b",
        ],
    ),
    (
        "Football",
        [
            r"\bfootball\b",
            r"\bNFL\b",
            r"\bquarterback\b",
            r"\blineman\b",
            r"\blinebacker\b",
            r"\bwide receiver\b",
            r"\bSuper Bowl\b",
            r"\btouchdown\b",
            r"\bHeisman\b",
            r"\bSenior Bowl\b",
            r"\bAHSAA\b.*football|football.*\bAHSAA\b",
        ],
    ),
    (
        "Basketball",
        [
            r"\bbasketball\b",
            r"\bNBA\b",
            r"\bpoint guard\b",
            r"\bNJCAA\b.*basketball|basketball.*\bNJCAA\b",
        ],
    ),
    ("Golf", [r"\bgolf\b", r"\bLPGA\b", r"\bPGA\b", r"\bgolfer\b"]),
    ("Track & Field", [r"\btrack\b", r"\bcross country\b", r"\bjumper\b", r"\bsprint"]),
    ("Soccer", [r"\bsoccer\b"]),
    ("Volleyball", [r"\bvolleyball\b"]),
    ("Boxing", [r"\bboxing\b", r"\bwelterweight\b", r"\bheavyweight\b", r"\bboxer\b"]),
    ("Softball", [r"\bsoftball\b"]),
    ("Tennis", [r"\btennis\b"]),
    ("Swimming", [r"\bswim", r"\bdiving\b"]),
    ("Sailing", [r"\bsailing\b", r"\bU\.S\. Sailing\b"]),
    ("Shooting", [r"\bskeet\b", r"\bclay target\b", r"\bmarksman\b", r"\bshooting\b"]),
    ("Media", [r"\bsportscaster\b", r"\bsports writer\b", r"\bjournalist\b", r"\broadcaster\b"]),
        (
        "Contributor",
        [
            r"\bSpecial Olympics\b",
            r"\bSupervisor of Health, Physical Education\b",
            r"\bPhysical Education and Recreation\b",
        ],
    ),
]


def infer(text: str) -> list[str]:
    hits = []
    for sport, pats in SPORTS:
        if any(re.search(pat, text, re.I) for pat in pats):
            hits.append(sport)
    return hits


def main() -> None:
    inductees = json.loads(DATA.read_text(encoding="utf-8"))
    counts: Counter[str] = Counter()
    none = []
    for p in inductees:
        blob = f"{p.get('name','')}\n{p.get('summary','')}\n{p.get('bio','')}"
        sports = infer(blob)
        # Keep any manually curated sports if already present and non-empty
        existing = p.get("sports")
        if isinstance(existing, list) and existing and p.get("sportsCurated"):
            sports = existing
        p["sports"] = sports
        if sports:
            for s in sports:
                counts[s] += 1
        else:
            none.append(p["name"])

    DATA.write_text(json.dumps(inductees, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("counts", dict(counts))
    print("tagged", sum(1 for p in inductees if p.get("sports")), "/", len(inductees))
    print("untagged", len(none))
    for n in none:
        print(" -", n)


if __name__ == "__main__":
    main()
