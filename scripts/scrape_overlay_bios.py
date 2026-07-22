"""Extract Ultimate Addons overlay bios (Read more popups) from HOF page."""
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
    s = html_lib.unescape(s or "")
    s = s.upper()
    s = s.replace("“", '"').replace("”", '"').replace("’", "'").replace("‘", "'")
    s = re.sub(r"[\"'`]", "", s)
    s = re.sub(r"\b(JR|SR|III|II|IV|DR|THE)\b\.?", " ", s)
    s = re.sub(r"[^A-Z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def strip_tags(s: str) -> str:
    s = re.sub(r"\[/?[^\]]+\]", " ", s)
    s = re.sub(r"<\s*br\s*/?\s*>", "\n", s, flags=re.I)
    s = re.sub(r"</\s*p\s*>", "\n\n", s, flags=re.I)
    s = re.sub(r"<[^>]+>", " ", s)
    s = html_lib.unescape(s)
    s = s.replace("\xa0", " ")
    s = re.sub(r"[ \t]+", " ", s)
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
    return SequenceMatcher(None, na, nb).ratio()


def main() -> None:
    html = json.loads(
        get("https://mobilesportshalloffame.net/wp-json/wp/v2/pages?slug=hall-of-famers")
    )[0]["content"]["rendered"]

    # Map overlay id -> nearby heading name
    triggers = re.findall(
        r"<h4>(.*?)</h4>\s*<h5>(.*?)</h5>.*?"
        r'data-class-id="(content-[^"]+)"[^>]*>\s*Read more',
        html,
        flags=re.I | re.S,
    )
    print("read-more triggers", len(triggers))

    overlays = {}
    for m in re.finditer(
        r'<div class="ult-overlay\s+(content-[^"\s]+)[^"]*"[^>]*>.*?'
        r'<div class="ult_modal-body"[^>]*>(.*?)</div>\s*</div>\s*</div>',
        html,
        flags=re.I | re.S,
    ):
        oid, body = m.group(1), strip_tags(m.group(2))
        if len(body) > 80:
            overlays[oid] = body
    print("overlay bodies", len(overlays))

    # Also looser overlay body capture
    if len(overlays) < 20:
        for m in re.finditer(
            r'class="ult-overlay\s+(content-[^"\s]+).*?<div class="ult_modal-body"[^>]*>(.*?)</div>',
            html,
            flags=re.I | re.S,
        ):
            oid, body = m.group(1), strip_tags(m.group(2))
            if len(body) > 80:
                overlays[oid] = body
        print("overlay bodies retry", len(overlays))

    paired = []
    for title, year, oid in triggers:
        title = strip_tags(title)
        bio = overlays.get(oid, "")
        if len(bio) < 80:
            continue
        paired.append({"title": title, "year": year.strip(), "bio": bio, "id": oid})
    print("paired", len(paired))

    # If pairing failed, use all overlay texts and match by first words / content
    inductees = json.loads(DATA.read_text(encoding="utf-8"))
    updated = 0

    if paired:
        used = set()
        for e in paired:
            best_i, best_sc = None, 0.0
            for i, p in enumerate(inductees):
                if i in used:
                    continue
                sc = score_names(e["title"], p["name"])
                if sc > best_sc:
                    best_sc, best_i = sc, i
            if best_i is not None and best_sc >= 0.72:
                p = inductees[best_i]
                if len(e["bio"]) > len(p.get("bio") or "") + 30:
                    p["bio"] = e["bio"]
                    updated += 1
                    print(f"OVERLAY {p['name']} <- {e['title']} ({len(e['bio'])})")
                used.add(best_i)
    else:
        # Match overlays by searching inductee last name inside bio start
        for oid, bio in overlays.items():
            best_i, best_sc = None, 0.0
            head = bio[:120]
            for i, p in enumerate(inductees):
                sc = score_names(head, p["name"])
                # last name early in bio
                ln = last_name(p["name"])
                if ln and ln in normalize(bio[:200]):
                    sc = max(sc, 0.8)
                if sc > best_sc:
                    best_sc, best_i = sc, i
            if best_i is not None and best_sc >= 0.75:
                p = inductees[best_i]
                if len(bio) > len(p.get("bio") or "") + 30:
                    p["bio"] = bio
                    updated += 1
                    print(f"OVERLAY~ {p['name']} ({len(bio)})")

    # Ensure Guy Sumlin
    for p in inductees:
        if "SUMLIN" in p["name"].upper() and len(p.get("bio") or "") < 40:
            p["bio"] = "Welterweight boxing champion."

    DATA.write_text(json.dumps(inductees, ensure_ascii=False, indent=2), encoding="utf-8")
    print("updated", updated)
    print(
        "coverage",
        sum(1 for p in inductees if len(p.get("bio") or "") >= 40),
        "/",
        len(inductees),
    )
    print("long>500", sum(1 for p in inductees if len(p.get("bio") or "") > 500))


if __name__ == "__main__":
    main()
