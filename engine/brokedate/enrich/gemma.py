"""Gemma via local Ollama: schema-locked batch categorizer (SPEC 7.3).

Few-shot examples are built from SIMULATED narrations only. Never send real narrations anywhere but the
local Ollama on 127.0.0.1.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any

import httpx

from brokedate.enrich.rules import CATEGORIES, COUNTERPARTIES

log = logging.getLogger(__name__)

CATEGORY_HELP = {
    "food_delivery": "app food delivery (Swiggy, Zomato)",
    "campus_food": "tea, canteen, street food, small snacks bought in person",
    "groceries_snacks": "groceries or snacks from stores or quick-commerce apps",
    "transport": "toto/e-rickshaw, auto, bus, metro, cab, bike taxi; drivers are often paid on personal UPI IDs",
    "outing": "movies, cafes, malls, games zones, eating out with friends",
    "shopping": "clothes, shoes, gadgets, online shopping",
    "recharge_bills": "mobile recharge, data packs, bills",
    "gaming": "game top-ups, app store purchases",
    "education": "xerox, stationery, books, courses, fees",
    "transfer_to_person": "money sent to a friend or family member (splits, loans, gifts)",
    "transfer_from_person": "money received from a person who is not the regular allowance sender",
    "allowance": "the regular monthly allowance credit",
    "refund": "refunds and reversals",
    "cash_withdrawal": "ATM cash",
    "other": "anything else (salon, charges, unclear)",
}

FEW_SHOT = [  # simulated narrations only
    ("UPI-BABLU SK-bablusk24@ybl-SBIN0016209-602273575436-Payment", "DEBIT", 1800,
     {"merchant": "Bablu Sk (toto driver)", "category": "transport", "counterparty": "person", "confidence": 0.7}),
    ("UPI-SAYAN MONDAL-sayan.mondal@okaxis-ICIC0DC0099-686510505038-Split", "DEBIT", 15000,
     {"merchant": "Sayan Mondal", "category": "transfer_to_person", "counterparty": "person", "confidence": 0.9}),
    ("UPI-SWIGGY-swiggy.payu@hdfcbank-HDFC0MERUPI-512479957284-Payment", "DEBIT", 23400,
     {"merchant": "Swiggy", "category": "food_delivery", "counterparty": "merchant", "confidence": 0.98}),
    ("UPI-MAA TARA TEA STALL-taratea87@ybl-HDFC0MERUPI-636248020515-Payment", "DEBIT", 1500,
     {"merchant": "Maa Tara Tea Stall", "category": "campus_food", "counterparty": "merchant", "confidence": 0.9}),
    ("UPI-RIK BANERJEE-rikb@ybl-UTIB0000553-610055512345-Return later", "CREDIT", 30000,
     {"merchant": "Rik Banerjee", "category": "transfer_from_person", "counterparty": "person", "confidence": 0.9}),
    ("UPI-GOPAL BAURI-gopalb51@ybl-YESB0YBLUPI-623456789012-Payment", "DEBIT", 2000,
     {"merchant": "Gopal Bauri (likely driver/vendor)", "category": "transport", "counterparty": "person",
      "confidence": 0.55}),
    ("UPI-GOOGLE PLAY-playstore@axisbank-UTIB0000553-645678901234-Google Play", "DEBIT", 9900,
     {"merchant": "Google Play", "category": "gaming", "counterparty": "merchant", "confidence": 0.9}),
    ("UPI-LOCAL GARMENTS-garments42@ybl-SBIN0016209-656789012345-Payment", "DEBIT", 45000,
     {"merchant": "Local Garments", "category": "shopping", "counterparty": "merchant", "confidence": 0.85}),
]

ITEM_SCHEMA = {
    "type": "object",
    "properties": {
        "i": {"type": "integer"},
        "merchant": {"type": "string"},
        "category": {"type": "string", "enum": list(CATEGORIES)},
        "counterparty": {"type": "string", "enum": list(COUNTERPARTIES)},
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
    },
    "required": ["i", "merchant", "category", "counterparty", "confidence"],
}
BATCH_SCHEMA = {"type": "object", "properties": {"items": {"type": "array", "items": ITEM_SCHEMA}},
                "required": ["items"]}


@dataclass
class Label:
    merchant: str
    category: str
    counterparty: str
    confidence: float


class OllamaError(RuntimeError):
    pass


class OllamaClient:
    def __init__(self, url: str, model: str, timeout_s: float = 240.0) -> None:
        self.url = url.rstrip("/")
        self.model = model
        self.timeout = timeout_s

    def available_models(self) -> list[str]:
        try:
            r = httpx.get(f"{self.url}/api/tags", timeout=5)
            r.raise_for_status()
        except httpx.HTTPError as e:
            raise OllamaError(f"Ollama not reachable at {self.url}: {e}") from e
        return [m["name"] for m in r.json().get("models", [])]

    def ensure_model(self) -> None:
        models = self.available_models()
        if self.model not in models and f"{self.model}:latest" not in models:
            raise OllamaError(f"Gemma model {self.model!r} not found in Ollama (have: {models}). "
                              f"Run: ollama pull {self.model}")

    def chat(self, messages: list[dict[str, str]], fmt: Any = None, temperature: float = 0.0,
             seed: int = 0, num_predict: int = 2048) -> tuple[str, dict[str, Any]]:
        body: dict[str, Any] = {"model": self.model, "messages": messages, "stream": False,
                                "options": {"temperature": temperature, "seed": seed, "num_predict": num_predict}}
        if fmt is not None:
            body["format"] = fmt
        try:
            r = httpx.post(f"{self.url}/api/chat", json=body, timeout=self.timeout)
            r.raise_for_status()
        except httpx.HTTPError as e:
            raise OllamaError(str(e)) from e
        data = r.json()
        return data["message"]["content"], data


def _prompt(rows: list[tuple[str, str, int]]) -> list[dict[str, str]]:
    cats = "\n".join(f"- {k}: {v}" for k, v in CATEGORY_HELP.items())
    shots = "\n".join(f"{json.dumps({'narration': n, 'direction': d, 'amount_rupees': a / 100})} -> {json.dumps(o)}"
                      for n, d, a, o in FEW_SHOT)
    system = (
        "You label Indian bank statement lines for a student's personal budget app. For each line return the "
        "merchant (clean human name), one category, the counterparty type and your confidence 0..1. "
        "Use low confidence (<0.6) when a payment to a personal UPI ID could be either a friend or a "
        "driver/vendor and the note does not say.\nCategories:\n" + cats + "\nExamples:\n" + shots
    )
    items = [{"i": i, "narration": n, "direction": d, "amount_rupees": a / 100} for i, (n, d, a) in enumerate(rows)]
    user = "Label these lines. Return {\"items\": [...]} with one entry per input index.\n" + json.dumps(items)
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def label_batch(client: OllamaClient, rows: list[tuple[str, str, int]], temperature: float = 0.0
                ) -> list[Label | None]:
    content, _ = client.chat(_prompt(rows), fmt=BATCH_SCHEMA, temperature=temperature)
    return parse_batch_response(content, len(rows))


def parse_batch_response(content: str, n: int) -> list[Label | None]:
    """Validate a model response against the schema; anything invalid becomes None (-> review)."""
    out: list[Label | None] = [None] * n
    try:
        data = json.loads(content)
        items = data["items"]
    except (json.JSONDecodeError, KeyError, TypeError):
        return out
    for it in items if isinstance(items, list) else []:
        try:
            i = int(it["i"])
            cat, cp = it["category"], it["counterparty"]
            conf = float(it["confidence"])
            if not (0 <= i < n) or cat not in CATEGORIES or cp not in COUNTERPARTIES or not 0 <= conf <= 1:
                continue
            out[i] = Label(str(it["merchant"])[:80], cat, cp, conf)
        except (KeyError, TypeError, ValueError):
            continue
    return out
