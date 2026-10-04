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

[[GIF, 6 seconds: Plans tab, switch "Saturday movie" on, the orange "with this plan" line drops and the "months make it" count updates. Simulated demo.]]

## What I Built

Subarna gets his allowance on the 1st. By the 20-somethings of every month he is doing maths in his head at the canteen counter: *if I get the momos today, do I still make it to payday?* He usually guesses. He usually guesses wrong.

[[One real line from Subarna, in his words, about the end of the month.]]

Budget apps didn't help him. They tell you what you **already** spent. What he needed was a straight answer about what is **about to** happen: *"Can I afford the ₹400 movie on Saturday, and what does it cost me?"*

So I built him **Broke Date**. It reads his bank statement **on his own laptop**, learns how he actually spends, and plays out the rest of his month **500 times**. From those 500 futures it tells him:

- **Safe to spend today**: the most he can spend right now and still keep the chance of going broke before payday under 10%.
- **How many of the 500 futures make it** to his next allowance, and when the ones that don't usually run out.
- **The price of a plan in days**: in the demo, Saturday's movie + popcorn costs **2.05 days** of runway. That number lands harder than a rupee amount ever did. <!-- source: post-numbers demo_sim.plan_day_costs (SIM, as of 2026-09-20) -->

And then it does the things a good friend would:

- 🗨️ **You can just ask it.** *"Can I afford ₹400 on Saturday?"*, *"turn on the movie"*, *"show where my money went"*. It reruns the futures and answers in plain English. It can also switch plans on and off and draw the chart for you.
- 🚨 **It notices the weird ones, with odds.** A spend gets flagged when TabPFN says a spend that big is *"about 1 in 400"* for him, with the usual range drawn next to it. And when nothing is weird, it says so: on the demo date it checked 96 spends and flagged none.
- 🪔 **It knows the festivals are coming.** *"Durga Puja starts in 27 days."* For Diwali it can compare with last year: those days cost the simulated student ₹920 more than a normal stretch. <!-- source: web/public/demo/forecast.json context.upcoming (SIM, as of 2026-09-20) -->
- ✉️ **Once a week, a letter from a future that went broke**, written by Gemma: *"Bhai, I'm writing from the 27th…"*. Funny, a bit haunting, and every number in it is real.
- ⏪ **A time machine for his own months.** Pick any past month and watch what Broke Date would have said every other day, using only the days before it, against the day the money actually ran out. It shows when it was right, when it was late, and when it cried wolf.

**Nothing leaves his laptop.** Not the statement, not the chat, not the letter. [[Confirm once recorded: "I recorded the demo with Wi-Fi switched off."]]

## Demo

**The real thing runs offline, so the real demo is a video:** Wi-Fi switched off, Ollama and TabPFN on the laptop, the whole flow from importing a statement to asking the chat.

[[YouTube / Loom embed, recorded in airplane mode]]

Want to click around yourself? There's a **sample-data preview** that runs entirely in your browser and makes no network calls (open DevTools → Network and watch it stay empty): [[GitHub Pages URL]]

[[Screenshot 1: Overview dashboard: safe to spend, futures that make it, balance this month vs last.]]
[[Screenshot 2: Ask: "Can I afford a ₹400 movie on Saturday?" with the answer card.]]
[[Screenshot 3: Insights: "nothing unusual" (96 spends checked), Durga Puja + Diwali heads-up, the labeller comparison.]]
[[Screenshot 4: Time machine: a month that ran out, the warning line crossed days before the orange "ran out" line, and the calibration chart next to it.]]

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

**3. Spot anomalies.** For every recent spend, TabPFN, trained only on earlier spends, predicts what a spend *like this one* usually costs (same category, merchant history, weekday, time of month, balance). Here I use a TabPFN feature almost nobody touches: `predict(output_type="full")` hands back the **whole predicted distribution**, not a handful of quantiles, and its `.cdf()` includes the tails. So instead of "above the 97th percentile" (99 quantiles can't see past the 99th, so 1-in-100 and 1-in-10,000 look the same), each spend gets real odds: *"about 1 in 400 spends like this"*. A spend is flagged when those odds are 1 in 33 or rarer and it's over ₹100.

Odds are only worth showing if they're honest, so I checked. If TabPFN's probabilities mean what they say, about 3% of ordinary spends should look "1 in 33" rare. Across four back-to-back 45-day windows of the simulated student's untouched statement (193 spends, each window scored by a model fit only on what came before), **it expected 5.8 and found 4**; at the 10% level it expected 19.3 and found 21. <!-- source: out/insights/anomaly_eval_sim.json tail_check --> The app shows this check live, under the list. On the simulated student, it checked the 96 spends of the 45 days before the demo date and flagged **none**. I'd rather show an empty list than lower the bar until something turns up. <!-- source: web/public/demo/insights.json -->

Does it actually catch things? Real statements don't come labelled "this one was weird", so I **planted** some: copied the history, picked 5 ordinary recent spends, multiplied them by 3× or 5×, and asked three detectors to find them. Same plants for everyone, three random seeds, so 15 plants per column:

<!-- source: out/insights/anomaly_eval_sim.json (brokedate eval-anomaly, SIM) -->
| Detector | Found (3× plants) | Found (5× plants) | False alarms per run |
|---|---|---|---|
| **TabPFN (the app)** | **13 / 15** | **14 / 15** | 0 |
| "More than 3× this merchant's usual" | 11 / 15 | 13 / 15 | 0 |
| "3 standard deviations above its category" | 11 / 15 | 14 / 15 | 0 |

The gap is in the subtle cases. A 5× spend is obvious to everyone, but a 3× spend at a place he's rarely been, late in the month with little money left, only looks odd if you know *when* and *with how much* he usually spends like that, which is exactly what TabPFN gets as input and the rules don't. Fifteen plants is a small test, so read this as "TabPFN is at least as good, and better on the hard ones", not as a precise rate.

**4. Classify transactions.** Indian UPI narrations are chaos (`UPI-RAJU MAHATO-rajum12@ybl-SBIN0016209-6524...-Payment`: is Raju a friend or the auto driver?). Regex rules handle the obvious ones. **TabPFN learns from the rows the rules were sure about** and labels the leftovers it is confident on. Only what's still unclear goes to Gemma or to a "you decide" list. On the simulated statement (569 transactions), measured against the generator's ground truth:

<!-- source: out/labels/sim.json (brokedate eval-labels, SIM) -->
| Pipeline | Correct | Left for "you decide" |
|---|---|---|
| Rules only | 80.0% | 114 |
| Rules + TabPFN | 80.0% | 114 |
| Rules + Gemma | 82.3% | 0 |
| Rules + TabPFN + Gemma | 82.3% | 0 |

TabPFN added nothing here, and I think that's the right answer. The 114 leftovers are almost all UPI payments to people like "BABLU SK" or "RAJU MAHATO", who in this simulated student's life are auto and toto drivers. The rules never labelled a single payment to a person as transport, so there was nothing to learn it from, and TabPFN's best guess never got above 55% sure, under its 60% bar. **It knew it didn't know.** Gemma labelled all 114 confidently and got 13 right. In the app, a payment to a person goes to the "you decide" list once, and every later payment to the same person is remembered. (One engineering note: TabPFN v2 supports at most 10 classes and this student has 14 categories, so TabPFN sees the 9 most common plus an "other" bucket, and "other" is never assigned.)

### Gemma never touches a number

A chatbot that invents "you have ₹2,000 left" is worse than no chatbot. So the browser works out every answer first, from the 500 futures, in milliseconds, as a plain checked sentence.

My first design had Gemma reword that whole answer, with each number replaced by a placeholder like `{f1}` that the app filled back in. I measured it on the 14 questions the chat suggests, and **Gemma 3 1B passed the checks on only 2 of 14**. It dropped numbers, invented a "Friday" nobody mentioned, and strung placeholders into nonsense. Asking a 1B model to carry six numbers through a casual sentence is the wrong job. <!-- source: out/chat/chat_eval_english_v1_reword.json -->

So now Gemma does the part it's good at, being the friend. It writes **one short reaction line**, and the checked answer follows word for word: *"Whoa there, buddy! Let's not be hasty, yeah? You can spend up to…"* Gemma never sees a number (they're blanked out of what it reads), and its line is rejected if it:

- types a **digit** (the stream is cut on the spot) or a **number word** ("five hundred", "pachsho");
- mentions a **day** the question didn't ("save some for Friday");
- **contradicts the verdict**, like "go for it!" when the answer is "risky".

A rejected line is simply dropped. The answer underneath doesn't change, so the user never sees a wrong number.

<!-- source: 1B: out/chat/chat_eval_english.json; 4B: out/chat/chat_eval_english_prev_fixtures.json (4B skipped in the final run: under 5 GB free) -->
| Model | Lines accepted | Why the others were dropped | First word after | Whole line |
|---|---|---|---|---|
| Gemma 3 1B (default) | **12 / 14** (first design: 2 / 14) | contradicted the verdict, used a number word | 3.1 s | 3.9 s |
| Gemma 3 4B | 12 / 14 | contradicted the verdict, used a number word | 11.0 s | 12.7 s |

(4B numbers are from the run just before, on the previous export of the same 14 questions. In the final run the laptop had under 5 GB free, so the app refused to load 4B, which is the memory guard doing its job.)

The 4B model isn't better at this job, just four times slower, which is why 1B is the default. The checks aren't perfect either: one accepted line told the student *"you've got a decent cushion"* about a balance Gemma never saw. No digit, no wrong number, but a judgement it had no right to make. The number right after it is correct; the vibe is a guess.

It also never crashes a cheap laptop: the 1B model is the default, the 4B model only loads if **5 GB of RAM is actually free right now**, and if even 1B doesn't fit, the app answers with the checked text and no AI wording.

### It grades itself, under rules I wrote down first

I wrote the rules down before evaluating anything, and froze them in a commit before touching Subarna's real statement ([[link to the "docs(prereg): freeze evaluation contract" commit; only true once it exists]]): walk-forward only (each day predicted using only the days before it), every 2nd day with at least 60 days of history, a bootstrap over whole months for 90% intervals, and **TabPFN only "wins" if the entire interval of the difference favours it**.

On the simulated student (12 months, 138 evaluated days, 10 complete months, 5 of which ran out before payday):

<!-- source: out/backtest/sim/summary.json -->
- Five of those months really ran out. Broke Date warned ahead of time in **4 of the 5** (27, 21, 5 and 4 days before); in the fifth, the warning came only on the day itself. Averaged over all five, that's **11.4 days of notice**. It also cried wolf in 2 months that made it.
- Its probabilities are **good at the extremes and too timid in the middle**: when it said ~5% the month ran out 17% of the time, when it said ~94% it was 90%, but when it said ~33% it actually happened 79% of the time. You can see this in the app's calibration chart. <!-- source: web/public/demo/replay.json (brokedate.eval.replay, from the same backtest) -->
- Its error predicting "will I go broke before payday?" (Brier score, lower is better) was **0.207** (90% range 0.104–0.323).
- Simple methods: "keep spending like the last 14 days" scored **0.441**, "copy last month" **0.340**, and a LightGBM model inside the same simulator **0.248**.

I also have to say the honest part. By the rules I set myself, **the differences against the simple methods are not significant yet**. Ten months is not much, and the intervals overlap. The one clear result: **anchoring the futures to a second TabPFN model is a real improvement** (−0.096 Brier, interval −0.163 to −0.025). For the exact payday balance, LightGBM was actually a bit closer. I'm keeping these numbers in the post because a tool that tells a student what's coming has to be honest about how sure it is.

{% details For the nerds: the full table, calibration, how the simulator works %}

<!-- source: out/backtest/sim/summary.json; SIMULATED persona -->

| Model | Brier ↓ (90% CI) | CRPS ₹ ↓ | 80% range held | Days of notice (avg) | No warning at all |
|---|---|---|---|---|---|
| **TabPFN simulation (the app)** | **0.207** (0.104–0.323) | 249 | 75% | 11.4 days | 0 / 5 |
| TabPFN, no anchoring | 0.304 (0.200–0.413) | 241 | 90% | 13.4 days | 0 / 5 |
| TabPFN, no calibration | 0.221 (0.105–0.348) | 239 | 75% | 10.6 days | 0 / 5 |
| Spending pace (last 14 days) | 0.441 (0.215–0.684) | 1024 | n/a | 20.6 days | 0 / 5 |
| Copy last month | 0.340 (0.195–0.508) | 731 | n/a | 16.8 days | 1 / 5 |
| LightGBM quantiles, same simulator | 0.248 (0.142–0.363) | 212 | 83% | 11.8 days | 1 / 5 |

**Calibration.** The futures' spread is widened by a factor *k*, fitted only on earlier months (*k* = 1.3 at the end). Its 80% range held 75% of the time before and after calibration on this persona, so calibration barely moved it. Ten months can't tell 75% from 80% apart.

**Why a lattice.** Predicting 99 quantiles for 500 futures × 30 days on a CPU would be slow, so TabPFN predicts once on a grid of states (balance × recent spending × day), and the simulator interpolates. The browser re-runs the exact same simulation (tested to match the Python engine draw for draw), so even the sample-data preview answers what-ifs instantly with no server.

**Offline proof.** The test suite runs with network sockets blocked except localhost. The app ships a Content-Security-Policy that only allows connections to itself and the engine on `127.0.0.1`, so the browser itself refuses any other request; the build also fails if any external URL sneaks into the bundle. And the app shows its own receipt: a sidebar card reads the browser's request log and counts how many requests left the laptop (it says 0 of N), live, while you use it.

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
