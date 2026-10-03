import importlib.util
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "block_private", Path(__file__).resolve().parents[2] / "scripts" / "hooks" / "block_private.py"
)
assert _spec and _spec.loader
bp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bp)


def test_blocks_private_dirs():
    assert bp.problems_for("data/real/statement.csv", b"x")
    assert bp.problems_for("out/real/balance.png", None)
    assert bp.problems_for("brokedate-private/db.json", b"{}")


def test_blocks_file_types():
    for name in ["docs/stmt.pdf", "a.SQLITE", "x/y.xlsx", "z.xls", "ledger.db"]:
        assert bp.problems_for(name, b""), name


def test_blocks_account_numbers():
    assert bp.problems_for("notes.md", b"Account No: 50100123456789\n")
    assert bp.problems_for("notes.md", b"A/C XXXXXXXX6789 credited\n")
    assert bp.problems_for("notes.md", b"acct 1234 5678 9012\n")


def test_allows_normal_content():
    assert not bp.problems_for("engine/x.py", b"amount_paise = 1500000000\n")
    assert not bp.problems_for("data/sim/statement.csv", b"UPI-SWIGGY-swiggy@hdfc-HDFC0MERUPI-601665004060-Payment\n")
    assert not bp.problems_for("docs/a.md", b"account for the balance carefully, 150 rupees\n")


def test_allow_marker():
    text = b"# brokedate:allow-account-pattern\nAccount No: 50100123456789\n"
    assert not bp.problems_for("tests/fixture.txt", text)


def test_main_on_paths(tmp_path):
    good = tmp_path / "ok.txt"
    good.write_text("hello")
    bad = tmp_path / "s.pdf"
    bad.write_bytes(b"%PDF")
    assert bp.main([str(good)]) == 0
    assert bp.main([str(bad)]) == 1
