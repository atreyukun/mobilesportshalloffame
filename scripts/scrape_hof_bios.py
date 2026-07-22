"""Second-pass bio scrape: skip year headings, match missing inductees."""
from __future__ import annotations

import json
import re
import html as html_lib
from pathlib import Path
from difflib import SequenceMatcher
import urllib.request

ROOT = Path(r"d:\httpsmobilesportshalloffame")
DATA = ROOT / "data" / "inductees.json"
UA = {"User-Agent": "Mozilla/5.0 (compatible; MSHOF-migrator/1.0)"}


def get(url: str) -> str:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.read().decode("utf-8", "ignore")


def normalize(s: str) -> str:
    s = html_lib.unescape(s)
    s = s.upper()
    s = s.replace("“", '"').replace("”", '"').replace("’", "'").replace("‘", "'")
    s = re.sub(r"[\"'`]", "", s)
    s = re.sub(r"\b(JR|SR|III|II|IV|DR|THE)\b\.?", " ", s)
    s = re.sub(r"[^A-Z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def strip_tags(s: str) -> str:
    s = re.sub(r"<\s*br\s*/?\s*>", "\n", s, flags=re.I)
    s = re.sub(r"</\s*p\s*>", "\n\n", s, flags=re.I)
    s = re.sub(r"</\s*div\s*>", "\n", s, flags=re.I)
    s = re.sub(r"<[^>]+>", "", s)
    s = html_lib.unescape(s)
    s = s.replace("\xa0", " ")
    s = re.sub(r"[ \t]+\n", "\n", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()


def last_name(name: str) -> str:
    parts = normalize(name).split()
    return parts[-1] if parts else ""


def score_names(a: str, b: str) -> float:
    na, nb = normalize(a), normalize(b)
    if not na or not nb:
        return 0.0
    if na == nb:
        return 1.0
    la, lb = last_name(a), last_name(b)
    if la != lb and SequenceMatcher(None, la, lb).ratio() < 0.86:
        return 0.0
    # token overlap
    ta, tb = set(na.split()), set(nb.split())
    if not ta or not tb:
        return 0.0
    overlap = len(ta & tb) / max(len(ta), len(tb))
    return max(SequenceMatcher(None, na, nb).ratio(), overlap)


def is_year_title(title: str) -> bool:
    t = title.strip()
    return bool(re.fullmatch(r"19\d{2}|20\d{2}", t))


def extract_entries(html: str) -> list[dict]:
    entries = []
    parts = re.split(r"(?=<h[1-6]\b)", html, flags=re.I)
    for part in parts:
        hm = re.match(r"<h[1-6][^>]*>(.*?)</h[1-6]>(.*)", part, flags=re.I | re.S)
        if not hm:
            continue
        title = strip_tags(hm.group(1))
        if is_year_title(title):
            continue
        if len(title) < 3 or len(title) > 90:
            continue
        if normalize(title) in {"HALL OF FAMERS", "HOME", "NEWS EVENTS", "A C", "D F", "G I", "J L", "M O", "P S", "T Z"}:
            continue
        body = strip_tags(hm.group(2))
        body = re.split(r"\bRead more\b", body, maxsplit=1)[0].strip()
        # drop leading year-only lines
        body = re.sub(r"^(19|20)\d{2}\s*", "", body).strip()
        if len(body) < 100:
            continue
        entries.append({"title": title, "bio": body})

    best: dict[str, dict] = {}
    for e in entries:
        key = normalize(e["title"])
        if key not in best or len(e["bio"]) > len(best[key]["bio"]):
            best[key] = e
    return list(best.values())


def main() -> None:
    raw = get("https://mobilesportshalloffame.net/wp-json/wp/v2/pages?slug=hall-of-famers")
    html = json.loads(raw)[0]["content"]["rendered"]
    entries = extract_entries(html)
    print("entries", len(entries))

    # Also dump searchable plain text index of names present
    plain = strip_tags(html)
    Path(ROOT / "data" / "bios_extracted.json").write_text(
        json.dumps(entries, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    inductees = json.loads(DATA.read_text(encoding="utf-8"))
    used_entries = set()
    updated = 0

    for i, p in enumerate(inductees):
        best = None
        best_score = 0.0
        best_key = None
        for e in entries:
            key = normalize(e["title"])
            if key in used_entries:
                continue
            sc = score_names(e["title"], p["name"])
            if sc > best_score:
                best_score = sc
                best = e
                best_key = key
        existing = p.get("bio") or ""
        if best and best_score >= 0.70:
            # Prefer longer/fuller site bio
            if len(best["bio"]) >= len(existing) - 50:
                p["bio"] = best["bio"]
                used_entries.add(best_key)
                updated += 1
                print(f"OK {p['name']} <- {best['title']} ({best_score:.2f}, {len(best['bio'])})")
            else:
                used_entries.add(best_key)
                print(f"KEEP {p['name']} existing longer")
        else:
            # fuzzy search name inside page plain text for debugging
            n = normalize(p["name"])
            found = n in normalize(plain) or last_name(p["name"]) in normalize(plain)
            print(f"-- {p['name']} best={best_score:.2f} onpage={found}")

    DATA.write_text(json.dumps(inductees, ensure_ascii=False, indent=2), encoding="utf-8")
    with_bio = sum(1 for p in inductees if len(p.get("bio") or "") > 100)
    print("\nUpdated", updated)
    print("With bio", with_bio, "/", len(inductees))
    missing = [p["name"] for p in inductees if len(p.get("bio") or "") < 100]
    print("Still missing", len(missing))
    for n in missing:
        print(" ", n)


if __name__ == "__main__":
    main()
