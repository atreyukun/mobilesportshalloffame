"""Scrape HOF photos with stricter name matching."""
from __future__ import annotations

import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(r"d:\httpsmobilesportshalloffame")
OUT_DIR = ROOT / "assets" / "hof"
DATA = ROOT / "data" / "inductees.json"
UA = {"User-Agent": "Mozilla/5.0 (compatible; MSHOF-migrator/1.0)"}


def get(url: str) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=90) as resp:
        return resp.read()


def normalize(s: str) -> str:
    s = s.upper()
    s = s.replace("“", '"').replace("”", '"').replace("’", "'").replace("‘", "'")
    s = re.sub(r"[\"'`]", "", s)
    s = re.sub(r"\b(JR|SR|III|II|IV|DR|THE)\b\.?", " ", s)
    s = re.sub(r"[^A-Z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def tokens(s: str) -> list[str]:
    return [t for t in normalize(s).split() if t]


def last_name(name: str) -> str:
    parts = tokens(name)
    return parts[-1] if parts else ""


def first_names(name: str) -> set[str]:
    parts = tokens(name)
    return set(parts[:-1]) if len(parts) > 1 else set(parts)


def filename_key(url: str) -> str:
    base = Path(re.sub(r"[?#].*$", "", url)).stem
    base = re.sub(r"-\d+x\d+$", "", base)
    return normalize(base.replace("-", " ").replace("_", " "))


def full_size_url(url: str) -> str:
    url = url.replace("http://", "https://")
    return re.sub(r"-\d{2,4}x\d{2,4}(?=\.(jpg|jpeg|png|webp)$)", "", url, flags=re.I)


def score_match(person_name: str, img_key: str) -> float:
    p_last = last_name(person_name)
    i_parts = tokens(img_key)
    if not p_last or not i_parts:
        return 0.0
    i_last = i_parts[-1]
    # Last name must match (allow mild variants)
    if p_last != i_last and not (
        p_last.startswith(i_last) or i_last.startswith(p_last) or abs(len(p_last) - len(i_last)) <= 2
        and SequenceMatcher(None, p_last, i_last).ratio() >= 0.86
    ):
        # special nicknames mapped in filename
        nick_map = {
            "AARON": {"HANK", "HENRY"},
            "PAIGE": {"SATCHEL", "LEROY"},
            "STABLER": {"KENNY", "KEN"},
            "McCOVEY": {"WILLIE"},
        }
        # still require last-name equality mostly
        if p_last != i_last:
            # Thornton/Thorton, McDole/McDole variants handled above
            if SequenceMatcher(None, p_last, i_last).ratio() < 0.86:
                return 0.0

    p_first = first_names(person_name)
    i_first = set(i_parts[:-1])
    if not i_first:
        return 0.55 if p_last == i_last else 0.0

    # shared first/nickname token
    overlap = p_first & i_first
    if overlap:
        return 1.0 if p_last == i_last else 0.9

    # nickname heuristics: HANK in person, filename Hank Aaron
    nicknames = {
        "HENRY": {"HANK"},
        "HANK": {"HENRY"},
        "WILLIAM": {"BILL", "BILLY", "WILLIE"},
        "BILL": {"WILLIAM", "BILLY"},
        "BILLY": {"WILLIAM", "BILL"},
        "ROBERT": {"BOB", "BOBBY"},
        "BOBBY": {"ROBERT", "BOB"},
        "JAMES": {"JIM", "JIMMY", "JIMBO"},
        "JIM": {"JAMES", "JIMMY", "JIMBO"},
        "JIMBO": {"JAMES", "JIM", "JIMMY"},
        "THOMAS": {"TOM", "TOMMY", "TOMMIE"},
        "TOM": {"THOMAS", "TOMMY", "TOMMIE"},
        "EDWARD": {"ED", "EDDIE"},
        "ED": {"EDWARD", "EDDIE", "EDMUND"},
        "EDMUND": {"ED"},
        "MILTON": {"MILT"},
        "MILT": {"MILTON"},
        "LEROY": {"SATCHEL"},
        "SATCHEL": {"LEROY"},
        "CHARLIE": {"CHARLES"},
        "CHARLES": {"CHARLIE", "CHUCK"},
        "LOYD": {"LLOYD"},
        "LLOYD": {"LOYD"},
        "MARYDYE": {"MARDYE"},
        "MARDYE": {"MARYDYE"},
        "MABEL": {"MABEL"},
        "THORTON": {"THORNTON"},
        "THORNTON": {"THORTON"},
        "RAY": {"BUDDY"},
        "BUDDY": {"RAY"},
        "KENNY": {"KEN", "KENNETH"},
    }
    for pf in p_first:
        for iff in i_first:
            if iff in nicknames.get(pf, set()) or pf in nicknames.get(iff, set()):
                return 0.95
    # last name only — weak, don't auto-accept alone
    return 0.0


# late import for SequenceMatcher used above
from difflib import SequenceMatcher  # noqa: E402


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", normalize(name).lower()).strip("-")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    inductees = json.loads(DATA.read_text(encoding="utf-8"))

    # clear previous auto images (keep video/bio)
    for p in inductees:
        p.pop("image", None)

    raw = get("https://mobilesportshalloffame.net/wp-json/wp/v2/pages?slug=hall-of-famers").decode(
        "utf-8", "ignore"
    )
    html = json.loads(raw)[0]["content"]["rendered"]
    urls = re.findall(
        r"https?://[^\"'\s<>]+/wp-content/uploads/[^\"'\s<>]+\.(?:jpg|jpeg|png|webp)",
        html,
        re.I,
    )

    cleaned = []
    seen = set()
    for u in urls:
        u = full_size_url(u)
        if u in seen:
            continue
        # skip obvious non-portrait site images
        low = u.lower()
        if any(x in low for x in ["logo", "banner", "slider", "stadium", "baybear", "ballpark"]):
            continue
        seen.add(u)
        cleaned.append(u)

    images = [{"url": u, "key": filename_key(u), "file": Path(urllib.parse.urlparse(u).path).name} for u in cleaned]
    print("candidate images:", len(images))

    used = set()
    matched = 0
    unmatched = []

    for person in inductees:
        best = None
        best_score = 0.0
        for img in images:
            if img["url"] in used:
                continue
            sc = score_match(person["name"], img["key"])
            if sc > best_score:
                best_score = sc
                best = img
        if best and best_score >= 0.9:
            ext = Path(best["file"]).suffix.lower() or ".jpg"
            local_name = f"{slugify(person['name'])}{ext}"
            dest = OUT_DIR / local_name
            try:
                if not dest.exists() or dest.stat().st_size < 800:
                    dest.write_bytes(get(best["url"]))
                    time.sleep(0.04)
                person["image"] = f"assets/hof/{local_name}"
                used.add(best["url"])
                matched += 1
                print(f"OK  {person['name']} <- {best['file']} ({best_score:.2f})")
            except Exception as e:
                unmatched.append((person["name"], str(e)))
                print(f"ERR {person['name']}: {e}")
        else:
            unmatched.append((person["name"], f"best={best_score:.2f}"))
            print(f"--  {person['name']} (best {best_score:.2f})")

    # Media API pass for unmatched
    still = [p for p in inductees if not p.get("image")]
    print("\nMedia API pass for", len(still), "unmatched…")
    for person in still:
        q = urllib.parse.quote(last_name(person["name"]))
        if len(q) < 3:
            continue
        try:
            media = json.loads(
                get(
                    f"https://mobilesportshalloffame.net/wp-json/wp/v2/media?search={q}&per_page=20"
                ).decode("utf-8", "ignore")
            )
        except Exception:
            continue
        best = None
        best_score = 0.0
        for m in media:
            url = m.get("source_url") or ""
            if not url or url in used:
                continue
            key = filename_key(url)
            title_key = normalize(re.sub(r"<[^>]+>", "", m.get("title", {}).get("rendered", "")))
            sc = max(score_match(person["name"], key), score_match(person["name"], title_key))
            if sc > best_score:
                best_score = sc
                best = {"url": full_size_url(url), "file": Path(urllib.parse.urlparse(url).path).name}
        if best and best_score >= 0.9:
            ext = Path(best["file"]).suffix.lower() or ".jpg"
            local_name = f"{slugify(person['name'])}{ext}"
            dest = OUT_DIR / local_name
            try:
                dest.write_bytes(get(best["url"]))
                time.sleep(0.05)
                person["image"] = f"assets/hof/{local_name}"
                used.add(best["url"])
                matched += 1
                print(f"API {person['name']} <- {best['file']} ({best_score:.2f})")
            except Exception as e:
                print(f"API ERR {person['name']}: {e}")

    DATA.write_text(json.dumps(inductees, ensure_ascii=False, indent=2), encoding="utf-8")
    with_img = sum(1 for p in inductees if p.get("image"))
    print("\nFinal with images:", with_img, "/", len(inductees))
    print("Still missing:")
    for p in inductees:
        if not p.get("image"):
            print(" ", p["name"])


if __name__ == "__main__":
    main()
