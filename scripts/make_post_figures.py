"""Figures for docs/submission/POST_DRAFT.md, drawn only from files the engine wrote (no typed numbers).

    uv --project engine run --no-sync python scripts/make_post_figures.py

Look: editorial. Warm paper surface, a serif headline (Source Serif 4), Inter for everything else, a small
letter-spaced section label, hairline rules. Fonts are read from $BROKEDATE_FONTS or D:/devtools/fonts (both OFL);
without them it falls back to Georgia / Segoe UI.

Palette (validated with the dataviz skill's validate_palette.js on this surface): green = Broke Date / TabPFN,
terracotta = "ran out", warm gray = baselines (always direct-labelled). Labels are ink, never the series colour.
Every figure states its source file and which synthetic data it shows.
"""

from __future__ import annotations

import csv
import json
import os
from datetime import date, datetime, timedelta
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.dates as mdates  # noqa: E402
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from matplotlib import font_manager  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "images"
DEMO = ROOT / "web" / "public" / "demo"
SYN = ROOT / "data" / "subarna_syn"

SURFACE, INK, INK2, MUTED, GRID = "#f7f5f0", "#1f1e1c", "#4a4843", "#85827a", "#e2dfd6"
ACCENT, ACCENT_SOFT, TERRA, TERRA_SOFT, NEUTRAL = "#23805f", "#cfe3d9", "#a8491f", "#efd9cc", "#8f8c84"

FONTS = Path(os.environ.get("BROKEDATE_FONTS", "D:/devtools/fonts"))
for _f in sorted(FONTS.glob("*.ttf")) if FONTS.is_dir() else []:
    font_manager.fontManager.addfont(str(_f))
_have = {f.name for f in font_manager.fontManager.ttflist}
SANS = "Inter" if "Inter" in _have else "Segoe UI"
SERIF = "Source Serif 4" if "Source Serif 4" in _have else "Georgia"

plt.rcParams.update({
    "font.family": [SANS, "DejaVu Sans"], "font.size": 11, "axes.edgecolor": GRID, "axes.labelcolor": INK2,
    "xtick.color": MUTED, "ytick.color": INK2, "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.8,
    "axes.spines.top": False, "axes.spines.right": False, "axes.spines.left": False, "figure.facecolor": SURFACE,
    "axes.facecolor": SURFACE, "savefig.facecolor": SURFACE, "xtick.major.size": 0, "ytick.major.size": 0,
    "axes.labelsize": 10.5, "axes.titlesize": 10.5, "axes.titleweight": "medium",
})

SIM = "Simulated student"
SYNTH = "Synthetic statement"


def load(p: Path) -> dict:
    return json.loads(p.read_text(encoding="utf-8"))


def spaced(text: str) -> str:
    """Letter-spaced small caps, the way a section label is set (matplotlib has no tracking: hair spaces)."""
    return "\u200a".join(text.upper())


def frame(fig: plt.Figure, kicker: str, title: str, sub: str, source: str, who: str = SIM) -> None:
    """Header and footer, placed in inches so tall and short figures look the same."""
    h, left = fig.get_figheight(), 0.035

    def y(inches: float) -> float:
        return 1 - inches / h

    fig.text(left, y(0.30), spaced(kicker), fontsize=8.5, color=TERRA, va="top", fontweight="medium")
    fig.text(left, y(0.52), title, fontsize=21, color=INK, va="top", family=SERIF)
    fig.text(left, y(0.98), sub, fontsize=11, color=INK2, va="top")
    fig.add_artist(plt.Line2D([left, 1 - left], [0.42 / h, 0.42 / h], color=GRID, lw=0.9))
    fig.text(left, 0.17 / h, f"{who}  ·  source: {source}", fontsize=8.5, color=MUTED)


def save(fig: plt.Figure, name: str) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    fig.savefig(OUT / name, dpi=200)
    plt.close(fig)
    print("wrote", OUT / name)


def rupees(paise: float) -> str:
    return f"₹{paise / 100:,.0f}"


def label(ax: plt.Axes, text: str, xy: tuple, offset: tuple, *, strong: bool = False, **kw: object) -> None:
    ax.annotate(text, xy, xytext=offset, textcoords="offset points", color=INK if strong else INK2,
                fontsize=10.5 if strong else 10, fontweight="semibold" if strong else "normal", **kw)


def fig_futures() -> None:
    f = load(DEMO / "forecast.json")
    days = [date.fromisoformat(d) for d in f["paths"]["days"]]
    P = np.asarray(f["paths"]["balances_paise"], dtype=float) / 100
    line = f["broke_line_paise"] / 100
    broke = np.less(P, line).any(axis=1)
    fig = plt.figure(figsize=(10, 5.8))
    ax = fig.add_axes((0.08, 0.15, 0.86, 0.60))
    for row in P[~broke][::5]:
        ax.plot(days, row, color=ACCENT, alpha=0.08, lw=1)
    for row in P[broke]:
        ax.plot(days, row, color=TERRA, alpha=0.85, lw=1.3)
    b = f["band"]
    ax.fill_between(days, np.asarray(b["p10"]) / 100, np.asarray(b["p90"]) / 100, color=ACCENT_SOFT, alpha=0.6, lw=0)
    ax.plot(days, np.asarray(b["p50"]) / 100, color=ACCENT, lw=2.6)
    ax.axhline(line, color=INK2, lw=1, ls=(0, (4, 3)))
    ax.text(days[0], line, f"  broke line {rupees(f['broke_line_paise'])}", color=INK2, fontsize=9.5, va="bottom")
    label(ax, "typical future", (days[len(days) // 2], b["p50"][len(days) // 2] / 100), (12, 18), strong=True)
    n_broke, n = int(broke.sum()), len(P)
    ax.text(days[1], P.max() * 0.97, f"{n_broke} of {n} futures run out before payday (the terracotta lines)", color=INK,
            fontsize=11, fontweight="semibold", va="top")
    ax.set_ylim(bottom=0)
    ax.yaxis.set_major_formatter(lambda v, _: f"₹{v:,.0f}")
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%d %b"))
    frame(fig, "The forecast", "500 futures until payday", f"Balance from {days[0]:%d %b} to payday "
          f"({date.fromisoformat(f['next_anchor_date']):%d %b}). Each line is one future played out from TabPFN's spend forecast",
          "web/public/demo/forecast.json")
    save(fig, "fig1_futures.png")



def fig_calibration() -> None:
    r = load(DEMO / "replay.json")
    c = r["calibration"]["M1"]
    x = [b["mean_p"] * 100 for b in c]
    y = [b["observed"] * 100 for b in c]
    n = [b["n"] for b in c]
    fig = plt.figure(figsize=(7.4, 7.0))
    ax = fig.add_axes((0.12, 0.14, 0.82, 0.64))
    ax.plot([0, 100], [0, 100], color=NEUTRAL, lw=1.3, ls=(0, (5, 4)))
    ax.text(40, 33, "perfectly honest", color=MUTED, fontsize=9.5, rotation=40)
    ax.plot(x, y, color=ACCENT, lw=1.6, alpha=0.6)
    ax.scatter(x, y, s=[v * 9 for v in n], color=ACCENT, edgecolor=SURFACE, linewidth=2, zorder=3)
    for xi, yi, ni in zip(x, y, n, strict=True):
        right = xi > 80
        ax.annotate(f"said {xi:.0f}% → {yi:.0f}%  ({ni} days)", (xi, yi), xytext=(-12, -16) if right else (12, -4),
                    textcoords="offset points", fontsize=9, color=INK2, ha="right" if right else "left",
                    bbox={"boxstyle": "round,pad=0.2", "fc": SURFACE, "ec": "none"}, zorder=4)
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 100)
    ax.set_xlabel("Broke Date said")
    ax.set_ylabel("it actually happened")
    for a in (ax.xaxis, ax.yaxis):
        a.set_major_formatter(lambda v, _: f"{v:.0f}%")
    frame(fig, "Calibration", "Does it mean what it says?", f"All {r['n_days']} backtest days, grouped by the chance it gave",
          "web/public/demo/replay.json")
    save(fig, "fig3_calibration.png")


NAMES = {"M1": "Broke Date (TabPFN simulation)", "M1b": "…without calibration", "M1a": "…without anchoring",
         "B3": "LightGBM, same simulator", "B2": "Copy last month", "B1": "Spending pace (last 14 days)"}


def fig_brier() -> None:
    s = load(ROOT / "out" / "backtest" / "sim" / "summary.json")
    rows = sorted(s["models"].items(), key=lambda kv: kv[1]["brier"]["point"])
    fig = plt.figure(figsize=(10, 5.4))
    ax = fig.add_axes((0.31, 0.19, 0.63, 0.55))
    for i, (k, v) in enumerate(rows):
        b = v["brier"]
        col = ACCENT if k.startswith("M1") else NEUTRAL
        ax.plot([b["lo"], b["hi"]], [i, i], color=col, lw=2.5, alpha=0.35, solid_capstyle="round")
        ax.scatter([b["point"]], [i], s=90, color=col, edgecolor=SURFACE, linewidth=2, zorder=3)
        ax.text(b["hi"] + 0.01, i, f"{b['point']:.3f}", va="center", fontsize=10, color=INK)
    ax.set_yticks(range(len(rows)), [NAMES.get(k, k) for k, _ in rows])
    for t, (k, _) in zip(ax.get_yticklabels(), rows, strict=True):
        t.set_color(INK if k == "M1" else INK2)
        t.set_fontweight("semibold" if k == "M1" else "normal")
    ax.invert_yaxis()
    ax.set_xlim(0, 0.8)
    ax.grid(axis="y", visible=False)
    ax.set_xlabel("Brier score, lower is better  (dot = estimate, bar = 90% interval over months)")
    frame(fig, "Against simpler methods", "Will I go broke before payday? Error by method", "Walk-forward, rules written "
          f"down first  ·  {s['n_origins']} days in {s['n_cycles']} months", "out/backtest/sim/summary.json")
    save(fig, "fig4_brier.png")




def fig_tails() -> None:
    t = load(ROOT / "out" / "insights" / "anomaly_eval_sim.json")["tail_check"]
    fig = plt.figure(figsize=(10, 4.7))
    ax = fig.add_axes((0.25, 0.15, 0.68, 0.50))
    for i, lv in enumerate(t["levels"]):
        ax.barh(i - 0.17, lv["expected"], height=0.3, color=SURFACE, edgecolor=NEUTRAL, lw=1.4, hatch="///")
        ax.barh(i + 0.17, lv["observed"], height=0.3, color=ACCENT)
        ax.text(lv["expected"] + 0.4, i - 0.17, f"expected {lv['expected']:g}", va="center", fontsize=10, color=INK2)
        ax.text(lv["observed"] + 0.4, i + 0.17, f"found {lv['observed']}", va="center", fontsize=10.5, color=INK,
                fontweight="semibold")
    ax.set_yticks(range(len(t["levels"])), [f"TabPFN said ≤ {lv['level'] * 100:.0f}% likely" for lv in t["levels"]])
    ax.invert_yaxis()
    ax.grid(False)
    ax.set_xticks([])
    ax.spines["bottom"].set_visible(False)
    frame(fig, "The odds check", "Are TabPFN's odds honest?", f"{t['n']} ordinary spends in {len(t['windows'])} back-to-back "
          "45-day windows, odds from its full predicted distribution", "out/insights/anomaly_eval_sim.json (tail_check)")
    save(fig, "fig6_tails.png")


def fig_chat() -> None:
    v1 = load(ROOT / "out" / "chat" / "chat_eval_english_v1_reword.json")["models"]["gemma3:1b"]
    v2 = load(ROOT / "out" / "chat" / "chat_eval_english.json")["models"]["gemma3:1b"]
    fig = plt.figure(figsize=(10, 4.4))
    ax = fig.add_axes((0.32, 0.17, 0.6, 0.44))
    rows = [("Reword the whole answer\naround the numbers", v1, NEUTRAL), ("Write one reaction line;\nchecked answer follows", v2, ACCENT)]
    for i, (_lab, v, col) in enumerate(rows):
        ax.barh(i, v["accepted"], color=col, height=0.5)
        ax.text(v["accepted"] + 0.2, i, f"{v['accepted']} / {v['n']}", va="center", fontsize=12, fontweight="semibold", color=INK)
    ax.set_yticks([0, 1], [r[0] for r in rows])
    ax.set_xlim(0, rows[0][1]["n"] + 2)
    ax.invert_yaxis()
    ax.grid(False)
    ax.set_xticks([])
    ax.spines["bottom"].set_visible(False)
    frame(fig, "The words", "Same Gemma 3 1B, different job", "Replies that passed every check, on the 14 questions the chat suggests",
          "out/chat/chat_eval_english_v1_reword.json, out/chat/chat_eval_english.json")
    save(fig, "fig7_chat.png")



def fig_months() -> None:
    r = load(DEMO / "replay.json")
    months = [m for m in r["months"] if len(m["days"]) >= 3]
    cols = 3
    rows_n = -(-len(months) // cols)
    fh = 2.75 * rows_n + 2.2
    fig = plt.figure(figsize=(11, fh))
    top, bottom = 1 - 1.55 / fh, 0.75 / fh
    cell = (top - bottom) / rows_n
    for i, m in enumerate(months):
        ax = fig.add_axes((0.06 + (i % cols) * 0.315, top - (i // cols + 1) * cell + 0.5 / fh, 0.27, cell - 1.0 / fh))
        d = [date.fromisoformat(x["date"]) for x in m["days"]]
        ax.axhline(r["threshold"] * 100, color=MUTED, lw=0.8, ls=(0, (3, 3)))
        ax.plot(d, [x["p"] * 100 for x in m["days"]], color=ACCENT, lw=2)
        if m["broke_day"]:
            ax.axvline(date.fromisoformat(m["broke_day"]), color=TERRA, lw=1.4, ls=(0, (4, 3)))
        if m["went_broke"]:
            verdict = f"caught {m['lead_days']} days early" if (m["lead_days"] or 0) > 0 else "warned only on the day"
        else:
            verdict = "false alarm" if m["false_alarm"] else "quiet, correctly"
        ax.set_title(f"{date.fromisoformat(m['start']):%b %Y}  ·  {verdict}", loc="left", color=INK if m["went_broke"] else INK2,
                     fontweight="semibold" if m["went_broke"] else "normal")
        ax.set_ylim(0, 105)
        ax.set_yticks([0, 50, 100])
        ax.yaxis.set_major_formatter(lambda v, _: f"{v:.0f}%")
        ax.xaxis.set_major_locator(mdates.DayLocator(bymonthday=[1, 15]))
        ax.xaxis.set_major_formatter(mdates.DateFormatter("%d %b"))
        ax.tick_params(labelsize=8.5)
    frame(fig, "The time machine", "Every month, replayed", "Green: the chance of running out it gave each day, from past data "
          "only.  Terracotta: the day the money ran out.  Dotted: the 50% warning line", "web/public/demo/replay.json")
    save(fig, "fig9_months.png")



def fig_tail_demo() -> None:
    """The hidden feature, visible: the same TabPFN fit read two ways, on noise whose true answer is known."""
    from scipy.stats import norm

    from brokedate.models.tabpfn_adapter import DistRegressor, TabPFNDist

    rng = np.random.default_rng(0)
    m = TabPFNDist().fit(rng.random((400, 2)), rng.standard_normal(400))
    ys = np.linspace(0.0, 4.5, 46)
    X = np.full((len(ys), 2), 0.5)
    exact = m.exceed_prob(X, ys)
    coarse = DistRegressor.exceed_prob(m, X, ys)
    fig = plt.figure(figsize=(10, 5.7))
    ax = fig.add_axes((0.11, 0.19, 0.69, 0.55))
    ax.plot(ys, norm.sf(ys), color=MUTED, lw=1.2, ls=(0, (2, 2)))
    ax.plot(ys, exact, color=ACCENT, lw=2.6)
    keep = coarse > 0
    ax.plot(ys[keep], coarse[keep], color=NEUTRAL, lw=2.2)
    z = ys[~keep][0] if (~keep).any() else ys[-1]
    ax.scatter([z], [coarse[keep][-1]], color=NEUTRAL, s=40, zorder=3)
    ax.annotate("99 quantiles: “impossible”\nfrom here on", (z, coarse[keep][-1]), xytext=(-150, -90),
                textcoords="offset points", color=INK2, fontsize=10.5,
                arrowprops={"arrowstyle": "-", "color": NEUTRAL, "lw": 0.9})
    ax.set_yscale("log")
    ax.set_ylim(1e-6, 1)
    ax.text(ys[-1] + 0.08, exact[-1], "full distribution\noutput_type=\"full\"", color=INK, fontsize=10,
            fontweight="semibold", va="center")
    ax.text(ys[-1] + 0.08, norm.sf(ys[-1]), "true answer", color=MUTED, fontsize=9.5, va="center")
    ax.set_xlabel("how far above typical (standard deviations)")
    ax.set_ylabel("chance of a value at least this big")
    ax.yaxis.set_major_formatter(lambda v, _: f"1 in {1 / v:,.0f}" if v < 1 else "certain")
    ax.tick_params(which="minor", left=False)
    frame(fig, "A feature almost nobody uses", "TabPFN's full distribution sees past the 99th percentile",
          "Same model, same fit, read two ways. Quantiles stop at the 99th; the full predicted distribution keeps going",
          "computed live by this script", who="TabPFN v2 fit on 400 rows of N(0, 1) noise (seed 0), where the true answer is known")
    save(fig, "fig11_tail_demo.png")


def fig_pipeline() -> None:
    from matplotlib.patches import FancyArrowPatch, FancyBboxPatch

    fig = plt.figure(figsize=(11, 6.2))
    ax = fig.add_axes((0.03, 0.10, 0.94, 0.66))
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 60)
    ax.axis("off")

    def box(x: float, y: float, w: float, h: float, title: str, body: str, kind: str) -> None:
        fc, ec = {"tab": ("#e2efe8", ACCENT), "gem": (TERRA_SOFT, TERRA), "plain": ("#efede6", NEUTRAL)}[kind]
        ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.4,rounding_size=1.4", fc=fc, ec=ec, lw=1.2))
        ax.text(x + 1.2, y + h - 2.0, title, fontsize=13.5, color=INK, va="top", family=SERIF)
        ax.text(x + 1.2, y + h - 7.4, body, fontsize=9.3, color=INK2, va="top", linespacing=1.4)

    def arrow(x0: float, y0: float, x1: float, y1: float) -> None:
        ax.add_patch(FancyArrowPatch((x0, y0), (x1, y1), arrowstyle="-|>", mutation_scale=13, color=INK2, lw=1.1))

    box(1, 34, 18, 21, "Statement", "CSV / Excel from his\nbank, read on his\nlaptop. Reconciled\nto the paisa.", "plain")
    box(24, 34, 20, 21, "Sort transactions", "Regex rules first.\nTabPFN classifier for\nleftovers it's sure of.\nThe rest: “you decide”.", "tab")
    box(49, 34, 22, 21, "Forecast the spread", "TabPFN: 99 quantiles\nof tomorrow's spend\nfrom 14 numbers about\ntoday.", "tab")
    box(76, 34, 23, 21, "500 futures", "Play out every day to\npayday. Count who runs\nout. Price plans in\ndays, same draws.", "tab")
    box(1, 3, 30, 23, "Odd spends, with odds", "TabPFN's full predicted\ndistribution: “about 1 in\n400 spends like this”.\nChecked: are the odds honest?", "tab")
    box(36, 3, 29, 23, "The browser", "Reruns the same 500\nfutures for every what-if\nin 0.05 s. Computes every\nanswer and every number.", "plain")
    box(70, 3, 29, 23, "Gemma 3 1B", "Adds one friendly line.\nNever sees a number.\nDropped if it writes a digit,\ninvents a day, or disagrees.", "gem")
    arrow(19.6, 44.5, 23.4, 44.5)
    arrow(44.6, 44.5, 48.4, 44.5)
    arrow(71.6, 44.5, 75.4, 44.5)
    arrow(60, 33.4, 50.5, 26.8)
    arrow(87.5, 33.4, 56, 26.8)
    arrow(35, 33.4, 18, 26.8)
    arrow(65.6, 14.5, 69.4, 14.5)
    frame(fig, "How it works", "How a question gets answered", "Green: TabPFN does the numbers.  Terracotta: Gemma does the "
          "words.  Everything runs on 127.0.0.1; nothing leaves the laptop", "engine/brokedate, web/src", who="Architecture")
    save(fig, "fig0_pipeline.png")


def fig_heldout() -> None:
    """The synthetic statement ends the day before the forecast. What the app said then, against the rows it never saw."""
    fpath = ROOT / "out" / "forecast" / "subarna_syn.json"
    if not fpath.is_file():
        print("skip fig12_heldout.png: no", fpath)
        return
    f = load(fpath)
    days = [date.fromisoformat(d) for d in f["paths"]["days"]]
    P = np.asarray(f["paths"]["balances_paise"], dtype=float) / 100
    b = f["band"]
    bal: dict[date, float] = {}
    with (SYN / "heldout.csv").open(encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            bal[datetime.strptime(row["Date"], "%d/%m/%y").date()] = float(row["Closing Balance"])  # last row of a day wins
    # a path value on day d is the balance that day starts with, so the actual line uses the previous day's close
    actual, last = [f["balance_now_paise"] / 100], f["balance_now_paise"] / 100
    for d in days[1:]:
        last = bal.get(d - timedelta(days=1), last)
        actual.append(last)
    fig = plt.figure(figsize=(10, 5.9))
    ax = fig.add_axes((0.09, 0.15, 0.85, 0.60))
    for row in P[::6]:
        ax.plot(days, row, color=ACCENT, alpha=0.07, lw=1)
    ax.fill_between(days, np.asarray(b["p10"]) / 100, np.asarray(b["p90"]) / 100, color=ACCENT_SOFT, alpha=0.6, lw=0)
    ax.plot(days, np.asarray(b["p50"]) / 100, color=ACCENT, lw=2.2)
    ax.plot(days, actual, color=INK, lw=2.4)
    ax.axhline(f["broke_line_paise"] / 100, color=INK2, lw=1, ls=(0, (4, 3)))
    label(ax, "what the app expected", (days[6], b["p50"][6] / 100), (10, 14))
    k = len(days) * 2 // 3
    label(ax, "what happened (held out)", (days[k // 2], actual[k // 2]), (0, -22), strong=True, ha="center")
    ax.scatter([days[-1]], [actual[-1]], s=60, color=INK, edgecolor=SURFACE, linewidth=2, zorder=4)
    label(ax, f"{rupees(actual[-1] * 100)} left on the morning of payday", (days[-1], actual[-1]), (-150, 150), strong=True,
          ha="right", arrowprops={"arrowstyle": "-", "color": INK2, "lw": 0.9, "shrinkB": 6})
    ax.set_ylim(bottom=0)
    ax.yaxis.set_major_formatter(lambda v, _: f"₹{v:,.0f}")
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%d %b"))
    frame(fig, "A held-out month", f"It said {f['n_make_it']} of {f['n_futures']} futures make it. Then the month happened",
          f"Forecast made on {date.fromisoformat(f['as_of']):%d %b} from the statement up to the day before; the black line "
          "is the rest of the month, which the app never saw", "out/forecast/subarna_syn.json, data/subarna_syn/heldout.csv",
          who=SYNTH)
    save(fig, "fig12_heldout.png")


def fig_cover() -> None:
    """Cover card (1000 x 420 at 2x): the headline on the left, the two results that matter on the right."""
    s = load(ROOT / "out" / "backtest" / "sim" / "summary.json")
    lead = s["models"]["M1"]["lead_time"]["lead_days"]
    ahead, n = sum(1 for d in lead if d > 0), len(lead)
    v1 = load(ROOT / "out" / "chat" / "chat_eval_english_v1_reword.json")["models"]["gemma3:1b"]
    v2 = load(ROOT / "out" / "chat" / "chat_eval_english.json")["models"]["gemma3:1b"]
    fig = plt.figure(figsize=(10, 4.2))
    fig.text(0.05, 0.875, spaced("Built for a friend  ·  runs offline"), fontsize=8.5, color=MUTED, va="center")
    fig.text(0.05, 0.60, "Broke Date", fontsize=40, color=INK, family=SERIF, va="center")
    fig.text(0.05, 0.385, "His month, played out 500 times on his own\nlaptop, to answer one question: can I afford this?",
             fontsize=11.5, color=INK2, va="center", linespacing=1.45)
    fig.text(0.05, 0.125, f"TabPFN  ·  Gemma 3 1B  ·  an i3, Wi-Fi off  ·  {s['n_origins']} days backtested", fontsize=9, color=MUTED,
             va="center")
    fig.add_artist(plt.Line2D([0.525, 0.525], [0.10, 0.90], color=GRID, lw=1))
    x0, x1 = 0.575, 0.95
    fig.text(x0, 0.875, spaced("The backtest"), fontsize=8.5, color=TERRA, va="center", fontweight="medium")
    fig.text(x0, 0.675, f"{ahead} of {n}", fontsize=44, color=INK, va="center")
    fig.text(0.775, 0.675, "months that ran out were\nflagged ahead of time,\nby up to "
             f"{max(lead)} days.", fontsize=10.5, color=INK2, va="center", linespacing=1.4)
    ax = fig.add_axes((x0, 0.455, x1 - x0, 0.05))
    ax.axis("off")
    ax.set_xlim(0, n)
    for i in range(n):
        ax.barh(0, 0.97, left=i, color=ACCENT if i < ahead else TERRA, height=1)
    fig.text(x0, 0.40, f"{ahead} warned early", fontsize=9, color=ACCENT, va="center")
    fig.text(x1, 0.40, f"{n - ahead} only on the day", fontsize=9, color=TERRA, va="center", ha="right")
    fig.add_artist(plt.Line2D([x0, x1], [0.30, 0.30], color=GRID, lw=1))
    fig.text(x0, 0.245, spaced("The words"), fontsize=8.5, color=TERRA, va="center", fontweight="medium")
    fig.text(x0, 0.135, f"{v1['accepted']} → {v2['accepted']}", fontsize=24, color=INK, va="center")
    fig.text(0.735, 0.135, f"of {v2['n']} Gemma replies passed\nevery check, with a smaller job.", fontsize=10, color=INK2,
             va="center", linespacing=1.4)
    save(fig, "cover.png")


if __name__ == "__main__":
    for fn in (fig_cover, fig_pipeline, fig_futures, fig_calibration, fig_brier, fig_tails, fig_chat, fig_months,
               fig_tail_demo, fig_heldout):
        fn()
