"""How reliable is Gemma at phrasing answers without touching the numbers? (`brokedate eval-chat`)

Runs the fixed question set (web/src/lib/__fixtures__/chat_questions.json, grounded by the real browser brain)
through each installed Gemma that fits in free memory, exactly as the app does, and records for every reply: accepted
or rejected by the guards (and why), time to the first word and total time. Rejected drafts are never shown to the
user; the app falls back to the checked answer. Numbers are measured, never typed.
"""

from __future__ import annotations

import json
import time
from collections import Counter
from pathlib import Path
from typing import Any

from brokedate.config import REPO_ROOT, Config
from brokedate.enrich.gemma import OllamaClient, OllamaError, fits
from brokedate.narrate.chat import stream_reply

FIXTURES = REPO_ROOT / "web" / "src" / "lib" / "__fixtures__" / "chat_questions.json"
MODELS = ("gemma3:1b", "gemma3:4b")


def _reason(problem: str) -> str:
    for key, label in (("digit", "wrote a digit"), ("number words", "wrote a number word"), ("left out", "dropped a number"),
                       ("unknown placeholders", "invented a placeholder"), ("unit word", "repeated a unit"),
                       ("currency", "currency next to a number"), ("length", "too long or short")):
        if key in problem:
            return label
    return problem


def evaluate_chat(cfg: Config, language: str = "English", fixtures: Path = FIXTURES,
                  client: OllamaClient | None = None) -> dict[str, Any]:
    qs = json.loads(fixtures.read_text(encoding="utf-8"))
    client = client or OllamaClient(cfg.gemma.ollama_url, cfg.gemma.model, cfg.gemma.timeout_s)
    installed = {m.removesuffix(":latest") for m in client.available_models()}
    out: dict[str, Any] = {"language": language, "n_questions": len(qs), "models": {}}
    for model in MODELS:
        if model not in installed:
            out["models"][model] = {"skipped": "not installed"}
            continue
        if not fits(model):
            out["models"][model] = {"skipped": "not enough free memory"}
            continue
        rows: list[dict[str, Any]] = []
        reasons: Counter[str] = Counter()
        for q in qs:
            t0, first = time.perf_counter(), None
            final: dict[str, Any] = {}
            for ev in stream_reply(cfg, q["question"], q["facts"], q["template"], q["verdict"], language,
                                   client=client, model=model):
                if ev["type"] == "token" and first is None:
                    first = time.perf_counter() - t0
                if ev["type"] in ("done", "error"):
                    final = ev
            ok = final.get("type") == "done" and bool(final.get("ok"))
            for p in final.get("problems", []) if not ok else []:
                reasons[_reason(p)] += 1
            rows.append({"question": q["question"], "accepted": ok, "first_word_s": None if first is None else round(first, 2),
                         "total_s": round(time.perf_counter() - t0, 2), "problems": final.get("problems", []),
                         "error": final.get("message"), "text": final.get("text")})
        firsts = sorted(r["first_word_s"] for r in rows if r["first_word_s"] is not None)
        totals = sorted(r["total_s"] for r in rows)
        out["models"][model] = {
            "accepted": sum(r["accepted"] for r in rows), "n": len(rows),
            "acceptance_rate": round(sum(r["accepted"] for r in rows) / len(rows), 3) if rows else None,
            "rejections": dict(reasons.most_common()),
            "median_first_word_s": firsts[len(firsts) // 2] if firsts else None,
            "median_total_s": totals[len(totals) // 2] if totals else None,
            "replies": rows,
        }
    return out


__all__ = ["OllamaError", "evaluate_chat"]
