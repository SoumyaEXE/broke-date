"""`brokedate` CLI."""

from __future__ import annotations

import json
import logging
import sys
from datetime import date, datetime
from pathlib import Path

import typer

from brokedate.config import REPO_ROOT, Config, load_config
from brokedate.db import DB
from brokedate.money import format_inr

app = typer.Typer(add_completion=False, no_args_is_help=True, help="Broke Date: will you make it to payday?")
plan_app = typer.Typer(help="Planned purchases")
app.add_typer(plan_app, name="plan")

OUT = REPO_ROOT / "out"


def out_dir(subject: str) -> Path:
    """Simulated subject writes to out/ (publishable); real subjects to out/real/ (gitignored)."""
    return OUT if subject == "sim" else OUT / "real"


def _ctx() -> tuple[Config, DB]:
    cfg = load_config()
    cfg.data_dir.mkdir(parents=True, exist_ok=True)
    return cfg, DB(cfg.db_path)


def _setup_logging(verbose: bool) -> None:
    logging.basicConfig(level=logging.DEBUG if verbose else logging.INFO, format="%(levelname)s %(message)s")
    for noisy in ("httpx", "httpcore", "matplotlib", "urllib3", "filelock", "huggingface_hub"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def _say(msg: str) -> None:
    sys.stdout.buffer.write((msg + "\n").encode("utf-8"))
    sys.stdout.flush()


@app.callback()
def main(verbose: bool = typer.Option(False, "--verbose", "-v")) -> None:
    _setup_logging(verbose)


@app.command("import")
def import_cmd(path: Path, subject: str = typer.Option(..., "--subject", "-s"),
               password: str = typer.Option(None, help="PDF password, if any"),
               adapter: str = typer.Option(None), gemma: bool = typer.Option(True, "--gemma/--no-gemma"),
               confirm_anchors: bool = typer.Option(False, "--confirm-anchors",
                                                    help="accept detected allowance credits without review")) -> None:
    """Import a bank statement: parse, reconcile (hard gate), categorize, store locally."""
    from brokedate.ingest.pipeline import ReconciliationError, import_statement

    cfg, db = _ctx()
    try:
        rep = import_statement(path, subject, db, cfg, password=password, adapter=adapter, use_gemma=gemma,
                               auto_confirm_anchors=confirm_anchors or subject == "sim")
    except ReconciliationError as e:
        r = e.result
        _say(f"RECONCILIATION FAILED at file row {r.mismatch_row} (txn #{r.mismatch_index}): expected balance "
             f"{format_inr(r.expected_paise or 0)}, statement says {format_inr(r.found_paise or 0)}. Nothing written.")
        raise typer.Exit(2) from e
    rc = rep.reconciliation
    _say(f"parsed {rep.parsed_rows} rows with {rep.adapter}; reconciled OK to the paisa "
         f"({rc.n_with_balance} balances checked, opening {format_inr(rc.opening_paise or 0)}, closing "
         f"{format_inr(rc.closing_paise or 0)})")
    _say(f"inserted {rep.inserted}, duplicates skipped {rep.duplicates}, reversal pairs {rep.reversal_pairs}")
    en = rep.enrich
    if en:
        _say(f"categorized: rules {en.by_rules}, cache {en.by_cache}, gemma {en.by_gemma}, needs review "
             f"{en.needs_review}" + (f"  (gemma unavailable: {en.gemma_error})" if en.gemma_error else ""))
    _say(f"history {rep.date_from} -> {rep.date_to}; allowance sender '{rep.anchor_sender}', "
         f"{len(rep.anchors_detected)} anchor credits detected"
         + ("" if confirm_anchors or subject == "sim" else " (confirm with `brokedate anchors --confirm`)"))


@app.command()
def inspect(path: Path, password: str = typer.Option(None)) -> None:
    """Show the statement's table structure with every digit masked (safe to share while adapting a parser)."""
    from brokedate.ingest.pdf_bank import inspect_file

    _say(inspect_file(path, password))


@app.command()
def anchors(subject: str = typer.Option(..., "--subject", "-s"), confirm: bool = False) -> None:
    """List detected allowance (anchor) credits; --confirm accepts them."""
    from brokedate.ingest.pipeline import confirm_anchors

    _, db = _ctx()
    det = db.get_setting(f"{subject}:anchors_detected", [])
    for a in det:
        _say(f"  {a['date']}  {format_inr(a['amount_paise'])}")
    if confirm:
        confirm_anchors(db, subject, [a["id"] for a in det])
        _say(f"confirmed {len(det)} anchors")


@app.command()
def review(subject: str = typer.Option(..., "--subject", "-s"), limit: int = 30) -> None:
    """CLI review fallback: label uncategorized / low-confidence rows interactively."""
    from brokedate.enrich.rules import CATEGORIES

    cfg, db = _ctx()
    df = db.load_txns(subject)
    todo = df[(df["label_source"] == "unlabelled") | (df["confidence"].fillna(0) < cfg.gemma.confidence_threshold)]
    _say(f"{len(todo)} rows need review. Categories: {', '.join(CATEGORIES)}")
    for _, r in todo.head(limit).iterrows():
        _say(f"\n{r['date']}  {r['direction']}  {format_inr(int(r['amount_paise']))}  {r['raw_narration'][:90]}")
        _say(f"  current: {r['category']} ({r['label_source']}, {r['confidence']})")
        cat = typer.prompt("  category (enter to keep)", default=r["category"] or "other")
        if cat in CATEGORIES:
            db.update_labels(r["id"], r["merchant"], cat, r["counterparty"], "user", 1.0)


@app.command("eval-labels")
def eval_labels(labels: Path = typer.Argument(None), subject: str = typer.Option("sim", "--subject", "-s"),
                gemma: bool = typer.Option(True, "--gemma/--no-gemma")) -> None:
    """Categorization accuracy: vs data/sim/truth.csv (sim) or a hand-labelled CSV (real, local only)."""
    from brokedate.enrich.eval_labels import evaluate

    cfg, db = _ctx()
    from brokedate.enrich.eval_labels import compare_labellers

    res = evaluate(db, cfg, subject, labels, use_gemma=gemma)
    res["compare"] = compare_labellers(db, cfg, subject, labels, gemma=gemma)["variants"]
    _say(json.dumps({k: v for k, v in res.items() if k != "confusion"}, indent=2))
    dest = out_dir(subject) / "labels" / f"{subject}.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(res, indent=2), encoding="utf-8")
    _say(f"wrote {dest}")


@app.command()
def forecast(subject: str = typer.Option(..., "--subject", "-s"), as_of: str = typer.Option(None),
             n: int = typer.Option(None), seed: int = typer.Option(None),
             model: str = typer.Option("tabpfn"), out: Path = typer.Option(None)) -> None:
    """Run a forecast and print a human summary; writes JSON."""
    from brokedate.forecast.build import build_forecast
    from brokedate.service import load_ledger, load_plans, load_spread_k

    cfg, db = _ctx()
    led = load_ledger(db, cfg, subject)
    d = date.fromisoformat(as_of) if as_of else min(date.today(), led.last_day + __import__("datetime").timedelta(1))
    from brokedate.forecast import engine as fe

    p = fe.prepare(led, cfg, d, seed=seed, n=n, model=model, k=load_spread_k(subject))
    bundle = build_forecast(p, load_plans(db, subject), subject)
    r = bundle.response
    _say(f"as of {r['as_of']}: balance {format_inr(r['balance_now_paise'])}, allowance on {r['next_anchor_date']} "
         f"({r['horizon_days']} days)")
    if r["nothing_safe"]:
        _say(f"Nothing is safe to spend today: {round(r['risk_now'] * 100)}% chance of going broke already.")
    else:
        _say(f"{format_inr(r['safe_to_spend_paise'])} safe to spend today")
    _say(f"{r['n_make_it']} of {r['n_futures']} futures make it to payday")
    if r["broke_day"]:
        _say(f"if broke, most likely around {r['broke_day']['median']} (80%: {r['broke_day']['lo80']} to "
             f"{r['broke_day']['hi80']})")
    for pl in r["plans"]:
        _say(f"  plan {pl['name']} {format_inr(pl['amount_paise'])} on {pl['date']}: {pl['day_cost']} days")
    for rc in r["recent"][:5]:
        _say(f"  recent {rc['merchant']} {format_inr(rc['amount_paise'])}: +{rc['days_regained']} days if skipped")
    if r["similar_month"]:
        _say(f"this month looks like {r['similar_month']['label']}")
    _say(f"timings: {r['model']['timings_s']}")
    dest = out or out_dir(subject) / "forecast" / f"{subject}.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(r), encoding="utf-8")
    _say(f"wrote {dest}")


@plan_app.command("add")
def plan_add(name: str, amount_rupees: float, on: str, subject: str = typer.Option(..., "--subject", "-s")) -> None:
    import re

    _, db = _ctx()
    pid = re.sub(r"[^a-z0-9]+", "-", f"{name}-{on}".lower()).strip("-")
    db.upsert_plan(subject, pid, name, int(round(amount_rupees * 100)), on, True)
    _say(f"added plan {pid}")


@plan_app.command("list")
def plan_list(subject: str = typer.Option(..., "--subject", "-s")) -> None:
    _, db = _ctx()
    for p in db.plans(subject):
        _say(f"{p['id']}: {p['name']} {format_inr(p['amount_paise'])} on {p['date']} active={bool(p['active'])}")


@plan_app.command("toggle")
def plan_toggle(plan_id: str, active: bool = typer.Option(..., "--on/--off")) -> None:
    _, db = _ctx()
    db.set_plan_active(plan_id, active)


@app.command("plot-balance")
def plot_balance(subject: str = typer.Option(..., "--subject", "-s")) -> None:
    """Plot the balance history locally (out/real/ for real subjects; never committed)."""
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    from brokedate.service import load_ledger

    cfg, db = _ctx()
    led = load_ledger(db, cfg, subject)
    d = led.daily
    fig, ax = plt.subplots(figsize=(11, 4))
    ax.plot(d["date"], d["bal_end_paise"] / 100, lw=1.2, color="#14110f", label="end of day")
    ax.plot(d["date"], d["bal_min_paise"] / 100, lw=0.6, color="#d9480f", alpha=0.7, label="lowest in day")
    ax.axhline(cfg.forecast.broke_line_rupees, ls="--", color="#d9480f", lw=1)
    for a in led.anchors.dates:
        ax.axvline(a, color="#0f766e", lw=0.6, alpha=0.5)  # type: ignore[arg-type]
    ax.set_ylabel("balance (rupees)")
    ax.legend(loc="upper right")
    ax.set_title(f"{subject}: balance, allowance days (green), broke line (dashed)")
    dest = out_dir(subject) / "balance" / f"{subject}.png"
    dest.parent.mkdir(parents=True, exist_ok=True)
    fig.tight_layout()
    fig.savefig(dest, dpi=130)
    cycles = list(zip(led.anchors.dates, led.anchors.dates[1:], strict=False))
    broke = 0
    for a, b in cycles:
        r0, r1 = led.row_of(a), led.row_of(b)
        broke += int((d["bal_min_paise"].iloc[r0:r1] < cfg.broke_line_paise).any())
    _say(f"wrote {dest}; {broke} of {len(cycles)} full cycles dipped below the broke line")


@app.command()
def backtest(subject: str = typer.Option(..., "--subject", "-s"), limit: int = typer.Option(None),
             stride: int = typer.Option(None), n: int = typer.Option(None), reps: int = typer.Option(None)) -> None:
    """Run the pre-registered walk-forward evaluation (checkpointed, resumable)."""
    from brokedate.eval.backtest import run_backtest
    from brokedate.eval.prereg import frozen_params
    from brokedate.service import load_ledger

    cfg, db = _ctx()
    pr = frozen_params()
    led = load_ledger(db, cfg, subject)
    dest = out_dir(subject) / "backtest" / subject

    def prog(o, r, k, total):
        _say(f"[{datetime.now():%H:%M:%S}] {k}/{total} origin {o.day} H={r['H']} y={r['y']} "
             f"M1 p={r['models']['M1']['p']:.2f} B3 p={r['models']['B3']['p']:.2f} "
             f"({r['timing']['tabpfn_prepare']:.0f}s)")

    summ = run_backtest(led, cfg, dest, stride or pr["stride"], n or pr["n_futures_eval"], pr["base_seed"],
                        reps or pr["bootstrap_reps"], pr["min_history_days"], limit, prog)
    _say(json.dumps({m: {k: (v["point"] if isinstance(v, dict) and "point" in v else None)
                         for k, v in s.items() if k != "lead_time"} for m, s in summ["models"].items()}, indent=1))
    _say(f"wrote {dest / 'summary.json'}")


@app.command()
def letter(subject: str = typer.Option(..., "--subject", "-s"), language: str = typer.Option(None),
           as_of: str = typer.Option(None)) -> None:
    """Write this week's letter from a future that went broke (Gemma; numbers only via the facts ledger)."""
    from brokedate.service import forecast_for

    cfg, db = _ctx()
    from brokedate.narrate.letter import write_letter

    bundle = forecast_for(db, cfg, subject, date.fromisoformat(as_of) if as_of else None)
    res = write_letter(bundle, cfg, language or cfg.gemma.letter_language)
    _say(res["text_rendered"])
    _say(f"\n[attempts={res['attempts']} fallback={res['fallback_used']}]")


@app.command()
def serve(host: str = "127.0.0.1", port: int = 8787) -> None:
    """Run the local API (binds to 127.0.0.1 only)."""
    import uvicorn

    if host not in ("127.0.0.1", "localhost", "::1"):
        raise typer.BadParameter("Broke Date only binds to localhost")
    uvicorn.run("brokedate.api.server:app", host=host, port=port, log_level="info")


@app.command("export-demo")
def export_demo(as_of: str = typer.Option("2026-09-12")) -> None:
    """Precompute the static demo JSON from SIMULATED data only."""
    from brokedate.export.demo import export_demo as run

    _say(str(run(date.fromisoformat(as_of))))


@app.command("export-pocket")
def export_pocket(subject: str = typer.Option("sim", "--subject", "-s"), as_of: str = typer.Option(None)) -> None:
    """Single-file offline phone view."""
    from brokedate.export.pocket import export_pocket as run

    _say(str(run(subject, date.fromisoformat(as_of) if as_of else None)))


@app.command()
def bench(subject: str = typer.Option("sim", "--subject", "-s"), as_of: str = typer.Option("2026-09-12"),
          label: str = typer.Option("this-laptop")) -> None:
    """Measure fit / lattice / full forecast time and peak RAM on this machine -> out/bench.json."""
    from brokedate.bench.harness import run_bench

    _say(json.dumps(run_bench(subject, date.fromisoformat(as_of), label), indent=2))


@app.command("post-numbers")
def post_numbers() -> None:
    """Print every number the post needs, read from out/ artifacts (never typed by hand)."""
    from brokedate.export.post_numbers import collect

    _say(json.dumps(collect(), indent=2, ensure_ascii=False))


@app.command("delete-data")
def delete_data(yes: bool = typer.Option(False, "--yes")) -> None:
    """Delete the local database and real-data outputs."""
    import shutil

    cfg = load_config()
    if not yes:
        typer.confirm(f"Delete {cfg.data_dir} and {OUT / 'real'}?", abort=True)
    for p in (cfg.data_dir, OUT / "real"):
        if p.exists():
            shutil.rmtree(p)
    _say("deleted")


if __name__ == "__main__":
    app()
