"""Turn the SYNTHETIC transaction list for the "Subarna" persona into a statement the app can import.

    uv --project engine run --no-sync python scripts/build_subarna_statement.py [--end YYYY-MM-DD]

Input : data/subarna_syn/source_transactions.csv  (synthetic personal-expense dataset: date, category, merchant
        label, direction, amount). It is NOT a bank statement and not anyone's real money.
Output: data/subarna_syn/statement.csv   rows up to --end (default: yesterday), same columns as data/sim
        data/subarna_syn/heldout.csv     the rows after --end ("what happened next"), never imported
        data/subarna_syn/truth.csv       ref -> the source file's own category and merchant label
        data/subarna_syn/persona.json    every choice this script made, so nothing is hidden

What this script adds, and nothing else: a narration in the shape Indian banks write them, a reference number, an
opening balance and the running balance. No transaction is added, removed, moved or changed in amount.

The opening balance is a rule, not a taste: the source spends more than it earns, so the account needs savings to
start with. It is the smallest multiple of Rs 5,000 that keeps the balance from ever going below zero across the
whole source file. Deterministic: same input, same output (fixed seed).
"""

from __future__ import annotations

import argparse
import csv
import json
import random
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIR = ROOT / "data" / "subarna_syn"
SEED = 2026
ROUND_TO_PAISE = 500_000  # Rs 5,000

BANK_CODES = ["YESB0YBLUPI", "HDFC0MERUPI", "ICIC0DC0099", "UTIB0000553", "SBIN0016209", "PYTM0123456"]
FRIENDS = [("SAYAN MONDAL", "sayan.mondal@okaxis"), ("ANKITA ROY", "ankitaroy99@oksbi"),
           ("RITWIK SEN", "ritwik.sen7@ybl"), ("DEBOLINA PAUL", "debolina.p@okhdfcbank")]
FAMILY = ("PRADIP KUMAR DAS", "pradipkdas61@oksbi")
LANDLORD = ("TAPAN GHOSH", "tapanghosh.1964@oksbi")
EMPLOYER = "ABC TECH PVT LTD"
CLIENT = "PIXELCRAFT STUDIO"

# merchant_label in the source -> (name as a bank would print it, UPI handle, note). Lists are picked by seeded RNG.
UPI = {
    "Blinkit": [("BLINKIT", "blinkit.payu@hdfcbank", "Order")],
    "Zepto": [("ZEPTO", "zeptonow@icici", "Order")],
    "BigBasket": [("BIGBASKET", "bigbasket.rzp@hdfcbank", "Order")],
    "Reliance Smart": [("RELIANCE SMART BAZAAR", "reliancesmart.rzp@hdfcbank", "Payment")],
    "Local kirana": [("LOKNATH GENERAL STORE", "loknathstore@ybl", "Payment"),
                     ("MAA ANNAPURNA BHANDAR", "annapurnabhandar@paytm", "Payment")],
    "Zomato order": [("ZOMATO", "zomato-order@paytm", "Food order")],
    "Swiggy order": [("SWIGGY", "swiggy.rzp@hdfcbank", "Food order")],
    "Rapido bike": [("RAPIDO", "rapido.rzp@hdfcbank", "Bike ride")],
    "Rapido ride": [("RAPIDO", "rapido.rzp@hdfcbank", "Ride")],
    "Petrol pump": [("HP PETROL PUMP SALT LAKE", "hppetrol.saltlake@sbi", "Fuel"),
                    ("INDIAN OIL FUEL STATION", "iocl.fuelstn@icici", "Fuel")],
    "Flipkart purchase": [("FLIPKART", "flipkart.payu@hdfcbank", "Order")],
    "Amazon purchase": [("AMAZON PAY", "amazonpay.rzp@hdfcbank", "Order")],
    "KFC": [("KFC", "kfc.devyani@icici", "Payment")],
    "Dominos": [("DOMINOS PIZZA", "dominos.jfl@hdfcbank", "Order")],
    "Local restaurant": [("SPICE GARDEN RESTAURANT", "spicegarden@ybl", "Payment")],
    "Cafe": [("CAFE BY THE LANE", "cafebythelane@paytm", "Payment")],
    "Momos stall": [("DOLMA MOMO CORNER", "dolmamomo@ybl", "Payment")],
    "Tea stall": [("BAPI TEA STALL", "bapitea@paytm", "Payment")],
    "Laundry": [("QUICK WASH LAUNDRY", "quickwash@ybl", "Payment")],
    "Salon": [("TRENDS UNISEX SALON", "trendssalon@okaxis", "Payment")],
    "Photocopy shop": [("SHREE XEROX CENTRE", "shreexerox@paytm", "Payment")],
    "Local pharmacy": [("LIFELINE MEDICAL HALL", "lifelinemedical@ybl", "Payment")],
    "Online pharmacy": [("PHARMEASY", "pharmeasy.rzp@hdfcbank", "Order")],
    "Electricity bill": [("WBSEDCL", "wbsedcl.billdesk@hdfcbank", "Electricity bill")],
    "Mobile data top-up": [("JIO PREPAID", "jio@sbi", "Data pack")],
    "Mobile recharge": [("JIO PREPAID", "jio@sbi", "Recharge")],
    "Streaming subscription": [("SPOTIFY INDIA", "spotify.bdsi@icici", "Subscription")],
    "Online electronics purchase": [("CROMA", "croma.infiniti@hdfcbank", "Order")],
    "Mobile accessory purchase": [("CROMA", "croma.infiniti@hdfcbank", "Order")],
    "Laptop accessories": [("CROMA", "croma.infiniti@hdfcbank", "Order")],
    "Festival shopping": [("WESTSIDE", "westside.trent@hdfcbank", "Payment")],
    "Gift purchase": [("ARCHIES GIFT GALLERY", "archiesgift@ybl", "Payment")],
    "Rail travel booking": [("IRCTC", "irctc.rzp@hdfcbank", "Ticket")],
    "Intercity travel booking": [("REDBUS", "redbus.ibibo@hdfcbank", "Ticket")],
    "Shared accommodation rent": [(LANDLORD[0], LANDLORD[1], "Rent")],
    "Family transfer": [(FAMILY[0], FAMILY[1], "Home")],
}


def narration(rng: random.Random, row: dict, ref: str, when: datetime) -> str:
    label, cat = row["merchant_label"], row["category"]
    if cat == "cash_withdrawal":
        return f"ATM WDL-{ref[-6:]}-SALT LAKE KOLKATA"
    if cat == "income_salary":
        return f"NEFT-HDFCN{ref[:11]}-{EMPLOYER}-SALARY {when:%b %Y}".upper()
    if cat == "income_freelance":
        return f"IMPS-{ref}-{CLIENT}-PROJECT PAYMENT"
    if cat == "income_interest":
        return f"CREDIT INTEREST CAPITALISED {when:%b %Y}".upper()
    if label == "Friend settlement":
        name, vpa = rng.choice(FRIENDS)
        note = rng.choice(["Split", "Bill share", "Trip share", "Return"])
    else:
        name, vpa, note = rng.choice(UPI[label])
        if label == "Shared accommodation rent":
            note = f"Rent {when:%b}"
    return f"UPI-{name}-{vpa}-{rng.choice(BANK_CODES)}-{ref}-{note}"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--end", default=str(date.today() - timedelta(days=1)), help="last date in the statement")
    end = date.fromisoformat(ap.parse_args().end)
    src = DIR / "source_transactions.csv"
    with src.open(encoding="utf-8") as fh:
        lines = fh.read().splitlines()
    header = next(i for i, ln in enumerate(lines) if ln.startswith("transaction_datetime,"))
    rows = list(csv.DictReader(lines[header:]))
    for i, r in enumerate(rows):
        r["_when"] = datetime.fromisoformat(r["transaction_datetime"])
        r["_paise"] = round(float(r["amount_inr"]) * 100)
        r["_i"] = i
    rows.sort(key=lambda r: (r["_when"], r["_i"]))  # the source is already in time order; this only makes it certain

    cum = low = 0
    for r in rows:
        cum += r["_paise"] if r["direction"] == "credit" else -r["_paise"]
        low = min(low, cum)
    opening = ((-low + ROUND_TO_PAISE - 1) // ROUND_TO_PAISE) * ROUND_TO_PAISE  # round up to Rs 5,000

    rng = random.Random(SEED)
    bal = opening
    out, held, truth = [], [], []
    for r in rows:
        ref = str(rng.randrange(10**11, 10**12))
        when = r["_when"]
        nar = narration(rng, r, ref, when)
        credit = r["direction"] == "credit"
        bal += r["_paise"] if credit else -r["_paise"]
        d = when.strftime("%d/%m/%y")
        line = [d, nar, ref, d, "" if credit else f"{r['_paise'] / 100:.2f}", f"{r['_paise'] / 100:.2f}" if credit else "",
                f"{bal / 100:.2f}"]
        (out if when.date() <= end else held).append(line)
        truth.append([ref, when.isoformat(timespec="minutes"), r["merchant_label"], r["category"], r["direction"]])

    cols = ["Date", "Narration", "Chq./Ref.No.", "Value Dt", "Withdrawal Amt.", "Deposit Amt.", "Closing Balance"]
    first = rows[0]["_when"].strftime("%d/%m/%y")
    with (DIR / "statement.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(cols)
        w.writerow([first, "OPENING BALANCE", "", first, "", "", f"{opening / 100:.2f}"])
        w.writerows(out)
    with (DIR / "heldout.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(cols)
        w.writerows(held)
    with (DIR / "truth.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["ref", "timestamp", "source_merchant_label", "source_category", "direction"])
        w.writerows(truth)

    def paise(line: list[str]) -> int:
        return round(float(line[6]) * 100)

    persona = {
        "SYNTHETIC": "This is a synthetic dataset. It is not a bank statement, not proof of funds and not anyone's real money.",
        "source": "data/subarna_syn/source_transactions.csv",
        "kept_from_source": "every transaction: date, time order, direction and amount, unchanged",
        "added_by_script": ["narration text", "reference number", "opening balance", "running balance"],
        "seed": SEED,
        "opening_balance_rule": "smallest multiple of Rs 5,000 that never lets the balance go below zero over the whole source",
        "opening_balance_rupees": opening / 100,
        "lowest_balance_if_opening_were_zero_rupees": low / 100,
        "statement": {"from": str(rows[0]["_when"].date()), "to": str(end), "rows": len(out),
                      "closing_balance_rupees": paise(out[-1]) / 100 if out else opening / 100},
        "heldout": {"rows": len(held), "from": held[0][0] if held else None, "to": held[-1][0] if held else None,
                    "lowest_balance_rupees": min(map(paise, held)) / 100 if held else None,
                    "note": "dated after the statement ends; kept aside as 'what happened next', never imported"},
        "invented_names": {"employer": EMPLOYER, "client": CLIENT, "landlord": LANDLORD[0], "family": FAMILY[0],
                           "friends": [f[0] for f in FRIENDS], "note": "made up for the narrations; real brands "
                           "(Blinkit, Zomato...) appear only where the source file already named them or their kind"},
    }
    (DIR / "persona.json").write_text(json.dumps(persona, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({k: persona[k] for k in ("opening_balance_rupees", "statement", "heldout")}, indent=2))


if __name__ == "__main__":
    main()
