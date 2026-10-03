"""PDF statement adapter (pdfplumber tables) and the privacy-safe `inspect` view (SPEC 6.2).

Generic table extraction: header row detected with the same aliases as the CSV adapter, multi-line
narrations merged, repeated page headers and carried-forward rows skipped.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta
from pathlib import Path

from brokedate.ingest.base import ParsedStatement, RawTxn
from brokedate.ingest.csv_generic import OPENING_RE, SKIP_RE, map_header, parse_date
from brokedate.money import parse_amount


def _tables(path: Path, password: str | None = None) -> list[list[list[str]]]:
    import pdfplumber

    out = []
    with pdfplumber.open(path, password=password) as pdf:
        for page in pdf.pages:
            for tbl in page.extract_tables():
                out.append([[(c or "").replace("\n", " ").strip() for c in row] for row in tbl])
    return out


def mask(text: str, keep: int = 24) -> str:
    """Digits -> '#', narration truncated: safe to paste into a chat while discussing the format."""
    return re.sub(r"\d", "#", text)[:keep]


def inspect_file(path: Path, password: str | None = None, max_rows: int = 12) -> str:
    lines = [f"file: {path.name}"]
    if path.suffix.lower() == ".pdf":
        tables = _tables(path, password)
        lines.append(f"tables found: {len(tables)}")
        for ti, tbl in enumerate(tables[:2]):
            lines.append(f"-- table {ti}: {len(tbl)} rows x {max((len(r) for r in tbl), default=0)} cols")
            for r in tbl[:max_rows]:
                lines.append(" | ".join(mask(c) for c in r))
    else:
        from brokedate.ingest.csv_generic import read_rows

        rows = read_rows(path)
        lines.append(f"rows: {len(rows)}")
        for r in rows[:max_rows]:
            lines.append(" | ".join(mask(c) for c in r))
    return "\n".join(lines)


class PdfBankAdapter:
    name = "pdf_bank"

    def __init__(self, password: str | None = None) -> None:
        self.password = password

    def sniff(self, path: Path) -> float:
        if path.suffix.lower() != ".pdf":
            return 0.0
        try:
            tables = _tables(path, self.password)
        except Exception:
            return 0.0
        return 0.85 if any(map_header(r) for t in tables for r in t[:5]) else 0.2

    def parse(self, path: Path, subject: str) -> ParsedStatement:
        tables = _tables(path, self.password)
        cols = None
        txns: list[RawTxn] = []
        opening: int | None = None
        last_day = None
        seq = 0
        for tbl in tables:
            for r in tbl:
                if (c := map_header(r)) is not None:
                    cols = c
                    continue
                if cols is None:
                    continue

                def cell(key: str, r: list[str] = r, cols: dict[str, int] = cols) -> str:
                    i = cols.get(key)
                    return r[i] if i is not None and i < len(r) else ""

                narr, dtext = cell("narration"), cell("date")
                if OPENING_RE.search(narr):
                    if opening is None and not txns:
                        opening = parse_amount(cell("balance"))
                    continue
                try:
                    day = parse_date(dtext)
                except ValueError:
                    if txns and narr and not cell("debit") and not cell("credit") and not cell("amount"):
                        txns[-1].raw_narration += " " + narr
                    continue
                if SKIP_RE.search(narr) and not (cell("debit") or cell("credit")):
                    continue
                if "amount" in cols and not ("debit" in cols and "credit" in cols):
                    amt = parse_amount(cell("amount")) or 0
                    is_debit = cell("drcr").upper().startswith("D") or amt < 0
                    debit, credit = (abs(amt), 0) if is_debit else (0, abs(amt))
                else:
                    debit = abs(parse_amount(cell("debit")) or 0)
                    credit = abs(parse_amount(cell("credit")) or 0)
                if not debit and not credit:
                    continue
                seq = seq + 1 if day == last_day else 0
                last_day = day
                txns.append(RawTxn(
                    ts=datetime(day.year, day.month, day.day) + timedelta(minutes=seq),
                    amount_paise=debit or credit, direction="DEBIT" if debit else "CREDIT", raw_narration=narr,
                    ref_no=cell("ref") or None, balance_after_paise=parse_amount(cell("balance")),
                    source_file=path.name, source_row=len(txns) + 1,
                ))
        if not txns:
            raise ValueError("no transactions found in PDF tables; run `brokedate inspect` and extend the adapter")
        return ParsedStatement(txns, opening, self.name, path.name)
