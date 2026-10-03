"""Benchmark harness: measured, not claimed (SPEC 12). Appends a run to out/bench.json."""

from __future__ import annotations

import json
import os
import platform
import threading
import time
from datetime import UTC, date, datetime
from typing import Any

import psutil

from brokedate.config import REPO_ROOT, load_config
from brokedate.db import DB


class PeakRSS:
    def __init__(self, interval: float = 0.05) -> None:
        self.proc = psutil.Process(os.getpid())
        self.peak = self.proc.memory_info().rss
        self.interval = interval
        self._stop = threading.Event()
        self._t = threading.Thread(target=self._run, daemon=True)

    def _run(self) -> None:
        while not self._stop.is_set():
            self.peak = max(self.peak, self.proc.memory_info().rss)
            time.sleep(self.interval)

    def __enter__(self) -> PeakRSS:
        self._t.start()
        return self

    def __exit__(self, *a: Any) -> None:
        self._stop.set()
        self._t.join()


def machine_info() -> dict[str, Any]:
    cpu = platform.processor()
    try:
        if platform.system() == "Windows":
            import subprocess

            cpu = subprocess.run(["powershell", "-NoProfile", "-c", "(Get-CimInstance Win32_Processor).Name"],
                                 capture_output=True, text=True, timeout=10).stdout.strip() or cpu
    except Exception:
        pass
    return {"cpu": cpu, "logical_cores": psutil.cpu_count(), "ram_gb": round(psutil.virtual_memory().total / 2**30, 1),
            "os": f"{platform.system()} {platform.release()}", "python": platform.python_version()}


def run_bench(subject: str, as_of: date, label: str) -> dict[str, Any]:
    from brokedate.enrich.gemma import OllamaClient, OllamaError
    from brokedate.forecast import engine as fe
    from brokedate.forecast.build import build_forecast
    from brokedate.service import load_ledger, load_plans

    cfg = load_config()
    db = DB(cfg.db_path)
    led = load_ledger(db, cfg, subject)
    res: dict[str, Any] = {"label": label, "when": datetime.now(UTC).isoformat(timespec="seconds"),
                           "machine": machine_info(), "subject": subject, "as_of": str(as_of),
                           "n_futures": cfg.forecast.n_futures,
                           "tabpfn": f"{cfg.tabpfn.model_version} n_estimators={cfg.tabpfn.n_estimators}"}
    try:
        import torch

        res["torch_threads"] = torch.get_num_threads()
    except Exception:
        pass
    with PeakRSS() as mem:
        t = time.perf_counter()
        p = fe.prepare(led, cfg, as_of)
        t_prep = time.perf_counter() - t
        t = time.perf_counter()
        b = build_forecast(p, load_plans(db, subject), subject)
        t_out = time.perf_counter() - t
        t = time.perf_counter()
        fe.run(p)
        t_one = time.perf_counter() - t
    res.update({
        "fit_spend_s": round(p.timings.get("fit_spend", 0), 2), "lattice_s": round(p.timings.get("lattice", 0), 2),
        "lattice_rows": p.lattice_rows, "direct_model_s": round(p.timings.get("direct", 0), 2),
        "prepare_s": round(t_prep, 2), "outputs_s": round(t_out, 2), "full_forecast_s": round(t_prep + t_out, 2),
        "one_scenario_rollout_s": round(t_one, 3), "horizon_days": p.H,
        "safe_to_spend_search_iterations": b.response["facts"][b.response["fact_ids"]["safe_to_spend"]]["source"]
        .get("iterations"),
        "peak_rss_mb": round(mem.peak / 2**20, 1),
    })
    if cfg.gemma.enabled:
        try:
            cl = OllamaClient(cfg.gemma.ollama_url, cfg.gemma.model, cfg.gemma.timeout_s)
            cl.ensure_model()
            _, data = cl.chat([{"role": "user", "content": "Write two sentences about chai in Kolkata."}],
                              temperature=0.0, num_predict=120)
            ev, dur = data.get("eval_count"), data.get("eval_duration")
            res["gemma_tokens_per_s"] = round(ev / (dur / 1e9), 2) if ev and dur else None
            res["gemma_model"] = cfg.gemma.model
        except OllamaError as e:
            res["gemma_error"] = str(e)
    out = REPO_ROOT / "out" / "bench.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    runs = json.loads(out.read_text(encoding="utf-8")) if out.exists() else []
    runs = [r for r in runs if r.get("label") != label] + [res]
    out.write_text(json.dumps(runs, indent=2), encoding="utf-8")
    return res
