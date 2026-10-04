# TASKS: Broke Date

Work strictly in order. Each milestone has a timebox (IST) and acceptance criteria (AC). Tick boxes and
commit as you go. If a timebox is blown by more than 50%, consult the cut list at the bottom.

Deadline: Mon Oct 5, 06:59 UTC = 12:29 PM IST. Target publish: Sun Oct 4, ~4 PM IST.

---

## M0. Repo, guardrails, verification (Fri, 1.5 h)
- [ ] Scaffold repo per SPEC section 4. `uv` project in `engine/`, Vite React TS Tailwind in `web/`.
- [ ] Makefile targets from CLAUDE.md (stubs allowed for later milestones).
- [ ] `.gitignore`, pre-commit hook `scripts/hooks/block_private.py` + tests for the hook.
- [ ] `entire enable` (VERIFY usage), first commit.
- [ ] Smoke-test TabPFN adapter (SPEC 9.1) on synthetic data; record version, API shape, cached-fit
      option name, timing for a 500-row predict on this CPU in `docs/NOTES.md`.
- [ ] Smoke-test Ollama structured output with the local Gemma tag; record tokens/s in NOTES.md.
- [ ] Verify pytest-socket flags; write the offline test skeleton.
**AC:** `make check` green; NOTES.md has a "Verified APIs" section with real findings; hook blocks a staged
dummy PDF.

## M1. Data in: sim adapter, money, DB, reconciliation (Fri, 1.5 h)
- [ ] `money.py` with Indian grouping formatter + tests.
- [ ] SQLite schema (SPEC 5.1), `db.py`.
- [ ] Generic CSV bank adapter (column mapping by header names) that ingests `data/sim/statement.csv`;
      `make sim` runs `scripts/simulate_statement.py --out data/sim`. Refs read as strings.
- [ ] Score the rules-based narration parser against `data/sim/truth.csv` (sim-only accuracy).
- [ ] Reconciliation with property tests (SPEC 6.3).
- [ ] Anchor income detection + cycles (SPEC 6.4) on sim data; irregular mode unit test.
**AC:** `brokedate import data/sim/statement.csv --subject sim` reconciles to the paisa; anchors detected =
number of "Monthly" allowance credits in sim data (12); tests green.

## M2. Real data path (Fri night, 1.5 h, needs Subarna's statement)
- [ ] `brokedate inspect <file>` with masked digits (SPEC 6.2).
- [ ] Bank adapter for his actual format (prefer CSV/XLS if available).
- [ ] Import his statement into `~/.brokedate/` (never into git). Reconciliation must pass.
- [ ] Plot his balance over time locally (`brokedate plot-balance --subject subarna` -> out/real/balance.png).
- [ ] Decide post title per SPEC section 0 / Spec v2 PDF table; record the decision in NOTES.md.
**AC:** reconciled to the rupee; balance plot exists locally; title decision recorded.
**If the statement is not available by Sat 10 AM IST:** use Soumyadeep's own statement as primary real
subject, keep Subarna as the person it's built for and the reviewer; note it in NOTES.md.

## M3. Pre-registration commit (Fri night, 20 min). MUST happen before M7 runs on real data
- [ ] Fill the blanks in `docs/PREREGISTRATION.md` (stride, futures, seeds, LightGBM params).
- [ ] Commit alone: `docs(prereg): freeze evaluation contract`.
**AC:** git log shows this commit before any commit that adds `out/backtest/` results or real-data metrics.

## M4. Enrichment (Sat morning, 2 h)
- [ ] Regex rules + merchant dictionary (SPEC 7.2) with 50-narration synthetic fixture.
- [ ] Gemma batch categorizer with JSON schema, temperature 0, cache, confidence routing (SPEC 7.3).
- [ ] Review endpoint + CLI review fallback.
- [ ] Hand-label 100 real rows locally; `brokedate eval-labels` prints coverage and accuracy.
**AC:** categorizer runs offline; accuracy numbers produced (not typed); Gemma-off mode works.

## M5. Features + models (Sat morning, 2 h)
- [ ] Daily table and closure-safe features (SPEC 8), leakage test, closure test.
- [ ] Spend distribution model via adapter, quantile grid, inverse-CDF sampler (SPEC 9.2).
- [ ] Direct remaining-spend model (SPEC 9.3).
- [ ] Baselines B1, B2, B3 (SPEC 9.4).
**AC:** tests green; a single-day quantile prediction for today prints sensible monotone quantiles.

## M6. Simulator + outputs (Sat afternoon, 3 h)
- [ ] Vectorized rollout with CRN (SPEC 10.2 to 10.3), scheduled events (10.4).
- [ ] Anchoring (10.5), calibration hook (10.6, uses k from backtest later; default k=1).
- [ ] Outputs: p_make_it, broke-day dist, safe-to-spend bisection + curve, price-in-days, days regained,
      similar month DTW (SPEC 11).
- [ ] Facts ledger (SPEC 14.1).
- [ ] `brokedate forecast --subject sim` prints a human summary and writes JSON.
- [ ] Benchmark: full forecast time and peak RAM on this laptop -> `out/bench.json`.
**AC:** all sim tests in SPEC 19 green; forecast < 60 s with N=500 on the i3 (if not, set N=250 default,
record the measured time, move on).

## M7. Backtest (Sat evening, 2 h build + overnight run)
- [ ] Walk-forward per PREREGISTRATION.md, checkpointing and resume.
- [ ] Metrics + block bootstrap (SPEC 13).
- [ ] Run on sim first (sanity), then on real subject(s) overnight.
- [ ] Fit calibration k nested; report before/after coverage.
**AC:** `out/backtest/<subject>/summary.json` exists with all pre-registered metrics and CIs; no metric or
rule changed after the prereg commit (or a dated deviation entry exists).

## M8. Narration (Sat night, 1.5 h)
- [ ] Letter writer from a broke future, placeholders only (SPEC 14.2).
- [ ] Validator with Latin + Bengali digit tests, number words, unknown placeholders.
- [ ] Templates for Benglish, English, Bengali.
- [ ] Renderer linking facts.
**AC:** 20 generated letters on sim data: 0 contain digits after validation; fallback path tested.

## M9. API + offline proof (Sat night, 1 h)
- [ ] FastAPI endpoints (SPEC 15), schema snapshot test.
- [ ] Offline test of full pipeline with sockets blocked except localhost; CI workflow + badge.
**AC:** CI green including offline test.

## M10. Frontend (Sun morning, 4 h)
- [ ] Design tokens, local fonts, layout (SPEC 16.1).
- [ ] DataProvider live/static (16.2).
- [ ] HeroSafe, FuturesCanvas with morph animation, EatenCalendar, PlanList, RecentList, LetterCard,
      EvidenceDrawer, BacktestPage, ImportFlow, Settings (16.3).
- [ ] Accessibility pass (16.3).
**AC:** Subarna uses it on his laptop against his real data; toggling a precomputed plan animates in under
1 s; no console errors.

## M11. Pocket + demo site (Sun midday, 1.5 h)
- [ ] `make pocket` single-file HTML with afford-check and quick log (SPEC 17); open on Subarna's phone
      in airplane mode.
- [ ] `make demo` static export from sim data; GitHub Pages deploy; external-URL check; Playwright smoke.
**AC:** demo URL live; pocket file works offline on his phone.

## M12. Benchmarks, video, post (Sun afternoon, 2.5 h)
- [ ] `make bench` on both laptops (+ 8 GB cap run) -> table.
- [ ] Record video per `docs/submission/VIDEO_SCRIPT.md`; capture the eaten-calendar GIF.
- [ ] `make post-numbers`; fill `docs/submission/POST_DRAFT.md`; Subarna reviews; publish.
**AC:** SPEC section 23 checklist fully ticked. Post live with categories listed.

## Mon until 12:29 PM IST: buffer only. Do not plan work here.

---

## Cut list (cut from the top when behind)
1. Recent purchases "what if I hadn't" (keep plans)
2. Similar-month DTW (drop the "you looked like this in February" line)
3. Pocket file (replace with a phone screenshot of the responsive web app)
4. Second validation subject (Soumyadeep)
5. Calibration (report uncalibrated coverage honestly instead)
6. Import UI (keep CLI import; the UI starts from imported data)

## Never cut
Real data (one real subject minimum) · pre-registration before results · baselines in the backtest ·
futures canvas · safe-to-spend · plan toggles with price-in-days · letter validator · offline test ·
Subarna's reaction · honest limitations.
