"""Read the frozen evaluation parameters from docs/PREREGISTRATION.md (single source of truth)."""

from __future__ import annotations

import json
import re
from typing import Any

from brokedate.config import REPO_ROOT

PREREG = REPO_ROOT / "docs" / "PREREGISTRATION.md"


def frozen_params() -> dict[str, Any]:
    text = PREREG.read_text(encoding="utf-8")
    m = re.search(r"```json\s*(\{.*?\})\s*```", text, re.S)
    if not m:
        raise RuntimeError("PREREGISTRATION.md has no frozen ```json parameter block")
    return json.loads(m.group(1))
