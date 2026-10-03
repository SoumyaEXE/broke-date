"""Generic column-mapping adapter for bank CSV / XLSX exports (SPEC 6.1).

Finds the header row (banks put account details above the table), maps columns by header names, and
reads refs as strings (12-digit RRNs lose precision as floats).
"""

from __future__ import annotations

import csv
import re
from datetime import date, datetime, timedelta
from pathlib import Path

from brokedate.ingest.base import ParsedStatement, RawTxn
from brokedate.money import parse_amount

HEADER_ALIASES: dict[str, tuple[str, ...]] = {
    "date": ("date", "txn date", "transaction date", "tran date", "posting date", "value date"),
    "narration": ("narration", "description", "particulars", "remarks", "transaction details", "details",
                  "transaction remarks"),
    "ref": ("chq./ref.no.", "chq/ref no", "ref no", "ref no./cheque no.", "reference no", "cheque no",
            "chq no", "ref no./chq no.", "utr", "reference", "transaction id", "chq./ref. no."),
    "value_date": ("value dt", "value date"),
    "debit": ("withdrawal amt.", "withdrawal amt", "withdrawal", "withdrawals", "debit", "debit amount", "dr",
              "debit amt", "withdrawal (dr)", "dr amount"),
    "credit": ("deposit amt.", "deposit amt", "deposit", "deposits", "credit", "credit amount", "cr",
               "credit amt", "deposit (cr)", "cr amount"),
    "amount": ("amount", "txn amount", "transaction amount", "amount (inr)"),
    "drcr": ("dr/cr", "cr/dr", "type", "dr / cr", "debit/credit"),
    "balance": ("closing balance", "balance", "available balance", "balance (inr)", "running balance"),
}
DATE_FORMATS = ("%d/%m/%y", "%d/%m/%Y", "%d-%m-%Y", "%d-%m-%y", "%d-%b-%Y", "%d-%b-%y", "%d %b %Y", "%d %b %y",
                "%Y-%m-%d", "%d.%m.%Y", "%d.%m.%y", "%b %d, %Y", "%d/%b/%Y")
OPENING_RE = re.compile(r"opening\s+balance|balance\s+b/?f|brought\s+forward|b/f", re.I)
SKIP_RE = re.compile(r"closing\s+balance|carried\s+forward|c/f|total|statement\s+summary|page\s+\d", re.I)


def _norm(h: str) -> str:
    return re.sub(r"\s+", " ", str(h or "").strip().lower())


def parse_date(s: str | date | datetime) -> date:
    if isinstance(s, datetime):
        return s.date()
    if isinstance(s, date):
        return s
    t = str(s).strip()
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(t, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"unrecognised date: {s!r}")


def map_header(row: list[str]) -> dict[str, int] | None:
    cols: dict[str, int] = {}
    normed = [_norm(c) for c in row]
    for key, aliases in HEADER_ALIASES.items():
        for i, h in enumerate(normed):
            if h in aliases and i not in cols.values():
                cols.setdefault(key, i)
                break
    has_amounts = ("debit" in cols and "credit" in cols) or "amount" in cols
    if "date" in cols and "narration" in cols and has_amounts:
        return cols
    return None


def read_rows(path: Path) -> list[list[str]]:
    suf = path.suffix.lower()
    if suf in (".xlsx", ".xlsm"):
        import openpyxl

        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        ws = wb.worksheets[0]
        out = []
        for r in ws.iter_rows(values_only=True):
            out.append(["" if v is None else (v.strftime("%d/%m/%Y") if isinstance(v, datetime | date) else str(v))
                        for v in r])
        return out
    raw = path.read_bytes()
    for enc in ("utf-8-sig", "utf-16", "cp1252"):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        raise ValueError("cannot decode file")
    dialect = csv.Sniffer().sniff(text[:4096], delimiters=",;\t|") if text.count("\t") > text.count(",") else "excel"
    return [r for r in csv.reader(text.splitlines(), dialect)]


class GenericCsvAdapter:
    name = "csv_generic"

    def sniff(self, path: Path) -> float:
        if path.suffix.lower() not in (".csv", ".txt", ".xlsx", ".xlsm", ".tsv"):
            return 0.0
        try:
            rows = read_rows(path)[:40]
        except Exception:
            return 0.0
        return 0.9 if any(map_header(r) for r in rows) else 0.1

    def parse(self, path: Path, subject: str) -> ParsedStatement:
        rows = read_rows(path)
        hdr_idx, cols = next(((i, c) for i, r in enumerate(rows[:60]) if (c := map_header(r))), (None, None))
        if cols is None or hdr_idx is None:
            raise ValueError("no recognisable header row (need date, narration and amount columns)")
        txns: list[RawTxn] = []
        opening: int | None = None
        last_day: date | None = None
        seq = 0

        def cell(r: list[str], key: str) -> str:
            i = cols.get(key)
            return r[i].strip() if i is not None and i < len(r) and r[i] is not None else ""

        for ridx, r in enumerate(rows[hdr_idx + 1:], start=hdr_idx + 2):
            if not any(str(c).strip() for c in r):
                continue
            narr = cell(r, "narration")
            dtext = cell(r, "date")
            if OPENING_RE.search(narr) or OPENING_RE.search(dtext):
                bal = parse_amount(cell(r, "balance"))
                if bal is not None and opening is None and not txns:
                    opening = bal
                continue
            if SKIP_RE.search(narr) and not cell(r, "debit") and not cell(r, "credit") and not cell(r, "amount"):
                continue
            try:
                day = parse_date(dtext)
            except ValueError:
                if txns and not dtext and narr:     # continuation of a multi-line narration
                    txns[-1].raw_narration += " " + narr
                    continue
                continue
            if "amount" in cols and not ("debit" in cols and "credit" in cols):
                amt = parse_amount(cell(r, "amount"))
                if amt is None:
                    continue
                flag = cell(r, "drcr").upper()
                is_debit = flag.startswith("D") or amt < 0
                debit, credit = (abs(amt), 0) if is_debit else (0, abs(amt))
            else:
                debit = abs(parse_amount(cell(r, "debit")) or 0)
                credit = abs(parse_amount(cell(r, "credit")) or 0)
            if debit == 0 and credit == 0:
                continue
            if debit and credit:
                raise ValueError(f"row {ridx}: both withdrawal and deposit set")
            seq = seq + 1 if day == last_day else 0
            last_day = day
            ref = cell(r, "ref")
            ref = ref[:-2] if ref.endswith(".0") else ref
            txns.append(RawTxn(
                ts=datetime(day.year, day.month, day.day) + timedelta(minutes=seq),
                amount_paise=debit or credit, direction="DEBIT" if debit else "CREDIT",
                raw_narration=narr, ref_no=ref or None,
                balance_after_paise=parse_amount(cell(r, "balance")),
                source_file=path.name, source_row=ridx,
            ))
        if not txns:
            raise ValueError("no transactions found")
        return ParsedStatement(txns, opening, self.name, path.name)
