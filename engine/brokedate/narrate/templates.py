"""Fallback letters (used when Gemma is off, unreachable, or fails validation 3 times). Placeholders only:
the slot names are mapped to real fact ids at render time."""

from __future__ import annotations

TEMPLATES: dict[str, dict[str, str]] = {
    "benglish": {
        "broke": ("Bhai, ami tor future theke likhchi, {n_broke} jon er dol theke, jara pay-day obdi pouchate parlam na. "
                  "Amar wallet {broke_day} e shesh. Tui ekhon {balance_now} niye boshe achish, ar ajke {safe} "
                  "porjonto khoroch korle shob thik thakbe. {plan_clause}Chap nish na, shudhu ektu dekhe shune. "
                  "Amra onek jon, kintu tui ekhono amar moto hoini."),
        "fine": ("Bhai, ami tor future theke likhchi. Shotti bolchi, {n_make_it} jon er moddhe amra beshirbhag pay-day obdi "
                 "pouchechi. Ajke {safe} porjonto nishchinte khoroch kor. {plan_clause}Kintu mone rakhish, amar "
                 "moto kichhu future kharap din dekheche. Bhalo thakish."),
        "plan": "Ar {plan_name} er dam ashole {plan_cost}, mone rakhish. ",
    },
    "english": {
        "broke": ("Hey. I'm writing from the {n_broke} futures of you that didn't make it to payday. My wallet ran dry "
                  "around {broke_day}. You're sitting on {balance_now} right now, and spending up to {safe} today "
                  "keeps you safe. {plan_clause}No pressure. Just know some of us are still out here, broke and "
                  "oddly fond of you."),
        "fine": ("Hey, it's a future you. Good news: {n_make_it} of us make it to payday. You can spend up to "
                 "{safe} today without worrying. {plan_clause}A few of us still had a rough last week, so keep an eye "
                 "on things. See you on the other side."),
        "plan": "And {plan_name} really costs you {plan_cost}. Your call. ",
    },
    "bengali": {
        "broke": ("ভাই, আমি তোর ভবিষ্যৎ থেকে লিখছি, সেই {n_broke} জনের দল থেকে যারা মাসের শেষ পর্যন্ত টিকতে পারেনি। আমার টাকা ফুরিয়েছে "
                  "{broke_day} নাগাদ। তোর কাছে এখন {balance_now}, আর আজ {safe} পর্যন্ত খরচ করলে চিন্তা নেই। {plan_clause}চাপ "
                  "নিস না, শুধু একটু খেয়াল রাখিস।"),
        "fine": ("ভাই, আমি তোর ভবিষ্যৎ থেকে লিখছি। ভালো খবর, আমাদের মধ্যে {n_make_it} জন মাসের শেষ অবধি পৌঁছেছি। আজ {safe} "
                 "পর্যন্ত নিশ্চিন্তে খরচ কর। {plan_clause}তবু কয়েকজনের শেষ সপ্তাহটা কঠিন গেছে, মনে রাখিস।"),
        "plan": "আর {plan_name} এর আসল দাম {plan_cost}, মনে রাখিস। ",
    },
}


def lang_key(language: str) -> str:
    lk = language.strip().lower()
    if lk in TEMPLATES:
        return lk
    if lk in ("bangla", "bengali script", "bn"):
        return "bengali"
    if "beng" in lk or "bangl" in lk:
        return "benglish"
    return "english"
