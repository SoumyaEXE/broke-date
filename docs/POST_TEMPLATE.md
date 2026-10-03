---
title: [[TITLE: chosen in M2 from real data, see SPEC section 0]]
published: false
tags: devchallenge, weekendchallenge, hf26challenge, ai
cover_image: [[eaten-calendar still or futures canvas, from SIMULATED demo only]]
---

<!--
Rules for whoever fills this in:
- Every [[number]] comes from `make post-numbers`. Never type a number by hand.
- Subarna's numbers: relative only (days, % of allowance). Dates shifted. No identifying merchants.
- Use the official DEV submission template if it differs from these headings; keep the content.
- Subarna reads and approves before publishing.
-->

[[GIF: eaten calendar, a plan toggled off, days light back up. Simulated demo data.]]

## What I Built

Subarna is my friend and teammate. [[One or two sentences in his voice about the end-of-month
problem, from the interview. Real quote.]]

So I built him **Broke Date**. It runs on his laptop, reads his own bank statement, and simulates
500 possible versions of the rest of his month. Then it tells him three things:

- how much is **safe to spend today**,
- how many of those 500 futures **make it to payday**,
- and exactly **how many days** a plan costs him. Saturday at the movies: [[f: day cost]] days.

Once a week he gets a letter from one of the futures that didn't make it.

> [[Rendered sample letter from the SIMULATED demo, Benglish]]

It never sends his data anywhere. [[One line on the airplane-mode video.]]

## Demo

- Live demo (sample data, simulated): [[GitHub Pages URL]]
- Video, recorded with Wi-Fi off: [[YouTube/Loom embed]]

[[Screenshot: futures canvas with counts]]

### What Subarna said

> [[His real reaction, verbatim. What he changed after using it.]]

## Code

{% embed [[GitHub repo URL]] %}

## How I Built It

**TabPFN does the forecasting.** Instead of predicting one number, it predicts the full distribution of
how much Subarna might spend on any given day, learned from his own history with no training loop. I
use that distribution to roll out 500 futures, one day at a time, feeding each simulated day's spending
back into the next. He tightens up when money gets low, and the simulation learned that too.

**Price in days** comes from rerunning the same 500 futures, with the same random draws, without the
plan. The difference is the plan's real cost.

**Gemma** does two jobs: it untangles messy UPI narrations like `UPI/DR/.../SWIGGY LTD/...` into clean
categories (schema-locked JSON, [[f: categorization accuracy]] on 100 hand-labelled rows), and it writes
the weekly letter. Gemma is never allowed to write a number: it writes placeholders, a validator rejects
any digit, and the real values are filled in from the engine.

**It grades itself.** Before looking at any results on his real data, I committed the evaluation rules
to the repo ([[link to prereg commit]]). On his past [[n]] months:

[[Plain-language headline from summary.json: lead time, and whether TabPFN beat the baselines.]]

{% details For the nerds: evaluation, calibration, benchmarks, limitations %}

### Pre-registered backtest
[[Table from summary.json: M1, M1a, M1b, B1, B2, B3 x Brier, CRPS, coverage, lead time, with 90% CIs.]]

[[One honest paragraph: where TabPFN won, where it tied or lost, why.]]

### Calibration
[[Coverage of the 80% band before and after calibration, from summary.json.]]

### Architecture
[[Diagram image]]

### Benchmarks (measured, not claimed)
[[Table from out/bench.json: device, RAM, full forecast time, peak RAM, Gemma on/off.]]

### Offline proof
The full pipeline runs in CI with network sockets blocked except localhost. [[badge]]

### Limitations
[[Paste SPEC section 25, updated with real numbers: n cycles, CI widths, double counting, licence.]]

{% enddetails %}

## Why Does Open Innovation Matter?

[[Draft: A 19-year-old's bank statement is the most private document he owns. The only way I could
build this for Subarna without asking him to trust a company with it was open weights running on his
own laptop: TabPFN for the forecast, Gemma for the words. Open models made "it never leaves your
laptop" something I could prove with a test, not a promise in a privacy policy. Rewrite in your voice.]]

## My Agent Session

[[Entire / DevRelay embed per challenge instructions]]

## Prize Categories

- Best Use of TabPFN
- Best Use of Gemma
- Best Use of Entire

---

Built with [[Subarna's handle]], who let me read his bank statement and still talks to me.
