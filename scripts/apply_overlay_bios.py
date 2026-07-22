"""Transfer every old-site HOF entry text into data/inductees.json.

Handles:
- Normal ult_modal-body overlays
- Broken WP entries where bio paragraphs sit after an empty modal
- Listing-only blurbs (no Read more)
"""
from __future__ import annotations

import html as html_lib
import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(r"d:\httpsmobilesportshalloffame")
DATA = ROOT / "data" / "inductees.json"
UA = {"User-Agent": "Mozilla/5.0 (compatible; MSHOF-migrator/1.0)"}
PROTECTED = {"HENRY HANK AARON", "OZZIE SMITH"}


def get(url: str) -> str:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.read().decode("utf-8", "ignore")


def normalize(s: str) -> str:
    s = html_lib.unescape(s or "").upper()
    s = s.replace("\u201c", '"').replace("\u201d", '"')
    s = re.sub(r"[\"'`]", "", s)
    s = re.sub(r"\b(JR|SR|III|II|IV|DR|THE)\b\.?", " ", s)
    s = re.sub(r"[^A-Z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def html_to_text(s: str) -> str:
    s = re.sub(r"\[/?[^\]]+\]", " ", s)
    s = re.sub(r"<\s*br\s*/?\s*>", "\n", s, flags=re.I)
    s = re.sub(r"</\s*p\s*>", "\n\n", s, flags=re.I)
    s = re.sub(r"<[^>]+>", " ", s)
    s = html_lib.unescape(s)
    s = s.replace("\xa0", " ")
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()


def clean_bio(s: str) -> str:
    s = html_to_text(s)
    s = re.split(r"(?i)\n\s*Close\s*\n", s, maxsplit=1)[0]
    s = re.split(r"\[vc_column_text", s, maxsplit=1)[0]
    s = re.split(r"\{margin-top:", s, maxsplit=1)[0]
    s = re.split(r"border-top-color:", s, maxsplit=1)[0]
    s = re.sub(r"(?i)^\s*Close\s+", "", s)
    s = re.sub(r"(?i)\bRead more\.?\s*$", "", s)
    # Drop truncated tag leftovers
    s = re.sub(r"<\s*div\b.*", "", s, flags=re.I | re.S)
    return s.strip(" \n\t.]")


def modal_body_text(block: str) -> str:
    bm = re.search(
        r'<div class="ult_modal-body"[^>]*>(.*)',
        block,
        flags=re.I | re.S,
    )
    if not bm:
        return ""
    return clean_bio(bm.group(1))


def trailing_paragraphs(after_overlay: str) -> str:
    """Bios sometimes sit as <p> tags after a broken empty modal."""
    chunk = re.split(r"(?i)<h4>", after_overlay, maxsplit=1)[0]
    chunk = re.split(r"\[vc_column_text", chunk, maxsplit=1)[0]
    # drop residual overlay close wrappers
    chunk = re.sub(
        r'(?is)<div class="ult-overlay-close">.*?</div>',
        " ",
        chunk,
    )
    ps = re.findall(r"(?is)<p[^>]*>(.*?)</p>", chunk)
    texts = []
    for p in ps:
        t = clean_bio(p)
        if len(t) < 30:
            continue
        if "border-top" in t or "!important" in t:
            continue
        texts.append(t)
    return "\n\n".join(texts).strip()


def extract_entries(html: str) -> dict[str, dict]:
    by_key: dict[str, dict] = {}
    for part in re.split(r"(?i)(?=<h4>)", html):
        hm = re.match(r"(?is)<h4>(.*?)</h4>\s*<h5>(.*?)</h5>(.*)", part)
        if not hm:
            continue
        title = clean_bio(hm.group(1))
        rest = re.split(r"(?i)<h4>", hm.group(3), maxsplit=1)[0]

        trigger = re.search(
            r'<div[^>]*data-class-id="(content-[^"]+)"[^>]*>\s*Read more',
            rest,
            flags=re.I,
        )
        overlay = ""
        trailing = ""
        if trigger:
            oid = trigger.group(1)
            # Prefer fence to ult-overlay-close for THIS overlay id
            om = re.search(
                rf'(?is)<div class="ult-overlay\s+{re.escape(oid)}[^"]*"[^>]*>'
                rf'(.*?)<div class="ult-overlay-close"',
                rest,
            )
            if om:
                overlay = modal_body_text(om.group(1))
                after = rest[om.end() :]
                # skip the close div end
                after = re.sub(r"(?is)^[^>]*>\s*Close\s*</div>\s*</div>", "", after, count=1)
                trailing = trailing_paragraphs(after)
            if len(overlay) < 40 and trailing:
                overlay = trailing
            elif trailing and len(trailing) > len(overlay) + 50:
                overlay = trailing

        before = rest[: trigger.start()] if trigger else rest
        before = re.split(r"(?i)<div\b", before, maxsplit=1)[0]
        blurb = clean_bio(before)
        if "\n\n" in blurb:
            first = blurb.split("\n\n")[0].strip()
            if 20 < len(first) < 500:
                blurb = first

        bio = overlay if len(overlay) > 40 else blurb
        key = normalize(title)
        rec = {"title": title, "bio": bio, "overlay": overlay, "blurb": blurb}
        if key not in by_key or len(bio) > len(by_key[key]["bio"]):
            by_key[key] = rec
    return by_key


def main() -> None:
    html = json.loads(
        get(
            "https://mobilesportshalloffame.net/wp-json/wp/v2/pages"
            "?slug=hall-of-famers&_fields=content"
        )
    )[0]["content"]["rendered"]

    by_key = extract_entries(html)
    print("entries", len(by_key))
    print("long overlay/trailing", sum(1 for e in by_key.values() if len(e["overlay"]) > 40))

    inductees = json.loads(DATA.read_text(encoding="utf-8"))
    updated = 0
    missing = []
    for p in inductees:
        key = normalize(p["name"])
        e = by_key.get(key)
        if not e:
            pn = key.split()
            best, best_sc = None, 0.0
            for tk, cand in by_key.items():
                tn = tk.split()
                if not pn or not tn or pn[-1] != tn[-1]:
                    continue
                sc = len(set(pn) & set(tn)) / max(len(set(pn) | set(tn)), 1)
                if sc > best_sc:
                    best_sc, best = sc, cand
            e = best if best and best_sc >= 0.45 else None
        if not e or not e["bio"]:
            missing.append(p["name"])
            continue

        new_bio = e["bio"]
        cur = p.get("bio") or ""
        dirty = bool(
            re.search(
                r"(?i)(</?div|vc_column|border-top-color|!important|\nClose\b)",
                cur,
            )
        )
        prot = key in PROTECTED
        if prot and not dirty and len(cur) >= len(new_bio):
            continue
        if dirty or new_bio != cur:
            if dirty or len(new_bio) >= len(cur) or len(cur) < 220:
                p["bio"] = new_bio
                updated += 1

    DATA.write_text(json.dumps(inductees, ensure_ascii=False, indent=2), encoding="utf-8")
    dirty_left = [
        p["name"]
        for p in inductees
        if re.search(r"(?i)(</?div|vc_column|border-top-color|!important)", p.get("bio") or "")
    ]
    lengths = sorted((len(p.get("bio") or ""), p["name"]) for p in inductees)
    print("updated", updated, "missing", missing)
    print("dirty left", dirty_left)
    print("shortest", lengths[:10])
    print(
        ">=40",
        sum(1 for n, _ in lengths if n >= 40),
        ">500",
        sum(1 for n, _ in lengths if n > 500),
        "/",
        len(inductees),
    )
    for needle in ("JIMMY GREEN", "AMOS OTIS", "SHELWOOD", "GUY SUMLIN", "BILL MENTON"):
        for p in inductees:
            if needle.replace(" ", "") in normalize(p["name"]).replace(" ", "") or (
                needle in normalize(p["name"])
            ):
                b = p.get("bio") or ""
                print(f"\n{p['name']} ({len(b)})")
                print(b[:160].replace("\n", " "))
                if len(b) > 200:
                    print("...", b[-100:].replace("\n", " "))


if __name__ == "__main__":
    main()
