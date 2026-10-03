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

import psutil

from brokedate.config import Config
from brokedate.enrich.gemma import OllamaClient, OllamaError
from brokedate.narrate.templates import lang_key
from brokedate.narrate.tone import LANGUAGE_NOTES
from brokedate.narrate.validate import PLACEHOLDER, has_digit, validate

CHAT_TONE = """\
You are Broke Date, a money buddy for a college student in Kolkata. You talk like a kind older cousin: warm,
direct, a little funny, never preachy. Never shame, never moralize, never lecture about saving.
Answer the question in one to three short sentences. Lead with the answer (yes / tight / no, or the number).
Use ONLY the facts given. Do not add new facts, advice or numbers that are not in the facts.
"""

CHAT_PREFERENCE = ("gemma3:4b", "gemma3:1b", "gemma3:270m", "gemma2:2b")
_PARTIAL_TAIL = re.compile(r"\{f?\d*$")


def pick_chat_model(cfg: Config, installed: list[str]) -> str | None:
    """Choose the Gemma that this machine can run quickly. 4b needs ~8 GB RAM; 1b runs on low-end laptops."""
    have = {m.removesuffix(":latest") for m in installed}
    if cfg.gemma.chat_model != "auto":
        return cfg.gemma.chat_model if cfg.gemma.chat_model in have else None
    ram_gb = psutil.virtual_memory().total / 2**30
    for tag in CHAT_PREFERENCE:
        if tag == "gemma3:4b" and ram_gb < 7.5:
            continue
        if tag in have:
            return tag
    gemmas = sorted(m for m in have if m.startswith("gemma"))
    return gemmas[0] if gemmas else None


def chat_messages(question: str, facts: list[dict[str, str]], template: str, verdict: str | None,
                  language: str) -> list[dict[str, str]]:
    lk = lang_key(language)
    lang_note = LANGUAGE_NOTES.get(lk, f"Write in {language}.")
    lines = "\n".join(f"- {{{f['id']}}}: {f['desc']}" for f in facts)
    system = (CHAT_TONE + lang_note + "\n\nHARD RULE: never write any digit, number, date or number word "
              "(not in English, not in Bengali, not transliterated). Whenever you need a number, amount, "
              "percentage or date, write its placeholder exactly as given, in curly braces, e.g. {f1}. "
              "Placeholders already include ₹, % and units, so never put ₹, Rs, rupees, % or 'days' next to them. "
              "Plain text only. No greeting, no sign-off, no emojis, under sixty words.")
    user = (f"Question: {question}\n"
            + (f"Verdict from the simulation: {verdict}\n" if verdict else "")
            + (f"Facts (placeholders only):\n{lines}\n" if lines else "No numeric facts for this question.\n")
            + f"A correct but plain reply, for reference only: {template}\n\n"
            "Say the same thing in your own words, like a friend texting back. Do not copy the reference sentence. "
            "Write your reply now.")
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]




def stream_reply(cfg: Config, question: str, facts: list[dict[str, str]], template: str, verdict: str | None,
                 language: str | None = None, client: OllamaClient | None = None) -> Iterator[dict[str, Any]]:
    """Yield events: {"type": "start", "model"}, {"type": "token", "text"}, {"type": "done", "ok", "text",
    "problems"} or {"type": "error", "message"}. Text uses {fN} placeholders; the browser fills in values."""
    language = language or cfg.gemma.letter_language
    client = client or OllamaClient(cfg.gemma.ollama_url, cfg.gemma.model, cfg.gemma.timeout_s)
    known = {f["id"] for f in facts}
    try:
        model = pick_chat_model(cfg, client.available_models())
    except OllamaError as e:
        yield {"type": "error", "message": f"Gemma is offline ({e.__class__.__name__})"}
        return
    if model is None:
        yield {"type": "error", "message": "No Gemma model installed. Run: ollama pull gemma3:1b"}
        return
    yield {"type": "start", "model": model}
    buf = ""
    try:
        for piece in client.chat_stream(chat_messages(question, facts, template, verdict, language),
                                        temperature=0.6, num_predict=160, model=model):
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
    yield {"type": "done", "ok": not problems, "text": text, "problems": problems}


def ndjson(events: Iterator[dict[str, Any]]) -> Iterator[bytes]:
    for ev in events:
        yield (json.dumps(ev, ensure_ascii=False) + "\n").encode()


__all__ = ["PLACEHOLDER", "chat_messages", "ndjson", "pick_chat_model", "stream_reply"]
