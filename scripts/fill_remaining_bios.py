"""Fill remaining HOF bios from vc_column_text blurbs + summaries."""
from __future__ import annotations

import json
import re
import html as html_lib
from pathlib import Path
import urllib.request

ROOT = Path(r"d:\httpsmobilesportshalloffame")
DATA = ROOT / "data" / "inductees.json"
UA = {"User-Agent": "Mozilla/5.0 (compatible; MSHOF-migrator/1.0)"}


def get(url: str) -> str:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.read().decode("utf-8", "ignore")


def normalize(s: str) -> str:
    s = html_lib.unescape(s or "")
    s = s.upper()
    s = s.replace("“", '"').replace("”", '"').replace("’", "'").replace("‘", "'")
    s = re.sub(r"[\"'`]", "", s)
    s = re.sub(r"\b(JR|SR|III|II|IV|DR|THE)\b\.?", " ", s)
    s = re.sub(r"[^A-Z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def strip_tags(s: str) -> str:
    s = re.sub(r"\[/?vc_[^\]]*\]", " ", s)
    s = re.sub(r"<\s*br\s*/?\s*>", "\n", s, flags=re.I)
    s = re.sub(r"</\s*p\s*>", "\n\n", s, flags=re.I)
    s = re.sub(r"<[^>]+>", " ", s)
    s = html_lib.unescape(s)
    s = s.replace("\xa0", " ")
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()


def name_variants(name: str) -> list[str]:
    raw = html_lib.unescape(name)
    variants = {raw, re.sub(r"[“”\"‘’']", "", raw)}
    # without nickname quotes content kept
    n = normalize(name)
    variants.add(n)
    parts = n.split()
    if len(parts) >= 2:
        variants.add(f"{parts[0]} {parts[-1]}")
        variants.add(parts[-1])
        # nickname only + last
        for p in parts[1:-1]:
            variants.add(f"{p} {parts[-1]}")
    # special
    specials = {
        "ALBERT TIPPING TERRY": ["TIPPING TERRY", "ALBERT TERRY", "TIPPING"],
        "EDWARD ED SCOTT": ["ED SCOTT", "EDWARD SCOTT", "ED SCOTT SR"],
        "TED DOUBLE DUTY RADCLIFFE": ["DOUBLE DUTY RADCLIFFE", "TED RADCLIFFE", "RADCLIFFE"],
        "W J PETE MILNE": ["PETE MILNE", "W J MILNE", "MILNE"],
        "JAMES JIM TATE": ["JIM TATE", "JAMES TATE"],
        "JOHNNY J D SHELWOOD": ["J D SHELWOOD", "JOHNNY SHELWOOD", "SHELWOOD"],
        "JULES STORMY MUGNIER": ["STORMY MUGNIER", "JULES MUGNIER"],
        "CARVEL BAMA ROWELL": ["BAMA ROWELL", "CARVEL ROWELL"],
        "LIONEL RED NOONAN": ["RED NOONAN", "LIONEL NOONAN"],
        "WILLIAM BOBBY ROBINSON": ["BOBBY ROBINSON", "WILLIAM ROBINSON"],
        "WILLIAM EARLE SMITH": ["EARLE SMITH", "WILLIAM EARLE SMITH JR"],
        "1947 MOBILE BEARS BASEBALL TEAM": ["1947 MOBILE BEARS", "MOBILE BEARS BASEBALL TEAM"],
        "1988 VIGOR HIGH SCHOOL FOOTBALL TEAM": ["1988 VIGOR", "VIGOR HIGH SCHOOL FOOTBALL"],
    }
    key = normalize(name)
    for k, vals in specials.items():
        if key.startswith(k) or k in key:
            variants.update(vals)
    return [v for v in variants if v]


def main() -> None:
    raw = get("https://mobilesportshalloffame.net/wp-json/wp/v2/pages?slug=hall-of-famers")
    html = json.loads(raw)[0]["content"]["rendered"]
    plain = strip_tags(html)
    plain_norm = normalize(plain)

    # Collect vc_column_text chunks
    chunks = re.findall(
        r"\[vc_column_text[^\]]*\](.*?)\[/vc_column_text\]",
        html,
        flags=re.I | re.S,
    )
    if not chunks:
        # rendered HTML may already expand shortcodes — split on column_text class
        chunks = re.findall(
            r'<div[^>]*class="[^"]*wpb_text_column[^"]*"[^>]*>.*?<div[^>]*class="[^"]*wpb_wrapper[^"]*"[^>]*>(.*?)</div>',
            html,
            flags=re.I | re.S,
        )
    print("chunks", len(chunks))
    chunk_texts = [strip_tags(c) for c in chunks]
    chunk_texts = [c for c in chunk_texts if len(c) > 40]

    inductees = json.loads(DATA.read_text(encoding="utf-8"))
    filled = 0

    for p in inductees:
        existing = (p.get("bio") or "").strip()
        if len(existing) > 100:
            continue

        variants = name_variants(p["name"])
        best = ""
        for text in chunk_texts:
            nt = normalize(text)
            if any(normalize(v) in nt for v in variants if len(normalize(v)) >= 4):
                # Prefer chunk that starts with the name-ish content
                if len(text) > len(best):
                    best = text

        # Also try regex on full plain text: NAME YEAR rest until next ALLCAPS name pattern
        if len(best) < 80:
            for v in sorted(variants, key=len, reverse=True):
                vv = re.escape(v)
                # allow curly quotes variance already stripped in plain
                m = re.search(
                    rf"({re.escape(html_lib.unescape(p['name']))}|\b{vv}\b)\s*((?:19|20)\d{{2}})?\s*(.{{40,800}}?)(?=\s+[A-Z0-9][A-Z0-9 .'\-]{{2,40}}\s+(?:19|20)\d{{2}}\b|\s*Close\b|\Z)",
                    plain,
                    flags=re.I | re.S,
                )
                if m:
                    piece = " ".join(x for x in m.groups() if x).strip()
                    piece = re.sub(r"\s+", " ", piece)
                    if len(piece) > len(best):
                        best = piece
                    break

        if len(best) >= 60:
            # Clean leading name/year duplication into readable bio
            bio = best
            # If it's "NAME YEAR text", drop name/year prefix when summary-like
            bio = re.sub(
                rf"^{re.escape(html_lib.unescape(p['name']))}\s*",
                "",
                bio,
                flags=re.I,
            ).strip()
            bio = re.sub(r"^(19|20)\d{2}\s*", "", bio).strip()
            if len(bio) < 40:
                bio = best
            p["bio"] = bio
            filled += 1
            print(f"FILL {p['name']} ({len(bio)} chars)")
        else:
            # Last resort: use listing summary so the modal isn't empty
            summary = (p.get("summary") or "").strip()
            if len(summary) >= 40:
                p["bio"] = summary
                filled += 1
                print(f"SUM  {p['name']} ({len(summary)} chars)")
            else:
                print(f"MISS {p['name']}")

    DATA.write_text(json.dumps(inductees, ensure_ascii=False, indent=2), encoding="utf-8")
    with_bio = sum(1 for p in inductees if len(p.get("bio") or "") >= 40)
    long_bio = sum(1 for p in inductees if len(p.get("bio") or "") > 200)
    print("\nFilled this pass:", filled)
    print("With any bio>=40:", with_bio, "/", len(inductees))
    print("With long bio>200:", long_bio)
    missing = [p["name"] for p in inductees if len(p.get("bio") or "") < 40]
    print("Still empty:", missing)


if __name__ == "__main__":
    main()
