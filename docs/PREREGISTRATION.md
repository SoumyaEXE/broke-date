# Pre-registered evaluation: Broke Date

Status: DRAFT until the commit titled `docs(prereg): freeze evaluation contract`.
After that commit this file is frozen. Changes are allowed only as dated entries in "Deviations" at the
bottom, explaining what changed and why. Earlier text is never edited.

Fill every `<<...>>` before committing.

## 1. Question
On a person's own transaction history, does a TabPFN-driven simulation forecast (a) whether they go
below the broke line before their next anchor income, and (b) their end-of-cycle balance, better than
simple baselines, with honest uncertainty?

## 2. Subjects
- S1: Subarna (allowance income). Data: bank statement covering <<from>> to <<to>>.
- S2: Soumyadeep (irregular income), if available by Sat 6 PM IST. Otherwise reported as not done.
- S0: simulated persona (sanity check only; never presented as evidence).
Each subject is modelled only on their own history.

## 3. Definitions
- Broke line: ₹150 (15,000 paise).
- Anchor income: as detected and user-confirmed per SPEC 6.4. Cycle = interval between anchors.
- Event Y (broke): balance falls below the broke line on any day from the origin up to the day before
  the next anchor.
- End-of-cycle balance B: balance at the end of the day before the next anchor.

## 4. Forecast origins
- Every <<stride, e.g. 2>>-th day with at least 60 days of prior history and a known next anchor date
  (S2: next anchor = actual next income for evaluation purposes).
- Models are fit only on data strictly before the origin.

## 5. Models compared
- M1 TabPFN simulation: spend-distribution model + rollout, N_eval = <<e.g. 200>> futures, anchored to
  the direct model, with nested spread calibration.
- M1a TabPFN simulation without anchoring (ablation).
- M1b TabPFN simulation without calibration (ablation).
- B1 Burn rate (14-day mean daily spend), logistic squash fit on prior origins only.
- B2 Same point last cycle.
- B3 LightGBM quantile simulation, same features, same simulator, fixed params:
  `n_estimators=<<200>>, learning_rate=<<0.05>>, num_leaves=<<15>>, min_data_in_leaf=<<10>>`,
  quantiles 0.1 to 0.9 step 0.1.
Seeds: forecast seed per origin = <<base seed, e.g. 20261002>> + origin index.

## 6. Metrics
- Primary: Brier score for Y.
- Secondary: CRPS for B (sample-based); empirical coverage of the 80% interval for B; lead time for
  cycles where Y occurred (actual broke day minus first origin in that cycle with P(Y) >= 0.5; no warning
  counts as 0 days lead and is reported separately).

## 7. Uncertainty
Block bootstrap over cycles, 2,000 replicates, 90% percentile intervals for every metric and for the
difference M1 minus each baseline.

## 8. Decision and reporting rules
- "TabPFN better than baseline X" is claimed only if the 90% interval of (Brier_M1 - Brier_X) is entirely
  below 0. Otherwise we report "no clear difference" or "baseline better", whichever applies.
- All metrics for all models are published, including losses.
- No features, hyperparameters, thresholds, or origin rules are tuned after viewing results on S1 or S2.
  Development and debugging use S0 (simulated) only.

## 9. Known limitations, stated in advance
Small number of cycles; wide intervals expected. One person per model. Daily spends simulated
conditionally independent given features. Results do not generalize to other people without testing.

## Deviations
(none yet)
