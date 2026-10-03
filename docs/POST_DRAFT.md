---
title: "Broke Date: I simulated my friend's month 500 times so he'd stop running out of money on the 24th"
published: false
tags: devchallenge, weekendchallenge, hf26challenge, opensource
cover_image: [[cover: Futures fan chart from the SIMULATED demo, 1000x420]]
---

<!--
DRAFT for the author. Rules (from CLAUDE.md):
- Every number below either comes from a file the code wrote (cited in a comment) or is a [[placeholder]].
  Numbers marked SIM are from the simulated student persona, never from Subarna's real statement.
- Subarna's own numbers only after his statement is imported locally, relative only (days, % of allowance),
  and only with his OK. Real data never goes in git or in this post.
- Replace [[...]] before publishing. Read it aloud once; cut anything that sounds like a brochure.
-->

[[GIF, 6 seconds: Plans tab, switch "Saturday movie" on, the orange "with this plan" line drops and "491 → 476 months make it" updates. Simulated demo.]]

## What I Built

Subarna gets his allowance on the 1st. By the 20-somethings of every month he is doing maths in his head at the canteen counter: *if I get the momos today, do I still make it to payday?* He usually guesses. He usually guesses wrong.

[[One real line from Subarna, in his words, about the end of the month.]]

Budget apps didn't help him. They tell you what you **already** spent. What he needed was a straight answer about what is **about to** happen: *"Can I afford the ₹400 movie on Saturday, and what does it cost me?"*

So I built him **Broke Date**. It reads his bank statement **on his own laptop**, learns how he actually spends, and plays out the rest of his month **500 times**. From those 500 futures it tells him:

- **Safe to spend today**: the most he can spend right now and still keep the chance of going broke before payday under 10%.
- **How many of the 500 futures make it** to his next allowance, and when the ones that don't usually run out.
- **The price of a plan in days**: Saturday's movie costs him [[f: movie day cost]] days of runway. That number lands harder than "₹320" ever did.

And then it does the things a good friend would:

- 🗨️ **You can just ask it.** *"Can I afford ₹400 on Saturday?"*, *"turn on the movie"*, *"show where my money went"*. It reruns the futures and answers in plain English. It can also switch plans on and off and draw the chart for you.
- 🚨 **It notices the weird ones.** [[f: one real flagged example from the simulated demo, e.g. "₹X at Y when spends like it are usually ₹A–₹B"]] gets flagged as unusual, with the usual range drawn next to it.
- 🪔 **It knows Durga Puja is coming.** *"Durga Puja starts in [[f: days]] days. Last time that week cost you [[f: extra]] more than a normal stretch."*
- ✉️ **Once a week, a letter from a future that went broke**, written by Gemma: *"Bhai, I'm writing from the 27th…"*. Funny, a bit haunting, and every number in it is real.

**Nothing leaves his laptop.** Not the statement, not the chat, not the letter. [[Confirm once recorded: "I recorded the demo with Wi-Fi switched off."]]

## Demo

**The real thing runs offline, so the real demo is a video:** Wi-Fi switched off, Ollama and TabPFN on the laptop, the whole flow from importing a statement to asking the chat.

[[YouTube / Loom embed, recorded in airplane mode]]

Want to click around yourself? There's a **sample-data preview** that runs entirely in your browser and makes no network calls (open DevTools → Network and watch it stay empty): [[GitHub Pages URL]]

[[Screenshot 1: Overview dashboard: safe to spend, futures that make it, balance this month vs last.]]
[[Screenshot 2: Ask: "Can I afford a ₹400 movie on Saturday?" with the answer card.]]
[[Screenshot 3: Insights: unusual spends with their usual range, Puja heads-up.]]

> The preview and the video use a **simulated** student (a generator I wrote that produces a realistic Kolkata-style UPI statement). Subarna's real statement only ever lived on his laptop.

## Code

{% embed [[GitHub repo URL]] %}

## How I Built It

Broke Date is a Python engine (FastAPI on `127.0.0.1` only) plus a React dashboard. Two open models do all the AI work, both running locally:

| Model | Job | Why this model |
|---|---|---|
| **TabPFN v2** (Prior Labs) | Every number: forecasts, risk, anomalies, categories | A foundation model for small tables. One student has ~300 days of data, far too little to train a model from scratch, and TabPFN needs no training loop |
| **Gemma 3** (1B by default, 4B when the laptop has memory to spare) via **Ollama** | Words only: chat replies and the weekly letter | Small enough to run on a student laptop, good enough to sound like a friend |

### TabPFN, four ways

The TabPFN category asks to *"forecast, predict, classify, or spot anomalies"*. Broke Date does all four on the same statement.

**1. Forecast the whole distribution, not one number.** For each day ahead, TabPFN predicts **99 quantiles** of how much Subarna might spend, given his balance (and that balance per day left until payday), what he spent in the last 3 and 14 days, and the calendar: weekday, days since and until his allowance, festivals, exam weeks, and any bill due that day. Fourteen numbers per day, nothing else. One forecast of "₹160 tomorrow" would be useless. The spread is the point: some days are ₹20 chai days, some are ₹600 birthday days.

**2. Simulate 500 futures.** Starting from today's balance, each future draws one day at a time from TabPFN's distribution, feeds the new balance back in, and keeps going until payday. When money gets low he spends less, and because balance is a feature, the simulation learned that too. A plan's **price in days** is the same 500 futures rerun with the same random draws, plus the plan. Same randomness means the difference is the plan and nothing else.

**3. Spot anomalies.** For every recent spend, TabPFN, trained only on earlier spends, predicts what a spend *like this one* usually costs (same category, merchant history, weekday, time of month, balance). If the amount sits above the 97th percentile of that prediction and is over ₹100, it's flagged. [[f: on the simulated student, N of M spends in the last 6 weeks were flagged]].

**4. Classify transactions.** Indian UPI narrations are chaos (`UPI-RAJU MAHATO-rajum12@ybl-SBIN0016209-6524...-Payment`: is Raju a friend or the auto driver?). Regex rules handle the obvious ones. **TabPFN learns from the rows the rules were sure about** and labels the leftovers it is confident on. Only what's still unclear goes to Gemma or to a "you decide" list. On the simulated statement, measured against the generator's ground truth:

| Pipeline | Correct |
|---|---|
| Rules only | [[f: labels.compare.rules]] |
| Rules + TabPFN | [[f: labels.compare.rules+tabpfn]] |
| Rules + Gemma | [[f: labels.compare.rules+gemma]] |
| Rules + TabPFN + Gemma | [[f: labels.compare.rules+tabpfn+gemma]] |

### Gemma never touches a number

A chatbot that invents "you have ₹2,000 left" is worse than no chatbot. So the browser works out every answer first, from the 500 futures, in milliseconds. Gemma then gets the answer with each number **replaced by a placeholder** like `{f1}`, plus what each placeholder means. It writes the sentence; the app puts the real numbers back.

Three guards keep it honest:
- the stream is **cut the instant Gemma types a digit**;
- the finished reply is rejected if it uses a **number word** ("five hundred", "pachsho"), invents a placeholder, or **drops one of the numbers**, because "16 of 500 months run out" and "you'll run out" mean very different things;
- when a draft is rejected, the checked plain answer is shown instead, and you can always see which one you got.

It also never crashes a cheap laptop: the 1B model is the default, the 4B model only loads if **5 GB of RAM is actually free right now**, and if even 1B doesn't fit, the app answers with the checked text and no AI wording.

### It grades itself, under rules I wrote down first

Before running any evaluation, I committed the rules to the repo ([[link to PREREGISTRATION.md commit]]): walk-forward only (each day predicted using only the days before it), every 2nd day with at least 60 days of history, a bootstrap over whole months for 90% intervals, and **TabPFN only "wins" if the entire interval of the difference favours it**.

On the simulated student (12 months, 138 evaluated days, 10 complete months, 5 of which ran out before payday):

<!-- source: out/backtest/sim/summary.json -->
- Broke Date warned about running out on average **11.4 days ahead**, and it **never missed** a month that went broke (0 of 5).
- Its error predicting "will I go broke before payday?" (Brier score, lower is better) was **0.207** (90% range 0.104–0.323).
- Simple methods: "keep spending like the last 14 days" scored **0.441**, "copy last month" **0.340**, and a LightGBM model inside the same simulator **0.248**.

I also have to say the honest part. By the rules I set myself, **the differences against the simple methods are not significant yet**. Ten months is not much, and the intervals overlap. The one clear result: **anchoring the futures to a second TabPFN model is a real improvement** (−0.096 Brier, interval −0.163 to −0.025). For the exact payday balance, LightGBM was actually a bit closer. I'm keeping these numbers in the post because a tool that tells a student what's coming has to be honest about how sure it is.

{% details For the nerds: the full table, calibration, how the simulator works %}

<!-- source: out/backtest/sim/summary.json; SIMULATED persona -->

| Model | Brier ↓ (90% CI) | CRPS ₹ ↓ | 80% range held | Warned ahead | Missed |
|---|---|---|---|---|---|
| **TabPFN simulation (the app)** | **0.207** (0.104–0.323) | 249 | 75% | 11.4 days | 0 / 5 |
| TabPFN, no anchoring | 0.304 (0.200–0.413) | 241 | 90% | 13.4 days | 0 / 5 |
| TabPFN, no calibration | 0.221 (0.105–0.348) | 239 | 75% | 10.6 days | 0 / 5 |
| Spending pace (last 14 days) | 0.441 (0.215–0.684) | 1024 | n/a | 20.6 days | 0 / 5 |
| Copy last month | 0.340 (0.195–0.508) | 731 | n/a | 16.8 days | 1 / 5 |
| LightGBM quantiles, same simulator | 0.248 (0.142–0.363) | 212 | 83% | 11.8 days | 1 / 5 |

**Calibration.** The futures' spread is widened by a factor *k*, fitted only on earlier months (*k* = 1.3 at the end). Its 80% range held 75% of the time before and after calibration on this persona, so calibration barely moved it. Ten months can't tell 75% from 80% apart.

**Why a lattice.** Predicting 99 quantiles for 500 futures × 30 days on a CPU would be slow, so TabPFN predicts once on a grid of states (balance × recent spending × day), and the simulator interpolates. The browser re-runs the exact same simulation (tested to match the Python engine draw for draw), so even the sample-data preview answers what-ifs instantly with no server.

**Offline proof.** The test suite runs with network sockets blocked except localhost. The app ships a Content-Security-Policy that only allows connections to itself and the engine on `127.0.0.1`, so the browser itself refuses any other request; the build also fails if any external URL sneaks into the bundle.

**Limitations.**
- One person's history, so the model says nothing about anyone else.
- Ten months is a small evaluation.
- Spending that's split between friends or paid back later is counted when it happens.
- The categorizer accuracy above is on simulated narrations; real narrations are messier.

{% enddetails %}

## Why Open Innovation Matters Here

A student's bank statement is the most private document he owns. Every late-night order, every friend he paid back, every month his parents topped him up.

I could not build this with a hosted API without asking Subarna to send all of that to a company and trust a privacy policy. With **open weights running on his own laptop**, "your data never leaves" stops being a promise and becomes something I can **test**: the tests run with the network switched off[[, and the demo was recorded in airplane mode (confirm)]].

Open models also made it **free to run forever** (no API key, no token bill for a student living on an allowance) and **small enough** for the laptop he already has. And because TabPFN is open, I could check what it actually does under a pre-registered backtest instead of trusting a vendor's benchmark. Sometimes that check said "not significant yet", and that's part of why I trust it.

## Prize Categories

- **Best Use of TabPFN**: forecasting a full distribution, 500-future simulation, anomaly detection, and a classifier stage, all from one student's CSV.
---

Built for and with [[Subarna's DEV handle]], who let me read his bank statement and is still talking to me.
