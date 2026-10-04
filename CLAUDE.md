# CLAUDE.md: Broke Date

You are building **Broke Date**, a local-first app that tells one real person (Subarna) how much he can
safely spend today, how many of 500 simulated futures make it to his next allowance, and how many days
each purchase costs him. It is a submission to the DEV Hacktoberfest Weekend Challenge "Build for a Friend",
targeting **Best Use of TabPFN** (primary), plus Gemma and Entire as bonus categories.

Hard deadline: **Mon Oct 5 2026, 06:59 UTC (12:29 PM IST)**. Target publish: Sun Oct 4 afternoon IST.

Read these before writing any code, in this order:
1. `docs/SPEC.md`: the full product and engineering spec (source of truth)
2. `docs/dev/TASKS.md`: ordered milestones with acceptance criteria (work strictly in order)
3. `docs/PREREGISTRATION.md`: the evaluation contract (frozen once committed)

## Non-negotiable rules

1. **Never fabricate a number.** No hardcoded metrics, benchmark times, accuracy figures or example
   outputs anywhere in UI copy, README or the post. Every number shown to a human is computed by the
   engine and traceable to a fact in the facts ledger. If a number is not computed yet, show a visible
   placeholder like `[[pending: backtest]]` so it cannot ship by accident.
2. **The evaluation contract is frozen.** After `docs/PREREGISTRATION.md` is committed, do not change
   metrics, baselines, thresholds, features used in evaluation, or the pass rule. If something is
   genuinely broken, add a dated "Deviation" entry to the bottom of that file explaining what and why.
   Never edit earlier text.
3. **Real data never leaves the machine and never enters git.** Everything under `data/real/` and
   `~/.brokedate/` is gitignored. A pre-commit hook blocks commits containing those paths, PDFs, or
   strings matching account-number patterns. Never print raw bank narrations in logs at INFO level.
4. **The public demo uses simulated data only** (`scripts/simulate_statement.py`). Never put real-data screenshots,
   numbers, or merchants in the repo, demo site, or post assets.
5. **No network at runtime.** After one-time model downloads, the engine must work with sockets blocked
   except localhost (Ollama). This is enforced by tests. Do not add telemetry, CDNs, remote fonts or
   analytics to the UI. Bundle fonts locally.
6. **Gemma never produces numbers.** It writes with `{fN}` placeholders only. A validator rejects any
   output containing a digit in any script (Latin or Bengali) or a spelled-out number from the blocklist.
7. **Rollout closure rule.** Every feature used by the daily spend model must be computable from the
   simulated path (balance, simulated daily totals, calendar). No category-level features in that model.
8. **Determinism.** Every stochastic step takes an explicit seed. Same inputs + same seed = byte-identical
   outputs. Counterfactuals always reuse the baseline's random draws (common random numbers).
9. **Verify third-party APIs against the installed version.** The TabPFN, Ollama and Entire details in
   the spec are written from documentation that may have changed. Before relying on any of them, write a
   tiny smoke test, read the installed package's docstrings/source, and adapt the adapter layer, not the
   rest of the code. Record what you found in `docs/NOTES.md`.
10. **Honesty over polish.** If TabPFN loses to a baseline, the UI and the post say so. If a feature is
    cut, the post does not imply it exists.

## How to work

- Work milestone by milestone from `docs/dev/TASKS.md`. Do not start a milestone until the previous one's
  acceptance criteria pass. Tick boxes in `docs/dev/TASKS.md` as you go and commit.
- Small commits, conventional messages (`feat(engine): ...`, `test(sim): ...`, `docs(prereg): ...`).
  The commit history is part of the submission (it proves the build happened inside the window).
- After each milestone: run `make check` (lint + types + tests) and fix everything before moving on.
- When a decision is not covered by the spec, choose the simplest option that keeps all rules above,
  write it in `docs/NOTES.md` under "Decisions", and continue. Do not stop to ask unless it touches
  rules 1 to 6.
- Prefer boring, well-tested code over clever code. This runs on a 2022 i3 laptop.
- Keep the cut list in mind (`docs/dev/TASKS.md`, bottom). If a milestone runs long, cut from that list,
  never from the "never cut" list.

## Stack and commands

- Python 3.11+, managed with `uv`. Engine package: `engine/brokedate/`.
- Frontend: Vite + React 18 + TypeScript (strict) + Tailwind. Package manager: `pnpm`. Dir: `web/`.
- Local LLM: Ollama, a small Gemma model (tag set in config, discovered via `ollama list`).

```
make setup        # uv sync, pnpm install, install pre-commit hook
make sim          # generate simulated demo data into data/sim/
make check        # ruff + mypy + pytest (offline) + tsc + vitest
make engine       # run FastAPI on 127.0.0.1:8787
make web          # run Vite dev server against the local engine
make demo         # export precomputed demo JSON from sim data, build static site to web/dist
make pocket       # export single-file offline phone view to out/pocket.html
make bench        # run benchmark harness, write out/bench.json
make backtest     # run pre-registered evaluation, write out/backtest/*.json
```

## Definition of done (the judge checklist)

See `docs/SPEC.md` section 23. Nothing is done until every box there is checked with real outputs.
