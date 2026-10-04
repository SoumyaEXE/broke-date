# Where every number in the post comes from

The post itself carries no HTML comments (DEV prints them as text). This file keeps the trail instead: each
claim, and the file the code wrote that backs it. Rebuild the files with the commands in RUNBOOK.md.

| Section | Claim (start of the sentence) | Source |
|---|---|---|
| TL;DR | - Runs on a budget laptop: an i3-1215U with integrated graphics, 1.0 GB of memory at peak, and every what-if answered in 0.05 s. Gemma 1B by… | `out/bench.json` |
| One question, end to end | 2. It reruns all 500 futures with ₹400 leaving his account on the 26th, using the same random draws as the forecast without the movie. On th… | `out/bench.json one_scenario_rollout_s` |
| One question, end to end | 3. It counts. 476 of 500 still make payday, which is 16 fewer. It costs him 2.7 days of runway on his own money, and the chance of going bro… | `docs/images/ui_ask.png, sample data` |
| One question, end to end | 5. Gemma gets the answer with the numbers blanked out and writes one line on top, about 3 seconds after he hits Enter. | `out/chat/chat_eval_english.json` |
| How TabPFN does all the numbers | 2. Play out 500 futures. Starting from today's balance, each future draws one day at a time from TabPFN's distribution, feeds the new balanc… | `web/public/demo/forecast.json plans` |
| How TabPFN does all the numbers | Where "safe to spend" comes from. The headline number on the dashboard is the same trick turned around. Rerun the 500 futures for ₹0, ₹100, … | `web/public/demo/forecast.json safe_curve` |
| How TabPFN does all the numbers | Same TabPFN fit, read two ways. Read through 99 quantiles (gray), anything past the 99th is "impossible". Read through the full distribution… | `scripts/make_post_figures.py fig_tail_demo, computed live` |
| How TabPFN does all the numbers | If its odds mean what they say, about 3% of ordinary spends should look "1 in 33" rare. It expected 5.8 and found 4; at the 10% level it exp… | `out/insights/anomaly_eval_sim.json tail_check` |
| How TabPFN does all the numbers | Does it catch real weirdness? Statements don't come labelled, so I planted some: copied the history, picked 5 ordinary recent spends, multip… | `out/insights/anomaly_eval_sim.json` |
| How TabPFN does all the numbers | On the demo date it checked 96 spends and flagged none. The closest call was ₹90 at a roll stall, about 1 in 213 for him, but under the ₹100… | `web/public/demo/insights.json closest` |
| Gemma never touches a number | Same model, same 14 questions. Only the job changed. | `out/chat/chat_eval_english_v1_reword.json, out/chat/chat_eval_english.json` |
| Gemma never touches a number | (table or figure above) | `1B out/chat/chat_eval_english.json; 4B out/chat/chat_eval_english_prev_fixtures.json (previous export of the same 14 questions; in the final run the app refused to load 4B with under 5 GB free)` |
| Built for a budget laptop, not a GPU | Subarna has an HP laptop with an Intel Core i3, so that's the class of machine I designed for. Every number in this post was measured on my … | `out/bench.json machine` |
| Built for a budget laptop, not a GPU | - TabPFN predicts once, not 500 × 30 times. Predicting quantiles for every future and every day on a CPU would be slow. So TabPFN predicts o… | `out/bench.json` |
| Does it work? It grades itself, under rules I wrote down first | Nine months of the simulated year (the first had only one evaluated day). January was flagged 27 days before the money ran out. The February… | `web/public/demo/replay.json` |
| Does it work? It grades itself, under rules I wrote down first | The forecast from 4 October (green) against the rest of the month, which the app never saw (black). He made it, with ₹649 left on the mornin… | `out/forecast/subarna_syn.json, data/subarna_syn/heldout.csv` |
| Does it work? It grades itself, under rules I wrote down first | Good at the extremes, too timid in the middle. When it said ~33%, the month ran out 79% of the time. The app shows this chart next to the ti… | `web/public/demo/replay.json` |
| Does it work? It grades itself, under rules I wrote down first | Error on "will I go broke before payday?" (lower is better). Simulated student. | `out/backtest/sim/summary.json` |
| What I got wrong | (table or figure above) | `out/labels/sim.json (brokedate eval-labels, SIM)` |
| What I got wrong | TabPFN's embeddings didn't find better look-alike months. I tried getembeddings() to answer "which past month does this one feel like?". The… | `out/experiments/similar_month_embeddings_sim.json` |
| What I got wrong | My festival comparison was comparing against nothing. The Diwali heads-up said last year's festival days cost the simulated student ₹920 mor… | `web/public/demo/forecast.json context.upcoming; engine/tests/test_insights.py` |
| Five things TabPFN taught me | 1. Predicting is the expensive part, not fitting. On the i3, fitting the spend model took 9.0 s, but predicting quantiles for 2,280 grid sta… | `out/bench.json fit_spend_s, lattice_s, lattice_rows` |
| The offline part is a test, not a promise | - The script that took every screenshot in this post logged every request too: zero went anywhere but 127.0.0.1. | `docs/images/screenshots_requests.json` |

## Author notes (rules for editing the post)

```text
DRAFT for the author. Rules (from CLAUDE.md):
- Every number below comes from a file the code wrote (cited in a comment) or is a [[placeholder]].
  Numbers about the student are from the SIMULATED persona, never Subarna's real statement.
- Subarna's own numbers only after his statement is imported locally, relative only (share-card), with his OK.
- Replace every [[...]] before publishing. Read it aloud once.
```
