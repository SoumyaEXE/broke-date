"""Static demo export: SIMULATED data only (SPEC 22.1). Writes web/public/demo/*.json."""

from __future__ import annotations

import json
import shutil
import tempfile
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from brokedate.config import REPO_ROOT, load_config
from brokedate.db import DB

DEMO_DIR = REPO_ROOT / "web" / "public" / "demo"
SIM_STATEMENT = REPO_ROOT / "data" / "sim" / "statement.csv"


def _next_weekday(d: date, wd: int) -> date:
    return d + timedelta(days=(wd - d.weekday()) % 7 or 7)


def demo_plans(as_of: date) -> list[tuple[str, str, int, date, bool]]:
    sat = _next_weekday(as_of, 5)
    return [
        ("movie-sat", "Saturday movie + popcorn", 32000, sat, False),
        ("biryani", "Biryani with the gang", 28000, _next_weekday(as_of, 2), False),
        ("earphones", "New earphones", 89900, sat + timedelta(days=5), False),
    ]


def export_demo(as_of: date, out: Path = DEMO_DIR, letter: bool = True) -> dict[str, Any]:
    from brokedate.forecast import engine as fe
    from brokedate.forecast.build import build_forecast
    from brokedate.ingest.pipeline import import_statement
    from brokedate.narrate.letter import write_letter
    from brokedate.service import load_ledger, load_plans

    cfg = load_config()
    tmp = Path(tempfile.mkdtemp(prefix="bd-demo-"))
    try:
        cfg.data_dir = tmp
        db = DB(tmp / "demo.sqlite")
        rep = import_statement(SIM_STATEMENT, "sim", db, cfg, use_gemma=cfg.gemma.enabled, auto_confirm_anchors=True)
        for pid, name, amt, d, active in demo_plans(as_of):
            db.upsert_plan("sim", pid, name, amt, d.isoformat(), active)
        led = load_ledger(db, cfg, "sim")
        from brokedate.service import load_spread_k

        p = fe.prepare(led, cfg, as_of, k=load_spread_k("sim"))
        bundle = build_forecast(p, load_plans(db, "sim"), "sim", include_lattice=True)
        resp = bundle.response
        resp["demo"] = {"simulated": True, "note": "SIMULATED persona. Not a real person's data.",
                        "categorized": rep.enrich.__dict__ if rep.enrich else None}
        out.mkdir(parents=True, exist_ok=True)
        (out / "forecast.json").write_text(json.dumps(resp), encoding="utf-8")
        letters = {}
        if letter:
            for lang in ("Benglish", "English", "Bengali"):
                letters[lang] = write_letter(bundle, cfg, lang)
            (out / "letters.json").write_text(json.dumps(letters, ensure_ascii=False), encoding="utf-8")
        bt = REPO_ROOT / "out" / "backtest" / "sim" / "summary.json"
        if bt.exists():
            shutil.copy(bt, out / "backtest.json")
        lab = REPO_ROOT / "out" / "labels" / "sim.json"
        if lab.exists():
            shutil.copy(lab, out / "labels.json")
        bench = REPO_ROOT / "out" / "bench.json"
        if bench.exists():
            shutil.copy(bench, out / "bench.json")
        db.close()
        return {"as_of": str(as_of), "n_make_it": resp["n_make_it"], "safe_to_spend_paise": resp["safe_to_spend_paise"],
                "letters": {k: v["fallback_used"] for k, v in letters.items()}, "out": str(out)}
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
