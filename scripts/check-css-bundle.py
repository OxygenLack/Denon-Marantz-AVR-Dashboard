#!/usr/bin/env python3
"""Guard against a green build that silently lost Tailwind utilities.

Lesson (vault: "Tailwind 4 verliert fontsource-Dateien bei gruenem Build"):
a mis-detected content source or a broken @theme makes `vite build` exit 0
while the CSS shrinks to a few KB and every `denon-*` class is gone. Check
the artefact, not the exit code.

Reference: the built CSS was 54 KB on 54e4c96 (v3 config via @config) and
56 KB right after the @theme-inline migration. Fails under 30 KB.

Usage: python3 scripts/check-css-bundle.py [frontend/dist]
"""
from __future__ import annotations

import sys
from pathlib import Path

MIN_BYTES = 30 * 1024
REQUIRED = (
    ".bg-denon-card",
    ".text-denon-gold",
    ".bg-denon-gold\\/",
    "sm\\:",
    ".btn-primary",
)


def main() -> int:
    dist = Path(sys.argv[1] if len(sys.argv) > 1 else "frontend/dist")
    files = sorted((dist / "assets").glob("*.css")) if (dist / "assets").is_dir() else []
    if not files:
        print(f"check-css-bundle: no CSS under {dist}/assets - run `npm run build` first", file=sys.stderr)
        return 1
    total = sum(f.stat().st_size for f in files)
    css = "".join(f.read_text(encoding="utf-8", errors="replace") for f in files)
    ok = True
    if total < MIN_BYTES:
        print(f"check-css-bundle: FAIL built CSS is {total} B (< {MIN_BYTES} B)", file=sys.stderr)
        ok = False
    for marker in REQUIRED:
        if marker not in css:
            print(f"check-css-bundle: FAIL missing {marker!r}", file=sys.stderr)
            ok = False
    if ok:
        print(f"check-css-bundle: OK {total} B in {', '.join(f.name for f in files)}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
