"""Chat replies, generated live by Gemma on this laptop. The browser has already rerun the TabPFN futures for the
question and sends the answer as facts ({fN} placeholders with plain descriptions) plus a checked template reply.
Gemma rephrases it as a friend would, streaming token by token. Same contract as the letter (SPEC 14.2): Gemma
never sees or writes a number. The stream is cut the moment a digit appears; the finished text must pass the
letter validator, otherwise the UI keeps the template reply."""

from __future__ import annotations

import json
import re
from collections.abc import Iterator
from typing import Any

from brokedate.config import Config
from brokedate.enrich.gemma import OllamaClient, OllamaError, fits
from brokedate.narrate.templates import lang_key
from brokedate.narrate.validate import PLACEHOLDER, has_digit, validate

# Kept short on purpose: on CPU, prompt processing dominates time-to-first-token, and gemma3's sliding-window
# attention means Ollama cannot reuse a cached prefix across different questions.
CHAT_TONE = (
    "You are Broke Date, a warm, funny older-cousin money buddy for a Kolkata college student. Never shame or "
    "lecture. Reply in one to three short sentences. If a verdict is given, open with it; if not, do not judge. "
    "Use only the facts in the plain answer and keep their meaning. "
)
SHORT_LANG = {
    "benglish": "Write in Benglish: Bengali in Latin letters mixed with English, like Kolkata students text.",
    "english": "Write in casual Indian English.",
    "bengali": "Write in Bengali script, casual and warm.",
}

# Lightest first: the default must never push a student laptop into swapping or crashing (see enrich.gemma).
CHAT_PREFERENCE = ("gemma3:1b", "gemma3:270m", "gemma2:2b", "gemma3:4b")
_PARTIAL_TAIL = re.compile(r"\{f?\d*$")
_UNIT_AFTER = re.compile(r"\{f\d+\}\s*(?:days?|din|%|percent|futures?|months?)\b", re.I)


def pick_chat_model(cfg: Config, installed: list[str], requested: str | None = None) -> str | None:
    """The model to use for a reply. "auto" is the lightest installed Gemma. A heavier model is used only when it
    was asked for (here or in config) AND enough RAM is free right now; otherwise we fall back to the lightest."""
    have = {m.removesuffix(":latest") for m in installed}
    want = requested or (cfg.gemma.chat_model if cfg.gemma.chat_model != "auto" else None)
    if want and want in have and fits(want):
        return want
    for tag in CHAT_PREFERENCE:
        if tag in have and (tag != "gemma3:4b" or fits(tag)):
            return tag
    return None


def chat_messages(question: str, facts: list[dict[str, str]], template: str, verdict: str | None,
                  language: str) -> list[dict[str, str]]:
    lk = lang_key(language)
    lang_note = SHORT_LANG.get(lk, f"Write in {language}.")
    kinds = ", ".join(f"{{{f['id']}}} {f['desc'].split(',')[0]}" for f in facts)
    system = (CHAT_TONE + lang_note + " Never write digits or number words: copy placeholders like {f1} exactly; "
              "they already include ₹, % and units. No greeting, no emojis.")
    user = (f"Question: {question}\n"
            + (f"Verdict: {verdict}\n" if verdict else "")
            + f"Plain answer: {template}\n"
            + (f"Placeholders: {kinds}\n" if kinds else "")
            + "Say it in your own words, like a friend texting back.")
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def warm_messages(language: str) -> list[dict[str, str]]:
    """A real-shaped request, so warming loads the model and its compute graph for this prompt size."""
    return chat_messages("How much can I spend today?", [{"id": "f1", "desc": "amount"}], "You can spend {f1}.",
                         None, language)


def stream_reply(cfg: Config, question: str, facts: list[dict[str, str]], template: str, verdict: str | None,
                 language: str | None = None, client: OllamaClient | None = None, model: str | None = None,
                 ) -> Iterator[dict[str, Any]]:
    """Yield events: {"type": "start", "model"}, {"type": "token", "text"}, {"type": "done", "ok", "text",
    "problems"} or {"type": "error", "message"}. Text uses {fN} placeholders; the browser fills in values."""
    language = language or cfg.gemma.letter_language
    client = client or OllamaClient(cfg.gemma.ollama_url, cfg.gemma.model, cfg.gemma.timeout_s)
    known = {f["id"] for f in facts}
    try:
        requested = model
        model = pick_chat_model(cfg, client.available_models(), requested)
    except OllamaError as e:
        yield {"type": "error", "message": f"Gemma is offline ({e.__class__.__name__})"}
        return
    if model is None:
        yield {"type": "error", "message": "No Gemma model installed. Run: ollama pull gemma3:1b"}
        return
    start: dict[str, Any] = {"type": "start", "model": model}
    if requested and requested != model:
        start["note"] = f"{requested} needs more free memory than this laptop has right now, so {model} wrote this."
    yield start
    buf = ""
    try:
        for piece in client.chat_stream(chat_messages(question, facts, template, verdict, language),
                                        temperature=0.35, num_predict=160, model=model):
            buf += piece
            # live guard: a digit anywhere outside a placeholder ends the stream immediately
            # (an unfinished placeholder at the very end, e.g. "{f1", is not a digit yet)
            if has_digit(_PARTIAL_TAIL.sub("", buf)):
                yield {"type": "done", "ok": False, "text": buf, "problems": ["wrote a digit"]}
                return
            yield {"type": "token", "text": piece}
    except OllamaError as e:
        yield {"type": "error", "message": str(e)}
        return
    text = buf.strip().strip('"')
    problems = validate(text, known, min_words=4, max_words=80)
    if not facts:
        problems = [p for p in problems if p != "no facts referenced"]
    # placeholders already carry their unit ("0.7 days", "5%"); a repeated unit reads "0.7 days days"
    if _UNIT_AFTER.search(text):
        problems.append("unit word repeated after a placeholder")
    # coverage: dropping a number changes the meaning ("sixteen of five hundred run out" -> "you'll run out")
    missing = sorted(set(PLACEHOLDER.findall(template)) - set(PLACEHOLDER.findall(text)))
    if missing:
        problems.append(f"left out facts {missing}")
    yield {"type": "done", "ok": not problems, "text": text, "problems": problems}


def ndjson(events: Iterator[dict[str, Any]]) -> Iterator[bytes]:
    for ev in events:
        yield (json.dumps(ev, ensure_ascii=False) + "\n").encode()


__all__ = ["PLACEHOLDER", "chat_messages", "ndjson", "pick_chat_model", "stream_reply"]
