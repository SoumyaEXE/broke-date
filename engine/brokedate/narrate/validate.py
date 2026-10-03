"""Letter validator: Gemma may never write a number (SPEC 14.2)."""

from __future__ import annotations

import re
import unicodedata

NUMBER_WORDS_EN = {
    "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
    "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty", "thirty", "forty",
    "fifty", "sixty", "seventy", "eighty", "ninety", "hundred", "hundreds", "thousand", "thousands", "lakh", "lakhs",
    "crore", "crores", "million", "millions", "billion", "dozen", "dozens", "half", "halves", "quarter", "quarters",
    "twice", "thrice", "double", "triple", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth",
    "eleventh", "twelfth", "twentieth", "thirtieth", "percent", "percentage", "k",
}
# Bengali script
NUMBER_WORDS_BN = {
    "শূন্য", "এক", "একটা", "একটি", "দুই", "দুটো", "দুটি", "তিন", "তিনটে", "চার", "চারটে", "পাঁচ", "ছয়", "সাত", "আট",
    "নয়", "দশ", "এগারো", "বারো", "কুড়ি", "তিরিশ", "চল্লিশ", "পঞ্চাশ", "ষাট", "সত্তর", "আশি", "নব্বই", "শ", "শো",
    "একশো", "হাজার", "লাখ", "কোটি", "অর্ধেক", "আধা", "দ্বিগুণ", "শতাংশ",
}
# transliterated Bengali (Benglish). 'noy' is left out on purpose: it is the everyday negation ("bhalo noy").
NUMBER_WORDS_BENGLISH = {
    "ek", "ekta", "ekti", "dui", "duto", "duti", "tinte", "tinta", "charte", "charta", "panch", "paanch", "panchta",
    "choy", "chhoy", "choyta", "saat", "shaat", "saatta", "aat", "aath", "aatta", "nota", "dosh", "doshta", "egaro",
    "baro", "kuri", "tirish", "chollish", "ponchash", "shottor", "aashi", "nobboi", "sho", "esho", "hajar",
    "hazar", "koti", "adha", "aadha", "ordhek", "dwigun", "shotangsho",
}
BLOCKLIST = NUMBER_WORDS_EN | NUMBER_WORDS_BN | NUMBER_WORDS_BENGLISH

PLACEHOLDER = re.compile(r"\{(f\d+)\}")
CURRENCY_ADJ = re.compile(r"([₹$€£৳]\s*\{f\d+\})|(\b(?:rs|inr|rupees?|taka|tk)\.?\s*\{f\d+\})|"
                          r"(\{f\d+\}\s*(?:rupees?|taka|tk|rs|inr)\b)", re.I)
# letters plus Indic combining marks (vowel signs are not \w in Python re, which would split Bengali words)
WORD = re.compile("(?:[^\\W\\d_]|[ऀ-ॿঀ-৿])+", re.UNICODE)


class LetterRejected(ValueError):
    pass


def has_digit(text: str) -> bool:
    # Python's \d is Unicode-aware: Latin 0-9, Bengali ০-৯, Devanagari, etc. Belt and braces: also check the
    # Unicode category of every character.
    if re.search(r"\d", PLACEHOLDER.sub("", text)):
        return True
    return any(unicodedata.category(ch) == "Nd" for ch in PLACEHOLDER.sub("", text))


def validate(text: str, known_ids: set[str], min_words: int = 30, max_words: int = 120) -> list[str]:
    """Return a list of problems (empty = accepted)."""
    problems: list[str] = []
    if has_digit(text):
        problems.append("contains a digit; numbers must only appear as {fN} placeholders")
    body = PLACEHOLDER.sub(" ", text)
    words = [w.lower() for w in WORD.findall(body)]
    bad = sorted({w for w in words if w in BLOCKLIST})
    if bad:
        problems.append(f"contains number words {bad}; use placeholders instead")
    ids = PLACEHOLDER.findall(text)
    unknown = sorted({i for i in ids if i not in known_ids})
    if unknown:
        problems.append(f"unknown placeholders {unknown}")
    if re.search(r"\{[^}]*\}", PLACEHOLDER.sub("", text)):
        problems.append("malformed placeholder")
    if CURRENCY_ADJ.search(text):
        problems.append("currency symbol or word next to a placeholder (the value already includes it)")
    if not ids:
        problems.append("no facts referenced")
    n = len(text.split())
    if n < min_words or n > max_words:
        problems.append(f"length {n} words (want {min_words} to {max_words})")
    return problems
