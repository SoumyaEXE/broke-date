---
title: "I Played Out a Broke Student's Month 500 Times on a Budget i3 Laptop With the Wi-Fi Off. It Warned Him Ahead in 4 of 5 Bad Months."
published: false
tags: devchallenge, weekendchallenge, hf26challenge, opensource
cover_image: https://raw.githubusercontent.com/SoumyaEXE/broke-date/main/docs/images/cover.png
---

<!--
DRAFT for the author. Rules (from CLAUDE.md):
- Every number below comes from a file the code wrote (cited in a comment) or is a [[placeholder]].
  Numbers about the student are from the SIMULATED persona, never Subarna's real statement.
- Subarna's own numbers only after his statement is imported locally, relative only (share-card), with his OK.
- Replace every [[...]] before publishing. Read it aloud once.
-->

Subarna gets his allowance on the 1st. By the 20-somethings he's doing maths in his head at the canteen counter: *if I get the momos today, do I still make it to payday?* He guesses. He usually guesses wrong.

So I built him **Broke Date**. It reads his bank statement on **his own laptop**, learns how he actually spends, and plays out the rest of his month **500 times**, so it can answer the only question he cares about: *"Can I afford this, and what does it cost me?"* No cloud, no API key, no account. He has an **HP laptop with an Intel Core i3**, so I built for exactly that class of machine, and measured everything on an i3 with integrated graphics, with the Wi-Fi off.

Then I did the part most budget apps skip: I made it **grade itself**. I replayed a year of a simulated student's life, day by day, and asked how often it would have warned him before he ran out.

[[One real line from Subarna, in his words, about the end of the month.]]

## TL;DR

- **What:** an offline money forecaster for one student. **TabPFN** does every number (forecasting, 500 simulated futures, spotting odd spends, sorting transactions). **Gemma** only does the talking, and never touches a number.
- **It warns early, mostly.** On a simulated year, walk-forward with rules I wrote down first: **4 of 5** months that ran out were flagged ahead of time (27, 21, 5 and 4 days before). The fifth was flagged only on the day itself, and there were 2 false alarms.
- **It's honest about how sure it is, and where it isn't.** It's accurate at the extremes (said 94%, happened 90%) and **too timid in the middle** (said 33%, happened 79%). There's a chart for that inside the app.
- **A TabPFN feature almost nobody uses:** `predict(output_type="full")`. Instead of "above the 97th percentile", odd spends get real odds, *"about 1 in 400 spends like this"*. And the odds check out: of 193 ordinary spends, TabPFN expected 5.8 to look that rare and **4 did**.
- **I measured my own LLM, and changed the design because of it.** Asking Gemma 3 1B to reword answers around the numbers passed my checks **2 times out of 14**. Giving it a smaller job passed **13 of 14**.
- **Runs on a budget laptop:** an i3-1215U with integrated graphics, **1.0 GB** of memory at peak, and every what-if answered in **0.05 s**. <!-- source: out/bench.json --> Gemma 1B by default; the 4B model only loads if 5 GB is actually free.

## 3 findings in 30 seconds

1. **A month can be predicted as a spread, not a number.** TabPFN forecasts 99 quantiles of tomorrow's spend from 14 numbers about today. Chain those days together and you get 500 believable futures. Count how many run out and you have a risk you can explain in one sentence.
2. **The best feature isn't the forecast, it's the price tag.** *"Saturday's movie costs you 2.05 days of runway"* lands harder than any rupee amount, and it's the same 500 futures rerun with the same random draws, so the difference is the plan and nothing else.
3. **A small model is reliable at a small job.** Gemma 1B can't carry six numbers through a casual sentence. It can write one friendly line. So that's its job, and the checked numbers follow word for word.

![500 futures until payday](https://raw.githubusercontent.com/SoumyaEXE/broke-date/main/docs/images/fig1_futures.png)
*One month, 500 ways. Each thin line is a future played out from TabPFN's spend forecast. The terracotta ones dip under the ₹150 "broke line" before payday: 8 of 500 here. Simulated student.*

## Why not just use a budget app?

I looked at what Subarna already had before building anything:

| What he tried | What it tells him | What it can't tell him |
|---|---|---|
| His bank app | What he **already** spent | Whether he'll make it to the 1st |
| A budget app with categories | That "food" is over budget | What *this* ₹400 does to the rest of his month |
| A spreadsheet | Whatever he types in | Anything, by the 20th, when he's stopped updating it |
| Asking a chatbot | A confident-sounding guess | Anything about *his* money (and he'd have to paste his statement into it) |
| **Broke Date** | How many of 500 futures reach payday, what's safe today, what a plan costs **in days** | Anything about anyone else. It only knows him |

The gap isn't tracking. It's the question *"if I do this, what happens next?"* That's a forecasting problem, and it needs a forecasting model.

## What I built

![Overview dashboard](https://raw.githubusercontent.com/SoumyaEXE/broke-date/main/docs/images/ui_overview.png)
*The overview: safe to spend today, how many of the 500 futures make it, this month against last, and the TabPFN forecast running past today. Sample data.*

Every screen answers one question a broke student actually asks:

| Screen | The question | What you get |
|---|---|---|
| **Overview** | *How am I doing?* | Safe to spend today, futures that make it, the month so far vs last month |
| **Ask** | *Can I afford ₹400 on Saturday?* | A straight answer from the 500 futures, with a chart. It can also flip plans on and off for you |
| **Plans** | *What does the trip cost me?* | Each plan priced in **days of runway**, with and without it |
| **Insights** | *Did I do something weird?* | Odd spends with real odds, festival heads-ups from last year's spending |
| **How good am I?** | *Should I trust this?* | A time machine for past months and a "does it mean what it says?" chart |

![Ask: can I afford a ₹400 movie?](https://raw.githubusercontent.com/SoumyaEXE/broke-date/main/docs/images/ui_ask.png)
*Ask "Can I afford a ₹400 movie on Saturday?" It reruns all 500 futures with the movie in them and answers in a sentence and a chart. Sample data, so the browser answers on its own; in the real app Gemma adds one line on top.*

## Demo

**The real thing runs offline, so the real demo is a video**: Wi-Fi switched off, Ollama and TabPFN on the i3, from importing a statement to asking the chat.

[[YouTube / Loom embed, recorded in airplane mode]]

There's also a **sample-data preview** that runs entirely in your browser: [[GitHub Pages URL]]. Open DevTools → Network and watch it stay empty.

> **About the data.** Nothing in this post is anyone's real money. There are two synthetic datasets, and each figure says which one it shows:
>
> - **A simulated student** who lives on an allowance and regularly runs out. He comes from a generator I wrote that produces a Kolkata-style UPI statement. He is the stress test: the backtest, the time machine and the sample preview.
> - **A synthetic statement** for a salaried person: 761 transactions over 13 months, salary on the 28th, rent, Rapido, Blinkit. [[confirm with Subarna: is this the shape of his own month?]] A script turns that transaction list into a statement the app can import. It adds only narrations, reference numbers, an opening balance and the running balance; it does not add, remove or change a single transaction. This is what the video imports.

## One question, end to end

Here's what happens when he types *"Can I afford a ₹400 movie on Saturday?"*:

![How a question gets answered](https://raw.githubusercontent.com/SoumyaEXE/broke-date/main/docs/images/fig0_pipeline.png)

1. **The browser reads the question.** ₹400, a movie, Saturday the 26th. That's plain parsing, no AI involved.
2. **It reruns all 500 futures** with ₹400 leaving his account on the 26th, using the **same random draws** as the forecast without the movie. On the i3 that takes **0.053 s**. <!-- source: out/bench.json one_scenario_rollout_s -->
3. **It counts.** 476 of 500 still make payday, which is 16 fewer. It costs him **2.7 days** of runway on his own money, and the chance of going broke becomes 5%, under his 10% line, so the verdict is **comfortable**. <!-- source: docs/images/ui_ask.png, sample data -->
4. **It writes the checked answer**, a plain sentence with every number in it.
5. **Gemma gets the answer with the numbers blanked out** and writes one line on top, about **3 seconds** after he hits Enter. <!-- source: out/chat/chat_eval_english.json -->
6. **The line is checked** (no digits, no number words, no invented days, no disagreeing with the verdict). If it fails, it's dropped and he just sees the answer.

Only steps 5 and 6 involve an LLM, and neither can change a number.

## How TabPFN does all the numbers

TabPFN is a foundation model for small tables: you hand it rows, it predicts, with no training loop. That matters here, because one student has about 300 days of data, far too little to train anything from scratch.

**1. Forecast the spread, not one number.** For each day ahead, TabPFN predicts **99 quantiles** of how much he might spend, from 14 numbers: balance (and balance per day left until payday), spending over the last 3 and 14 days, and the calendar (weekday, days since and until the allowance, festivals, exam weeks, bills due that day). "₹160 tomorrow" would be useless. The spread is the point: some days are ₹20 chai days, some are ₹600 birthday days.

**2. Play out 500 futures.** Starting from today's balance, each future draws one day at a time from TabPFN's distribution, feeds the new balance back in, and keeps going until payday. When money gets low he spends less, and because balance is a feature, the simulation learned that too. A plan's **price in days** is the same 500 futures rerun with the same random draws, plus the plan: in the sample data, Saturday's movie costs 2.05 days of runway. <!-- source: web/public/demo/forecast.json plans -->

**Where "safe to spend" comes from.** The headline number on the dashboard is the same trick turned around. Rerun the 500 futures for ₹0, ₹100, ₹200… spent today, and find the most he can spend while the chance of going broke stays under his comfort line (10% by default, and he can change it). In the sample data that comes to ₹700. <!-- source: web/public/demo/forecast.json safe_curve -->

**3. Spot the weird spends, with real odds.** For every recent spend, TabPFN, trained only on earlier spends, predicts what a spend *like this one* usually costs, given its category, the merchant's history, weekday, time of month and balance.

Here's the feature almost nobody touches: `predict(output_type="full")` returns TabPFN's **whole predicted distribution**, and its `.cdf()` includes the tails. With the usual 99 quantiles, anything past the 99th looks the same, so a 1-in-100 spend and a 1-in-10,000 spend are indistinguishable. With the full distribution, each spend gets real odds, *"about 1 in 400 spends like this"*, and it's flagged at 1 in 33 or rarer (and over ₹100).

Here's that difference, on noise where the true answer is known:

![The TabPFN feature almost nobody uses](https://raw.githubusercontent.com/SoumyaEXE/broke-date/main/docs/images/fig11_tail_demo.png)
*Same TabPFN fit, read two ways. Read through 99 quantiles (gray), anything past the 99th is "impossible". Read through the full distribution (green), it keeps giving odds out to 1 in 100,000, close to the truth (dotted), though a little thin around 2 to 3 standard deviations.* <!-- source: scripts/make_post_figures.py fig_tail_demo, computed live -->

Odds are only worth showing if they're honest, so I checked:

![Are TabPFN's odds honest?](https://raw.githubusercontent.com/SoumyaEXE/broke-date/main/docs/images/fig6_tails.png)
*If its odds mean what they say, about 3% of ordinary spends should look "1 in 33" rare. It expected 5.8 and found 4; at the 10% level it expected 19.3 and found 21. Four back-to-back 45-day windows, each scored by a model fit only on what came before.* <!-- source: out/insights/anomaly_eval_sim.json tail_check -->

Does it catch real weirdness? Statements don't come labelled, so I **planted** some: copied the history, picked 5 ordinary recent spends, multiplied them by 3× or 5×, and asked three detectors to find them, with the same plants for each: 15 plants at 3× and 15 at 5×. No detector raised a single false alarm. <!-- source: out/insights/anomaly_eval_sim.json -->

At 5× everyone finds them. At 3×, TabPFN finds **13 of 15** against **11 of 15** for both rules. A 3× spend at a place he rarely goes, late in the month with little money left, only looks odd if you know *when* and *with how much* he usually spends like that, which is exactly what TabPFN gets as input. Fifteen plants is a small test, so read it as "at least as good, and better on the subtle ones".

On the demo date it checked 96 spends and flagged **none**. The closest call was ₹90 at a roll stall, *about 1 in 213* for him, but under the ₹100 floor, because a ₹90 roll can't be what's sinking his month. I'd rather show an empty list and the closest calls than lower the bar until something turns up. <!-- source: web/public/demo/insights.json closest -->

**4. Sort the transactions.** Indian UPI narrations are chaos (`UPI-RAJU MAHATO-rajum12@ybl-SBIN0016209-6524...-Payment`: is Raju a friend or the auto driver?). Regex rules handle the obvious ones. TabPFN learns from the rows the rules were sure about and labels the leftovers it's confident on. Only what's still unclear goes to Gemma or to a "you decide" list. Results are in "What I got wrong", because they didn't go the way I hoped.

## Gemma never touches a number

A chatbot that invents "you have ₹2,000 left" is worse than no chatbot. So the browser works out every answer first, from the 500 futures, in milliseconds, as a plain checked sentence.

My first design had Gemma reword that whole answer, with each number swapped for a placeholder like `{f1}` that the app filled back in. I measured it on the 14 questions the chat suggests, and **Gemma 3 1B passed my checks 2 times out of 14**. It dropped numbers, invented a "Friday" nobody had mentioned, and strung placeholders into nonsense.

![Same Gemma, different job](https://raw.githubusercontent.com/SoumyaEXE/broke-date/main/docs/images/fig7_chat.png)
*Same model, same 14 questions. Only the job changed.* <!-- source: out/chat/chat_eval_english_v1_reword.json, out/chat/chat_eval_english.json -->

Now Gemma does the friend part. It writes **one short reaction line**, and the checked answer follows word for word: *"Whoa there, buddy! Let's not be hasty, yeah? You can spend up to…"* Gemma never sees a number (they're blanked out of what it reads). Its line is dropped if it:
- types a **digit** (the stream is cut on the spot) or a **number word** ("five hundred", "pachsho");
- mentions a **day** the question didn't ("save some for Friday");
- **contradicts the verdict**, like "go for it!" when the answer is "risky".

When a line is dropped, the answer underneath doesn't change.

| Model | Lines accepted | First word after | Whole line |
|---|---|---|---|
| **Gemma 3 1B** (default) | **13 / 14** | **3.2 s** | 4.1 s |
| Gemma 3 4B | 12 / 14 | 11.0 s | 12.7 s |

<!-- source: 1B out/chat/chat_eval_english.json; 4B out/chat/chat_eval_english_prev_fixtures.json (previous export of the same 14 questions; in the final run the app refused to load 4B with under 5 GB free) -->

(The 4B row is from an earlier run of the same 14 questions. In the final run the laptop had under 5 GB free, so the app refused to load it, which is the memory guard doing its job.)

On the i3, the bigger model isn't better at this job, just four times slower. The checks aren't perfect either: one accepted line told the student *"you've got a decent cushion"* about a balance Gemma never saw. No digit and no wrong number, but a judgement it had no right to make.

## Built for a budget laptop, not a GPU

Subarna has an **HP laptop with an Intel Core i3**, so that's the class of machine I designed for. Every number in this post was measured on my own i3, an **Intel Core i3-1215U** (2 performance + 4 efficiency cores) with **integrated graphics, no GPU**, with only **3 to 5 GB of its 16 GB RAM free** while I measured. <!-- source: out/bench.json machine -->

What that forced:

- **Gemma 3 1B by default.** The 4B model only loads if **5 GB is actually free right now**. If even 1B doesn't fit, the app answers with the checked text and no AI line. It never pushes the laptop into swapping.
- **One model, one request, out after 5 minutes idle.** Ollama runs with `OLLAMA_MAX_LOADED_MODELS=1` and `NUM_PARALLEL=1`, so a forgotten tab can't stack models in memory.
- **TabPFN predicts once, not 500 × 30 times.** Predicting quantiles for every future and every day on a CPU would be slow. So TabPFN predicts on a grid of states (balance × recent spending × day) and the simulator interpolates. A full forecast (fit TabPFN, predict the grid, play out 500 futures) takes **47 s** on the i3, about once a day, with **1.0 GB** peak memory. After that, rerunning all 500 futures for a what-if takes **0.053 s**. Gemma 1B writes at **22 tokens a second**. Those numbers were measured with the engine and the Gemma server both running alongside. <!-- source: out/bench.json -->
- **What-ifs run in the browser.** The browser reruns the exact same simulation (tested draw-for-draw against the Python engine), so flipping a plan on and off is instant, with no server round trip.
- **Short prompts.** On a CPU, reading the prompt is most of Gemma's wait, and gemma3 can't reuse a cached prefix across questions. So the prompt is a few lines: **3.2 s to the first word** on the i3.

## Does it work? It grades itself, under rules I wrote down first

I wrote the evaluation rules down before running anything, and froze them in a commit before touching Subarna's real statement ([[link to the "docs(prereg): freeze evaluation contract" commit; only true once it exists]]):
- walk-forward only, so each day is predicted using only the days before it;
- every 2nd day with at least 60 days of history;
- 90% intervals by resampling whole months;
- **TabPFN only "wins" if the entire interval of the difference favours it.**

**The time machine.** Pick any past month and watch what Broke Date would have said, every other day, against the day the money actually ran out.

Across the simulated year (10 complete months, 138 evaluated days), five months ran out before payday:
- **4 of 5 were flagged ahead of time** (27, 21, 5 and 4 days before);
- the fifth was flagged only on the day itself;
- 2 months that made it got a false alarm.

Here's every month at once, warts included:

![Every month, replayed](https://raw.githubusercontent.com/SoumyaEXE/broke-date/main/docs/images/fig9_months.png)
*Nine months of the simulated year (the first had only one evaluated day). January was flagged 27 days before the money ran out. The February miss is the interesting one: the money ran out on the 2nd, the very first day of that month's replay, so there was no earlier day to warn on.* <!-- source: web/public/demo/replay.json -->

**One month it never saw.** The synthetic statement runs past today, so I cut it at 3 October and kept the rest of the month hidden. On the morning of the 4th, with ₹48,606 in the account and payday 24 days away, Broke Date said **423 of 500 futures make it**, a 15% chance of running out, which is over the 10% comfort line. So it said **nothing was safe to spend** that day, and that at most ₹1,080 could go without making things noticeably worse.

![A held-out month](https://raw.githubusercontent.com/SoumyaEXE/broke-date/main/docs/images/fig12_heldout.png)
*The forecast from 4 October (green) against the rest of the month, which the app never saw (black). He made it, with ₹649 left on the morning of payday. Synthetic statement.* <!-- source: out/forecast/subarna_syn.json, data/subarna_syn/heldout.csv -->

That's one month, so it proves nothing on its own. But it's the kind of answer I wanted: not "you're fine" and not "you're doomed", but "this one is close, don't add anything", about a month that then came down to ₹649.

**Does it mean what it says?** When it says 30%, does it happen 30% of the time?

![Calibration](https://raw.githubusercontent.com/SoumyaEXE/broke-date/main/docs/images/fig3_calibration.png)
*Good at the extremes, too timid in the middle. When it said ~33%, the month ran out 79% of the time. The app shows this chart next to the time machine.* <!-- source: web/public/demo/replay.json -->

**Against simple methods:**

![Brier scores](https://raw.githubusercontent.com/SoumyaEXE/broke-date/main/docs/images/fig4_brier.png)
*Error on "will I go broke before payday?" (lower is better). Simulated student.* <!-- source: out/backtest/sim/summary.json -->

Broke Date's error was **0.207**, against **0.441** for "keep spending like the last 14 days", **0.340** for "copy last month", and **0.248** for LightGBM inside the same simulator.

Now the honest part. **By the rules I set myself, those differences aren't significant yet.** Ten months is not much, and the intervals overlap. The one clear result is that **anchoring the futures to a second TabPFN model is a real improvement** (−0.096 error, interval −0.163 to −0.025). For the exact payday balance, LightGBM was actually a bit closer. I'm keeping all of it in, because a tool that tells a student what's coming has to be honest about how sure it is.

## What I got wrong

**TabPFN couldn't sort the hard transactions, and that was the right call.** On the simulated statement (569 rows, against the generator's ground truth):

| Pipeline | Correct | Left for "you decide" |
|---|---|---|
| Rules only | 80.0% | 114 |
| Rules + TabPFN | 80.0% | 114 |
| Rules + Gemma | 82.3% | 0 |
| Rules + TabPFN + Gemma | 82.3% | 0 |

<!-- source: out/labels/sim.json (brokedate eval-labels, SIM) -->

The 114 leftovers are almost all UPI payments to people like "BABLU SK", who in this student's life are auto and toto drivers. The rules never labelled a single payment to a person as transport, so there was nothing to learn it from, and TabPFN never got sure enough to clear its 60% bar. **It knew it didn't know.** Gemma labelled all 114 confidently and got 13 right. So in the app, a payment to a person goes to "you decide" once, and every later payment to them is remembered.

**TabPFN v2 caps out at 10 categories.** My student has 14. The categorizer crashed on its first real run, and I only found out because the eval logged the error instead of hiding it. Now TabPFN sees the 9 most common plus an "other" bucket it never assigns.

**TabPFN's embeddings didn't find better look-alike months.** I tried `get_embeddings()` to answer "which past month does this one feel like?". The month it picked ended the same way as this month **46%** of the time over 119 backtest days, against **60.5%** for my simple balance-curve match and **52%** for always guessing the same answer. Worse than guessing. Its embeddings are shaped for predicting tomorrow's spend, not how a whole month ends. It's not in the app. <!-- source: out/experiments/similar_month_embeddings_sim.json -->

**My festival comparison was comparing against nothing.** The Diwali heads-up said last year's festival days cost the simulated student ₹920 *more than a normal stretch*. Rebuilding on a second dataset, I noticed "normal" was ₹0. The baseline was the 60 days before the festival, but the statement only began 16 days before it, and the missing days were being counted as days he spent nothing. Counting only days that are actually in the statement, normal is ₹320, so the honest number is **₹600 more**. The app now refuses to compare at all when it has fewer than 14 real days to compare against. <!-- source: web/public/demo/forecast.json context.upcoming; engine/tests/test_insights.py -->

## Five things TabPFN taught me

1. **Predicting is the expensive part, not fitting.** On the i3, fitting the spend model took 9.0 s, but predicting quantiles for 2,280 grid states took 28.3 s. So I predict once on a grid and interpolate, instead of asking TabPFN 500 × 12 questions. <!-- source: out/bench.json fit_spend_s, lattice_s, lattice_rows -->
2. **Quantiles hide the tails.** `output_type="quantiles"` is what everyone uses, and it can't tell 1-in-100 from 1-in-10,000. `output_type="full"` hands back the distribution itself, tails included. It's the most useful line of code in the project.
3. **It's allowed to say "I don't know", and you should let it.** Faced with transactions unlike anything it had seen, TabPFN stayed under my 60% bar on every one. A small LLM, asked the same question, was confidently wrong on 101 of 114.
4. **Know the limits before your first real run.** TabPFN v2's classifier head has 10 slots. My student has 14 categories. The error message is clear once you hit it, but I'd rather have read the validation code first.
5. **Embeddings aren't a free similarity search.** They're shaped by what TabPFN was asked to predict. Asked "which month is like this one?", they did worse than always guessing the common answer.

## The offline part is a test, not a promise

- The test suite runs with **network sockets blocked** except localhost.
- The built app ships a **Content-Security-Policy** that only allows connections to itself and the engine on `127.0.0.1`, so the browser itself refuses anything else. The build also **fails** if any external URL sneaks into the bundle. It caught one: the logo library was bundling Google's brand-guideline links, so I now copy in only the SVG path.
- The app shows its **own receipt**: a sidebar card reads the browser's request log and says how many requests left the laptop. It says 0.
- The script that took every screenshot in this post logged every request too: **zero went anywhere but 127.0.0.1**. <!-- source: docs/images/screenshots_requests.json -->

## Limitations

- One person's history, so it says nothing about anyone else.
- Ten simulated months is a small evaluation, and the headline differences aren't significant yet.
- It's too timid between 20% and 60%.
- Split bills and money paid back later count when they happen.
- The categorizer numbers are on simulated narrations; real ones are messier.
- Gemma's reaction line can still carry a vibe it can't know ("decent cushion").
- The held-out check is a single month on synthetic data.

## What I'd build next

- **"What's driving my risk?"** TabPFN 9.1 can pass gradients back through its inputs (`fit_with_differentiable_input`). Pointed at the forecast, that could say *"half of your risk is last week's spending, a quarter is Saturday's plan"*. It's the most hidden feature of all, and the next thing I want to try.
- **Fix the timid middle.** The calibration chart says a 33% should read closer to 79%. A recalibration fitted only on earlier months would fix that without touching TabPFN.
- **His real year.** The pre-registered backtest on Subarna's own statement, reported only as relative numbers (months, days of notice), with his OK.
- **A Bengali voice.** The weekly letter already has a Bengali mode; the chat could too.

## Try it

```bash
git clone https://github.com/SoumyaEXE/broke-date && cd broke-date
make setup && make sim          # a simulated student statement
make engine                     # API on 127.0.0.1:8787 (TabPFN on CPU)
make web                        # dashboard on 127.0.0.1:5173
```

Every number and chart in this post rebuilds from the code:

```bash
brokedate backtest -s sim && brokedate eval-anomaly -s sim && brokedate eval-chat && brokedate eval-labels -s sim
python scripts/make_post_figures.py
```

{% embed https://github.com/SoumyaEXE/broke-date %}

## Why open models, here

A student's bank statement is the most private document he owns: every late-night order, every friend he paid back, every month his parents topped him up.

I couldn't build this on a hosted API without asking Subarna to send all of that to a company and trust a privacy policy. With **open weights on his own laptop**, "your data never leaves" stops being a promise and becomes something I can **test**[[, and the demo was recorded in airplane mode (confirm)]]. Open models also made it **free to run forever** (no API key, no token bill on an allowance) and **small enough for the HP i3 he already has**. And because TabPFN is open, I could check what it actually does under a pre-registered backtest instead of trusting a benchmark. Sometimes that check said "not significant yet", and that's part of why I trust it.

## Your turn

Everybody knows a Subarna. If yours runs out on the 24th:

1. Clone the repo and run `make sim` to see the whole thing on the simulated student, Wi-Fi off.
2. Point it at a real statement (a CSV or Excel export from the bank). It stays on that laptop.
3. Ask it the question your friend actually asks at the canteen counter.

Then tell me in the comments what it said, and whether you believed it. And if you think 500 futures is overkill and a spending-pace rule is enough, the "How good am I?" tab will settle it on your own data.

## Prize Categories

- **Best Use of TabPFN**: a full-distribution forecast, a 500-future simulation, anomaly odds from TabPFN's full predicted distribution (with a check that the odds are honest), and a classifier stage, all from one student's CSV, on a CPU.

---

Built for and with [[Subarna's DEV handle]], who let me read his bank statement and is still talking to me.
