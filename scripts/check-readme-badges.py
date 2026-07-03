#!/usr/bin/env python3
"""Fail if a README version badge has drifted from the real dependency pin.

The README shields.io badges (FastAPI, Python, React, Vite) hardcode a version.
Renovate bumps the actual pins in requirements.txt / Dockerfile / package.json
but not the badge text, so the badge silently goes stale. This check ties the
two together: each badge must match its source of truth, truncated to the
badge's own precision (e.g. badge "0.138" matches pin "0.138.0").

Run with --fix to rewrite the badges from the pins instead of failing.

Usage:  python scripts/check-readme-badges.py [--fix]
Exit 0 = in sync, 1 = drift (or fixed with --fix).
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
README = ROOT / "README.md"


def pin_fastapi() -> str:
    m = re.search(r"^fastapi==([0-9][0-9.]*)", (ROOT / "backend/requirements.txt").read_text(), re.M)
    return m.group(1) if m else ""


def pin_python() -> str:
    m = re.search(r"python:([0-9]+\.[0-9]+)", (ROOT / "Dockerfile").read_text())
    return m.group(1) if m else ""


def pin_npm(section: str, name: str) -> str:
    pkg = json.loads((ROOT / "frontend/package.json").read_text())
    return re.sub(r"^[^0-9]*", "", pkg.get(section, {}).get(name, ""))


# badge label -> resolver for the source-of-truth version
SOURCES = {
    "FastAPI": pin_fastapi,
    "Python": pin_python,
    "React": lambda: pin_npm("dependencies", "react"),
    "Vite": lambda: pin_npm("devDependencies", "vite"),
}


def truncate(version: str, parts: int) -> str:
    """Trim a version to N dotted components (so pin 0.138.0 == badge 0.138)."""
    return ".".join(version.split(".")[:parts])


def main() -> int:
    fix = "--fix" in sys.argv[1:]
    text = README.read_text()
    drift, fixed = [], text

    for label, resolver in SOURCES.items():
        # match e.g.  ![FastAPI](https://img.shields.io/badge/FastAPI-0.138-009688)
        pat = re.compile(rf"(/badge/{re.escape(label)}-)([0-9][0-9.]*)(-)")
        m = pat.search(fixed)
        if not m:
            continue  # badge not present; nothing to check
        badge_ver = m.group(2)
        pin = resolver()
        if not pin:
            print(f"WARN: could not resolve source version for {label}", file=sys.stderr)
            continue
        want = truncate(pin, badge_ver.count(".") + 1)
        if badge_ver != want:
            drift.append((label, badge_ver, want, pin))
            if fix:
                fixed = pat.sub(rf"\g<1>{want}\g<3>", fixed, count=1)

    if not drift:
        print("README badges in sync with dependency pins.")
        return 0

    for label, have, want, pin in drift:
        print(f"DRIFT: {label} badge shows {have!r} but pin is {pin!r} -> expected {want!r}")

    if fix:
        README.write_text(fixed)
        print("Fixed README badges. Review and commit.")
        return 0

    print("\nRun:  python scripts/check-readme-badges.py --fix", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
