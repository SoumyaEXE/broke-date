# Broke Date: Product and Engineering Spec (v2)

Source of truth for the build. If this file and code disagree, this file wins until it is updated with a
dated note. Sections marked **VERIFY** depend on third-party APIs that must be checked against installed
versions before use (see CLAUDE.md rule 9).

---

## 0. Mission

Subarna lives on an allowance that arrives once a month. The question that ruins his week is not
"how much did I spend" but **"will I make it to payday, and what can I safely spend today?"**

Broke Date answers that on his own laptop, from his own bank history, with no cloud:

1. **Safe to spend today**: the largest amount he can spend today while keeping the chance of going broke
   before payday at or below 10%.
2. **500 futures**: TabPFN-driven simulations of the rest of his month. "412 of 500 futures make it."
3. **Price in days**: how many days of runway any past or planned purchase costs him.
4. **A letter from a future that went broke**: a weekly note written by Gemma, every number grounded.
5. **It grades itself**: a pre-registered backtest on his own history, shown in the app.

Built for one person. Works for anyone on irregular money. The post leads with Subarna, always.

### What judges must feel in 10 seconds
- A striking visual that is also the honest model output (the futures canvas).
- A single human number ("₹420 safe to spend today").
- Proof: every number clickable to its source; offline proven by a test; claims backed by a backtest.

---

## 1. Users

| User | Context | What they need |
|---|---|---|
| Subarna (primary) | Third-year student, Kolkata. Allowance from his mother once a month. Laptop + Android phone. Spends via UPI. | Know what is safe today; see what Saturday plans really cost; not be lectured. |
| Soumyadeep (second validation subject) | Student + freelancer, irregular income. | Same engine with a different "anchor income" definition. Proves it generalizes beyond one person. |
| Judges | 30 to 90 seconds per entry, desktop browser. | Instant demo with sample data, a striking visual, credible numbers. |

---

## 2. Product surface

Copy in quotes is final unless the user changes it. Numbers in examples are placeholders; real values
come from the engine.

### 2.1 Home ("Today")
- Header: date, days until next allowance ("Allowance in 17 days").
- **Hero number**: "₹{safe} safe to spend today". Sub-line: "Keeps your chance of going broke before
  payday at or below 10%." Tap opens the evidence drawer.
- **Futures count**: "{k} of 500 futures make it to payday." Small multiples of 10x50 dots (green/red)
  as a compact alternate to the canvas on narrow screens.
- **Broke date** (only if P(broke) >= 0.2): "If you do go broke, most likely around the {d}th
  (80% range {a}th to {b}th)."
- **Futures canvas** (see 2.2) below the fold on mobile, beside the hero on desktop.
- **Planned purchases** list with "+ Add plan" (name, amount, date). Each row shows a day-cost chip
  ("2.1 days") and a toggle. Toggling animates the canvas and updates hero numbers.
- **Recent purchases** (last 7 days) with "What if I hadn't?" chips (days regained).
- **Letter card** (weekly; regenerate button; mute in settings).

### 2.2 Futures canvas (the wonder screen)
- X axis: today to next allowance. Y axis: balance. 500 paths drawn at low alpha.
- Paths that never cross the broke line: color A. Paths that cross: color B, and they **stop** at the
  crossing day (a path ending is visually meaningful).
- Colors must be color-blind safe: use blue-green `#0f766e` for "made it" and vermilion `#d9480f` for
  "broke", plus a dashed broke line labelled "broke line ₹150". Never rely on color alone: the legend
  shows counts.
- Median path drawn bold. 80% calibrated band shaded.
- On toggle: transition paths over 600 ms (interpolate between baseline and counterfactual arrays with
  identical path indices; CRN guarantees path i corresponds across scenarios). Show a delta badge:
  "+61 futures make it".
- Render with `<canvas>` (not SVG): 500 paths x ~30 points must stay at 60 fps on an i3.

### 2.3 Eaten calendar
- Horizontal strip of day cells from today to allowance. Cells after the median broke day are dark with
  "broke" hatching. Each planned or recent purchase appears as a bite taken off the right end of the
  strip, sized by its day cost. Toggling a purchase restores its bite with an animation.
- This is the GIF that opens the post. Make the animation crisp and slow enough to read (~700 ms).

### 2.4 Evidence drawer ("Why?")
Every number on screen has an info affordance that opens the drawer showing:
- The fact id and value from the facts ledger.
- How it was computed (one plain sentence + "technical details" expander).
- Inputs used (date range of history, number of futures, seed, model version).
- For "similar month": a small overlay chart of this month vs the matched past month.

### 2.5 "How good am I on your data?" (self-grading page)
- Reads `out/backtest/summary.json` produced by the pre-registered evaluation.
- Plain-language headline: "On your past {n} months, I flagged trouble on average {x} days before it
  happened." Only shown if the metric exists; otherwise "[[pending: backtest]]".
- Table: TabPFN vs 3 baselines on the pre-registered metrics with 90% CIs.
- Calibration chart: claimed 80% coverage vs actual, before and after calibration.
- Honest-limitations box, auto-filled from the evaluation output (n cycles, CI widths, where it lost).

### 2.6 Import
- Drop a PDF/CSV/XLS statement or "Use sample data".
- Progress: parsing, reconciliation (green check or the exact mismatching row), categorization
  (with count resolved by rules vs Gemma vs needs review).
- Review table for uncategorized or low-confidence rows; corrections persist.
- Anchor income confirmation: "These look like your allowance: [list]. Correct?" (see 6.4).

### 2.7 Settings
- Broke line (default ₹150), risk tolerance for safe-to-spend (default 10%), number of futures
  (default 500, interactive 250), letter language (Benglish / English / Bengali / other free text),
  letter on/off, Gemma on/off (fallback mode), data folder location, "Delete all my data".

### 2.8 Pocket file (phone)
See section 17.

---

## 3. Architecture

```
statement (PDF/CSV/XLS)
   -> ingest adapters -> reconciliation (hard fail on mismatch)
   -> enrichment: rules -> Gemma (schema-locked) -> cache -> user corrections
   -> ledger DB (SQLite, integer paise)
   -> cycles (anchor income detection) -> daily table -> features (closure rule)
   -> models: TabPFN spend-distribution model, TabPFN direct remaining-spend model, baselines
   -> simulator: N futures, batched, CRN, scheduled events, anchoring, calibration
   -> outputs: safe-to-spend, futures, broke-date dist, price-in-days, similar month
   -> facts ledger -> Gemma letter writer (placeholders only, validator) -> renderer
   -> FastAPI (127.0.0.1) -> React UI | static demo export | pocket.html export
```

All processes bind to 127.0.0.1. Ollama runs locally. No other network.

---

## 4. Repo layout

```
broke-date/
  CLAUDE.md
  Makefile
  README.md
  LICENSE                      # MIT for our code; README notes third-party model licences
  .gitignore                   # data/real/, ~/.brokedate, *.pdf, out/real/
  .pre-commit-config.yaml      # + scripts/hooks/block_private.py
  config/brokedate.example.toml
  docs/  SPEC.md PREREGISTRATION.md NOTES.md  dev/TASKS.md  submission/(POST_DRAFT VIDEO_SCRIPT RUNBOOK IMAGES).md  images/
  scripts/
    simulate.py                # public demo data generator
    hooks/block_private.py
  engine/
    pyproject.toml
    brokedate/
      __init__.py
      config.py                # pydantic-settings, loads TOML + env
      money.py                 # Paise type, formatting (₹ with Indian grouping)
      db.py                    # SQLite schema + access
      ingest/
        base.py                # Adapter protocol
        pdf_bank.py            # Subarna's bank format (written after inspecting a redacted page)
        csv_generic.py         # column-mapping CSV/XLS adapter
        sim.py                 # adapter for scripts/simulate_statement.py output
        reconcile.py
        cycles.py              # anchor income detection + cycle segmentation
      enrich/
        rules.py               # regex narration parser
        gemma.py               # Ollama structured-output categorizer
        cache.py
        eval_labels.py         # accuracy vs hand-labelled set
      features/
        daily.py               # transactions -> daily table
        spec.py                # FEATURES list + closure assertions
      models/
        tabpfn_adapter.py      # VERIFY: single point of contact with tabpfn
        spend_model.py         # daily spend distribution
        direct_model.py        # remaining-spend-to-payday distribution
        baselines.py           # B1 burn rate, B2 last cycle, B3 LightGBM quantile
      sim/
        rollout.py             # vectorized N-future simulator
        events.py              # scheduled known events
        anchor.py              # quantile mapping to direct model
        calibrate.py           # spread scaling for coverage
      forecast/
        outputs.py             # survival, broke-date, safe-to-spend, price-in-days
        similar.py             # DTW similar month
        facts.py               # facts ledger
      narrate/
        letter.py              # prompt + Ollama call
        validate.py            # digit / number-word rejection
        templates.py           # fallback letters per language
        tone.py                # tone rules injected into prompt
      eval/
        backtest.py            # walk-forward per PREREGISTRATION.md
        metrics.py             # Brier, CRPS (sample-based), coverage, lead time
        bootstrap.py           # block bootstrap by cycle
      export/
        demo.py                # precomputed JSON for static site
        pocket.py              # single-file HTML for phone
      bench/
        harness.py
      api/
        server.py              # FastAPI app
        schemas.py             # pydantic response models (mirror web/src/types.ts)
      cli.py                   # `brokedate` Typer CLI
    tests/
  web/
    package.json vite.config.ts tailwind.config.ts index.html
    src/
      types.ts                 # mirrors engine/brokedate/api/schemas.py
      data/provider.ts         # interface; LiveProvider (fetch 127.0.0.1) and StaticProvider (demo JSON)
      components/ FuturesCanvas.tsx EatenCalendar.tsx HeroSafe.tsx PlanList.tsx RecentList.tsx
                  LetterCard.tsx EvidenceDrawer.tsx BacktestPage.tsx ImportFlow.tsx Settings.tsx
      lib/ format.ts interpolate.ts
      fonts/                   # bundled, no remote fonts
    public/demo/               # generated by `make demo`
  out/                          # generated artifacts (gitignored except out/demo/)
  data/
    sim/                        # generated sim data (committed)
    real/                       # NEVER committed
```

---

## 5. Data model

All money is **integer paise** internally (`int`, never float). Convert to rupees only at the UI edge.

### 5.1 SQLite tables
```sql
CREATE TABLE txn (
  id            TEXT PRIMARY KEY,      -- stable hash of (source, ref_no or row signature)
  subject       TEXT NOT NULL,         -- 'subarna' | 'soumyadeep' | 'sim'
  ts            TEXT NOT NULL,         -- ISO local time, Asia/Kolkata
  amount_paise  INTEGER NOT NULL,      -- positive
  direction     TEXT NOT NULL CHECK (direction IN ('DEBIT','CREDIT')),
  status        TEXT NOT NULL DEFAULT 'SUCCESS',  -- SUCCESS | FAILED | REVERSED
  balance_after_paise INTEGER,         -- from statement when available
  raw_narration TEXT NOT NULL,
  ref_no        TEXT,
  merchant      TEXT,
  category      TEXT,                  -- enum in 7.1
  counterparty  TEXT,                  -- 'merchant' | 'person' | 'self' | 'bank' | 'unknown'
  label_source  TEXT,                  -- 'rule' | 'gemma' | 'user' | 'sim'
  is_anchor_income INTEGER NOT NULL DEFAULT 0,
  source_file   TEXT, source_row INTEGER
);
CREATE TABLE label_cache (narration_key TEXT PRIMARY KEY, merchant TEXT, category TEXT,
                          counterparty TEXT, source TEXT, created_at TEXT);
CREATE TABLE plan (id TEXT PRIMARY KEY, subject TEXT, name TEXT, amount_paise INTEGER,
                   date TEXT, active INTEGER DEFAULT 1);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
```

### 5.2 Daily table (pandas, derived, never stored as truth)
One row per calendar day per subject: `date, spend_paise (sum of SUCCESS debits excluding transfers to
self), income_paise, anchor_income_paise, balance_start_paise, balance_end_paise, cycle_id,
day_in_cycle, days_to_next_anchor` plus calendar flags.

### 5.3 Shared API types
Define once in `engine/brokedate/api/schemas.py` (pydantic) and mirror by hand in `web/src/types.ts`.
Add a test that dumps the pydantic JSON schema and compares field names with a checked-in snapshot so the
two cannot drift silently.

Core response: `ForecastResponse`
```
{
  as_of: "2026-10-04", subject: "subarna", seed: 1234, n_futures: 500,
  horizon_days: 17, next_anchor_date: "2026-10-21", broke_line_paise: 15000,
  balance_now_paise: 234000,
  safe_to_spend_paise: 42000, risk_tolerance: 0.10,
  p_make_it: 0.824, n_make_it: 412,
  broke_day: { median: "2026-10-18", lo80: "2026-10-15", hi80: "2026-10-20" } | null,
  paths: { days: ["2026-10-04", ...], balances_paise: int[n_futures][horizon+1] },  // downsample for UI if needed
  band: { p10: int[], p50: int[], p90: int[] },
  similar_month: { cycle_id, label: "February", overlay_this: int[], overlay_then: int[] } | null,
  plans: [{ id, name, amount_paise, date, day_cost: 2.1, futures_delta: -61, active }],
  recent: [{ txn_id, merchant, amount_paise, date, days_regained: 0.8 }],
  facts: { "f1": { value, unit, text_en, source: { kind, detail } }, ... },
  model: { tabpfn_version, engine_version, n_history_days, anchored: true, calibrated: true, spread_k: 1.07 }
}
```

---

## 6. Ingestion

### 6.1 Adapter protocol
```python
class Adapter(Protocol):
    name: str
    def sniff(self, path: Path) -> float: ...           # confidence 0..1
    def parse(self, path: Path, subject: str) -> list[RawTxn]: ...
```
Registry picks the highest `sniff` score above 0.6, else asks the user to choose.

### 6.2 Subarna's bank PDF adapter
- Do not guess the format. Step 1: `brokedate inspect statement.pdf` prints page 1 table structure with
  all digits masked (`9` -> `#`) and narrations truncated, so the format can be discussed safely.
- Implement with `pdfplumber` table extraction; handle multi-line narrations, page headers/footers,
  carried-forward rows, and "Opening Balance" rows.
- If his bank app also exports CSV/XLS, prefer it (more reliable) and keep the PDF adapter as a fallback.
- **VERIFY** UPI app exports: PhonePe and Paytm statements are typically PDFs; Google Pay often has no
  direct export. Prefer the bank's own statement.

### 6.3 Reconciliation (hard gate)
For each subject, sorted by statement order:
`balance[i] = balance[i-1] + credit[i] - debit[i]` must equal the statement's balance column for every
row where the statement provides one. On the first mismatch: stop, show the row index, the expected and
found values (digits visible only locally), and do not write anything to the DB.
Also: drop FAILED rows, pair and remove REVERSED/refund-of-same-ref rows, dedupe by `ref_no`.
Property test: random sequences from the simulator always reconcile; a single mutated amount always fails.

### 6.4 Anchor income and cycles
- Anchor income = the recurring credit that defines "payday". Detection: credits whose counterparty
  string matches a configurable pattern (default: largest recurring sender), arriving within +-5 days of
  the same day of month, amount within +-40% of the median. User confirms the list in the UI.
- For irregular earners (Soumyadeep): anchor income = any credit >= configurable threshold. "Next
  anchor date" is then predicted, not known. In that case the horizon is the 75th percentile of historical
  gaps between anchors and the UI says "Next income: not scheduled, assuming ~{n} days".
- Cycle = interval between consecutive anchor credits. Partial cycles at the edges are excluded from
  training targets that need a full cycle but kept for daily spend modelling.

---

## 7. Enrichment

### 7.1 Category enum
`food_delivery, campus_food, groceries_snacks, transport, outing, shopping, recharge_bills, gaming,
education, transfer_to_person, transfer_from_person, allowance, refund, cash_withdrawal, other`

### 7.2 Rules first (`enrich/rules.py`)
Regex library for common Indian narration shapes, for example:
```
UPI/DR/<ref>/<NAME>/<BANK>/<vpa>/<note>
UPI-<NAME>-<vpa>-<BANKCODE>-<ref>-<note>
NEFT/<ref>/<NAME>/...
IMPS/P2A/<ref>/<NAME>/...
POS <ref> <MERCHANT> <CITY>
ATM WDL <ref> <LOCATION>
```
Plus a merchant dictionary (Swiggy, Zomato, Blinkit, Zepto, Uber, Rapido, Ola, Metro, Jio, Airtel, PVR,
INOX, Myntra, Meesho, Amazon, Flipkart, Google Play, ...). VPA handles that look like a person
(`name@okaxis`, phone-number VPAs) map to `counterparty=person`.

### 7.3 Gemma for the rest (`enrich/gemma.py`)  **VERIFY**
- Ollama chat endpoint with `format` set to a JSON schema (Ollama structured outputs). Schema:
  `{"merchant": string, "category": enum(7.1), "counterparty": enum, "confidence": number 0..1}`.
- `temperature: 0`. Batch rows (e.g. 20 narrations per request, array schema) to cut latency on CPU.
- Prompt includes the category definitions and 8 few-shot examples built from **simulated** narrations
  only (never real ones).
- Rows with `confidence < 0.6` go to the review table.
- Cache by normalized narration key (lowercase, refs and digits stripped).
- Model tag from config `gemma.model`; on startup, `ollama list` and fail fast with a helpful message if
  missing. Gemma disabled -> rules + cache + "needs review".

### 7.4 Evaluation of categorization
- `data/real/labels_100.csv` (local only): 100 rows hand-labelled by Soumyadeep/Subarna.
- Report: rules coverage %, Gemma accuracy on the remainder, overall accuracy, confusion matrix.
- These numbers go in the post's nerd section (as computed, never typed by hand).

---

## 8. Features

### 8.1 Closure rule (hard)
Every feature of the **daily spend model** must be computable inside the simulator from:
(a) the calendar, (b) the simulated balance, (c) the simulated daily-spend history (real history
prepended), (d) scheduled events. `features/spec.py` declares each feature with a `closure_ok: bool`
and a test asserts the spend model uses only `closure_ok` features.

### 8.2 Spend model features (closure-safe)
| Feature | Definition |
|---|---|
| dow | weekday 0..6 (categorical as integer) |
| is_weekend | 0/1 |
| day_in_cycle | days since last anchor |
| days_to_anchor | days until next anchor (known or assumed) |
| frac_cycle | day_in_cycle / cycle_length |
| bal_rupees | balance at start of day |
| bal_frac | balance / anchor amount |
| safe_daily | balance / max(days_to_anchor, 1) |
| spend_1d, spend_3d, spend_7d, spend_14d | rolling sums of daily spend (rupees) |
| days_since_big | days since a day with spend > 2x median daily spend |
| zero_streak | consecutive zero-spend days ending yesterday |
| is_festival, days_to_festival | from a local calendar file (Kolkata festivals, editable) |
| is_exam | from user-entered exam windows (optional) |
| scheduled_today | known scheduled outflow today (recharge, plans) in rupees |

Category-level features (delivery count etc.) are **not** allowed here. They may be used by the
explanation layer only.

### 8.3 Direct model features
Same as above at the origin day only, plus `cycle_spend_so_far`. Target: total spend from origin day
(inclusive) to the day before next anchor.

---

## 9. Models

### 9.1 TabPFN adapter  **VERIFY**
`models/tabpfn_adapter.py` is the only file that imports `tabpfn`. It exposes:
```python
class DistRegressor:
    def fit(self, X: np.ndarray, y: np.ndarray) -> "DistRegressor": ...
    def quantiles(self, X: np.ndarray, qs: np.ndarray) -> np.ndarray:  # shape (len(X), len(qs))
```
Implementation notes to verify against the installed version:
- `TabPFNRegressor(device="cpu", n_estimators=..., random_state=seed, ...)`.
- Prediction with `output_type="quantiles"` and a `quantiles=[...]` list is expected to return one array
  per quantile; stack to `(n, q)`. If the installed API differs, adapt here only.
- A cached fit mode exists in recent versions to speed up repeated predictions on the same training
  context; find its exact parameter name in the installed version and use it.
- CPU sample-size guard: if a warning/limit about training size on CPU appears, check for the documented
  override flag; our training sets are small (< 1,000 rows) so this should not trigger.
- Weights download on first use. Record model version, weight file name and licence in `docs/NOTES.md`.
  If weights are gated (licence acceptance / token), document the one-time step in README.
- Fallback (only if local weights are impossible): `tabpfn-client` behind the same interface, with a loud
  UI banner "Cloud mode: your data is sent to Prior Labs" and the offline test marked skipped. Do not
  ship cloud mode as default.
- Smoke test `tests/test_tabpfn_adapter.py`: fit on 200 synthetic rows, quantiles monotone in q,
  output shape correct, runtime logged.

### 9.2 Spend distribution model
- Train on all complete days of the subject's history up to the origin. Target: `spend_rupees`.
- Quantile grid `QS = linspace(0.01, 0.99, 99)`. Enforce monotonicity with `np.maximum.accumulate`.
- Sampling: given `u ~ U(0,1)` per future per day (from the CRN stream), interpolate the inverse CDF
  across the grid; below 0.01 use q01, above 0.99 use q99 times a small tail factor (config, default 1.0,
  i.e. no extrapolation). Clip at 0.
- Zero-inflation is handled naturally: many low quantiles will be exactly 0 on no-spend days.

### 9.3 Direct remaining-spend model
- One row per historical day: features at that day, target = spend until the day before next anchor.
- Same adapter, quantile grid. Used for anchoring (10.5) and as an extra point in the backtest.

### 9.4 Baselines (`models/baselines.py`)
- **B1 burn rate**: remaining spend = mean daily spend over last 14 days x days_to_anchor; broke if
  balance - remaining < broke line. Probability via a logistic squash of the margin fitted on history
  (so Brier is defined).
- **B2 same point last cycle**: remaining spend = spend from the same day_in_cycle to end in the previous
  full cycle.
- **B3 LightGBM quantile**: one LGBM per quantile in a coarse grid (0.1..0.9) on the same closure-safe
  features, used in the same simulator. Fixed hyperparameters (in PREREGISTRATION.md), no tuning on test.

---

## 10. Simulation engine (`sim/`)

### 10.1 Inputs
History daily table up to `as_of - 1`, current state at start of `as_of` (balance, rolling buffers),
horizon `H` days to the day before next anchor, scheduled events, `N` futures, `seed`, model.

### 10.2 Common random numbers
`rng = np.random.default_rng(seed)`; draw `U = rng.random((N, H))` once per forecast. **All scenarios
(baseline, counterfactuals, safe-to-spend search) reuse the same `U`.** This makes differences between
scenarios reflect only the intervention, and makes path i comparable across scenarios for animation.

### 10.3 Rollout (vectorized)
```python
def rollout(state0, U, model, events, H, N, broke_line):
    bal = np.full(N, state0.balance, dtype=float)
    hist = np.tile(state0.last_14_spends, (N, 1))      # (N, 14) rolling buffer
    alive = np.ones(N, bool); first_broke = np.full(N, -1)
    paths = np.empty((N, H + 1)); paths[:, 0] = bal
    for t in range(H):
        X = build_features_batch(day=t, bal=bal, hist=hist, events=events, calendar=...)  # (N, F)
        Q = model.quantiles(X, QS)                       # ONE call per day, (N, 99)
        spend = inverse_cdf(Q, U[:, t]) + events.scheduled(t)   # scheduled outflows deterministic
        spend = np.minimum(spend, np.maximum(bal, 0))    # cannot spend money you don't have (UPI)
        bal = bal - spend + events.inflows(t)
        hist = np.roll(hist, -1, axis=1); hist[:, -1] = spend
        newly = alive & (bal < broke_line)
        first_broke[newly] = t + 1; alive &= ~newly
        paths[:, t + 1] = bal
    return paths, first_broke
```
Notes:
- Features that are identical across futures (calendar) are computed once per day and broadcast.
- Futures that went broke keep simulating (their balance stays near 0) so the band is well defined, but
  the UI stops drawing them at `first_broke`.
- Cost: H calls with N rows each. Target: N=500, H<=31 in under 60 s on the i3-1215U (measured, not
  assumed). Interactive mode N=250.

### 10.4 Scheduled events (`sim/events.py`)
Known recurring outflows (phone recharge every 28 days from last observed, subscriptions), user plans,
festivals (as features), and for the irregular-income subject optional expected inflows. Plans are
injected as deterministic spend on their date in addition to sampled spend. **Known limitation:** a plan
may overlap with spending the model already expects on that day type (double counting). Mitigation:
plans reduce the sampled spend that day by the model's median spend for that weekday, floored at 0, and
this is stated in the limitations section.

### 10.5 Anchoring to the direct model (`sim/anchor.py`)
Purpose: stop small daily errors compounding over H days.
1. Rollout totals `T_i = sum_t spend_i,t` (excluding scheduled events).
2. Direct model gives quantiles `D(q)` of remaining spend at the origin.
3. For each future, rank `r_i = rank(T_i)/(N+1)`; target total `T*_i = D(r_i)` (interpolated).
4. Scale that future's sampled daily spends by `T*_i / T_i` (guard `T_i = 0`), then recompute balances,
   `first_broke`. Order of paths and their shapes are preserved; their totals now match the direct
   model's distribution.
Anchoring is on by default. The backtest reports results with and without it (pre-registered).

### 10.6 Calibration (`sim/calibrate.py`)
Spread scaling: for each future, `T_i' = median(T) + k * (T_i - median(T))`, with `k` chosen on
walk-forward history so that the 80% interval of end-of-cycle balance covers ~80% of realized outcomes.
`k` is fit only on origins strictly before the current one (nested), clipped to [0.7, 1.6]. Report
coverage before and after.

---

## 11. Forecast outputs (`forecast/`)

| Output | Definition |
|---|---|
| `p_make_it` | fraction of futures with `first_broke == -1` |
| broke-day distribution | `first_broke` over futures that go broke; median and 10th/90th percentile; null if `p_make_it > 0.8` (UI then hides the broke date) |
| safe to spend | largest `S` in [0, balance - broke_line] such that, injecting `S` as spend today and re-running with the same `U`, `P(broke) <= tolerance`. Bisection to ₹10 precision, max 10 iterations, cache the curve `P(broke | S)` on a grid (also exported to the pocket file). If even `S=0` exceeds tolerance: show "Nothing is safe today" + the current risk, never a negative number |
| price in days (plan) | `median_runway(with plan) - median_runway(without plan)`, where runway = `first_broke` or `H+1` for futures that make it. Also report `futures_delta`. Same `U` |
| days regained (recent purchase) | re-run from today with balance + that amount; same `U`; difference in median runway |
| similar month | DTW distance between this cycle's normalized balance curve (balance / anchor amount vs day_in_cycle, up to today) and each past cycle's prefix of equal length; Sakoe-Chiba band of 3 days; return best cycle and its full curve for overlay. Implement DTW in numpy (no extra dependency) |

All outputs are written into the facts ledger (section 14.1) with their computation source.

---

## 12. Performance and caching

- Fit TabPFN once per (subject, as_of, model kind); keep in memory in the API process.
- Precompute on forecast: baseline, all active plans toggled off/on individually, top 5 recent purchases,
  and the safe-to-spend curve. Toggling in the UI is then instant (no recompute) for those cases.
- Arbitrary new plan: recompute with N=250 and show a spinner with an honest estimate from the
  benchmark ("about {s} seconds on this laptop").
- Benchmark harness (`bench/harness.py`) records: fit time, per-day predict time, full forecast time,
  safe-to-spend search time, peak RSS (via `psutil`), Gemma tokens/s. Writes `out/bench.json` with
  machine info (CPU model, RAM, OS). The 8 GB test runs the engine under a memory cap (Linux:
  `systemd-run --scope -p MemoryMax=8G ...` or `prlimit`; Windows: document the method used).

---

## 13. Evaluation (`eval/`)

Implements `docs/PREREGISTRATION.md` exactly. Key implementation rules:
- Walk-forward: for each origin, every model is fit on data strictly before the origin.
- Origins: every `stride`-th day (stride from prereg) with >= 60 days of history and a known next anchor.
- Metrics (`eval/metrics.py`):
  - Brier: `mean((p - y)^2)` for broke-before-anchor.
  - CRPS from samples for end-of-cycle balance: `mean|X - y| - 0.5 * mean|X - X'|` (use the sorted-sample
    O(N log N) formula).
  - Coverage of the 80% interval of end-of-cycle balance.
  - Lead time (cycles that went broke): actual broke day minus the first origin day in that cycle where
    `P(broke) >= 0.5`. Negative or missing = no useful warning, counted as such.
- Block bootstrap (`eval/bootstrap.py`): resample whole cycles with replacement, 2,000 reps, 90% CI on
  each metric and on the TabPFN-minus-baseline difference.
- Outputs `out/backtest/{subject}/summary.json` and `per_origin.parquet`. The UI and post read only these.
- Runtime: the backtest is the heaviest job. Run it overnight Saturday with the prereg's `stride` and
  `n_futures_eval`. Log progress and support resume (checkpoint per origin).

---

## 14. Narration

### 14.1 Facts ledger (`forecast/facts.py`)
```json
{"f1": {"value": 42000, "unit": "paise", "kind": "safe_to_spend",
        "text_en": "₹420 safe to spend today", "source": {"kind": "simulation", "n": 500, "seed": 1234}},
 "f2": {"value": 2.1, "unit": "days", "kind": "plan_day_cost", "subject_ref": "plan:pvr-sat",
        "text_en": "2.1 days", "source": {"kind": "counterfactual", "plan_id": "pvr-sat"}},
 "f3": {"value": 88, "unit": "futures", "kind": "n_broke", ...}}
```
Values are rendered by the UI/renderer using `money.py` formatting, never by Gemma.

### 14.2 Letter writer (`narrate/letter.py`)
- Voice: written **from one specific future that went broke** (pick the broke future whose path is
  closest to the median broke path). Opening like "From one of the {f3} of us who didn't make it."
- Inputs to Gemma: language, tone rules, the list of fact ids with **descriptions but no values**
  (e.g. `f2: day cost of the plan 'PVR Saturday'`), the plan names, the similar-month label.
- Output contract: plain text, 40 to 90 words, may only reference numbers as `{fN}` placeholders.
- **Validator** (`narrate/validate.py`):
  - Reject if `re.search(r"\d", text)` (Python's `\d` matches Unicode decimal digits, which covers
    Bengali `০-৯`; add an explicit test for both scripts).
  - Reject if any token is in a number-word blocklist (English one..thousand, "dozen", "half", Bengali
    and transliterated Bengali number words; extendable).
  - Reject unknown placeholders (`{f9}` not in ledger) and placeholders adjacent to currency symbols that
    would double-render.
  - Up to 3 attempts with the rejection reason appended; then use `templates.py` for that language.
- Tone rules (`narrate/tone.py`): warm, funny, a little haunting, never shaming, never moralizing about
  money, no advice beyond the facts, no comments about family. One concrete suggestion at most, and only
  one backed by a counterfactual fact.
- Renderer replaces placeholders with formatted values and wraps each in a link to the evidence drawer.

### 14.3 Languages
Default for Subarna: Benglish (Bengali in Latin script mixed with English). Also English, Bengali
script, or any language string the user types. Validator is language-agnostic for digits.

---

## 15. API (FastAPI, 127.0.0.1:8787)

| Method | Path | Body / query | Returns |
|---|---|---|---|
| POST | /import | multipart file, subject | ImportReport (parsed rows, reconciliation result, categorization stats) |
| GET | /review | subject | rows needing review |
| POST | /review | corrections | ok |
| GET | /anchors | subject | detected anchor credits |
| POST | /anchors | confirmed ids | ok |
| POST | /forecast | subject, as_of?, n?, seed? | ForecastResponse |
| POST | /plans | plan | ForecastResponse (recomputed) |
| PATCH | /plans/{id} | active | ForecastResponse (from cache if precomputed) |
| GET | /letter | subject, language | {text_rendered, placeholders, attempts, fallback_used} |
| GET | /backtest | subject | summary.json |
| GET | /health | | versions, model availability, gemma on/off |

CORS only for the Vite dev origin. Bind to 127.0.0.1 only.

---

## 16. Frontend

### 16.1 Design direction
"Bank statement meets late-night poster." Off-white paper `#f7f5f0` background, ink `#14110f`,
made-it `#0f766e`, broke `#d9480f`, muted `#6b6460`. Numbers in a tabular monospace (bundle
JetBrains Mono or IBM Plex Mono locally); text in a clean grotesk (bundle locally). Dark mode with the
same accents on `#121110`. Generous whitespace; one hero number per screen. No gradients, no emoji
confetti, no generic dashboard cards. Motion only where it carries meaning (paths morphing, days being
eaten).

### 16.2 Data provider
`DataProvider` interface with `LiveProvider` (fetch to 127.0.0.1:8787) and `StaticProvider` (reads
`/demo/*.json`). Build flag `VITE_MODE=demo` selects static. The static demo shows a persistent,
polite banner: "Sample data (simulated). The real thing runs offline on your laptop." Demo toggles only
offer precomputed scenarios.

### 16.3 Components (key behaviour)
- `FuturesCanvas`: props `paths`, `firstBroke`, `band`, `brokeLine`, `compareTo?`. Device-pixel-ratio
  aware, resizes with container, draws paths at alpha 0.06, median at full opacity, animates between
  two path arrays with requestAnimationFrame. Hover: show balance at day for the median path.
- `EatenCalendar`: computes bites from plan/recent day costs; respects reduced-motion preference.
- `HeroSafe`: big number, risk sub-line, evidence link.
- `EvidenceDrawer`: renders any fact by id.
- `BacktestPage`: table + calibration chart (Recharts is fine here).
- Accessibility: keyboard reachable toggles, focus rings, aria-live on hero number changes, color-blind
  safe palette, text alternatives for the canvas (counts and median broke day as text).

### 16.4 Build for GitHub Pages
`vite.config.ts` `base` set from env for the repo path. `make demo` exports JSON from sim data and builds.
Deploy via GitHub Actions to Pages. **VERIFY** Pages is enabled on the repo; Cloudflare Pages is the
fallback. No card required for either.

---

## 17. Pocket file (`export/pocket.py`)

- One self-contained `pocket.html` (inline CSS/JS, no external requests) with an embedded JSON snapshot:
  hero numbers, futures (downsampled to 100 paths), band, plans with precomputed toggles, the
  safe-to-spend curve `P(broke | S)` on a grid of S, and the letter.
- "Can I afford ₹X today?" input: interpolates the precomputed curve and answers with the risk.
- "I spent ₹X" quick log: stored in the page's localStorage, subtracts from balance and shifts the curve
  lookup accordingly, with a label "estimate until your next laptop sync".
- Snapshot timestamp shown prominently; after 3 days it shows "This snapshot is getting old".
- Transfer: Quick Share / USB. Document both. No server, no QR networking.

---

## 18. Privacy, offline, security

- Offline test: `pytest --disable-socket --allow-hosts=127.0.0.1,localhost` (pytest-socket) runs the
  full pipeline on sim data including a mocked or real local Ollama. CI runs it; README shows the badge.
  **VERIFY** pytest-socket flag names against the installed version.
- UI: no external URLs in the built bundle. Add a build-time check that greps `web/dist` for `http://`
  or `https://` outside an allowlist (GitHub repo link in About page only).
- Pre-commit hook `scripts/hooks/block_private.py`: blocks staged files under `data/real/`, any `.pdf`,
  any `.sqlite`, and content matching 9 to 18 digit runs next to "A/C", "Acct", "account" (tune to avoid
  false positives on paise values in tests).
- Logs: narrations only at DEBUG; DEBUG disabled by default.
- "Delete all my data" removes `~/.brokedate/` and `data/real/` after confirmation.
- Publication policy for the post: relative numbers only for Subarna (days, % of allowance), dates
  shifted by a hidden constant, category-level spending, no merchant names that identify places he
  frequents, Subarna approves before publishing.

---

## 19. Testing strategy

| Layer | Tests |
|---|---|
| money | formatting (₹1,23,456.78 Indian grouping), paise arithmetic, no floats in DB |
| ingest | sim adapter round-trip; reconciliation property tests; dedupe and reversal pairing |
| cycles | anchor detection on sim data finds all allowance credits; irregular-income mode |
| enrich | rules on a fixture of 50 synthetic narrations; Gemma call mocked with schema-valid and invalid responses |
| features | closure rule test; no leakage test (features at day d use only data < d) |
| models | adapter smoke test; quantiles monotone; deterministic with seed |
| sim | CRN: identical U gives identical paths; counterfactual with zero-amount plan gives zero delta; paths never below 0; anchoring preserves path order and matches direct quantiles |
| outputs | safe-to-spend monotonic risk curve; never negative; "nothing safe" branch |
| eval | metrics against hand-computed tiny examples; bootstrap CI contains point estimate |
| narrate | validator rejects Latin digits, Bengali digits, number words, unknown placeholders; fallback after 3 failures |
| api | schema snapshot test (pydantic vs types.ts field names) |
| offline | full pipeline with sockets blocked except localhost |
| web | vitest for format/interpolate; Playwright smoke on the static demo (loads, toggle animates, no console errors, no external requests) |

---

## 20. Config (`config/brokedate.example.toml`)
See the file. Every tunable lives there; nothing magic in code.

---

## 21. Simulated demo data
`scripts/simulate_statement.py` produces a persona-driven year for a student in a tier-2 Indian city as a
**bank-style CSV export** (`data/sim/statement.csv`: Date, Narration, Chq./Ref.No., Value Dt,
Withdrawal Amt., Deposit Amt., Closing Balance) plus `truth.csv` (ground-truth merchant, category,
counterparty per ref) and `persona.json` (all assumptions and prices). Properties:
- Realistic UPI narrations (`UPI-<NAME>-<vpa>-<IFSC>-<12-digit RRN>-<note>`), person-VPA drivers and tea
  stalls (hard cases for categorization), failed-then-reversed UPI, ATM cash withdrawals (spending that
  disappears from the record), quarterly interest credits and SMS charges, friend splits and paybacks,
  borrowing and emergency top-ups when broke, festival gifts and splurges, exam-period delivery spikes.
- Running balance reconciles to the paisa on every row (tested).
- With the default seed (13), 5 of 11 full allowance cycles dip below the ₹150 broke line. Other seeds range
  from 1 to 8 of 11: use several seeds in tests so the engine is not tuned to one story.
- It goes through the **same ingestion path as real data** (generic CSV bank adapter), so parser,
  reconciliation and categorization are developed and tested before the real statement arrives.
- `truth.csv` gives the categorizer a free accuracy benchmark on simulated rows (report separately from the
  real 100-row hand-labelled score; never mix them).
- Read `Chq./Ref.No.` as a string (12-digit refs lose precision as floats).
It is the only data used for the public demo, tests and screenshots, and must never be described as a
real person's data.

---

## 22. Delivery

### 22.1 Demo site
Static build on GitHub Pages: home, futures canvas, eaten calendar, plan toggles (precomputed), letter,
backtest page computed on sim data (labelled as such), "Run it on your own data" section with install
steps.

### 22.2 Video (`docs/submission/VIDEO_SCRIPT.md`)
60 to 90 seconds, recorded with Wi-Fi off and the browser network panel visible for the first seconds.
Ends on Subarna's real reaction.

### 22.3 Post (`docs/submission/POST_DRAFT.md`)
Two layers. Story, GIF, demo, reaction up top. Technical depth inside DEV's `{% details %}` block.
Required DEV template sections included. Every number pulled from `out/` artifacts by a small script
(`make post-numbers` prints them) so nothing is typed by hand.

### 22.4 Entire
`entire enable --agent claude-code` in the repo at the start. **VERIFY** current CLI usage. Embed the
session per the challenge's instructions in the "My Agent Session" section.

---

## 23. Definition of done (judge checklist)

- [ ] Real statement imported and reconciled to the rupee (local only).
- [ ] Forecast for Subarna's current cycle runs offline in measured time on both laptops.
- [ ] Futures canvas, eaten calendar, plan toggles, safe-to-spend, letter all work live and in the demo.
- [ ] PREREGISTRATION.md committed before the first real backtest run (commit order visible in git log).
- [ ] Backtest summary for Subarna (and Soumyadeep if done) produced; baselines included; CIs included.
- [ ] Calibration before/after coverage reported.
- [ ] Categorization accuracy on 100 labelled rows reported.
- [ ] Offline test green in CI; badge in README.
- [ ] Benchmarks table filled from `out/bench.json`.
- [ ] Pocket file opens offline on Subarna's phone.
- [ ] Static demo deployed; no external requests; no console errors.
- [ ] Video recorded in airplane mode.
- [ ] Post drafted from template with numbers from `make post-numbers`; Subarna approved it.
- [ ] Categories listed: TabPFN, Gemma, Entire. Entire session embedded.
- [ ] README: what it is, install, one-time downloads, licences (TabPFN weights non-commercial), limitations.

---

## 24. Known unknowns (resolve early, record in NOTES.md)

1. TabPFN: exact quantile API, cached fit mode name, current model version, weight download/licence
   steps, CPU speed for N=500 batch predictions.
2. Ollama: Gemma tag available locally, structured-output behaviour with arrays, CPU tokens/s.
3. Subarna's bank: statement format, months available, whether CSV/XLS export exists.
4. Entire CLI current commands and embed method.
5. pytest-socket flag names.
6. Whether Subarna actually runs low most months (decides the post title, not the engine).

## 25. Explicit limitations (pre-written for honesty; keep updated)
- Personal model from one person's history: small sample, wide intervals.
- Days are simulated independently given closure-safe features; streaky behaviour beyond 14 days is not
  modelled.
- Plans can double count with expected spend; mitigated, not eliminated.
- TabPFN weights are licensed for non-commercial use; this is a personal tool.
- The model downloads once; "offline" means after that.
- Irregular-income mode assumes the next income date from history.
