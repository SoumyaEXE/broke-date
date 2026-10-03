"""
Broke Date: realistic SIMULATED bank statement for a student in a tier-2 Indian city.

PUBLIC DEMO / DEVELOPMENT DATA ONLY. Never present this as a real person's history.

Outputs (in --out, default data/sim/):
  statement.csv  Bank-style export (HDFC-like column layout): Date, Narration, Chq./Ref.No., Value Dt,
                 Withdrawal Amt., Deposit Amt., Closing Balance. Same shape a real export has, so the
                 engine's real ingestion path (parser, reconciliation, narration cleaner) is exercised.
  truth.csv      Ground-truth labels per ref no (merchant, category, counterparty) for scoring the
                 narration cleaner / Gemma categorizer.
  persona.json   The persona and price assumptions used, for transparency.

Prices are typical tier-2 (e.g. Durgapur / Siliguri / Asansol) student spending in 2025-26 and are
assumptions, not survey data. Edit PRICES below.

Usage: python simulate_statement.py --seed 13 --out data/sim
"""

import argparse
import csv
import json
import random
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path

# ---------------------------------------------------------------------------------------------
# Persona
# ---------------------------------------------------------------------------------------------
PERSONA = {
    "city_tier": 2,
    "city_label": "tier-2 city, West Bengal (illustrative)",
    "start": "2025-10-01",
    "end": "2026-09-30",
    "opening_balance": 640,
    "allowance_sender": "SANCHITA DAS",     # fictional parent name
    "allowance_day": 1,
    "allowance_jitter_days": 3,
    "phases": [
        # start, end, monthly allowance, has college/school commute, label
        ["2025-10-01", "2026-03-20", 2500, True, "class 12 + boards"],
        ["2026-03-21", "2026-07-31", 3000, False, "post-boards break"],
        ["2026-08-01", "2026-09-30", 4000, True, "first year college"],
    ],
    "exams": [["2025-12-01", "2025-12-12"], ["2026-02-16", "2026-03-20"]],
    "festivals": {
        "Durga Puja": ["2025-09-28", "2025-10-02"],
        "Kali Puja / Diwali": ["2025-10-19", "2025-10-21"],
        "Christmas": ["2025-12-23", "2025-12-26"],
        "New Year": ["2025-12-31", "2026-01-01"],
        "Saraswati Puja": ["2026-01-22", "2026-01-23"],
        "Holi": ["2026-03-03", "2026-03-04"],
        "Poila Baishakh": ["2026-04-14", "2026-04-15"],
    },
    "broke_rupees": 150,
}

# rupees; (low, high). Tier-2 student prices.
PRICES = {
    "toto": (10, 20), "auto": (15, 40), "bus": (10, 20),
    "chai": (10, 20), "canteen": (30, 80), "street_food": (30, 90),
    "delivery": (140, 340), "grocery_snacks": (60, 260),
    "movie": (150, 260), "cafe": (120, 380), "mall": (180, 550), "outing_fest": (250, 900),
    "split": (40, 250), "shopping": (250, 900), "game_topup": [49, 79, 99, 149, 199],
    "xerox": (10, 120), "haircut": (80, 150), "data_pack": [19, 29, 49],
    "recharge": 349, "recharge_every": 28,
}

FRIENDS = [("SAYAN MONDAL", "sayan.mondal@okaxis"), ("ANKITA ROY", "ankitaroy99@oksbi"),
           ("RIK BANERJEE", "rikb@ybl"), ("PRIYA SAHA", "priyasaha@okhdfcbank"),
           ("ARKA GHOSH", "arka.g@paytm"), ("SOUMYADEEP DEY", "soumyadeep@okicici")]
MERCHANTS = {
    # e-rickshaw / auto drivers receive UPI on personal VPAs, so narrations show a person's name:
    # realistic, and a genuinely hard case for the categorizer (person VPA, but category transport)
    "toto":    [("BABLU SK", "bablusk{n}@ybl", "transport"), ("RAJU MAHATO", "rajum{n}@ybl", "transport"),
                ("SAMIR ALI", "samirali{n}@paytm", "transport"), ("GOPAL BAURI", "gopalb{n}@ybl", "transport")],
    "auto":    [("AUTO STAND", "auto{n}@ybl", "transport"), ("RAPIDO", "rapido@ybl", "transport")],
    "bus":     [("SBSTC BUS", "sbstc@sbi", "transport")],
    "chai":    [("MAA TARA TEA STALL", "taratea{n}@ybl", "campus_food")],
    "canteen": [("COLLEGE CANTEEN", "canteen{n}@okaxis", "campus_food"),
                ("SCHOOL CANTEEN", "schoolcanteen@ybl", "campus_food")],
    "street_food": [("MOMO CORNER", "momocorner@ybl", "campus_food"),
                    ("ROLL CENTRE", "rollcentre{n}@paytm", "campus_food"),
                    ("PHUCHKA DADA", "phuchka{n}@ybl", "campus_food")],
    "delivery": [("SWIGGY", "swiggy.payu@hdfcbank", "food_delivery"),
                 ("ZOMATO", "zomato.payu@hdfcbank", "food_delivery")],
    "grocery_snacks": [("BLINKIT", "blinkit.payu@hdfcbank", "groceries_snacks"),
                       ("ZEPTO", "zepto.payu@axisbank", "groceries_snacks"),
                       ("LOCAL GENERAL STORE", "generalstore{n}@ybl", "groceries_snacks")],
    "movie":   [("INOX LEISURE", "inox.payu@hdfcbank", "outing"), ("PVR LTD", "pvr.razorpay@icici", "outing")],
    "cafe":    [("CAFE COFFEE DAY", "ccd.payu@hdfcbank", "outing"), ("THE BREW ROOM", "brewroom@okaxis", "outing")],
    "mall":    [("MALL FOOD COURT", "foodcourt{n}@ybl", "outing"), ("TIMEZONE", "timezone.razorpay@icici", "outing")],
    "shopping": [("MYNTRA", "myntra.payu@hdfcbank", "shopping"), ("MEESHO", "meesho.razorpay@icici", "shopping"),
                 ("AMAZON", "amazonupi@apl", "shopping"), ("LOCAL GARMENTS", "garments{n}@ybl", "shopping")],
    "game_topup": [("GOOGLE PLAY", "playstore@axisbank", "gaming")],
    "xerox":   [("XEROX AND STATIONERY", "xerox{n}@ybl", "education")],
    "haircut": [("STYLE SALON", "stylesalon@ybl", "other")],
    "data_pack": [("JIO", "jio@sbi", "recharge_bills")],
    "recharge": [("JIO PREPAID", "jio@sbi", "recharge_bills")],
}
BANK_CODES = ["YESB0YBLUPI", "HDFC0MERUPI", "ICIC0DC0099", "UTIB0000553", "SBIN0016209", "PYTM0123456"]


@dataclass
class Row:
    ts: datetime
    narration: str
    ref: str
    debit: int = 0
    credit: int = 0
    balance: int = 0
    merchant: str = ""
    category: str = ""
    counterparty: str = ""
    truth_spend: bool = False   # counts as consumption spend for the engine's ground truth


@dataclass
class State:
    balance: int
    rows: list = field(default_factory=list)
    ref_counter: int = 0


def d(s):
    return date.fromisoformat(s)


def window(day, pairs):
    return any(d(a) <= day <= d(b) for a, b in pairs)


def festival(day):
    for name, (a, b) in PERSONA["festivals"].items():
        if d(a) <= day <= d(b):
            return name
    return None


def phase(day):
    for a, b, allow, commute, label in PERSONA["phases"]:
        if d(a) <= day <= d(b):
            return allow, commute, label
    raise ValueError(day)


def human_amount(rng, lo, hi):
    x = rng.uniform(lo, hi)
    r = rng.random()
    if r < 0.45:
        return int(round(x / 10) * 10)
    if r < 0.6:
        return int(round(x / 5) * 5)
    return int(round(x))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=13)
    ap.add_argument("--out", default="data/sim")
    args = ap.parse_args()
    rng = random.Random(args.seed)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    st = State(balance=PERSONA["opening_balance"])

    def new_ref():
        st.ref_counter += 1
        return str(rng.randint(500000000000, 699999999999))  # 12-digit UPI RRN style

    def upi_narr(direction, name, vpa, note):
        vpa = vpa.replace("{n}", str(rng.randint(10, 99)))
        bank = rng.choice(BANK_CODES)
        ref = new_ref()
        # HDFC-like narration shape; other banks differ, which is what the adapter layer is for
        return f"UPI-{name}-{vpa}-{bank}-{ref}-{note}", ref

    def post(ts, narration, ref, debit=0, credit=0, merchant="", category="", counterparty="", spend=False):
        st.balance += credit - debit
        st.rows.append(Row(ts, narration, ref, debit, credit, st.balance, merchant, category, counterparty, spend))

    start, end = d(PERSONA["start"]), d(PERSONA["end"])

    # allowance arrival dates
    allowance_dates = set()
    m = date(start.year, start.month, 1)
    while m <= end:
        a = m + timedelta(days=PERSONA["allowance_day"] - 1 + rng.randint(0, PERSONA["allowance_jitter_days"]))
        if start <= a <= end:
            allowance_dates.add(a)
        m = date(m.year + m.month // 12, m.month % 12 + 1, 1)

    next_recharge = start + timedelta(days=rng.randint(4, 20))
    pending_reversals = []  # (date, row-args)

    day = start
    while day <= end:
        allowance, commute, label = phase(day)
        weekend = day.weekday() >= 5
        fest = festival(day)
        exam = window(day, PERSONA["exams"])
        school_day = commute and not weekend and not fest
        events = []  # (hour, minute, callable)

        def at(h_lo, h_hi, fn):
            events.append((rng.randint(h_lo, h_hi), rng.randint(0, 59), fn))

        # ---- inflows
        if day in allowance_dates:
            amt = allowance + rng.choice([0, 0, 0, 0, 200, 500, -300])
            def f(ts, amt=amt):
                n, ref = upi_narr("CR", PERSONA["allowance_sender"], "sanchita.das@oksbi", "Monthly")
                post(ts, n, ref, credit=amt, merchant=PERSONA["allowance_sender"], category="allowance",
                     counterparty="person")
            at(7, 10, f)
        if fest and rng.random() < 0.45:
            amt = rng.choice([200, 300, 500, 500, 1000])
            def f(ts, amt=amt, fest=fest):
                rel, rvpa = rng.choice([("TAPAN DAS", "tapandas@oksbi"), ("RINA SARKAR", "rinasarkar@ybl"),
                                        ("BISWAJIT PAL", "biswajitpal@okaxis")])
                n, ref = upi_narr("CR", rel, rvpa, "Bijoya" if "Puja" in fest else "Gift")
                post(ts, n, ref, credit=amt, merchant=rel, category="transfer_from_person", counterparty="person")
            at(9, 20, f)
        if day.month in (3, 6, 9, 12) and day.day == 28:
            def f(ts):
                ref = new_ref()
                post(ts, f"CREDIT INTEREST CAPITALISED {ref}", ref, credit=rng.randint(3, 15),
                     merchant="BANK", category="other", counterparty="bank")
            at(1, 2, f)

        # ---- decision context (evaluated lazily against live balance inside spend())
        def flush_factor():
            r = st.balance / max(allowance, 1)
            base = 1.2 if r > 0.6 else 0.95 if r > 0.25 else 0.5
            return base * (1.7 if rng.random() < 0.08 else 1.0)  # occasional splurge mood

        def spend(kind, h_lo, h_hi, essential=False, amount=None, note="Payment"):
            def f(ts):
                if kind == "canteen":  # school canteen before college starts, college canteen after
                    name, vpa, cat = MERCHANTS[kind][0 if "college" in label else 1]
                else:
                    name, vpa, cat = rng.choice(MERCHANTS[kind])
                if amount is not None:
                    amt = amount
                elif isinstance(PRICES[kind], list):
                    amt = rng.choice(PRICES[kind])
                else:
                    amt = human_amount(rng, *PRICES[kind])
                if amt > st.balance:
                    if not essential:
                        return
                    amt = st.balance
                    if amt <= 0:
                        return
                n, ref = upi_narr("DR", name, vpa, note)
                post(ts, n, ref, debit=amt, merchant=name, category=cat,
                     counterparty="person" if kind == "toto" else "merchant", spend=True)
                if rng.random() < 0.008:  # failed-then-reversed UPI
                    pending_reversals.append((day + timedelta(days=rng.choice([0, 1, 2])), amt, ref, name))
            at(h_lo, h_hi, f)

        # ---- fixed-ish
        if day >= next_recharge:
            spend("recharge", 8, 22, essential=True, amount=PRICES["recharge"], note="Recharge")
            next_recharge = day + timedelta(days=PRICES["recharge_every"])

        # ---- commute + campus
        if school_day:
            trips = rng.choice([0, 1, 2, 2])
            for _ in range(trips):
                spend(rng.choice(["toto", "toto", "auto", "bus"]), 7, 18, essential=True)
            if rng.random() < 0.55:
                spend("chai", 10, 17)
            if rng.random() < 0.45:
                spend(rng.choice(["canteen", "street_food"]), 11, 18)

        # ---- discretionary (probabilities scale with how flush he feels)
        ff = flush_factor()
        if rng.random() < (0.055 + (0.07 if weekend else 0) + (0.10 if exam else 0)) * ff:
            spend("delivery", 13, 23)
        if rng.random() < 0.07 * ff:
            spend("grocery_snacks", 16, 22)
        if not school_day and rng.random() < 0.10 * ff:
            spend("street_food", 16, 21)
        p_out = (0.2 if weekend else 0.035) * ff * (0.35 if exam else 1) * (2.4 if fest else 1)
        if not commute:
            p_out *= 1.3
        if rng.random() < p_out:
            kind = rng.choice(["movie", "cafe", "mall", "cafe"])
            spend(kind, 15, 21)
            if rng.random() < 0.5:
                fname, fvpa = rng.choice(FRIENDS)
                amt = human_amount(rng, *PRICES["split"])
                def f(ts, fname=fname, fvpa=fvpa, amt=amt):
                    if amt <= st.balance:
                        n, ref = upi_narr("DR", fname, fvpa, "Split")
                        post(ts, n, ref, debit=amt, merchant=fname, category="transfer_to_person",
                             counterparty="person", spend=True)
                at(19, 23, f)
        if rng.random() < 0.018 * ff * (2.5 if fest else 1):
            spend("shopping", 11, 23)
        if rng.random() < 0.02 * ff:
            spend("game_topup", 19, 23, note="Google Play")
        if school_day and rng.random() < 0.06:
            spend("xerox", 9, 17, essential=True)
        if rng.random() < 1 / 32:
            spend("haircut", 10, 19)
        if rng.random() < 0.03 * ff:
            spend("data_pack", 12, 23, note="Data")
        if rng.random() < 0.012 and st.balance > 700:  # cash for the week; the spending itself is invisible
            def f(ts):
                amt = rng.choice([200, 300, 500])
                if amt <= st.balance:
                    ref = new_ref()
                    post(ts, f"NWD-XXXXXXXXXXXX{rng.randint(1000,9999)}-S1AW{rng.randint(1000,9999)}-ATM BUS STAND", ref,
                         debit=amt, merchant="ATM", category="cash_withdrawal", counterparty="self", spend=True)
            at(10, 19, f)

        # ---- broke-mode rescues
        def rescue(ts):
            if st.balance < PERSONA["broke_rupees"] and rng.random() < 0.35:
                if rng.random() < 0.55:
                    fname, fvpa = rng.choice(FRIENDS)
                    amt = rng.choice([200, 300, 500])
                    n, ref = upi_narr("CR", fname, fvpa, "Return later")
                    post(ts, n, ref, credit=amt, merchant=fname, category="transfer_from_person", counterparty="person")
                else:
                    amt = rng.choice([300, 500, 1000])
                    n, ref = upi_narr("CR", PERSONA["allowance_sender"], "sanchita.das@oksbi", "Kharcha")
                    post(ts, n, ref, credit=amt, merchant=PERSONA["allowance_sender"], category="transfer_from_person",
                         counterparty="person")
        at(18, 22, rescue)

        # friends paying back
        if rng.random() < 0.04:
            fname, fvpa = rng.choice(FRIENDS)
            amt = human_amount(rng, 40, 250)
            def f(ts, fname=fname, fvpa=fvpa, amt=amt):
                n, ref = upi_narr("CR", fname, fvpa, "Split")
                post(ts, n, ref, credit=amt, merchant=fname, category="transfer_from_person", counterparty="person")
            at(19, 23, f)

        # reversals due today
        for rd, amt, oref, name in [p for p in pending_reversals if p[0] == day]:
            def f(ts, amt=amt, oref=oref, name=name):
                ref = new_ref()
                post(ts, f"REV-UPI-{name}-{oref}-UPI TXN REVERSAL", ref, credit=amt, merchant=name,
                     category="refund", counterparty="merchant")
            at(9, 21, f)
        pending_reversals[:] = [p for p in pending_reversals if p[0] != day]

        # quarterly SMS charges (some banks)
        if day.month in (3, 6, 9, 12) and day.day == 30:
            def f(ts):
                ref = new_ref()
                amt = min(18, max(st.balance, 0))
                if amt:
                    post(ts, f"SMS CHARGES FOR QTR INCL GST {ref}", ref, debit=amt, merchant="BANK",
                         category="other", counterparty="bank")
            at(2, 3, f)

        # execute in time order: balance evolves exactly as the statement shows
        for h, mi, fn in sorted(events, key=lambda e: (e[0], e[1])):
            fn(datetime(day.year, day.month, day.day, h, mi))
        day += timedelta(days=1)

    # ---- write bank-style CSV
    with open(out / "statement.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["Date", "Narration", "Chq./Ref.No.", "Value Dt", "Withdrawal Amt.", "Deposit Amt.", "Closing Balance"])
        w.writerow([start.strftime("%d/%m/%y"), "OPENING BALANCE", "", start.strftime("%d/%m/%y"), "", "",
                    f"{PERSONA['opening_balance']:.2f}"])
        for r in st.rows:
            dt = r.ts.strftime("%d/%m/%y")
            w.writerow([dt, r.narration, r.ref, dt, f"{r.debit:.2f}" if r.debit else "",
                        f"{r.credit:.2f}" if r.credit else "", f"{r.balance:.2f}"])
    with open(out / "truth.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["ref", "timestamp", "merchant", "category", "counterparty", "is_consumption_spend"])
        for r in st.rows:
            w.writerow([r.ref, r.ts.isoformat(timespec="minutes"), r.merchant, r.category, r.counterparty,
                        int(r.truth_spend)])
    (out / "persona.json").write_text(json.dumps({"persona": PERSONA, "prices_rupees": PRICES, "seed": args.seed,
                                                  "note": "SIMULATED. Not a real person's data."}, indent=2))
    print(f"wrote {len(st.rows)} rows to {out}/statement.csv (+ truth.csv, persona.json)")


if __name__ == "__main__":
    main()
