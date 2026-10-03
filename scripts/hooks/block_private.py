"""Pre-commit guard: refuse to commit private financial data.

Blocks staged paths under data/real/, out/real/ or brokedate-private/, any PDF / SQLite / Excel file, and text
content where an account-number-like digit run (9 to 18 digits) sits next to an account keyword.
Usage: python scripts/hooks/block_private.py [paths...]   (no args: inspects `git diff --cached`)
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

BLOCKED_DIRS = ("data/real/", "out/real/", "brokedate-private/")
BLOCKED_SUFFIXES = (".pdf", ".sqlite", ".sqlite3", ".db", ".xls", ".xlsx")
ACCOUNT_RE = re.compile(
    r"(?i)(?:\ba/?c\b|\bacct\b|\baccount(?:\s*(?:no|number))?\b)[\s.:#-]{0,6}[X*\d][X*\d\s-]{7,24}\d"
)
# Sim-data and test fixtures are allowed to carry fake account-like strings only if explicitly marked.
ALLOW_MARKER = "brokedate:allow-account-pattern"


def problems_for(path: str, content: bytes | None) -> list[str]:
    norm = path.replace("\\", "/")
    out: list[str] = []
    if any(norm.startswith(d) or f"/{d}" in norm for d in BLOCKED_DIRS):
        out.append(f"{path}: private data directory")
    if norm.lower().endswith(BLOCKED_SUFFIXES):
        out.append(f"{path}: blocked file type")
    if content is not None and not out:
        try:
            text = content.decode("utf-8")
        except UnicodeDecodeError:
            return out
        if ALLOW_MARKER not in text:
            for i, line in enumerate(text.splitlines(), 1):
                m = ACCOUNT_RE.search(line)
                if m and sum(c.isdigit() for c in m.group(0)) >= 4:
                    out.append(f"{path}:{i}: looks like an account number")
                    break
    return out


def staged_files() -> list[str]:
    res = subprocess.run(
        ["git", "diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"],
        capture_output=True, check=True,
    )
    return [p for p in res.stdout.decode("utf-8").split("\0") if p]


def staged_content(path: str) -> bytes | None:
    res = subprocess.run(["git", "show", f":{path}"], capture_output=True)
    return res.stdout if res.returncode == 0 else None


def main(argv: list[str]) -> int:
    if argv:
        items = [(p, Path(p).read_bytes() if Path(p).is_file() else None) for p in argv]
    else:
        items = [(p, staged_content(p)) for p in staged_files()]
    found = [msg for p, c in items for msg in problems_for(p, c)]
    if found:
        print("block_private: commit refused (private data guard)", file=sys.stderr)
        for msg in found:
            print("  " + msg, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
