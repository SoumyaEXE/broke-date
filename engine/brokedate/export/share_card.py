"""Share card: what the backtest on a REAL person's statement can say in public (`brokedate share-card -s <subject>`).

Relative only, by construction: counts of months and days of notice, error scores (unitless) and calibration rates.
No rupee amounts, no dates, no merchants, no balances ever leave this function, so the output is safe to paste into
a post with the person's OK. Computed from the backtest's own files; nothing is typed by hand.
"""

from __future__ import annotations

from typing import Any

from brokedate.eval.replay import build_replay

FORBIDDEN_KEYS = {"date", "start", "payday", "broke_day", "first_warning", "days", "B", "B_med", "amount", "balance"}


def share_card(summary: dict[str, Any], origins: list[dict[str, Any]], threshold: float = 0.5) -> dict[str, Any]:
    rep = build_replay(origins, threshold)
    ms = rep["months"]
    broke = [m for m in ms if m["went_broke"]]
    ahead = [m for m in broke if (m["lead_days"] or 0) > 0]
    best = min(("B1", "B2", "B3"), key=lambda k: summary["models"][k]["brier"]["point"]) if summary.get("models") else None
    card = {
        "months_evaluated": len(ms),
        "months_ran_out": len(broke),
        "warned_ahead": len(ahead),
        "warned_only_on_the_day": sum(1 for m in broke if m["lead_days"] == 0 and m["first_warning"] is not None),
        "never_warned": sum(1 for m in broke if m["first_warning"] is None),
        "notice_days_each": sorted((m["lead_days"] for m in ahead), reverse=True),
        "notice_days_avg_all": round(sum(m["lead_days"] or 0 for m in broke) / len(broke), 1) if broke else None,
        "false_alarm_months": sum(1 for m in ms if m["false_alarm"]),
        "brier_app": round(summary["models"]["M1"]["brier"]["point"], 3) if summary.get("models") else None,
        "brier_best_simple": round(summary["models"][best]["brier"]["point"], 3) if best else None,
        "verdicts": {k: v["brier"]["verdict"] for k, v in summary.get("diff_vs_M1", {}).items()},
        "calibration": [{"said": f"{int(b['lo'] * 100)}-{int(b['hi'] * 100)}%", "happened": f"{round(b['observed'] * 100)}%",
                         "n_days": b["n"]} for b in rep["calibration"].get("M1", [])],
    }
    assert not FORBIDDEN_KEYS & set(card), "share card must stay relative-only"
    return card


def to_markdown(card: dict[str, Any], name: str = "my friend") -> str:
    lines = [
        f"Over {card['months_evaluated']} of {name}'s real months (each day predicted using only the days before it):",
        f"- {card['months_ran_out']} months ran out before payday. Broke Date warned ahead in {card['warned_ahead']} of them"
        + (f" ({', '.join(str(d) for d in card['notice_days_each'])} days before)" if card["notice_days_each"] else "")
        + (f"; {card['warned_only_on_the_day']} only on the day itself" if card["warned_only_on_the_day"] else "")
        + (f"; {card['never_warned']} with no warning" if card["never_warned"] else "") + ".",
        f"- False alarms: {card['false_alarm_months']} month(s) where it warned but the money lasted.",
    ]
    if card["brier_app"] is not None:
        lines.append(f"- Prediction error (Brier, lower is better): {card['brier_app']} vs {card['brier_best_simple']} for the best simple method.")
    return "\n".join(lines)
