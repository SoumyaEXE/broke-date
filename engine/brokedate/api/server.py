"""Local API on 127.0.0.1:8787 (SPEC 15). Fits once per (subject, as_of); plan changes reuse the lattice."""

from __future__ import annotations

import json
import logging
import shutil
import tempfile
import threading
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from brokedate import __version__
from brokedate.api.schemas import (
    AnchorsIn,
    ChatIn,
    Correction,
    ForecastIn,
    ForecastResponse,
    LetterResponse,
    PlanIn,
    PlanPatch,
    SettingsIn,
)
from brokedate.config import Config, load_config
from brokedate.db import DB
from brokedate.enrich.gemma import OllamaClient, OllamaError
from brokedate.forecast import engine as fe
from brokedate.forecast.build import ForecastBundle, build_forecast
from brokedate.service import NoDataError, default_as_of, load_ledger, load_plans, load_spread_k

log = logging.getLogger(__name__)

def _warm() -> None:
    """Prepare the newest subject's forecast (TabPFN fits take about a minute on CPU) and load the chat Gemma into
    RAM, so the first page view and the first chat reply are quick. Failures only log: the app works without it."""
    try:
        cfg, db = cfg_db()
        subjects = db.subjects()
        if subjects:
            _latest(subjects[0])
            log.info("warm: forecast ready for %s", subjects[0])
        if cfg.gemma.enabled:
            from brokedate.narrate.chat import pick_chat_model

            client = OllamaClient(cfg.gemma.ollama_url, cfg.gemma.model, cfg.gemma.timeout_s)
            model = pick_chat_model(cfg, client.available_models())
            if model:
                for _ in client.chat_stream([{"role": "user", "content": "Reply with: ok"}], num_predict=2, model=model):
                    pass
                log.info("warm: %s loaded", model)
    except Exception as e:  # pragma: no cover - best effort
        log.warning("warm-up skipped: %s", e)


@asynccontextmanager
async def _lifespan(_: FastAPI) -> AsyncIterator[None]:
    threading.Thread(target=_warm, name="warm", daemon=True).start()
    yield


app = FastAPI(title="Broke Date", version=__version__, lifespan=_lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
                   allow_methods=["*"], allow_headers=["*"])

_lock = threading.Lock()
_state: dict[str, Any] = {"cfg": None, "db": None, "prepared": {}, "bundles": {}}


def cfg_db() -> tuple[Config, DB]:
    if _state["cfg"] is None:
        cfg = load_config()
        cfg.data_dir.mkdir(parents=True, exist_ok=True)
        _state["cfg"] = cfg
        _state["db"] = DB(cfg.db_path)
        _apply_settings(cfg, _state["db"])
    return _state["cfg"], _state["db"]


def _apply_settings(cfg: Config, db: DB) -> None:
    s = db.get_setting("ui:settings", {}) or {}
    if s.get("broke_line_rupees"):
        cfg.forecast.broke_line_rupees = int(s["broke_line_rupees"])
    if s.get("risk_tolerance"):
        cfg.forecast.risk_tolerance = float(s["risk_tolerance"])
    if s.get("n_futures"):
        cfg.forecast.n_futures = int(s["n_futures"])
    if s.get("letter_language"):
        cfg.gemma.letter_language = s["letter_language"]
    if s.get("gemma_enabled") is not None:
        cfg.gemma.enabled = bool(s["gemma_enabled"])


def _invalidate(subject: str | None = None) -> None:
    for k in list(_state["prepared"]):
        if subject is None or k[0] == subject:
            _state["prepared"].pop(k, None)
            _state["bundles"].pop(k, None)


def _prepared(subject: str, as_of: date | None, n: int | None, seed: int | None) -> fe.Prepared:
    cfg, db = cfg_db()
    led = load_ledger(db, cfg, subject)
    d = as_of or default_as_of(led)
    key = (subject, str(d), n, seed)
    if key not in _state["prepared"]:
        _state["prepared"][key] = fe.prepare(led, cfg, d, seed=seed, n=n, k=load_spread_k(subject))
    _state["last_key"] = key
    return _state["prepared"][key]


def _forecast(subject: str, as_of: date | None = None, n: int | None = None, seed: int | None = None
              ) -> ForecastBundle:
    with _lock:
        p = _prepared(subject, as_of, n, seed)
        _, db = cfg_db()
        bundle = build_forecast(p, load_plans(db, subject), subject, include_lattice=True)
        _state["bundles"][(subject, str(p.as_of), n, seed)] = bundle
        _state["last_bundle"] = {subject: bundle}
        return bundle


def _latest(subject: str) -> ForecastBundle:
    lb = _state.get("last_bundle", {}).get(subject)
    if lb is not None:
        _, db = cfg_db()
        with _lock:
            p = lb.prepared
            b = build_forecast(p, load_plans(db, subject), subject, include_lattice=True)
            _state["last_bundle"] = {subject: b}
            return b
    return _forecast(subject)


@app.get("/health")
def health() -> dict[str, Any]:
    cfg, db = cfg_db()
    out: dict[str, Any] = {"version": __version__, "subjects": db.subjects(), "data_dir": "local",
                           "tabpfn": cfg.tabpfn.model_version, "gemma_enabled": cfg.gemma.enabled,
                           "gemma_model": cfg.gemma.model}
    try:
        import tabpfn

        out["tabpfn_version"] = getattr(tabpfn, "__version__", "?")
    except Exception as e:  # pragma: no cover
        out["tabpfn_error"] = str(e)
    if cfg.gemma.enabled:
        try:
            models = OllamaClient(cfg.gemma.ollama_url, cfg.gemma.model).available_models()
            out["gemma_available"] = cfg.gemma.model in models or f"{cfg.gemma.model}:latest" in models
            from brokedate.narrate.chat import pick_chat_model

            out["chat_model"] = pick_chat_model(cfg, models)
        except OllamaError as e:
            out["gemma_available"] = False
            out["gemma_error"] = str(e)
    return out


@app.post("/import")
async def import_file(file: UploadFile = File(...), subject: str = Form(...), password: str | None = Form(None),
                      confirm_anchors: bool = Form(False)) -> dict[str, Any]:
    from brokedate.ingest.pipeline import ReconciliationError, import_statement

    cfg, db = cfg_db()
    up = cfg.data_dir / "uploads"
    up.mkdir(parents=True, exist_ok=True)
    suffix = Path(file.filename or "statement.csv").suffix
    with tempfile.NamedTemporaryFile(delete=False, dir=up, suffix=suffix) as tmp:
        shutil.copyfileobj(file.file, tmp)
        path = Path(tmp.name)
    try:
        rep = import_statement(path, subject, db, cfg, password=password,
                               auto_confirm_anchors=confirm_anchors or subject == "sim")
    except ReconciliationError as e:
        r = e.result
        raise HTTPException(422, {"error": "reconciliation_failed", "row": r.mismatch_row,
                                  "index": r.mismatch_index, "expected_paise": r.expected_paise,
                                  "found_paise": r.found_paise}) from e
    except ValueError as e:
        raise HTTPException(400, {"error": "parse_failed", "detail": str(e)}) from e
    finally:
        path.unlink(missing_ok=True)
    _invalidate(subject)
    return json.loads(json.dumps(rep.to_dict(), default=str))


@app.get("/review")
def review_rows(subject: str) -> list[dict[str, Any]]:
    cfg, db = cfg_db()
    df = db.load_txns(subject)
    if df.empty:
        return []
    todo = df[(df["label_source"] == "unlabelled") | (df["confidence"].fillna(0) < cfg.gemma.confidence_threshold)]
    todo = todo[todo["label_source"] != "user"]
    cols = ["id", "date", "direction", "amount_paise", "raw_narration", "merchant", "category", "counterparty",
            "label_source", "confidence"]
    return json.loads(todo[cols].to_json(orient="records", date_format="iso"))


@app.post("/review")
def post_review(corrections: list[Correction]) -> dict[str, Any]:
    from brokedate.enrich.rules import CATEGORIES, normalize_key

    _, db = cfg_db()
    n = 0
    for c in corrections:
        if c.category not in CATEGORIES:
            raise HTTPException(400, f"unknown category {c.category}")
        row = db.conn.execute("SELECT raw_narration, direction, merchant, counterparty, subject FROM txn WHERE id=?",
                              (c.id,)).fetchone()
        if not row:
            continue
        merchant = c.merchant or row["merchant"]
        cp = c.counterparty or row["counterparty"]
        db.update_labels(c.id, merchant, c.category, cp, "user", 1.0)
        db.cache_put(normalize_key(row["raw_narration"]) + "|" + row["direction"], merchant, c.category, cp, "user",
                     1.0)
        _invalidate(row["subject"])
        n += 1
    return {"ok": True, "updated": n}


@app.get("/anchors")
def get_anchors(subject: str) -> dict[str, Any]:
    _, db = cfg_db()
    return {"detected": db.get_setting(f"{subject}:anchors_detected", []),
            "confirmed": db.get_setting(f"{subject}:anchors_confirmed")}


@app.post("/anchors")
def post_anchors(body: AnchorsIn) -> dict[str, Any]:
    from brokedate.ingest.pipeline import confirm_anchors

    _, db = cfg_db()
    confirm_anchors(db, body.subject, body.ids)
    _invalidate(body.subject)
    return {"ok": True}


@app.post("/forecast", response_model=ForecastResponse)
def post_forecast(body: ForecastIn) -> dict[str, Any]:
    try:
        b = _forecast(body.subject, date.fromisoformat(body.as_of) if body.as_of else None, body.n, body.seed)
    except NoDataError as e:
        raise HTTPException(404, str(e)) from e
    return b.response


@app.post("/plans", response_model=ForecastResponse)
def add_plan(body: PlanIn) -> dict[str, Any]:
    import re

    _, db = cfg_db()
    pid = re.sub(r"[^a-z0-9]+", "-", f"{body.name}-{body.date}".lower()).strip("-")
    db.upsert_plan(body.subject, pid, body.name, body.amount_paise, body.date, body.active)
    return _latest(body.subject).response


@app.patch("/plans/{plan_id}", response_model=ForecastResponse)
def patch_plan(plan_id: str, body: PlanPatch, subject: str) -> dict[str, Any]:
    _, db = cfg_db()
    db.set_plan_active(plan_id, body.active)
    return _latest(subject).response


@app.delete("/plans/{plan_id}", response_model=ForecastResponse)
def delete_plan(plan_id: str, subject: str) -> dict[str, Any]:
    _, db = cfg_db()
    db.delete_plan(plan_id)
    return _latest(subject).response


@app.get("/letter", response_model=LetterResponse)
def get_letter(subject: str, language: str | None = None) -> dict[str, Any]:
    from brokedate.narrate.letter import write_letter

    cfg, _ = cfg_db()
    b = _latest(subject)
    return write_letter(b, cfg, language)


@app.post("/chat")
def post_chat(body: ChatIn) -> StreamingResponse:
    """Stream a Gemma-written reply for an answer the browser already simulated. NDJSON events; see narrate/chat."""
    from brokedate.narrate.chat import ndjson, stream_reply

    cfg, _ = cfg_db()
    if not cfg.gemma.enabled:
        raise HTTPException(409, "Gemma is switched off in settings")
    facts = [f.model_dump() for f in body.facts]
    return StreamingResponse(ndjson(stream_reply(cfg, body.question, facts, body.template, body.verdict, body.language)),
                             media_type="application/x-ndjson")


@app.get("/backtest")
def get_backtest(subject: str) -> dict[str, Any]:
    from brokedate.cli import out_dir

    f = out_dir(subject) / "backtest" / subject / "summary.json"
    if not f.is_file():
        raise HTTPException(404, "no backtest yet")
    return json.loads(f.read_text(encoding="utf-8"))


@app.get("/settings")
def get_settings() -> dict[str, Any]:
    cfg, db = cfg_db()
    return {"broke_line_rupees": cfg.forecast.broke_line_rupees, "risk_tolerance": cfg.forecast.risk_tolerance,
            "n_futures": cfg.forecast.n_futures, "letter_language": cfg.gemma.letter_language,
            "gemma_enabled": cfg.gemma.enabled,
            "letters_enabled": (db.get_setting("ui:settings", {}) or {}).get("letters_enabled", True)}


@app.post("/settings")
def post_settings(body: SettingsIn) -> dict[str, Any]:
    cfg, db = cfg_db()
    cur = db.get_setting("ui:settings", {}) or {}
    cur.update({k: v for k, v in body.model_dump().items() if v is not None})
    db.set_setting("ui:settings", cur)
    _apply_settings(cfg, db)
    _invalidate()
    _state["last_bundle"] = {}
    return get_settings()


@app.post("/delete-all")
def delete_all() -> dict[str, Any]:
    cfg, db = cfg_db()
    db.close()
    _state.update(cfg=None, db=None, prepared={}, bundles={}, last_bundle={})
    if cfg.data_dir.exists():
        shutil.rmtree(cfg.data_dir)
    return {"ok": True}
