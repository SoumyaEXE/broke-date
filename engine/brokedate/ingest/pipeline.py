"""Statement -> reconciled, labelled ledger rows in SQLite."""

from __future__ import annotations

import logging
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from brokedate.config import Config
from brokedate.db import DB
from brokedate.enrich.pipeline import EnrichStats, label_rows
from brokedate.ingest.cycles import detect_anchors
from brokedate.ingest.reconcile import ReconcileResult, dedupe, mark_reversals, reconcile
from brokedate.ingest.registry import parse_statement

log = logging.getLogger(__name__)


@dataclass
class ImportReport:
    file: str
    adapter: str
    parsed_rows: int
    reconciliation: ReconcileResult
    inserted: int = 0
    duplicates: int = 0
    reversal_pairs: int = 0
    enrich: EnrichStats | None = None
    anchors_detected: list[dict[str, Any]] = field(default_factory=list)
    anchor_sender: str = ""
    date_from: str = ""
    date_to: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class ReconciliationError(RuntimeError):
    def __init__(self, result: ReconcileResult) -> None:
        super().__init__(f"reconciliation failed at row {result.mismatch_row}: expected {result.expected_paise} "
                         f"found {result.found_paise} (paise)")
        self.result = result


def import_statement(path: Path, subject: str, db: DB, cfg: Config, password: str | None = None,
                     adapter: str | None = None, use_gemma: bool | None = None, auto_confirm_anchors: bool = False,
                     ) -> ImportReport:
    stmt = parse_statement(path, subject, password=password, adapter=adapter)
    rec = reconcile(stmt)
    report = ImportReport(path.name, stmt.adapter, len(stmt.txns), rec)
    if not rec.ok:
        raise ReconciliationError(rec)   # hard gate: nothing written
    report.reversal_pairs = mark_reversals(stmt.txns)
    fresh = dedupe(stmt.txns, subject, db.existing_ids(subject))
    report.duplicates = len(stmt.txns) - len(fresh)
    seq0 = db.max_seq(subject) + 1
    rows = []
    for i, t in enumerate(fresh):
        rows.append({
            "id": t.txn_id(subject), "subject": subject, "ts": t.ts.isoformat(), "seq": seq0 + i,
            "amount_paise": int(t.amount_paise), "direction": t.direction, "status": t.status,
            "balance_after_paise": t.balance_after_paise, "raw_narration": t.raw_narration, "ref_no": t.ref_no,
            "is_anchor_income": 0, "source_file": t.source_file, "source_row": t.source_row,
        })
    report.enrich = label_rows(rows, db, cfg, use_gemma=use_gemma)
    for r in rows:
        r.pop("_parsed_kind", None)
    report.inserted = db.insert_txns(rows)
    if db.get_setting(f"{subject}:opening_paise") is None:
        db.set_setting(f"{subject}:opening_paise", rec.opening_paise)

    df = db.load_txns(subject)
    report.date_from, report.date_to = str(df["date"].min()), str(df["date"].max())
    sc = cfg.subject(subject)
    anchors = detect_anchors(df, sc.anchor_mode, sc.anchor_sender_pattern, sc.irregular_min_income_rupees * 100)
    report.anchor_sender = anchors.sender
    report.anchors_detected = [{"id": i, "date": str(d), "amount_paise": a}
                               for i, d, a in zip(anchors.ids, anchors.dates, anchors.amounts_paise, strict=True)]
    db.set_setting(f"{subject}:anchors_detected", report.anchors_detected)
    if auto_confirm_anchors or db.get_setting(f"{subject}:anchors_confirmed") is not None:
        confirm_anchors(db, subject, anchors.ids)
    return report


def confirm_anchors(db: DB, subject: str, ids: list[str]) -> None:
    db.set_setting(f"{subject}:anchors_confirmed", list(ids))
    db.set_anchor_flags(subject, set(ids))
