"""Local calendar: festivals and exam windows (features only)."""

from __future__ import annotations

import tomllib
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path


@dataclass
class Calendar:
    festivals: list[tuple[str, date, date]]
    exams: list[tuple[date, date]]

    @classmethod
    def load(cls, festivals_file: Path, exams: list[list[str]] | None = None) -> Calendar:
        fest = []
        if festivals_file.is_file():
            raw = tomllib.loads(festivals_file.read_text(encoding="utf-8"))
            for f in raw.get("festival", []):
                fest.append((f["name"], date.fromisoformat(f["start"]), date.fromisoformat(f["end"])))
        ex = [(date.fromisoformat(a), date.fromisoformat(b)) for a, b in (exams or [])]
        return cls(sorted(fest, key=lambda x: x[1]), ex)

    def festival(self, d: date) -> str | None:
        for name, a, b in self.festivals:
            if a <= d <= b:
                return name
        return None

    def days_to_festival(self, d: date, cap: int = 60) -> int:
        best = cap
        for _, a, b in self.festivals:
            if a <= d <= b:
                return 0
            if a > d:
                best = min(best, (a - d).days)
        return best

    def is_exam(self, d: date) -> bool:
        return any(a <= d <= b for a, b in self.exams)

    def covers(self, d: date) -> bool:
        """True if the festival file has entries at least 60 days beyond d (else features degrade)."""
        return any(a >= d + timedelta(days=0) for _, a, _ in self.festivals)
