"""Experiment (negative result, not used by the app): can TabPFN's embeddings find a better "month like this one"?

For every backtest day (out/backtest/<subject>/per_origin.jsonl), using only data before that day:
  - dtw: the app's similar month (balance-curve shape, forecast/similar.py);
  - emb: fit TabPFN on earlier days, embed today's 14 spend features and each past month's features at the same
         day of the month (TabPFNDist.embed -> get_embeddings), take the nearest by cosine;
  - raw: the same nearest-neighbour search on the plain standardised features (does TabPFN add anything?).
Score: how often the look-alike month's ending (ran out or not) matches this month's. Writes
out/experiments/similar_month_embeddings_<subject>.json.

    uv --project engine run --no-sync python scripts/experiment_similar_embeddings.py --subject sim
"""

from __future__ import annotations

import argparse
import json
import os
import time
from datetime import date, timedelta
from pathlib import Path

import numpy as np

from brokedate.config import REPO_ROOT, load_config
from brokedate.db import DB
from brokedate.eval.replay import load_origins
from brokedate.features.daily import feature_table
from brokedate.features.spec import SPEND_FEATURES
from brokedate.forecast.similar import similar_month
from brokedate.models.tabpfn_adapter import make_tabpfn
from brokedate.service import load_ledger


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--subject", default="sim")
    a = ap.parse_args()
    cfg = load_config()
    db = DB(Path(os.environ.get("BROKEDATE_DATA_DIR", cfg.data_dir)) / "brokedate.sqlite")
    led = load_ledger(db, cfg, a.subject)
    base = REPO_ROOT / "out" / "backtest" / a.subject if a.subject == "sim" else REPO_ROOT / "out" / "real" / "backtest" / a.subject
    origins = load_origins(base / "per_origin.jsonl")
    ft = feature_table(led, led.last_day + timedelta(days=1)).set_index("date")

    def went_broke(s: date, e: date) -> bool:
        return bool((led.daily["bal_min_paise"].iloc[led.row_of(s):led.row_of(e) + 1] < cfg.broke_line_paise).any())

    rows, t0 = [], time.time()
    for o in origins:
        d = date.fromisoformat(o["origin"])
        sm = similar_month(led, d)
        if sm is None or d not in ft.index:
            continue
        cur = led.prev_anchor(d - timedelta(days=1))
        k = (d - cur).days
        cands = []
        for i in range(len(led.anchors.dates) - 1):
            s, e = led.anchors.dates[i], led.anchors.dates[i + 1] - timedelta(days=1)
            if e < cur and (e - s).days + 1 >= k and s + timedelta(days=k) in ft.index:
                cands.append((s, e, s + timedelta(days=k)))
        if not cands:
            continue
        train = ft[ft.index < d]
        Xtr = train[SPEND_FEATURES].to_numpy(float)
        m = make_tabpfn(cfg, 0).fit(Xtr, train["free_spend_rupees"].to_numpy(float))
        X = np.vstack([ft.loc[[d], SPEND_FEATURES].to_numpy(float)] + [ft.loc[[c[2]], SPEND_FEATURES].to_numpy(float) for c in cands])
        E = m.embed(X)
        E = E / np.linalg.norm(E, axis=1, keepdims=True)
        j = int(np.argmax(E[1:] @ E[0]))
        Xs = (X - Xtr.mean(0)) / (Xtr.std(0) + 1e-9)
        jr = int(np.argmin(((Xs[1:] - Xs[0]) ** 2).sum(1)))
        rows.append({"origin": str(d), "y": int(o["y"]), "dtw": int(sm["then_went_broke"]),
                     "emb": int(went_broke(cands[j][0], cands[j][1])), "raw": int(went_broke(cands[jr][0], cands[jr][1])),
                     "same_month_as_dtw": str(cands[j][0]) == sm["start"]})
    n = len(rows)
    ys = sum(r["y"] for r in rows)
    out = {"subject": a.subject, "n_days": n, "seconds": round(time.time() - t0),
           "accuracy": {k: round(sum(r[k] == r["y"] for r in rows) / n, 3) for k in ("dtw", "emb", "raw")},
           "always_majority": round(max(ys, n - ys) / n, 3),
           "emb_picks_same_month_as_dtw": round(sum(r["same_month_as_dtw"] for r in rows) / n, 3),
           "verdict": "not used: TabPFN embeddings did not beat the app's DTW similar month", "rows": rows}
    dest = REPO_ROOT / "out" / "experiments" / f"similar_month_embeddings_{a.subject}.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print({k: v for k, v in out.items() if k != "rows"}, "->", dest)


if __name__ == "__main__":
    main()
