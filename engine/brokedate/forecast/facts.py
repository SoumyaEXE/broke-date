"""Facts ledger: every number shown to a human, with how it was computed (SPEC 14.1)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from brokedate.money import format_inr


def _ord(n: int) -> str:
    suf = "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suf}"


def render_value(value: Any, unit: str) -> str:
    if unit == "paise":
        return format_inr(int(round(value)))
    if unit == "days":
        v = float(value)
        return f"{v:.1f} day" + ("" if abs(v - 1) < 1e-9 else "s")
    if unit == "futures":
        return f"{int(value)}"
    if unit == "percent":
        return f"{round(float(value) * 100):d}%"
    if unit == "date":
        from datetime import date

        d = date.fromisoformat(str(value))
        return f"{_ord(d.day)} {d.strftime('%b')}"
    if unit == "count":
        return f"{int(value)}"
    return str(value)


@dataclass
class Facts:
    items: dict[str, dict[str, Any]] = field(default_factory=dict)

    def add(self, kind: str, value: Any, unit: str, desc: str, how: str, source: dict[str, Any],
            subject_ref: str | None = None) -> str:
        fid = f"f{len(self.items) + 1}"
        self.items[fid] = {"id": fid, "kind": kind, "value": value, "unit": unit, "text": render_value(value, unit),
                           "desc": desc, "how": how, "source": source, "subject_ref": subject_ref}
        return fid

    def by_kind(self, kind: str, subject_ref: str | None = None) -> str | None:
        for fid, f in self.items.items():
            if f["kind"] == kind and (subject_ref is None or f["subject_ref"] == subject_ref):
                return fid
        return None

    def descriptions(self) -> dict[str, str]:
        """What Gemma sees: ids and descriptions, never values."""
        return {fid: f["desc"] for fid, f in self.items.items()}

    def to_json(self) -> dict[str, dict[str, Any]]:
        return self.items
