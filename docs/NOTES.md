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

## Title decision
(filled in M2 after plotting the real balance)
