"""Enrichment: rules -> cache -> Gemma -> review queue (SPEC 7)."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

from brokedate.config import Config
from brokedate.db import DB
from brokedate.enrich.gemma import OllamaClient, OllamaError, label_batch
from brokedate.enrich.rules import normalize_key, parse_narration

log = logging.getLogger(__name__)


@dataclass
class EnrichStats:
    total: int = 0
    by_rules: int = 0
    by_cache: int = 0
    by_gemma: int = 0
    needs_review: int = 0
    gemma_error: str | None = None
    review_ids: list[str] = field(default_factory=list)


def label_rows(rows: list[dict], db: DB, cfg: Config, use_gemma: bool | None = None) -> EnrichStats:
    """rows: dicts with id, raw_narration, direction, amount_paise. Mutates rows with labels."""
    st = EnrichStats(total=len(rows))
    use_gemma = cfg.gemma.enabled if use_gemma is None else use_gemma
    pending: list[dict] = []
    for r in rows:
        p = parse_narration(r["raw_narration"], r["direction"])
        r["merchant"], r["counterparty"] = p.merchant, p.counterparty
        r["_parsed_kind"] = p.kind
        if p.category is not None and p.confidence >= cfg.gemma.confidence_threshold:
            r.update(category=p.category, label_source="rule", confidence=p.confidence)
            st.by_rules += 1
            continue
        cached = db.cache_get(normalize_key(r["raw_narration"]) + "|" + r["direction"])
        if cached and cached["category"]:
            r.update(merchant=cached["merchant"], category=cached["category"], counterparty=cached["counterparty"],
                     label_source=cached["source"], confidence=cached["confidence"])
            st.by_cache += 1
            continue
        r.update(category=p.category, label_source="rule", confidence=p.confidence)
        pending.append(r)

    if pending and use_gemma:
        client = OllamaClient(cfg.gemma.ollama_url, cfg.gemma.model, cfg.gemma.timeout_s)
        try:
            client.ensure_model()
            # dedupe by cache key so each distinct narration shape is asked once
            groups: dict[str, list[dict]] = {}
            for r in pending:
                groups.setdefault(normalize_key(r["raw_narration"]) + "|" + r["direction"], []).append(r)
            keys = list(groups)
            bs = cfg.gemma.batch_size
            for s in range(0, len(keys), bs):
                chunk = keys[s:s + bs]
                reps = [groups[k][0] for k in chunk]
                labels = label_batch(client, [(x["raw_narration"], x["direction"], x["amount_paise"]) for x in reps],
                                     cfg.gemma.temperature)
                for k, lab in zip(chunk, labels, strict=True):
                    if lab is None:
                        continue
                    db.cache_put(k, lab.merchant, lab.category, lab.counterparty, "gemma", lab.confidence)
                    for r in groups[k]:
                        r.update(merchant=lab.merchant, category=lab.category, counterparty=lab.counterparty,
                                 label_source="gemma", confidence=lab.confidence)
        except OllamaError as e:
            st.gemma_error = str(e)
            log.warning("Gemma unavailable, rows go to review: %s", e)
    for r in pending:
        if r.get("label_source") == "gemma":
            st.by_gemma += 1
        if r.get("category") is None or (r.get("confidence") or 0) < cfg.gemma.confidence_threshold:
            st.needs_review += 1
            st.review_ids.append(r["id"])
            if r.get("category") is None:
                r["category"] = "other"
                r["label_source"] = "unlabelled"
    return st
