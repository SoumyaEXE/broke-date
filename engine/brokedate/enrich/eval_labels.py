"""Categorization accuracy (SPEC 7.4). Sim: vs data/sim/truth.csv. Real: vs a local hand-labelled CSV with
columns ref (or narration), category. Numbers are computed, never typed."""

from __future__ import annotations

import csv
from collections import Counter
from pathlib import Path
from typing import Any

from brokedate.config import REPO_ROOT, Config
from brokedate.db import DB
from brokedate.enrich.pipeline import label_rows


def evaluate(db: DB, cfg: Config, subject: str, labels: Path | None, use_gemma: bool = True) -> dict[str, Any]:
    df = db.load_txns(subject)
    if df.empty:
        raise ValueError(f"no transactions for {subject}")
    if labels is None:
        if subject != "sim":
            raise ValueError("real subjects need a hand-labelled CSV path")
        labels = REPO_ROOT / "data" / "sim" / "truth.csv"
    truth: dict[str, str] = {}
    with labels.open(encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            key = r.get("ref") or r.get("narration") or ""
            truth[key.strip()] = r["category"].strip()
    rows = []
    for _, r in df.iterrows():
        key = (r["ref_no"] or "") if (r["ref_no"] or "") in truth else r["raw_narration"]
        if key in truth:
            rows.append({"id": r["id"], "raw_narration": r["raw_narration"], "direction": r["direction"],
                         "amount_paise": int(r["amount_paise"]), "_truth": truth[key],
                         "_anchor": bool(r["is_anchor_income"])})
    # fresh labelling pass (no cache: measure the pipeline, not earlier corrections)
    tmp_db = DB(":memory:")
    try:
        st = label_rows(rows, tmp_db, cfg, use_gemma=use_gemma)
    finally:
        tmp_db.close()
    for r in rows:   # anchor detection, not the text labeller, decides 'allowance'
        if r["_anchor"]:
            r["category"] = "allowance"
    def acc(sel: list[dict]) -> float | None:
        return round(sum(r["category"] == r["_truth"] for r in sel) / len(sel), 4) if sel else None

    by_src: dict[str, list[dict]] = {}
    for r in rows:
        by_src.setdefault(r.get("label_source") or "?", []).append(r)
    confusion = Counter((r["_truth"], r["category"]) for r in rows if r["category"] != r["_truth"])
    return {
        "subject": subject, "n_rows": len(rows), "gemma_used": use_gemma and cfg.gemma.enabled,
        "gemma_model": cfg.gemma.model if use_gemma and cfg.gemma.enabled else None,
        "gemma_error": st.gemma_error,
        "rules_coverage": round(st.by_rules / len(rows), 4) if rows else None,
        "accuracy_overall": acc(rows),
        "accuracy_by_source": {k: {"n": len(v), "accuracy": acc(v)} for k, v in by_src.items()},
        "needs_review": st.needs_review,
        "confusion_top": [{"truth": t, "predicted": p, "n": n} for (t, p), n in confusion.most_common(15)],
        "note": "simulated narrations vs simulator ground truth" if subject == "sim" else "hand-labelled real rows",
    }
