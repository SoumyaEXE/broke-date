"""Reconciliation: the hard gate between a statement and the ledger (SPEC 6.3)."""

from __future__ import annotations

from dataclasses import dataclass, field

from brokedate.enrich.rules import parse_narration
from brokedate.ingest.base import ParsedStatement, RawTxn


@dataclass
class ReconcileResult:
    ok: bool
    n_rows: int
    opening_paise: int | None
    closing_paise: int | None
    mismatch_index: int | None = None
    mismatch_row: int | None = None       # source row number in the file
    expected_paise: int | None = None
    found_paise: int | None = None
    n_with_balance: int = 0
    notes: list[str] = field(default_factory=list)


def reconcile(stmt: ParsedStatement) -> ReconcileResult:
    """balance[i] = balance[i-1] + credit[i] - debit[i] for every row that carries a balance."""
    txns = stmt.txns
    opening = stmt.opening_balance_paise
    if opening is None:
        first = next((i for i, t in enumerate(txns) if t.balance_after_paise is not None), None)
        if first is None:
            return ReconcileResult(False, len(txns), None, None, notes=["no balance column: cannot reconcile"])
        bal_first = txns[first].balance_after_paise
        assert bal_first is not None
        opening = bal_first - sum(t.signed for t in txns[: first + 1])
    bal = opening
    n_bal = 0
    for i, t in enumerate(txns):
        bal += t.signed
        if t.balance_after_paise is not None:
            n_bal += 1
            if t.balance_after_paise != bal:
                return ReconcileResult(False, len(txns), opening, None, i, t.source_row, bal, t.balance_after_paise,
                                       n_bal)
    return ReconcileResult(True, len(txns), opening, bal, n_with_balance=n_bal)


def mark_reversals(txns: list[RawTxn]) -> int:
    """Pair reversal credits with their original debit (by ref) and mark both REVERSED. Returns pairs found.

    Both rows stay in the ledger (they moved the balance) but neither counts as spending.
    """
    by_ref = {t.ref_no: t for t in txns if t.ref_no and t.direction == "DEBIT"}
    pairs = 0
    for t in txns:
        if t.direction != "CREDIT":
            continue
        p = parse_narration(t.raw_narration, t.direction)
        if p.kind == "REVERSAL" and p.orig_ref in by_ref:
            orig = by_ref[p.orig_ref]
            if orig.amount_paise == t.amount_paise and orig.status == "SUCCESS":
                orig.status = "REVERSED"
                t.status = "REVERSED"
                pairs += 1
    return pairs


def dedupe(txns: list[RawTxn], subject: str, existing_ids: set[str]) -> list[RawTxn]:
    seen = set(existing_ids)
    out = []
    for t in txns:
        tid = t.txn_id(subject)
        if tid in seen:
            continue
        seen.add(tid)
        out.append(t)
    return out
