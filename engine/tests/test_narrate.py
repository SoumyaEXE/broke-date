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


# ---- chat (Gemma reacts in one line; the checked answer follows verbatim) ----

class _FakeChatClient:
    def __init__(self, pieces: list[str], models: list[str] | None = None) -> None:
        self.pieces = pieces
        self.models = models if models is not None else ["gemma3:1b"]

    def available_models(self) -> list[str]:
        return self.models

    def chat_stream(self, messages, temperature=0.6, seed=0, num_predict=200, model=None):  # noqa: ANN001
        import re

        body = messages[1]["content"]
        assert not re.search(r"\d|\{f", body)  # Gemma sees no numbers and no placeholders to copy
        yield from self.pieces


_FACTS = [{"id": "f1", "desc": "amount you can safely spend today"}, {"id": "f2", "desc": "chance of going broke"}]
_TPL = "You can spend up to {f1} today. Risk stays at {f2}."
_YES = "comfortable: yes, they can afford it"


def _run(pieces: list[str], models: list[str] | None = None, verdict: str | None = _YES,
         question: str = "how much can I spend?") -> list[dict]:
    from brokedate.config import Config
    from brokedate.narrate.chat import stream_reply

    return list(stream_reply(Config(), question, _FACTS, _TPL, verdict, "English",
                             client=_FakeChatClient(pieces, models)))  # type: ignore[arg-type]


def test_chat_streams_reaction_then_the_checked_answer_verbatim() -> None:
    ev = _run(["Good news, ", "bhai!"])
    assert ev[0] == {"type": "start", "model": "gemma3:1b"}
    assert [e["text"] for e in ev if e["type"] == "token"] == ["Good news, ", "bhai!", f" {_TPL}"]
    assert ev[-1] == {"type": "done", "ok": True, "text": f"Good news, bhai! {_TPL}", "problems": []}


def test_chat_cuts_stream_on_digit() -> None:
    ev = _run(["You can spend ", "₹860 today", " and more text that must never arrive"])
    assert ev[-1] == {"type": "done", "ok": False, "text": "You can spend ₹860 today", "problems": ["wrote a digit"]}
    assert not any(e.get("text", "").startswith(" and more") for e in ev if e["type"] == "token")


def test_chat_rejects_number_words_and_placeholders() -> None:
    ev = _run(["About five hundred left, see {f1}."])
    assert ev[-1]["ok"] is False and any("number words" in p for p in ev[-1]["problems"])
    assert "tried to repeat a number" in ev[-1]["problems"]


def test_chat_rejects_an_invented_day_but_allows_the_questions_own() -> None:
    assert "invented a day ['friday']" in _run(["Save some for Friday, yaar."])[-1]["problems"]
    assert _run(["Friday plans sorted, yaar."], question="movie on Friday?")[-1]["ok"] is True


def test_chat_rejects_a_reaction_that_contradicts_the_verdict() -> None:
    assert "contradicted the verdict" in _run(["Go for it, treat yourself!"], verdict="risky: better to hold off")[-1]["problems"]
    assert "contradicted the verdict" in _run(["Nah, hold off on that."])[-1]["problems"]
    assert _run(["Hmm, this is a stretch."], verdict="doable but tight")[-1]["ok"] is True


def test_chat_keeps_only_the_first_line() -> None:
    ev = _run(["Arre wah, sorted!\n", "Also here is a long ramble"])
    assert ev[-1]["ok"] is True and ev[-1]["text"] == f"Arre wah, sorted! {_TPL}"
class _VM:
    available = 2 * 2**30


def test_chat_model_defaults_to_lightest_and_respects_free_ram(monkeypatch) -> None:  # noqa: ANN001
    import psutil

    from brokedate.config import Config
    from brokedate.narrate.chat import pick_chat_model

    monkeypatch.setattr(psutil, "virtual_memory", lambda: _VM)
    _VM.available = 12 * 2**30
    assert pick_chat_model(Config(), ["gemma3:4b", "gemma3:1b:latest"]) == "gemma3:1b"  # auto = lightest, always
    assert pick_chat_model(Config(), ["gemma3:4b", "gemma3:1b"], "gemma3:4b") == "gemma3:4b"  # asked + fits
    _VM.available = 3 * 2**30
    assert pick_chat_model(Config(), ["gemma3:4b", "gemma3:1b"], "gemma3:4b") == "gemma3:1b"  # asked, no room
    assert pick_chat_model(Config(), ["gemma3:4b"]) is None  # only a heavy model and no room: skip Gemma
    assert pick_chat_model(Config(), ["llama3:8b"]) is None


def test_ollama_client_never_loads_a_model_that_does_not_fit(monkeypatch) -> None:  # noqa: ANN001
    import psutil
    import pytest

    from brokedate.enrich.gemma import OllamaClient, OllamaError

    monkeypatch.setattr(psutil, "virtual_memory", lambda: _VM)
    c = OllamaClient("http://127.0.0.1:11434", "gemma3:4b")
    monkeypatch.setattr(c, "available_models", lambda: ["gemma3:4b", "gemma3:1b"])
    _VM.available = 2 * 2**30
    assert c.safe_model() == "gemma3:1b"
    _VM.available = 1 * 2**30
    with pytest.raises(OllamaError, match="not enough free memory"):
        c.safe_model()


def test_chat_reports_offline_gemma() -> None:
    from brokedate.config import Config
    from brokedate.enrich.gemma import OllamaError
    from brokedate.narrate.chat import stream_reply

    class Down(_FakeChatClient):
        def available_models(self) -> list[str]:
            raise OllamaError("connection refused")

    ev = list(stream_reply(Config(), "q", _FACTS, "t {f1}", None, "English", client=Down([])))  # type: ignore[arg-type]
    assert ev == [{"type": "error", "message": "Gemma is offline (OllamaError)"}]



def test_chat_eval_counts_acceptance_and_reasons(monkeypatch) -> None:  # noqa: ANN001
    import json as _json

    from brokedate.config import Config
    from brokedate.narrate import chat_eval

    class Fake:
        """gemma3:1b reacts without numbers (valid); gemma3:4b sneaks in a digit."""

        def available_models(self) -> list[str]:
            return ["gemma3:1b", "gemma3:4b"]

        def chat_stream(self, messages, temperature=0.6, seed=0, num_predict=200, model=None):  # noqa: ANN001
            yield "Arre, let's see this." if model == "gemma3:1b" else "You have 5 rupees."

    monkeypatch.setattr(chat_eval, "fits", lambda m: True)
    monkeypatch.setattr("brokedate.narrate.chat.fits", lambda m: True)
    res = chat_eval.evaluate_chat(Config(), client=Fake())  # type: ignore[arg-type]
    n = len(_json.loads(chat_eval.FIXTURES.read_text(encoding="utf-8")))
    one, four = res["models"]["gemma3:1b"], res["models"]["gemma3:4b"]
    assert one["n"] == four["n"] == n and one["accepted"] == n
    assert four["accepted"] == 0 and four["rejections"] == {"wrote a digit": n}


def test_chat_strips_emojis() -> None:
    ev = _run(["Arre wah \U0001f602, ", "sorted!"])
    assert ev[-1]["ok"] is True and ev[-1]["text"] == f"Arre wah, sorted! {_TPL}"
