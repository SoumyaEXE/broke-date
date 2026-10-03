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
