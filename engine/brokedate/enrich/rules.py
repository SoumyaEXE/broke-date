"""Rules-first narration parser for common Indian bank narration shapes (SPEC 7.2).

Generic: patterns and the merchant dictionary describe how Indian bank / UPI narrations look in general,
not any one person's history. Anything the rules cannot place confidently goes to Gemma, then review.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

CATEGORIES = (
    "food_delivery", "campus_food", "groceries_snacks", "transport", "outing", "shopping", "recharge_bills",
    "gaming", "education", "transfer_to_person", "transfer_from_person", "allowance", "refund",
    "cash_withdrawal", "other",
)
COUNTERPARTIES = ("merchant", "person", "self", "bank", "unknown")


@dataclass
class Parsed:
    kind: str                       # UPI | NEFT | IMPS | ATM | POS | REVERSAL | CHARGES | INTEREST | OTHER
    name: str = ""                  # counterparty display name as written in the narration
    vpa: str = ""
    note: str = ""
    ref: str = ""
    orig_ref: str = ""              # for reversals
    merchant: str | None = None     # normalized merchant if known
    category: str | None = None
    counterparty: str = "unknown"
    confidence: float = 0.0


# --- shapes -----------------------------------------------------------------------------------------
_UPI_DASH = re.compile(
    r"^UPI-(?P<name>.*?)-(?P<vpa>[\w.\-]+@[\w.]+)-(?P<ifsc>[A-Z]{4}0[A-Z0-9]{6,7})-(?P<ref>\d{9,14})-?(?P<note>.*)$",
    re.I,
)
_UPI_SLASH = re.compile(
    r"^UPI/(?:(?P<dir>DR|CR)/)?(?P<ref>\d{9,14})/(?P<name>[^/]*)/(?P<bank>[^/]*)/(?P<vpa>[^/]*@[^/]*)/?(?P<note>.*)$",
    re.I,
)
_UPI_LOOSE = re.compile(r"\bUPI\b.*?(?P<vpa>[\w.\-]+@[a-z]+)", re.I)
_NEFT = re.compile(r"^(?:NEFT|RTGS)[/\- ](?:CR[/\- ]|DR[/\- ])?(?P<ref>[A-Z0-9]+)[/\- ](?P<name>[^/\-]+)", re.I)
_IMPS = re.compile(r"^IMPS[/\- ](?:P2A|P2P)?[/\- ]?(?P<ref>\d+)[/\- ](?P<name>[^/\-]+)", re.I)
_ATM = re.compile(r"^(?:NWD|ATW|ATM\s*WDL|ATM\s*CASH|CASH\s*WDL|EAW)\b", re.I)
_POS = re.compile(r"^(?:POS|PCD|ECOM)\s*(?:\d+\s*)?(?P<name>[A-Z][A-Z0-9 &.'*]+)", re.I)
_REV = re.compile(r"^(?:REV|RVSL|REVERSAL)[-/ ](?:UPI-)?(?P<name>.*?)-(?P<orig>\d{9,14})", re.I)
_CHARGES = re.compile(r"\b(?:CHARGES?|CHGS|GST|SMS ALERT|AMC|MIN BAL|PENALTY)\b", re.I)
_INTEREST = re.compile(r"\b(?:INT(?:EREST)?\.?\s*(?:PD|PAID|CAPITALI[SZ]ED|CREDIT)|CREDIT INTEREST|SB INT)\b", re.I)

# --- merchant dictionary (generic, Indian market) -----------------------------------------------------
MERCHANTS: list[tuple[str, str, str]] = [
    # (regex on name/vpa, normalized merchant, category)
    (r"swiggy", "Swiggy", "food_delivery"), (r"zomato", "Zomato", "food_delivery"),
    (r"eatsure|faasos|dominos|pizza ?hut|kfc|mcdonald|burger ?king", "Restaurant chain", "food_delivery"),
    (r"blinkit|grofers", "Blinkit", "groceries_snacks"), (r"zepto", "Zepto", "groceries_snacks"),
    (r"bigbasket|bb ?now|jiomart|dmart|instamart|spencer|more retail", "Grocery", "groceries_snacks"),
    (r"general store|kirana|provision|super ?market|grocery", "Local store", "groceries_snacks"),
    (r"\buber\b", "Uber", "transport"), (r"rapido", "Rapido", "transport"), (r"\bola\b|olacabs", "Ola", "transport"),
    (r"metro|irctc|railway|redbus|sbstc|wbtc|\bbus\b|auto ?stand|toto|e.?rickshaw", "Transport", "transport"),
    (r"\bjio\b|airtel|vodafone|\bvi\b|bsnl|recharge", "Mobile recharge", "recharge_bills"),
    (r"electricity|cesc|wbsedcl|broadband|act fibernet", "Bills", "recharge_bills"),
    (r"\bpvr\b|inox|cinepolis|bookmyshow|district", "Movies", "outing"),
    (r"cafe|coffee|ccd|starbucks|chaayos|brew|food ?court|timezone|bowling|restaurant|dhaba", "Outing", "outing"),
    (r"myntra|meesho|ajio|flipkart|amazon|nykaa|garment|fashion|footwear|lifestyle|westside|zudio", "Shopping",
     "shopping"),
    (r"google ?play|playstore|steam|garena|pubg|bgmi|free ?fire|supercell|riot", "Games", "gaming"),
    (r"xerox|stationery|photocopy|book ?store|coursera|udemy|unacademy|byju|college fee|exam fee", "Education",
     "education"),
    (r"canteen|tea ?stall|\bchai\b|momo|roll|phuchka|puchka|tiffin|snack|biryani|chowmein|kachori", "Campus food",
     "campus_food"),
    (r"salon|parlour|barber|haircut", "Salon", "other"),
]
_MERCHANT_RES = [(re.compile(p, re.I), m, c) for p, m, c in MERCHANTS]

# VPA handles typical of personal accounts vs payment aggregators
_AGGREGATOR_VPA = re.compile(r"(payu|razorpay|paytm-?\d|pinelabs|billdesk|cashfree|ccavenue|@apl|@axisbank|@hdfcbank$|"
                             r"\.rzp|merchant|mer\b|store|shop)", re.I)
_PHONE_VPA = re.compile(r"^\+?\d{10,12}@", re.I)


def looks_like_person(name: str, vpa: str) -> bool:
    if not vpa:
        return bool(re.fullmatch(r"[A-Za-z]+(?: [A-Za-z]+){1,3}", name.strip()))
    if _AGGREGATOR_VPA.search(vpa):
        return False
    if _PHONE_VPA.search(vpa):
        return True
    words = [w for w in re.split(r"\s+", name.strip()) if w]
    # 2-3 alphabetic words, no business words -> a person
    business = re.compile(r"(store|stall|centre|center|corner|canteen|ltd|pvt|private|limited|enterprise|traders|"
                          r"shop|mart|cafe|hotel|restaurant|salon|xerox|garments|bus|auto|stand|court|room|"
                          r"company|services|solutions|dada|bhandar)", re.I)
    if business.search(name):
        return False
    return 2 <= len(words) <= 4 and all(w.isalpha() for w in words)


def match_merchant(text: str) -> tuple[str, str] | None:
    for rx, m, c in _MERCHANT_RES:
        if rx.search(text):
            return m, c
    return None


def parse_narration(narration: str, direction: str) -> Parsed:
    n = narration.strip()
    if m := _REV.match(n):
        return Parsed("REVERSAL", name=m["name"].strip(), orig_ref=m["orig"], category="refund",
                      counterparty="merchant", merchant=m["name"].strip().title(), confidence=0.95)
    if _INTEREST.search(n):
        return Parsed("INTEREST", name="BANK", category="other", counterparty="bank", merchant="Bank interest",
                      confidence=0.95)
    if _CHARGES.search(n) and not n.upper().startswith("UPI"):
        return Parsed("CHARGES", name="BANK", category="other", counterparty="bank", merchant="Bank charges",
                      confidence=0.9)
    if _ATM.match(n):
        return Parsed("ATM", name="ATM", category="cash_withdrawal", counterparty="self", merchant="ATM",
                      confidence=0.95)
    p: Parsed | None = None
    if (m := _UPI_DASH.match(n)) or (m := _UPI_SLASH.match(n)):
        p = Parsed("UPI", name=m["name"].strip(), vpa=m["vpa"], note=(m["note"] or "").strip(), ref=m["ref"])
    elif m := _NEFT.match(n):
        p = Parsed("NEFT", name=m["name"].strip(), ref=m["ref"])
    elif m := _IMPS.match(n):
        p = Parsed("IMPS", name=m["name"].strip(), ref=m["ref"])
    elif m := _POS.match(n):
        p = Parsed("POS", name=m["name"].strip())
    elif m := _UPI_LOOSE.search(n):
        p = Parsed("UPI", vpa=m["vpa"], name=n)
    else:
        p = Parsed("OTHER", name=n)
    _classify(p, direction)
    return p


def _classify(p: Parsed, direction: str) -> None:
    hay = f"{p.name} {p.vpa}"
    mm = match_merchant(hay)
    person = looks_like_person(p.name, p.vpa) if p.kind in ("UPI", "NEFT", "IMPS") else False
    if mm and not person:
        p.merchant, p.category = mm
        p.counterparty = "merchant"
        p.confidence = 0.9
        if direction == "CREDIT":
            p.category, p.confidence = "refund", 0.7
        return
    if person:
        p.counterparty = "person"
        p.merchant = p.name.title()
        if direction == "CREDIT":
            p.category, p.confidence = "transfer_from_person", 0.8
        elif re.search(r"split|share|return|lend|loan|owe|bill|treat|party|gift", p.note, re.I):
            p.category, p.confidence = "transfer_to_person", 0.8
        else:
            # a payment to a personal VPA could be a friend, or a toto/auto driver or street vendor paid on a
            # personal handle. Ambiguous on purpose: leave category for Gemma / review.
            p.category, p.confidence = None, 0.3
        return
    p.merchant = p.name.title() if p.name else None
    p.counterparty = "merchant" if p.kind in ("UPI", "POS") else "unknown"
    p.category, p.confidence = None, 0.0


def normalize_key(narration: str) -> str:
    """Cache key: lowercase, refs / digits / bank codes stripped (SPEC 7.3)."""
    s = narration.lower()
    s = re.sub(r"[a-z]{4}0[a-z0-9]{6,7}", " ", s)        # IFSC-like bank codes
    s = re.sub(r"\d+", " ", s)
    s = re.sub(r"[^a-z@. ]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()
