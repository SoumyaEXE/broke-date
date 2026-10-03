# NOTES

## Verified APIs

### Machine (dev laptop)
- Intel Core i3-1215U, 8 logical cores (torch uses 6 threads), 15.7 GB RAM, Windows 11.
- All caches, models and private data live on D: (see `scripts/env.ps1`).

### TabPFN (verified 2026-10-03 against installed `tabpfn==9.1.0`, `torch==2.14.1` CPU)
- Constructor: `TabPFNRegressor.create_default_for_version(ModelVersion.V2, device="cpu", n_estimators=..., fit_mode=..., random_state=...)`.
  Default version in 9.1.0 is v3.5.
- Quantiles: `predict(X, output_type="quantiles", quantiles=[...])` returns a list with one array per quantile;
  stack on axis 1 to get `(n, q)`. Monotone in q on the smoke test (no repair needed, but the adapter still
  applies `np.maximum.accumulate`).
- Cached fit option: `fit_mode="fit_with_cache"` (others: `low_memory`, `fit_preprocessors`, `batched`).
  It roughly halves predict time compared with `fit_preprocessors` at the same `n_estimators`.
- Weights and licence:
  - v2 (`Prior-Labs/TabPFN-v2-reg`, file `tabpfn-v2-regressor.ckpt`, 43 MB) downloads without auth.
  - v2.5, v2.6, v3 and v3.5 are gated. They need licence acceptance on platform.priorlabs.ai plus
    `TABPFN_TOKEN`, with `TABPFN_NO_BROWSER=1` for non-interactive use (`tabpfn/browser_auth.py`).
  - Cache dir: `TABPFN_MODEL_CACHE_DIR` (otherwise `%APPDATA%\tabpfn` on Windows).
- A CPU warning about sample size (`_validate_num_samples_for_cpu`) fires on every fit. It is harmless at
  our sizes. The override is `ignore_pretraining_limits` / `settings.tabpfn.allow_cpu_large_dataset`.
- CPU timings, v2, fit_with_cache, 330 training rows x 20 features, 99 quantiles. Predict cost is linear in rows:

  | n_estimators | ms per predicted row |
  |---|---|
  | 1 | ~6 |
  | 2 | ~11 |
  | 4 | ~14 to 15 |

  The fit itself takes ~5 s (n_est 4).

### Ollama / Gemma
(pending: Ollama not installed yet; user installing to D:\devtools\ollama with OLLAMA_MODELS on D:)

### pytest-socket
(pending)

### Entire
- Install: `iex "& {$(irm https://entire.io/install.ps1)} -InstallDir D:\devtools\entire -NoPathUpdate"`.
- Claude Code integration: `entire agent add claude-code`; repo setup: `entire enable` (installs git hooks).
- Sharing: "Dispatches" (docs.entire.io/guides/dispatches). To verify after install.

## Decisions

- 2026-10-03. **State lattice instead of per-future TabPFN calls (SPEC 10.3).** The per-future design needs
  N x H = 15,000 predicted rows per scenario, about 160 s per scenario at n_est=2, and safe-to-spend needs ~10
  scenarios. Instead, for each horizon day we predict the spend quantile function once on a fixed lattice of
  per-future state (balance x spend_3d x spend_14d). The simulator then interpolates the quantile function
  trilinearly for each future's state (a convex mix of monotone quantile functions is monotone). Calendar
  features are exact per day. Cost: one TabPFN pass per forecast; all scenarios (baseline, plans, recent
  purchases, safe-to-spend search) reuse it, so they are near instant and CRN-consistent. The lattice is
  exported to the static demo and the pocket file, so phones and browsers re-run the futures locally.
- 2026-10-03. Spend-model per-future state is reduced to `bal`, `spend_3d`, `spend_14d`. Features derived from
  them (`bal_frac`, `safe_daily`) are recomputed exactly. `spend_1d`, `spend_7d`, `days_since_big` and
  `zero_streak` are dropped from the spend model so the lattice stays tractable. The closure rule still holds.
- 2026-10-03. Python pinned to 3.12 via uv (system Python is 3.14 with no torch guarantee).
- 2026-10-03. No GNU make on Windows: `scripts/dev.ps1 <target>` mirrors the Makefile targets. The Makefile is
  kept for Linux CI.

### Decisions made on S0 (simulated) before the pre-registration freeze
- 2026-10-03. **Inflows are simulated** (`sim/inflows.py`). Students get top-ups from family and friends when they
  run low, and friends pay back. Without inflows, anchoring to the direct model (whose target includes spending
  financed by those inflows) pushed every low-balance future broke on day 1. Model: P(any inflow today | balance
  bucket relative to anchor amount) and the empirical amount distribution per bucket, from the subject's own
  history before the origin. Closure-safe (only the simulated balance is used).
- 2026-10-03. **"Broke" is the lowest within-day balance**: in the simulator, balance after the day's spending and
  before that day's inflows; in the actuals, the minimum running balance on the statement that day. End-of-day
  balances hid real broke days (sim 15 Feb 2026: ₹92 intraday, rescued to ₹592 the same evening).
- 2026-10-03. **Anchoring is location-only** (`anchor_targets(mode="location")`): futures' horizon totals are
  scaled so their median equals the direct model's median, and the simulation keeps its own spread. Full
  quantile mapping (SPEC 10.5 as first written) collapsed the spread when the direct model had few training
  cycles. S0 check on 8 origins: Brier raw 0.310, location 0.209, quantile 0.247; CRPS 313 / 275 / 258.
- 2026-10-03. **Calibration k is fitted on end-of-cycle balance samples** of earlier origins (scaled around their
  median), then applied in the forward run as spread scaling of horizon totals (SPEC 10.6). Fitting directly on
  totals would need re-simulating every earlier origin for each k.
- 2026-10-03. **Price in days uses the subject's own money**: runway = days until the within-day balance first dips
  below the broke line, with no inflows and the allowance not counted, over the horizon plus 21 days. It is the mean
  over futures (the median is degenerate when most futures outlast the window). P(make it) and safe-to-spend use
  the realistic simulation with inflows.

## Title decision
(filled in M2 after plotting the real balance)
