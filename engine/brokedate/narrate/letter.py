"""A weekly letter from a future that went broke. Gemma writes words; every number comes from the facts ledger
(SPEC 14.2)."""

from __future__ import annotations

import logging
import re
from datetime import timedelta
from typing import Any

import numpy as np

from brokedate.config import Config
from brokedate.enrich.gemma import OllamaClient, OllamaError
from brokedate.forecast.build import ForecastBundle
from brokedate.forecast.facts import Facts
from brokedate.narrate.templates import TEMPLATES, lang_key
from brokedate.narrate.tone import LANGUAGE_NOTES, TONE_RULES
from brokedate.narrate.validate import PLACEHOLDER, validate

log = logging.getLogger(__name__)


def pick_narrator(bundle: ForecastBundle) -> dict[str, Any]:
    """The broke future whose path is closest to the median broke path; if none went broke, the closest call."""
    paths = np.asarray(bundle.response["paths"]["balances_paise"], float)
    fb = np.asarray(bundle.response["paths"]["first_broke"])
    H = bundle.response["horizon_days"]
    broke = np.nonzero((fb >= 1) & (fb <= H))[0]
    if len(broke):
        med = np.median(paths[broke], axis=0)
        i = int(broke[np.argmin(np.abs(paths[broke] - med).sum(axis=1))])
        return {"index": i, "went_broke": True, "broke_day_index": int(fb[i])}
    i = int(np.argmin(paths.min(axis=1)))
    return {"index": i, "went_broke": False, "low_day_index": int(np.argmin(paths[i]))}


def letter_facts(bundle: ForecastBundle) -> tuple[Facts, dict[str, str], dict[str, Any]]:
    """Copy the forecast facts and add narrator-specific ones. Returns (facts, slot -> fact id, narrator)."""
    facts = Facts(dict(bundle.facts.items))
    r = bundle.response
    nar = pick_narrator(bundle)
    as_of = __import__("datetime").date.fromisoformat(r["as_of"])
    slots: dict[str, str] = {}
    for slot, kind in (("safe", "safe_to_spend"), ("n_make_it", "n_make_it"), ("n_broke", "n_broke"),
                       ("balance_now", "balance_now"), ("days_to_payday", "days_to_payday"),
                       ("similar_month", "similar_month"), ("runway", "runway_days")):
        fid = facts.by_kind(kind)
        if fid:
            slots[slot] = fid
    if nar["went_broke"]:
        d = as_of + timedelta(days=nar["broke_day_index"] - 1)
        slots["broke_day"] = facts.add("narrator_broke_day", str(d), "date", "the day the narrator's wallet ran out",
                                       "First day this simulated future's balance dipped below the broke line.",
                                       {"kind": "simulation_path", "path_index": nar["index"]})
    else:
        low = int(min(r["paths"]["balances_paise"][nar["index"]]))
        slots["narrator_low"] = facts.add("narrator_low", low, "paise", "the lowest the narrator's balance got",
                                          "Minimum balance on this simulated future's path.",
                                          {"kind": "simulation_path", "path_index": nar["index"]})
    plans = [p for p in r["plans"] if p["active"] and p.get("in_horizon")]
    if plans:
        top = max(plans, key=lambda p: p["day_cost"])
        slots["plan_cost"] = facts.by_kind("plan_day_cost", f"plan:{top['id']}") or ""
        nar["plan_name"] = top["name"]
    return facts, slots, nar


def _prompt(facts: Facts, slots: dict[str, str], nar: dict[str, Any], language: str, feedback: str | None,
            ) -> list[dict[str, str]]:
    allowed = {fid: facts.items[fid]["desc"] for fid in slots.values() if fid}
    lines = "\n".join(f"- {{{fid}}}: {desc}" for fid, desc in allowed.items())
    lk = lang_key(language)
    lang_note = LANGUAGE_NOTES.get(lk, f"Write in {language}.")
    situation = ("You went broke before payday." if nar["went_broke"]
                 else "You did not go broke, but it got close.")
    plan_note = f"The reader has a plan called '{nar['plan_name']}'.\n" if nar.get("plan_name") else ""
    system = (TONE_RULES + "\n" + lang_note + "\n\nHARD RULE: never write any number, digit, or number word "
              "(not in English, not in Bengali, not transliterated). Whenever you need a number or date, write the "
              "placeholder exactly as given, in curly braces, e.g. {f1}. Placeholders already include the ₹ sign "
              "and units, so never put ₹, Rs, rupees or taka next to them. 40 to 90 words. Plain text only, no "
              "greeting line with a name, no sign-off with a name.")
    user = (f"{situation}\n{plan_note}Facts you may reference (placeholders only):\n{lines}\n\n"
            "Write the letter now.")
    msgs = [{"role": "system", "content": system}, {"role": "user", "content": user}]
    if feedback:
        msgs.append({"role": "user", "content": f"Your last draft was rejected: {feedback}. Rewrite it."})
    return msgs


def render(text: str, facts: Facts) -> tuple[str, list[dict[str, Any]]]:
    """Replace placeholders with formatted values; also return segments for UI linking to the evidence drawer."""
    segs: list[dict[str, Any]] = []
    pos = 0
    out = []
    for m in PLACEHOLDER.finditer(text):
        if m.start() > pos:
            segs.append({"type": "text", "text": text[pos:m.start()]})
            out.append(text[pos:m.start()])
        fid = m.group(1)
        val = facts.items[fid]["text"]
        segs.append({"type": "fact", "fact_id": fid, "text": val})
        out.append(val)
        pos = m.end()
    if pos < len(text):
        segs.append({"type": "text", "text": text[pos:]})
        out.append(text[pos:])
    return "".join(out), segs


def template_letter(slots: dict[str, str], nar: dict[str, Any], language: str) -> str:
    t = TEMPLATES[lang_key(language)]
    key = "broke" if nar["went_broke"] and "broke_day" in slots else "fine"
    plan_clause = ""
    if nar.get("plan_name") and slots.get("plan_cost"):
        plan_clause = t["plan"].replace("{plan_name}", nar["plan_name"]).replace("{plan_cost}",
                                                                                  "{" + slots["plan_cost"] + "}")
    text = t[key].replace("{plan_clause}", plan_clause)
    for slot, fid in slots.items():
        text = text.replace("{" + slot + "}", "{" + fid + "}")
    # any slot the template wanted but the forecast lacks: drop the sentence fragment gracefully
    return re.sub(r"\{(?!f\d+\})[a-z_]+\}", "", text)


def write_letter(bundle: ForecastBundle, cfg: Config, language: str | None = None,
                 client: OllamaClient | None = None, seed: int | None = None) -> dict[str, Any]:
    language = language or cfg.gemma.letter_language
    facts, slots, nar = letter_facts(bundle)
    known = set(facts.items)
    attempts: list[dict[str, Any]] = []
    text: str | None = None
    if cfg.gemma.enabled:
        client = client or OllamaClient(cfg.gemma.ollama_url, cfg.gemma.model, cfg.gemma.timeout_s)
        feedback = None
        week_seed = seed if seed is not None else int(bundle.response["as_of"].replace("-", "")) // 7
        for i in range(cfg.gemma.letter_max_attempts):
            try:
                draft, _ = client.chat(_prompt(facts, slots, nar, language, feedback), temperature=0.8,
                                       seed=week_seed + i, num_predict=300)
            except OllamaError as e:
                attempts.append({"error": str(e)})
                break
            draft = draft.strip().strip('"')
            problems = validate(draft, known)
            attempts.append({"draft_chars": len(draft), "problems": problems})
            if not problems:
                text = draft
                break
            feedback = "; ".join(problems)
    fallback = text is None
    if text is None:
        text = template_letter(slots, nar, language)
    rendered, segs = render(text, facts)
    return {"language": language, "text_placeholders": text, "text_rendered": rendered, "segments": segs,
            "placeholders": sorted(set(PLACEHOLDER.findall(text))), "attempts": len(attempts),
            "attempt_log": attempts, "fallback_used": fallback, "narrator": nar,
            "facts": {fid: facts.items[fid] for fid in set(PLACEHOLDER.findall(text))},
            "model": cfg.gemma.model if not fallback else None}
