# Broke Date

**How much is safe to spend today, how many of 500 simulated futures make it to payday, and how many days each
plan really costs.** Built for one person, Subarna, a first-year student in Kolkata who lives on a monthly
allowance. It runs on his laptop, reads his own bank statement, and never sends it anywhere.

- Sample-data preview (simulated persona, not a real person): a static page that runs fully in the browser and calls nothing. The real app runs offline on your own laptop.
- Forecasting: [TabPFN](https://github.com/PriorLabs/TabPFN) (open weights, runs locally on CPU)
- Words: [Gemma](https://ai.google.dev/gemma) via [Ollama](https://ollama.com), locally. Gemma never writes a number.
- Offline proof: the full test suite runs in CI with network sockets blocked except localhost

## What it shows

| | |
|---|---|
| **Safe to spend today** | The largest extra spend today that keeps the chance of going broke before payday at or below 10% (setting). |
| **500 futures** | TabPFN-driven simulations of the rest of the month, shown as a fan chart (this month so far, then the typical path and the likely range) and a daily chance-of-running-out bar chart. |
| **Price in days** | How much sooner your own money runs out if you go ahead with a plan, from rerunning the same 500 futures (same random draws) with and without it. |
| **Plans timeline** | The month to payday with each plan marked on its day; pick one to see the month with and without it. |
| **Ask** | A chat that answers ("can I afford ₹400 on Saturday?", "should I ask home for ₹500?") by rerunning the futures, and can act: switch plans, add one, change settings, draw a chart. Gemma phrases the reply offline; it never writes a number. |
| **Unusual spends** | TabPFN predicts what each kind of spend normally costs (category, merchant history, weekday, time of month, balance) and flags spends far above that range. |
| **Festival heads-up** | Durga Puja, Diwali and others from a local calendar, with what the same festival cost last time, measured from the statement. |
| **TabPFN categorizer** | Learns from the rows the regex rules were sure about and labels the leftovers it is confident on, before Gemma; accuracy of each pipeline is measured against ground truth. |
| **A letter from a future that went broke** | Gemma writes it in English, Benglish or Bengali. Every number is a placeholder that the engine fills in, and each one links to where it came from. |
| **How good am I?** | A walk-forward backtest on his own history against three baselines, under rules committed to this repo *before* any results on real data ([PREREGISTRATION.md](docs/PREREGISTRATION.md)). |

Every number on screen opens an evidence drawer: the fact id, its value, how it was computed, and the inputs
(history range, number of futures, seed, model).

## How it works

```
statement (CSV / XLSX / PDF)
  -> adapter -> reconciliation (every running balance must match to the paisa, or nothing is imported)
  -> rules -> TabPFN classifier (learns from the rules) -> Gemma (schema-locked JSON, local) -> review  => SQLite ledger
  -> allowance (anchor) detection -> daily table -> closure-safe features
  -> TabPFN spend-distribution model on a state lattice  +  TabPFN direct remaining-spend model
  -> 500-future simulator (common random numbers, inflows, scheduled events, location anchoring, calibration)
  -> safe-to-spend, broke date, price in days, similar month -> facts ledger -> letter + chat (Gemma, placeholders only)
  -> unusual spends (TabPFN quantiles of each spend) + festival heads-up (measured from last year)
  -> FastAPI on 127.0.0.1 -> React UI  |  static demo  |  single-file pocket.html for the phone
```

**Why a lattice.** On a laptop CPU, TabPFN predicts about 100 rows per second. Calling it once per day for each
of 500 futures would take minutes per scenario. Instead, for every day until payday, TabPFN predicts the full
spending distribution (99 quantiles) once on a small grid of states: balance x last 3 days' spending x last
14 days' spending. Each future then interpolates its own day from that grid. One TabPFN pass per forecast means
every what-if after it (plans, the safe-to-spend search, "what if I hadn't") is instant. The browser and phone
can also rerun the same futures from the exported grid and draws. See [docs/NOTES.md](docs/NOTES.md) for this and
every other decision.

**Honesty rules** (from [CLAUDE.md](CLAUDE.md)): no number is ever typed by hand into the UI, README or post. The
evaluation contract was frozen before any results on real data. If TabPFN loses to a baseline, the app says so.

## Run it on your own data

Requirements: Python 3.11+ via [uv](https://docs.astral.sh/uv/), Node 20+ with pnpm, and optionally Ollama with a
Gemma model.

```bash
# Linux / macOS
make setup
uv --project engine run brokedate import path/to/statement.csv --subject me
uv --project engine run brokedate anchors --subject me --confirm   # check the allowance credits it found
make engine        # API on 127.0.0.1:8787
make web           # UI on 127.0.0.1:5173
```

```powershell
# Windows (no make needed); scripts/env.ps1 keeps all caches and models on one drive
.\scripts\dev.ps1 setup
.\scripts\dev.ps1 engine
.\scripts\dev.ps1 web
```

One-time downloads (the only network use): Python/JS packages, the TabPFN v2 regressor weights (about 43 MB,
fetched on first forecast), and optionally `ollama pull gemma3:4b`. After that it works with Wi-Fi off.

Useful commands: `brokedate inspect <file>` (statement layout with every digit masked, safe to share),
`brokedate forecast -s me`, `brokedate letter -s me`, `brokedate backtest -s me`, `brokedate export-pocket -s me`,
`brokedate plot-balance -s me`, `brokedate delete-data`.

## Privacy

- Real statements, the database and real-data outputs live outside git (`$BROKEDATE_DATA_DIR`, `out/real/`).
  A pre-commit hook blocks private paths, PDFs, SQLite files and account-number patterns.
- The API binds to 127.0.0.1 only. The built UI contains no external URLs (checked at build time), and fonts are
  bundled.
- Gemma's few-shot examples come from simulated narrations only.
- The public demo, screenshots and tests use only `scripts/simulate_statement.py` output: a fictional student in
  a tier-2 West Bengal city.

## Evaluation

`brokedate backtest` runs the pre-registered walk-forward evaluation: every 2nd day with 60+ days of history,
models fit only on earlier data, Brier score for "goes broke before payday", CRPS and 80% interval coverage for
end-of-month balance, lead time, and a block bootstrap over months for 90% intervals. Results are in
`out/backtest/<subject>/summary.json` and on the app's "How good am I?" page. `brokedate post-numbers` prints
every number the write-up uses.

## Limitations

- A personal model fit on one person's history: few months, wide intervals. Nothing here is validated for anyone
  else.
- Days are simulated independently given closure-safe features. Behaviour that runs longer than 14 days is not
  modelled.
- Help from friends and family is modelled from his own past only and depends on balance alone.
- A plan can overlap with spending the model already expects that day. This is mitigated (that day's typical
  spending is replaced), not eliminated.
- "Offline" means after the one-time downloads above.

## Licences

The code is MIT. The TabPFN weights are under Prior Labs' licence, which is **non-commercial**; this is a
personal tool. Gemma weights are under the Gemma terms of use.
