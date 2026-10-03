from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Protocol


@dataclass
class RawTxn:
    ts: datetime                    # statement date (+ row order as minutes when no time is given)
    amount_paise: int               # positive
    direction: str                  # 'DEBIT' | 'CREDIT'
    raw_narration: str
    ref_no: str | None = None
    balance_after_paise: int | None = None
    source_file: str = ""
    source_row: int = 0
    status: str = "SUCCESS"
    extra: dict[str, str] = field(default_factory=dict)

    @property
    def day(self) -> date:
        return self.ts.date()

    @property
    def signed(self) -> int:
        return self.amount_paise if self.direction == "CREDIT" else -self.amount_paise

    def txn_id(self, subject: str) -> str:
        if self.ref_no:
            key = f"{subject}|ref|{self.ref_no}|{self.direction}|{self.amount_paise}"
        else:
            key = (f"{subject}|row|{self.day.isoformat()}|{self.direction}|{self.amount_paise}|"
                   f"{self.balance_after_paise}|{self.raw_narration}")
        return hashlib.sha1(key.encode("utf-8")).hexdigest()[:20]


@dataclass
class ParsedStatement:
    txns: list[RawTxn]
    opening_balance_paise: int | None
    adapter: str
    source_file: str


class Adapter(Protocol):
    name: str

    def sniff(self, path: Path) -> float: ...

    def parse(self, path: Path, subject: str) -> ParsedStatement: ...
