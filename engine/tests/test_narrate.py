from __future__ import annotations

import pytest

from brokedate.forecast.facts import Facts
from brokedate.narrate.letter import render, template_letter
from brokedate.narrate.templates import TEMPLATES
from brokedate.narrate.validate import validate

KNOWN = {"f1", "f2", "f3"}
OK = ("Bhai, ami tor future theke likhchi. Wallet {f2} e shesh hoye gelo, chai er glass ta khali. Tui ekhon {f1} "
      "porjonto khoroch korte parish ajke, tar beshi na. Movie ta ashole tor {f3} kheye nebe, bhebe dekhish. "
      "Chap nish na, amra shobai tor pashe achi, ektu dure theke hashchi.")


def test_accepts_clean_letter():
    assert validate(OK, KNOWN) == []


@pytest.mark.parametrize("bad", [
    OK + " 5",
    OK.replace("{f1}", "420"),
    OK + " ৫",                              # Bengali digit
    OK + " ৪২০ টাকা",
    OK.replace("chai", "two chai"),
    OK.replace("Movie", "Panch movie"),     # Benglish number word
    OK.replace("Movie", "পাঁচ movie"),       # Bengali number word
    OK.replace("{f3}", "{f9}"),             # unknown placeholder
    OK.replace("{f1}", "₹{f1}"),            # currency next to placeholder
    OK.replace("{f1}", "{f1} rupees"),
    "Too short {f1}.",
])
def test_rejects(bad):
    assert validate(bad, KNOWN)


def test_negation_noy_is_allowed():
    assert validate(OK.replace("tar beshi na", "tar beshi bhalo noy"), KNOWN) == []


def _facts():
    f = Facts()
    f.add("safe_to_spend", 42000, "paise", "safe", "x", {})
    f.add("n_make_it", 412, "futures", "n", "x", {})
    f.add("n_broke", 88, "futures", "b", "x", {})
    f.add("balance_now", 234000, "paise", "bal", "x", {})
    f.add("narrator_broke_day", "2026-10-18", "date", "bd", "x", {})
    f.add("plan_day_cost", 2.1, "days", "pc", "x", {})
    return f


@pytest.mark.parametrize("lang", list(TEMPLATES))
@pytest.mark.parametrize("broke", [True, False])
def test_templates_pass_validator(lang, broke):
    f = _facts()
    slots = {"safe": "f1", "n_make_it": "f2", "n_broke": "f3", "balance_now": "f4", "plan_cost": "f6"}
    if broke:
        slots["broke_day"] = "f5"
    text = template_letter(slots, {"went_broke": broke, "plan_name": "PVR Saturday"}, lang)
    assert validate(text, set(f.items), min_words=15) == [], text


def test_render_links_facts():
    f = _facts()
    out, segs = render("Safe {f1} and {f6}.", f)
    assert out == "Safe ₹420 and 2.1 days."
    assert [s["fact_id"] for s in segs if s["type"] == "fact"] == ["f1", "f6"]


# ---- chat (Gemma rephrases a simulated answer, streamed) ----

class _FakeChatClient:
    def __init__(self, pieces: list[str], models: list[str] | None = None) -> None:
        self.pieces = pieces
        self.models = models if models is not None else ["gemma3:1b"]

    def available_models(self) -> list[str]:
        return self.models

    def chat_stream(self, messages, temperature=0.6, seed=0, num_predict=200, model=None):  # noqa: ANN001
        import re

        body = messages[1]["content"]
        assert "{f1}" in body and not re.search(r"\d", re.sub(r"\{f\d+\}", "", body))
        yield from self.pieces


_FACTS = [{"id": "f1", "desc": "amount you can safely spend today"}, {"id": "f2", "desc": "chance of going broke"}]


def _run(pieces: list[str], models: list[str] | None = None) -> list[dict]:
    from brokedate.config import Config
    from brokedate.narrate.chat import stream_reply

    return list(stream_reply(Config(), "how much can I spend?", _FACTS, "You can spend up to {f1} today.", "yes",
                             "English", client=_FakeChatClient(pieces, models)))  # type: ignore[arg-type]


def test_chat_streams_and_accepts_placeholders() -> None:
    ev = _run(["Good news: ", "you can spend ", "{f1} today, ", "and the risk stays at {f2}."])
    assert ev[0] == {"type": "start", "model": "gemma3:1b"}
    assert [e["text"] for e in ev if e["type"] == "token"][2] == "{f1} today, "
    assert ev[-1]["type"] == "done" and ev[-1]["ok"] is True


def test_chat_cuts_stream_on_digit() -> None:
    ev = _run(["You can spend ", "₹860 today", " and more text that must never arrive"])
    assert ev[-1] == {"type": "done", "ok": False, "text": "You can spend ₹860 today", "problems": ["wrote a digit"]}
    assert not any(e.get("text", "").startswith(" and more") for e in ev if e["type"] == "token")


def test_chat_rejects_number_words_and_unknown_placeholders() -> None:
    ev = _run(["You can spend about five hundred, ", "see {f9}."])
    assert ev[-1]["ok"] is False and any("number words" in p for p in ev[-1]["problems"])
    assert any("unknown placeholders" in p for p in ev[-1]["problems"])


def test_chat_model_pick_prefers_small_on_low_ram(monkeypatch) -> None:  # noqa: ANN001
    import psutil

    from brokedate.config import Config
    from brokedate.narrate.chat import pick_chat_model

    class VM:
        total = 4 * 2**30

    monkeypatch.setattr(psutil, "virtual_memory", lambda: VM)
    assert pick_chat_model(Config(), ["gemma3:4b", "gemma3:1b:latest"]) == "gemma3:1b"
    VM.total = 16 * 2**30
    assert pick_chat_model(Config(), ["gemma3:4b", "gemma3:1b"]) == "gemma3:4b"
    assert pick_chat_model(Config(), ["llama3:8b"]) is None


def test_chat_reports_offline_gemma() -> None:
    from brokedate.config import Config
    from brokedate.enrich.gemma import OllamaError
    from brokedate.narrate.chat import stream_reply

    class Down(_FakeChatClient):
        def available_models(self) -> list[str]:
            raise OllamaError("connection refused")

    ev = list(stream_reply(Config(), "q", _FACTS, "t {f1}", None, "English", client=Down([])))  # type: ignore[arg-type]
    assert ev == [{"type": "error", "message": "Gemma is offline (OllamaError)"}]


def test_chat_guard_waits_for_placeholder_to_close() -> None:
    ev = _run(["You can spend up to {", "f", "1", "} today."])
    assert ev[-1]["ok"] is True and ev[-1]["text"] == "You can spend up to {f1} today."


def test_chat_rejects_reply_that_drops_a_fact() -> None:
    from brokedate.config import Config
    from brokedate.narrate.chat import stream_reply

    ev = list(stream_reply(Config(), "when?", _FACTS, "{f1} of them run out, around {f2}.", None, "English",
                           client=_FakeChatClient(["Bhai, you will run out around {f2}, sorry."])))  # type: ignore[arg-type]
    assert ev[-1]["ok"] is False and "left out facts ['f1']" in ev[-1]["problems"]


def test_chat_rejects_repeated_unit() -> None:
    ev = _run(["You can spend {f1} today; risk is {f2} percent."])
    assert ev[-1]["ok"] is False and "unit word repeated after a placeholder" in ev[-1]["problems"]
