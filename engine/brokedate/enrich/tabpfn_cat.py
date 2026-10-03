"""TabPFN categorizer: the stage between the regex rules and Gemma (classification use of TabPFN).

The rules label most rows confidently. TabPFN learns from exactly those rows (no hand-made training set, nothing
leaves the laptop) and labels the leftovers it is sure about; only what it is unsure about goes on to Gemma or the
review queue. Features are numbers TabPFN can read: amount, direction, payment kind, counterparty type, and a
small hashed fingerprint of the narration's words (name, UPI handle, note), digits removed.
"""

from __future__ import annotations

import re
import zlib
from collections.abc import Callable
from typing import Any

import numpy as np

from brokedate.enrich.rules import COUNTERPARTIES, parse_narration

KINDS = ("UPI", "NEFT", "IMPS", "ATM", "POS", "REVERSAL", "CHARGES", "INTEREST", "OTHER")
HASH_DIMS = 24
_TOKEN = re.compile(r"[a-z]{3,}")


def _hash_bag(text: str) -> np.ndarray:
    """Signed feature hashing of word tokens and character trigrams; L2-normalised, digits ignored."""
    v = np.zeros(HASH_DIMS)
    words = _TOKEN.findall(text.lower())
    grams = [w[i:i + 3] for w in words for i in range(len(w) - 2)]
    for tok in words + grams:
        h = zlib.crc32(tok.encode())
        v[h % HASH_DIMS] += 1.0 if (h >> 16) & 1 else -1.0
    n = np.linalg.norm(v)
    return v / n if n else v


def featurize(rows: list[dict[str, Any]]) -> np.ndarray:
    out = []
    for r in rows:
        p = parse_narration(r["raw_narration"], r["direction"])
        kind = KINDS.index(p.kind) if p.kind in KINDS else len(KINDS) - 1
        cp = COUNTERPARTIES.index(p.counterparty) if p.counterparty in COUNTERPARTIES else len(COUNTERPARTIES)
        handle = p.vpa.split("@")[0] if p.vpa else ""
        text = " ".join([p.name, handle, p.note, "" if p.kind == "UPI" else r["raw_narration"]])
        head = [np.log1p(r["amount_paise"] / 100.0), 1.0 if r["direction"] == "DEBIT" else 0.0, float(kind), float(cp)]
        out.append(np.concatenate([head, _hash_bag(text)]))
    return np.asarray(out, dtype=float).reshape(len(rows), 4 + HASH_DIMS)


def classify_pending(labelled: list[dict[str, Any]], pending: list[dict[str, Any]],
                     make_clf: Callable[[], Any], min_prob: float, min_train: int) -> int:
    """Label rows in `pending` (in place) where TabPFN is at least `min_prob` sure. Returns how many it labelled."""
    train = [r for r in labelled if r.get("category")]
    if len(train) < min_train or not pending or len({r["category"] for r in train}) < 2:
        return 0
    clf = make_clf().fit(featurize(train), np.asarray([r["category"] for r in train]))
    P = clf.proba(featurize(pending))
    n = 0
    for r, row in zip(pending, P, strict=True):
        j = int(np.argmax(row))
        if row[j] >= min_prob:
            r.update(category=str(clf.classes_[j]), label_source="tabpfn", confidence=round(float(row[j]), 3))
            n += 1
    return n
