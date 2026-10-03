"""Time machine + calibration are a regrouping of the backtest's own records: no new numbers."""

from __future__ import annotations

from datetime import date

import numpy as np
import pytest

from brokedate.config import REPO_ROOT
from brokedate.eval.metrics import lead_times
from brokedate.eval.replay import build_replay, calibration, load_origins, months


def _o(day: str, cycle: int, p: float, y: int, broke: str | None, payday: str) -> dict:
    d = date.fromisoformat(day)
    return {"origin": day, "origin_ord": d.toordinal(), "cycle": cycle, "window_end": payday, "y": y,
            "cycle_broke_day_ord": date.fromisoformat(broke).toordinal() if broke else None,
            "models": {"M1": {"p": p}, "B3": {"p": p / 2}, "B1": {"p": 0.5}}}


ORIGINS = [
    _o("2026-03-02", 1, 0.10, 1, "2026-03-20", "2026-04-01"),
    _o("2026-03-08", 1, 0.55, 1, "2026-03-20", "2026-04-01"),   # first warning: 12 days before running out
    _o("2026-03-14", 1, 0.90, 1, "2026-03-20", "2026-04-01"),
    _o("2026-04-03", 2, 0.05, 0, None, "2026-05-01"),
    _o("2026-04-15", 2, 0.60, 0, None, "2026-05-01"),           # warned, but made it: a false alarm
]


def test_months_warning_and_notice():
    m = months(ORIGINS)
    assert [x["cycle"] for x in m] == [1, 2]
    assert m[0]["first_warning"] == "2026-03-08" and m[0]["lead_days"] == 12 and m[0]["broke_day"] == "2026-03-20"
    assert m[1]["went_broke"] is False and m[1]["false_alarm"] is True and m[1]["lead_days"] is None
    assert m[0]["days"][1] == {"date": "2026-03-08", "p": 0.55, "p_B3": 0.275, "p_B1": 0.5}


def test_calibration_bins_count_every_day_once():
    c = calibration(ORIGINS, "M1")
    assert sum(b["n"] for b in c) == len(ORIGINS)
    top = next(b for b in c if b["lo"] == 0.8)
    assert top["n"] == 1 and top["observed"] == 1.0


def test_replay_matches_the_published_lead_times_on_the_real_sim_backtest():
    f = REPO_ROOT / "out" / "backtest" / "sim" / "per_origin.jsonl"
    if not f.is_file():
        pytest.skip("sim backtest not run on this machine")
    origins = load_origins(f)
    rep = build_replay(origins)
    flat = [{**o, "p": o["models"]["M1"]["p"]} for o in origins]
    lt = lead_times(flat, 0.5)
    leads = [m["lead_days"] for m in rep["months"] if m["went_broke"]]
    assert sorted(leads) == sorted(lt["lead_days"]) and np.isclose(np.mean(leads), lt["mean_lead"])
    assert sum(b["n"] for b in rep["calibration"]["M1"]) == len(origins)


def test_share_card_is_relative_only_and_matches_the_backtest():
    import json
    import re

    from brokedate.export.share_card import share_card, to_markdown

    base = REPO_ROOT / "out" / "backtest" / "sim"
    if not (base / "per_origin.jsonl").is_file():
        pytest.skip("sim backtest not run on this machine")
    card = share_card(json.loads((base / "summary.json").read_text(encoding="utf-8")), load_origins(base / "per_origin.jsonl"))
    assert card["months_ran_out"] == card["warned_ahead"] + card["warned_only_on_the_day"] + card["never_warned"]
    assert card["months_ran_out"] == json.loads((base / "summary.json").read_text())["models"]["M1"]["lead_time"]["n_broke_cycles"]
    md = to_markdown(card, "Subarna")
    assert "₹" not in md and not re.search(r"\d{4}-\d{2}-\d{2}", md) and "Rs" not in md
