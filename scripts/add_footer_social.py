"""Add social links into every page footer brand block."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(r"d:\httpsmobilesportshalloffame")

SOCIAL = """        <div class="footer-social" aria-label="Social media">
          <a href="https://www.facebook.com/p/Mobile-Sports-Hall-of-Fame-100075949835568/" class="footer-social-link" target="_blank" rel="noopener noreferrer" aria-label="Facebook">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M14 8.2h2.2V5h-2.3c-2.7 0-4.4 1.6-4.4 4.2v1.8H7.5V14h2V21h3.2v-7h2.4l.5-3h-2.9V9.5c0-.9.3-1.3 1.3-1.3z"/></svg>
          </a>
          <a href="https://www.instagram.com/mobilesportshof/" class="footer-social-link" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 7.2A4.8 4.8 0 1 0 12 16.8 4.8 4.8 0 0 0 12 7.2zm0 7.9a3.1 3.1 0 1 1 0-6.2 3.1 3.1 0 0 1 0 6.2zm6.1-8.2a1.1 1.1 0 1 1-2.2 0 1.1 1.1 0 0 1 2.2 0zM12 3.5c-2.3 0-2.6 0-3.5.1-2.3.1-3.4 1.2-3.5 3.5-.1.9-.1 1.2-.1 3.5s0 2.6.1 3.5c.1 2.3 1.2 3.4 3.5 3.5.9.1 1.2.1 3.5.1s2.6 0 3.5-.1c2.3-.1 3.4-1.2 3.5-3.5.1-.9.1-1.2.1-3.5s0-2.6-.1-3.5c-.1-2.3-1.2-3.4-3.5-3.5-.9-.1-1.2-.1-3.5-.1zm0 1.5c2.3 0 2.5 0 3.4.1 1.7.1 2.5.9 2.6 2.6.1.9.1 1.1.1 3.4s0 2.5-.1 3.4c-.1 1.7-.9 2.5-2.6 2.6-.9.1-1.1.1-3.4.1s-2.5 0-3.4-.1c-1.7-.1-2.5-.9-2.6-2.6-.1-.9-.1-1.1-.1-3.4s0-2.5.1-3.4c.1-1.7.9-2.5 2.6-2.6.9-.1 1.1-.1 3.4-.1z"/></svg>
          </a>
        </div>
"""

BRAND = re.compile(
    r'(<div class="footer-brand">\s*'
    r'<img src="assets/logo\.png\?v=\d+" alt="Mobile Sports Hall of Fame" />\s*'
    r'<p>The Mobile Sports Hall of Fame</p>\s*)'
    r'(?:<div class="footer-social"[\s\S]*?</div>\s*)?'
    r'(</div>)',
    re.MULTILINE,
)


def main() -> None:
    for path in sorted(ROOT.glob("*.html")):
        text = path.read_text(encoding="utf-8")
        updated, n = BRAND.subn(rf"\1{SOCIAL}      \2", text, count=1)
        if n:
            path.write_text(updated, encoding="utf-8", newline="")
            print("updated", path.name)
        else:
            print("no match", path.name)


if __name__ == "__main__":
    main()
