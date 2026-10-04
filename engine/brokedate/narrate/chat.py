"""Chat replies, generated live by Gemma on this laptop. The browser has already rerun the TabPFN futures for the
question and sends the answer as a checked template reply ({fN} placeholders the browser fills in).

Gemma's job is the friend part: one short reaction line in the user's language, streamed token by token, followed
by the checked answer word for word. Gemma never states a fact. We first asked it to reword the whole answer
around the placeholders; measured on the fixed question set (`brokedate eval-chat`), gemma3:1b passed the checks on
only a small share of replies, dropping numbers, inventing days and stringing placeholders into nonsense. So the
facts stay in the checked sentences, and the reaction is checked for what it must never do: digits, number words,
placeholders, invented days, or contradicting the verdict. A rejected reaction is dropped; the answer still shows."""

from __future__ import annotations

import json
import re
from collections.abc import Iterator
from typing import Any

from brokedate.config import Config
from brokedate.enrich.gemma import OllamaClient, OllamaError, fits
from brokedate.narrate.templates import lang_key
from brokedate.narrate.validate import BLOCKLIST, PLACEHOLDER, WORD, has_digit

# Kept short on purpose: on CPU, prompt processing dominates time-to-first-token, and gemma3's sliding-window
# attention means Ollama cannot reuse a cached prefix across different questions.
CHAT_TONE = (
    "You are Broke Date, a warm, funny older-cousin money buddy for a Kolkata college student. Never shame, mock "
    "or lecture; be kind and specific to the question. Write ONE short reaction (at most twelve words) to the answer below, like a friend texting first. "
    "The answer itself is shown right after your line, so do not repeat it: no amounts, numbers, dates or days. "
    "Match the verdict if one is given. "
)
SHORT_LANG = {
    "benglish": "Write in Benglish: Bengali in Latin letters mixed with English, like Kolkata students text.",
    "english": "Write in casual Indian English.",
    "bengali": "Write in Bengali script, casual and warm.",
}

# Lightest first: the default must never push a student laptop into swapping or crashing (see enrich.gemma).
CHAT_PREFERENCE = ("gemma3:1b", "gemma3:270m", "gemma2:2b", "gemma3:4b")
MAX_REACTION_WORDS = 18
# small models add emojis even when told not to; they are removed, not argued with
_EMOJI = re.compile("[\U0001f000-\U0001faff☀-➿️‍]+")
# day words the reaction may use only if the question already did ("you'll get it on Friday" was invented)
_DAY_WORDS = re.compile(r"\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|tonight|"
                        r"yesterday|weekend|january|february|march|april|may|june|july|august|september|october|"
                        r"november|december)\b", re.I)
# a cheerful "go for it" under a risky verdict (or "nah" under a comfortable one) would contradict the checked answer
_SAYS_YES = re.compile(r"\b(?:go for it|sure thing|no problem|easy|totally|absolutely|of course|treat yourself|"
                       r"why not|chill)\b", re.I)
_SAYS_NO = re.compile(r"\b(?:nope|nah|can'?t|cannot|don'?t|hold off|skip it|risky|sorry)\b", re.I)


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


def chat_messages(question: str, template: str, verdict: str | None, language: str) -> list[dict[str, str]]:
    """Gemma sees the answer with its numbers blanked out: it reacts to the meaning and has nothing to copy."""
    lang_note = SHORT_LANG.get(lang_key(language), f"Write in {language}.")
    answer = PLACEHOLDER.sub("[number]", template)
    user = (f"Question: {question}\n"
            + (f"Verdict: {verdict}\n" if verdict else "")
            + f"Answer (shown after your line): {answer}\n"
            + "Your one-line reaction:")
    return [{"role": "system", "content": CHAT_TONE + lang_note + " No emojis, no quotes."},
            {"role": "user", "content": user}]


def warm_messages(language: str) -> list[dict[str, str]]:
    """A real-shaped request, so warming loads the model and its compute graph for this prompt size."""
    return chat_messages("How much can I spend today?", "You can spend {f1} today.", None, language)


def check_reaction(text: str, question: str, verdict: str | None) -> list[str]:
    """What a reaction must never do. Empty = accepted."""
    problems: list[str] = []
    if has_digit(text):
        problems.append("wrote a digit")
    bad = sorted({w.lower() for w in WORD.findall(text)} & BLOCKLIST)
    if bad:
        problems.append(f"contains number words {bad}")
    if any(c in text for c in "{}[]"):
        problems.append("tried to repeat a number")
    allowed = {w.lower() for w in _DAY_WORDS.findall(question)}
    invented = sorted({w.lower() for w in _DAY_WORDS.findall(text)} - allowed)
    if invented:
        problems.append(f"invented a day {invented}")
    v = (verdict or "").lower()
    if (v.startswith("risky") or "tight" in v) and _SAYS_YES.search(text):
        problems.append("contradicted the verdict")
    if v.startswith("comfortable") and _SAYS_NO.search(text):
        problems.append("contradicted the verdict")
    n = len(text.split())
    if n < 2 or n > MAX_REACTION_WORDS:
        problems.append(f"length {n} words (want 2 to {MAX_REACTION_WORDS})")
    return problems


def stream_reply(cfg: Config, question: str, facts: list[dict[str, str]], template: str, verdict: str | None,
                 language: str | None = None, client: OllamaClient | None = None, model: str | None = None,
                 ) -> Iterator[dict[str, Any]]:
    """Yield events: {"type": "start", "model"}, {"type": "token", "text"}, {"type": "done", "ok", "text",
    "problems"} or {"type": "error", "message"}. On ok, text is Gemma's reaction + the checked answer (with {fN}
    placeholders the browser fills in). `facts` is accepted for the API shape; Gemma never needs them."""
    del facts
    language = language or cfg.gemma.letter_language
    client = client or OllamaClient(cfg.gemma.ollama_url, cfg.gemma.model, cfg.gemma.timeout_s)
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
        for raw in client.chat_stream(chat_messages(question, template, verdict, language),
                                      temperature=0.6, num_predict=40, model=model):
            piece = _EMOJI.sub("", raw)
            buf += piece
            if has_digit(buf):  # live guard: a digit ends the stream immediately
                yield {"type": "done", "ok": False, "text": buf, "problems": ["wrote a digit"]}
                return
            if "\n" in buf.strip():  # one line only; a second line is the model rambling on
                buf = buf.strip().split("\n", 1)[0]
                break
            yield {"type": "token", "text": piece}
    except OllamaError as e:
        yield {"type": "error", "message": str(e)}
        return
    text = re.sub(r"\s+([,.!?])", r"\1", re.sub(r"\s{2,}", " ", buf)).strip().strip('"“”')
    problems = check_reaction(text, question, verdict)
    if problems:
        yield {"type": "done", "ok": False, "text": text, "problems": problems}
        return
    yield {"type": "token", "text": f" {template}"}
    yield {"type": "done", "ok": True, "text": f"{text} {template}", "problems": []}


def ndjson(events: Iterator[dict[str, Any]]) -> Iterator[bytes]:
    for ev in events:
        yield (json.dumps(ev, ensure_ascii=False) + "\n").encode()


__all__ = ["PLACEHOLDER", "chat_messages", "check_reaction", "ndjson", "pick_chat_model", "stream_reply"]
