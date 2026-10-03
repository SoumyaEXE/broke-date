from __future__ import annotations

import os
from pathlib import Path

import pytest

from brokedate.config import REPO_ROOT, load_config
from brokedate.db import DB

SIM_DIR = REPO_ROOT / "data" / "sim"
SIM_STATEMENT = SIM_DIR / "statement.csv"
SIM_TRUTH = SIM_DIR / "truth.csv"

os.environ.setdefault("BROKEDATE_GEMMA", "0")
os.environ.setdefault("BROKEDATE_TABPFN_CAT", "0")  # unit tests use stub classifiers; real TabPFN runs in -m slow


@pytest.fixture
def cfg(tmp_path):
    c = load_config()
    c.data_dir = tmp_path
    c.gemma.enabled = False
    return c


@pytest.fixture
def db(tmp_path):
    d = DB(tmp_path / "t.sqlite")
    yield d
    d.close()


@pytest.fixture(scope="session")
def sim_ledger(tmp_path_factory):
    """Imported + ledger-built simulated subject, shared across tests."""
    from brokedate.ingest.pipeline import import_statement
    from brokedate.service import load_ledger

    tmp = tmp_path_factory.mktemp("sim")
    c = load_config()
    c.data_dir = tmp
    c.gemma.enabled = False
    d = DB(tmp / "sim.sqlite")
    import_statement(SIM_STATEMENT, "sim", d, c, use_gemma=False, auto_confirm_anchors=True)
    led = load_ledger(d, c, "sim")
    return c, d, led


def sim_path() -> Path:
    return SIM_STATEMENT
