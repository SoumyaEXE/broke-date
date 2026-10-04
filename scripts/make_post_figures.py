"""Figures for docs/POST_DRAFT.md, drawn only from files the engine wrote (no typed numbers).

    uv --project engine run --no-sync python scripts/make_post_figures.py

Every figure states its source file and that the data is the SIMULATED student. Palette: one accent (Broke Date /
TabPFN), one neutral for baselines (always direct-labelled), orange only for "ran out" (validated: dataviz skill).
"""

from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.dates as mdates  # noqa: E402
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "images"
DEMO = ROOT / "web" / "public" / "demo"

SURFACE, INK, INK2, MUTED, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#8a8984", "#e7e6e2"
ACCENT, ACCENT_SOFT, ORANGE, NEUTRAL = "#2a78d6", "#cfe0f6", "#eb6834", "#7d7c76"

plt.rcParams.update({
    "font.family": ["Segoe UI", "DejaVu Sans"], "font.size": 11, "axes.edgecolor": GRID, "axes.labelcolor": INK2,
    "xtick.color": MUTED, "ytick.color": INK2, "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.8,
    "axes.spines.top": False, "axes.spines.right": False, "axes.spines.left": False, "figure.facecolor": SURFACE,
    "axes.facecolor": SURFACE, "savefig.facecolor": SURFACE, "xtick.major.size": 0, "ytick.major.size": 0,
})


def load(p: Path) -> dict:
    return json.loads(p.read_text(encoding="utf-8"))


def frame(fig: plt.Figure, title: str, sub: str, source: str) -> None:
    fig.text(0.035, 0.955, title, fontsize=16, fontweight="bold", color=INK, va="top")
    fig.text(0.035, 0.885, sub, fontsize=11.5, color=INK2, va="top")
    fig.text(0.035, 0.025, f"SIMULATED student · source: {source}", fontsize=9, color=MUTED)


def save(fig: plt.Figure, name: str) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    fig.savefig(OUT / name, dpi=200)
    plt.close(fig)
    print("wrote", OUT / name)


def rupees(paise: float) -> str:
    return f"₹{paise / 100:,.0f}"


def fig_futures() -> None:
    f = load(DEMO / "forecast.json")
    days = [date.fromisoformat(d) for d in f["paths"]["days"]]
    P = np.asarray(f["paths"]["balances_paise"], dtype=float) / 100
    line = f["broke_line_paise"] / 100
    broke = np.less(P, line).any(axis=1)
    fig = plt.figure(figsize=(10, 5.4))
    ax = fig.add_axes((0.08, 0.13, 0.82, 0.66))
    for row in P[~broke][::5]:
        ax.plot(days, row, color=ACCENT, alpha=0.07, lw=1)
    for row in P[broke]:
        ax.plot(days, row, color=ORANGE, alpha=0.8, lw=1.4)
    b = f["band"]
    ax.fill_between(days, np.asarray(b["p10"]) / 100, np.asarray(b["p90"]) / 100, color=ACCENT_SOFT, alpha=0.55, lw=0)
    ax.plot(days, np.asarray(b["p50"]) / 100, color=ACCENT, lw=2.5)
    ax.axhline(line, color=INK2, lw=1, ls=(0, (4, 3)))
    ax.text(days[0], line, f"  broke line {rupees(f['broke_line_paise'])}", color=INK2, fontsize=9.5, va="bottom")
    ax.annotate("typical future", (days[len(days) // 2], b["p50"][len(days) // 2] / 100), xytext=(12, 18),
                textcoords="offset points", color=ACCENT, fontsize=10.5, fontweight="bold")
    n_broke, n = int(broke.sum()), len(P)
    ax.text(days[1], P.max() * 0.97, f"{n_broke} of {n} futures run out before payday (orange)", color=ORANGE,
            fontsize=11, fontweight="bold", va="top")
    ax.set_ylim(bottom=0)
    ax.yaxis.set_major_formatter(lambda v, _: f"₹{v:,.0f}")
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%d %b"))
    frame(fig, "500 futures until payday", f"Balance from {days[0]:%d %b} to payday ({f['next_anchor_date']}), each line one "
          "future played out by TabPFN's spend forecast", "web/public/demo/forecast.json")
    save(fig, "fig1_futures.png")


def fig_time_machine() -> None:
    r = load(DEMO / "replay.json")
    m = max((x for x in r["months"] if x["went_broke"]), key=lambda x: x["lead_days"] or 0)
    d = [date.fromisoformat(x["date"]) for x in m["days"]]
    p = [x["p"] * 100 for x in m["days"]]
    b1 = [x.get("p_B1", np.nan) * 100 for x in m["days"]]
    fig = plt.figure(figsize=(10, 5.2))
    ax = fig.add_axes((0.08, 0.14, 0.84, 0.64))
    ax.axhline(r["threshold"] * 100, color=MUTED, lw=1, ls=(0, (4, 3)))
    ax.text(d[0], r["threshold"] * 100 + 2, "warning line", color=MUTED, fontsize=9.5)
    ax.plot(d, b1, color=NEUTRAL, lw=1.6, ls=(0, (5, 4)))
    k = max(i for i, v in enumerate(b1) if v >= np.nanmax(b1) - 2)  # right end of its plateau: free space above
    ax.annotate("spending-pace rule", (d[k], b1[k]), xytext=(10, 6), textcoords="offset points", color=NEUTRAL, fontsize=10)
    ax.plot(d, p, color=ACCENT, lw=2.5, marker="o", ms=4.5, mec=SURFACE, mew=1.2)
    k = int(np.argmax(p[:-1]))
    ax.annotate("Broke Date", (d[k], p[k]), xytext=(8, 10), textcoords="offset points", color=ACCENT, fontsize=11,
                fontweight="bold")
    bd = date.fromisoformat(m["broke_day"])
    fw = date.fromisoformat(m["first_warning"])
    ax.axvline(bd, color=ORANGE, lw=1.6, ls=(0, (5, 3)))
    ax.text(bd, 102, " ran out", color=ORANGE, fontsize=10, fontweight="bold", va="bottom")
    ax.annotate("", xy=(bd, 8), xytext=(fw, 8), arrowprops={"arrowstyle": "<->", "color": INK2, "lw": 1.2})
    ax.text(fw + (bd - fw) / 2, 11, f"{m['lead_days']} days' notice", color=INK, fontsize=11, fontweight="bold", ha="center")
    ax.set_ylim(0, 110)
    ax.set_xlim(d[0] - timedelta(days=1), max(bd, d[-1]) + timedelta(days=7))
    ax.yaxis.set_major_formatter(lambda v, _: f"{v:.0f}%")
    ax.set_yticks([0, 25, 50, 75, 100])
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%d %b"))
    frame(fig, "The time machine: a month replayed", f"Chance of running out before payday, as predicted every other day "
          f"using only the days before it ({date.fromisoformat(m['start']):%B %Y})", "web/public/demo/replay.json")
    save(fig, "fig2_time_machine.png")


def fig_calibration() -> None:
    r = load(DEMO / "replay.json")
    c = r["calibration"]["M1"]
    x = [b["mean_p"] * 100 for b in c]
    y = [b["observed"] * 100 for b in c]
    n = [b["n"] for b in c]
    fig = plt.figure(figsize=(7.2, 6.4))
    ax = fig.add_axes((0.12, 0.13, 0.8, 0.66))
    ax.plot([0, 100], [0, 100], color=NEUTRAL, lw=1.3, ls=(0, (5, 4)))
    ax.text(40, 33, "perfectly honest", color=NEUTRAL, fontsize=9.5, rotation=40)
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
    frame(fig, "Does it mean what it says?", f"All {r['n_days']} backtest days, grouped by the chance it gave",
          "web/public/demo/replay.json")
    save(fig, "fig3_calibration.png")


NAMES = {"M1": "Broke Date (TabPFN simulation)", "M1b": "…without calibration", "M1a": "…without anchoring",
         "B3": "LightGBM, same simulator", "B2": "Copy last month", "B1": "Spending pace (last 14 days)"}


def fig_brier() -> None:
    s = load(ROOT / "out" / "backtest" / "sim" / "summary.json")
    rows = sorted(s["models"].items(), key=lambda kv: kv[1]["brier"]["point"])
    fig = plt.figure(figsize=(10, 5.0))
    ax = fig.add_axes((0.31, 0.15, 0.62, 0.62))
    for i, (k, v) in enumerate(rows):
        b = v["brier"]
        col = ACCENT if k.startswith("M1") else NEUTRAL
        ax.plot([b["lo"], b["hi"]], [i, i], color=col, lw=2.5, alpha=0.35, solid_capstyle="round")
        ax.scatter([b["point"]], [i], s=90, color=col, edgecolor=SURFACE, linewidth=2, zorder=3)
        ax.text(b["hi"] + 0.01, i, f"{b['point']:.3f}", va="center", fontsize=10, color=INK)
    ax.set_yticks(range(len(rows)), [NAMES.get(k, k) for k, _ in rows])
    for t, (k, _) in zip(ax.get_yticklabels(), rows, strict=True):
        t.set_color(INK if k == "M1" else INK2)
        t.set_fontweight("bold" if k == "M1" else "normal")
    ax.invert_yaxis()
    ax.set_xlim(0, 0.8)
    ax.grid(axis="y", visible=False)
    ax.set_xlabel("Brier score, lower is better (dot = estimate, bar = 90% interval over months)")
    frame(fig, "Will I go broke before payday? Error by method", f"Walk-forward, pre-registered rules · "
          f"{s['n_origins']} days in {s['n_cycles']} months", "out/backtest/sim/summary.json")
    save(fig, "fig4_brier.png")


DET = {"tabpfn": "TabPFN (the app)", "merchant_3x": "> 3× this merchant's usual", "category_z3": "3σ above its category"}


def fig_anomaly() -> None:
    a = load(ROOT / "out" / "insights" / "anomaly_eval_sim.json")
    n = a["n_plants"] * len(a["seeds"])
    fig = plt.figure(figsize=(10, 4.6))
    for j, fac in enumerate(["x3", "x5"]):
        ax = fig.add_axes((0.25 + j * 0.38, 0.15, 0.33, 0.58))
        for i, det in enumerate(DET):
            found = round(a["summary"][det][fac]["recall_mean"] * n)
            col = ACCENT if det == "tabpfn" else NEUTRAL
            ax.barh(i, found, color=col, height=0.55)
            ax.text(found + 0.3, i, f"{found} / {n}", va="center", fontsize=10.5, color=INK,
                    fontweight="bold" if det == "tabpfn" else "normal")
        ax.set_xlim(0, n + 3)
        ax.invert_yaxis()
        ax.grid(axis="y", visible=False)
        ax.set_title(f"spends planted at {fac[1:]}× normal", fontsize=11, color=INK2, loc="left")
        ax.set_yticks(range(len(DET)), list(DET.values()) if j == 0 else [""] * len(DET))
        ax.set_xticks([])
    fp = max(v[f]["false_alarms_mean"] for v in a["summary"].values() for f in v)
    frame(fig, "Planted anomalies: who finds them?", f"Same plants for every detector, {len(a['seeds'])} seeds × "
          f"{a['n_plants']} plants · false alarms: {fp:g} for all three", "out/insights/anomaly_eval_sim.json")
    save(fig, "fig5_anomaly.png")


def fig_tails() -> None:
    t = load(ROOT / "out" / "insights" / "anomaly_eval_sim.json")["tail_check"]
    fig = plt.figure(figsize=(10, 4.2))
    ax = fig.add_axes((0.25, 0.17, 0.68, 0.52))
    for i, lv in enumerate(t["levels"]):
        ax.barh(i - 0.17, lv["expected"], height=0.3, color=SURFACE, edgecolor=NEUTRAL, lw=1.5, hatch="///")
        ax.barh(i + 0.17, lv["observed"], height=0.3, color=ACCENT)
        ax.text(lv["expected"] + 0.4, i - 0.17, f"expected {lv['expected']:g}", va="center", fontsize=10, color=INK2)
        ax.text(lv["observed"] + 0.4, i + 0.17, f"found {lv['observed']}", va="center", fontsize=10, color=INK, fontweight="bold")
    ax.set_yticks(range(len(t["levels"])), [f"TabPFN said ≤ {lv['level'] * 100:.0f}% likely" for lv in t["levels"]])
    ax.invert_yaxis()
    ax.grid(axis="y", visible=False)
    ax.set_xticks([])
    frame(fig, "Are TabPFN's odds honest?", f"{t['n']} ordinary spends in {len(t['windows'])} back-to-back 45-day windows, "
          "exact odds from its full predicted distribution", "out/insights/anomaly_eval_sim.json (tail_check)")
    save(fig, "fig6_tails.png")


def fig_chat() -> None:
    v1 = load(ROOT / "out" / "chat" / "chat_eval_english_v1_reword.json")["models"]["gemma3:1b"]
    v2 = load(ROOT / "out" / "chat" / "chat_eval_english.json")["models"]["gemma3:1b"]
    fig = plt.figure(figsize=(10, 3.9))
    ax = fig.add_axes((0.32, 0.2, 0.6, 0.45))
    rows = [("Reword the whole answer\naround the numbers", v1, NEUTRAL), ("Write one reaction line;\nchecked answer follows", v2, ACCENT)]
    for i, (_lab, v, col) in enumerate(rows):
        ax.barh(i, v["accepted"], color=col, height=0.5)
        ax.text(v["accepted"] + 0.2, i, f"{v['accepted']} / {v['n']}", va="center", fontsize=12, fontweight="bold", color=INK)
    ax.set_yticks([0, 1], [r[0] for r in rows])
    ax.set_xlim(0, rows[0][1]["n"] + 2)
    ax.invert_yaxis()
    ax.grid(axis="y", visible=False)
    ax.set_xticks([])
    frame(fig, "Same Gemma 3 1B, different job", "Replies that passed every check, on the 14 questions the chat suggests",
          "out/chat/chat_eval_english_v1_reword.json, out/chat/chat_eval_english.json")
    save(fig, "fig7_chat.png")


def fig_plan_days() -> None:
    f = load(DEMO / "forecast.json")
    plans = sorted(f["plans"], key=lambda p: p["day_cost"])
    fig = plt.figure(figsize=(10, 3.9))
    ax = fig.add_axes((0.3, 0.2, 0.62, 0.45))
    for i, p in enumerate(plans):
        ax.barh(i, p["day_cost"], color=ACCENT, height=0.5)
        ax.text(p["day_cost"] + 0.08, i, f"{p['day_cost']:.2f} days", va="center", fontsize=11.5, fontweight="bold", color=INK)
    ax.set_yticks(range(len(plans)), [f"{p['name']}  ({rupees(p['amount_paise'])})" for p in plans])
    ax.set_xlim(0, max(p["day_cost"] for p in plans) * 1.3)
    ax.grid(axis="y", visible=False)
    ax.set_xticks([])
    frame(fig, "What a plan really costs: days of runway", "Same 500 futures rerun with the same random draws, plus the plan",
          "web/public/demo/forecast.json")
    save(fig, "fig8_plan_days.png")


def fig_months() -> None:
    r = load(DEMO / "replay.json")
    months = [m for m in r["months"] if len(m["days"]) >= 3]
    cols = 3
    rows_n = -(-len(months) // cols)
    fig = plt.figure(figsize=(11, 3.0 * rows_n + 1.6))
    h = 0.78 / rows_n
    for i, m in enumerate(months):
        ax = fig.add_axes((0.06 + (i % cols) * 0.315, 0.86 - (i // cols + 1) * h + 0.035, 0.27, h - 0.075))
        d = [date.fromisoformat(x["date"]) for x in m["days"]]
        ax.axhline(r["threshold"] * 100, color=MUTED, lw=0.8, ls=(0, (3, 3)))
        ax.plot(d, [x["p"] * 100 for x in m["days"]], color=ACCENT, lw=2)
        if m["broke_day"]:
            ax.axvline(date.fromisoformat(m["broke_day"]), color=ORANGE, lw=1.4, ls=(0, (4, 3)))
        if m["went_broke"]:
            verdict = f"caught {m['lead_days']} days early" if (m["lead_days"] or 0) > 0 else "warned only on the day"
        else:
            verdict = "false alarm" if m["false_alarm"] else "quiet, correctly"
        ax.set_title(f"{date.fromisoformat(m['start']):%b %Y} · {verdict}", fontsize=10.5, loc="left",
                     color=INK if m["went_broke"] else INK2)
        ax.set_ylim(0, 105)
        ax.set_yticks([0, 50, 100])
        ax.yaxis.set_major_formatter(lambda v, _: f"{v:.0f}%")
        ax.xaxis.set_major_locator(mdates.DayLocator(bymonthday=[1, 15]))
        ax.xaxis.set_major_formatter(mdates.DateFormatter("%d %b"))
        ax.tick_params(labelsize=8.5)
    frame(fig, "Every month, replayed", "Blue: the chance of running out it gave each day (only past data). "
          "Orange: the day the money actually ran out. Dotted: the 50% warning line", "web/public/demo/replay.json")
    fig.texts[0].set_y(0.975)
    fig.texts[1].set_y(0.94)
    save(fig, "fig9_months.png")


def fig_safe_curve() -> None:
    f = load(DEMO / "forecast.json")
    x = [p["spend_paise"] / 100 for p in f["safe_curve"]]
    y = [p["p_broke"] * 100 for p in f["safe_curve"]]
    cap = f["risk_tolerance"] * 100
    safe = f["safe_to_spend_paise"] / 100
    fig = plt.figure(figsize=(10, 5.0))
    ax = fig.add_axes((0.09, 0.14, 0.84, 0.64))
    ax.plot(x, y, color=ACCENT, lw=2.5)
    ax.axhline(cap, color=INK2, lw=1, ls=(0, (4, 3)))
    ax.text(x[-1], cap + 1.2, f"your comfort line: {cap:.0f}%", color=INK2, fontsize=10, ha="right")
    ax.axvline(safe, color=ACCENT, lw=1, alpha=0.5)
    ax.scatter([safe], [float(np.interp(safe, x, y))], s=80, color=ACCENT, edgecolor=SURFACE, linewidth=2, zorder=3)
    ax.annotate(f"safe to spend today: ₹{safe:,.0f}", (safe, float(np.interp(safe, x, y))), xytext=(-14, 26),
                textcoords="offset points", color=ACCENT, fontsize=11, fontweight="bold", ha="right")
    ax.set_ylim(0, max(y) * 1.08)
    ax.xaxis.set_major_formatter(lambda v, _: f"₹{v:,.0f}")
    ax.yaxis.set_major_formatter(lambda v, _: f"{v:.0f}%")
    ax.set_xlabel("if you spend this much today")
    ax.set_ylabel("chance of going broke before payday")
    frame(fig, "Where \"safe to spend\" comes from", "The 500 futures rerun for each amount spent today; the safe amount "
          "is the most that keeps the risk under your line", "web/public/demo/forecast.json")
    save(fig, "fig10_safe_curve.png")


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
    fig = plt.figure(figsize=(10, 5.2))
    ax = fig.add_axes((0.1, 0.14, 0.72, 0.64))
    ax.plot(ys, norm.sf(ys), color=MUTED, lw=1.2, ls=(0, (2, 2)))
    ax.plot(ys, exact, color=ACCENT, lw=2.5)
    keep = coarse > 0
    ax.plot(ys[keep], coarse[keep], color=NEUTRAL, lw=2.2)
    z = ys[~keep][0] if (~keep).any() else ys[-1]
    ax.scatter([z], [coarse[keep][-1]], color=NEUTRAL, s=40, zorder=3)
    ax.annotate("99 quantiles: \"impossible\"\nfrom here on", (z, coarse[keep][-1]), xytext=(-150, -90),
                textcoords="offset points", color=NEUTRAL, fontsize=10.5,
                arrowprops={"arrowstyle": "-", "color": NEUTRAL, "lw": 0.9})
    ax.set_yscale("log")
    ax.set_ylim(1e-6, 1)
    ax.text(ys[-1] + 0.08, exact[-1], "full distribution\n(output_type=\"full\")", color=ACCENT, fontsize=10,
            fontweight="bold", va="center")
    ax.text(ys[-1] + 0.08, norm.sf(ys[-1]), "true answer", color=MUTED, fontsize=9.5, va="center")
    ax.set_xlabel("how far above typical (standard deviations)")
    ax.set_ylabel("chance of a value at least this big")
    ax.yaxis.set_major_formatter(lambda v, _: f"1 in {1 / v:,.0f}" if v < 1 else "certain")
    frame(fig, "The TabPFN feature almost nobody uses", "Same model, same fit, read two ways. Quantiles stop at the 99th; "
          "the full predicted distribution keeps going", "computed live: TabPFN v2 on 400 rows of N(0, 1) noise, seed 0")
    fig.texts[-1].set_text("Computed live: TabPFN v2 fit on 400 rows of N(0, 1) noise (seed 0), where the true answer is known")
    save(fig, "fig11_tail_demo.png")


def fig_pipeline() -> None:
    from matplotlib.patches import FancyArrowPatch, FancyBboxPatch

    fig = plt.figure(figsize=(11, 5.6))
    ax = fig.add_axes((0.02, 0.06, 0.96, 0.76))
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 60)
    ax.axis("off")

    def box(x: float, y: float, w: float, h: float, title: str, body: str, kind: str) -> None:
        fc, ec = {"tab": ("#eaf2fc", ACCENT), "gem": ("#fdf0ea", ORANGE), "plain": ("#f1f0ec", NEUTRAL)}[kind]
        ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.4,rounding_size=1.6", fc=fc, ec=ec, lw=1.4))
        ax.text(x + 1.2, y + h - 2.2, title, fontsize=11, fontweight="bold", color=INK, va="top")
        ax.text(x + 1.2, y + h - 6.6, body, fontsize=9.3, color=INK2, va="top", linespacing=1.35)

    def arrow(x0: float, y0: float, x1: float, y1: float) -> None:
        ax.add_patch(FancyArrowPatch((x0, y0), (x1, y1), arrowstyle="-|>", mutation_scale=14, color=INK2, lw=1.3))

    box(1, 34, 18, 20, "Bank statement", "CSV / Excel from his\nbank, read on his\nlaptop. Reconciled\nto the paisa.", "plain")
    box(24, 34, 20, 20, "Sort transactions", "Regex rules first.\nTabPFN classifier for\nleftovers it's sure of.\nThe rest: 'you decide'.", "tab")
    box(49, 34, 22, 20, "Forecast the spread", "TabPFN: 99 quantiles\nof tomorrow's spend\nfrom 14 numbers about\ntoday.", "tab")
    box(76, 34, 23, 20, "500 futures", "Play out every day to\npayday. Count who runs\nout. Price plans in\ndays, same draws.", "tab")
    box(1, 4, 30, 22, "Odd spends, with odds", "TabPFN's full predicted\ndistribution: 'about 1 in\n400 spends like this'.\nChecked: are the odds honest?", "tab")
    box(36, 4, 29, 22, "Your browser", "Reruns the same 500\nfutures for every what-if\nin 0.05 s. Computes every\nanswer and every number.", "plain")
    box(70, 4, 29, 22, "Gemma 3 1B", "Adds one friendly line.\nNever sees a number.\nDropped if it writes a digit,\ninvents a day, or disagrees.", "gem")
    arrow(19.6, 44, 23.4, 44)
    arrow(44.6, 44, 48.4, 44)
    arrow(71.6, 44, 75.4, 44)
    arrow(60, 33.4, 50.5, 26.6)
    arrow(87.5, 33.4, 56, 26.6)
    arrow(35, 33.4, 18, 26.6)
    arrow(65.6, 15, 69.4, 15)
    fig.text(0.035, 0.955, "How a question gets answered", fontsize=16, fontweight="bold", color=INK, va="top")
    fig.text(0.035, 0.895, "Blue: TabPFN does the numbers. Orange: Gemma does the words. Everything on 127.0.0.1, "
             "nothing leaves the laptop", fontsize=11.5, color=INK2, va="top")
    save(fig, "fig0_pipeline.png")


if __name__ == "__main__":
    for fn in (fig_pipeline, fig_futures, fig_time_machine, fig_calibration, fig_brier, fig_anomaly, fig_tails, fig_chat,
               fig_plan_days, fig_months, fig_safe_curve, fig_tail_demo):
        fn()
