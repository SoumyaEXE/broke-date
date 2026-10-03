from __future__ import annotations

import copy
import csv
import random
import subprocess
import sys

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from brokedate.config import REPO_ROOT
from brokedate.ingest.base import ParsedStatement
from brokedate.ingest.csv_generic import GenericCsvAdapter
from brokedate.ingest.pipeline import ReconciliationError, import_statement
from brokedate.ingest.reconcile import dedupe, mark_reversals, reconcile
from tests.conftest import SIM_STATEMENT


def _parse():
    return GenericCsvAdapter().parse(SIM_STATEMENT, "sim")


def test_sniff_and_parse_sim():
    a = GenericCsvAdapter()
    assert a.sniff(SIM_STATEMENT) >= 0.6
    s = _parse()
    assert s.opening_balance_paise == 64000
    assert len(s.txns) == 569
    assert all(isinstance(t.ref_no, str) and len(t.ref_no) == 12 for t in s.txns)


def test_reconciles_to_the_paisa():
    r = reconcile(_parse())
    assert r.ok and r.n_with_balance == 569
    assert r.closing_paise == 174200


def test_single_mutation_fails():
    s = _parse()
    rng = random.Random(1)
    for _ in range(20):
        m = copy.deepcopy(s)
        i = rng.randrange(len(m.txns))
        m.txns[i].amount_paise += rng.choice([1, 100, -1]) if m.txns[i].amount_paise > 1 else 1
        r = reconcile(m)
        assert not r.ok and r.mismatch_index == i


@settings(max_examples=15, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(seed=st.integers(min_value=1, max_value=10_000))
def test_simulator_always_reconciles(seed, tmp_path_factory):
    out = tmp_path_factory.mktemp(f"s{seed}")
    subprocess.run([sys.executable, str(REPO_ROOT / "scripts" / "simulate_statement.py"), "--seed", str(seed),
                    "--out", str(out)], check=True, capture_output=True)
    s = GenericCsvAdapter().parse(out / "statement.csv", "sim")
    assert reconcile(s).ok


def test_reversal_pairing_and_dedupe():
    s = _parse()
    pairs = mark_reversals(s.txns)
    assert pairs == 3
    assert sum(t.status == "REVERSED" for t in s.txns) == 6
    ids = {t.txn_id("sim") for t in s.txns[:100]}
    assert len(dedupe(s.txns, "sim", ids)) == len(s.txns) - 100


def test_import_and_anchors(cfg, db):
    rep = import_statement(SIM_STATEMENT, "sim", db, cfg, use_gemma=False, auto_confirm_anchors=True)
    assert rep.reconciliation.ok and rep.inserted == 569
    monthly = sum(1 for r in csv.DictReader(SIM_STATEMENT.open(encoding="utf-8")) if r["Narration"].endswith("-Monthly"))
    assert len(rep.anchors_detected) == monthly == 12
    assert rep.anchor_sender == "SANCHITA DAS"
    rep2 = import_statement(SIM_STATEMENT, "sim", db, cfg, use_gemma=False)
    assert rep2.inserted == 0 and rep2.duplicates == 569


def test_failed_reconciliation_writes_nothing(cfg, db, tmp_path):
    rows = SIM_STATEMENT.read_text(encoding="utf-8").splitlines()
    rows[10] = rows[10].replace(",33.00,", ",34.00,") if ",33.00," in rows[10] else rows[10]
    parts = rows[10].split(",")
    parts[4] = f"{float(parts[4] or 0) + 1:.2f}" if parts[4] else parts[4]
    parts[5] = f"{float(parts[5]) + 1:.2f}" if parts[5] and not parts[4] else parts[5]
    rows[10] = ",".join(parts)
    bad = tmp_path / "bad.csv"
    bad.write_text("\n".join(rows), encoding="utf-8")
    with pytest.raises(ReconciliationError):
        import_statement(bad, "x", db, cfg, use_gemma=False)
    assert db.load_txns("x").empty


def test_irregular_mode(cfg, db):
    from brokedate.ingest.cycles import detect_anchors

    import_statement(SIM_STATEMENT, "sim", db, cfg, use_gemma=False)
    df = db.load_txns("sim")
    a = detect_anchors(df, "irregular", irregular_min_paise=150000)
    assert len(a.dates) >= 12
    assert all(x >= 150000 for x in a.amounts_paise)


def test_parsed_statement_type():
    assert isinstance(_parse(), ParsedStatement)


def test_late_allowance_is_expected_tomorrow_not_next_month() -> None:
    from datetime import date

    from brokedate.ingest.cycles import Anchors, next_anchor_date

    months = [date(2026, m, 2) for m in range(4, 10)]  # arrives on the 2nd every month
    a = Anchors([str(i) for i in range(len(months))], months, [300000] * len(months), "PARENT", "allowance")
    assert next_anchor_date(a, date(2026, 9, 20)) == (date(2026, 10, 2), True)  # normal: next month, scheduled
    assert next_anchor_date(a, date(2026, 10, 3)) == (date(2026, 10, 4), False)  # late by a day: expect tomorrow
    assert next_anchor_date(a, date(2026, 10, 15)) == (date(2026, 11, 2), True)  # far past due: next month
