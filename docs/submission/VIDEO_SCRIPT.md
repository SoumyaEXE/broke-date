# Video script (under 3 minutes)

**Budget:** 234 spoken words. At 100 words a minute that is 2:20 of talking, plus clicks and pauses: about **2:45**.
Six tabs only. Plans, Futures, Activity and Settings are left out on purpose.

Everything on screen is synthetic data. The first line says so.

## Before you hit record

1. **Free memory:** close Discord and all but one Brave window (the models want about 3 GB free).
2. **Servers up:** Ollama, the engine (127.0.0.1:8787) and the dashboard (127.0.0.1:5173). See docs/submission/RUNBOOK.md, section 2.
3. **Warm up off camera:** open <http://127.0.0.1:5173/?subject=subarna_syn>, wait for the Overview (about a minute the
   first time), then ask one throwaway question in Ask so Gemma is loaded.
4. **Open two tabs in advance:**
   - Tab A: <http://127.0.0.1:5173/?subject=demo_syn#/import> (an empty subject, for the import shot)
   - Tab B: <http://127.0.0.1:5173/?subject=subarna_syn#/overview> (already warmed)
5. Have `data/subarna_syn/statement.csv` ready to drag. **Turn Wi-Fi off, then record**, with the taskbar visible.

## The shots

| # | Time | Tab | Show these things, in this order | Say (word count) |
|---|---|---|---|---|
| 1 | 0:00 | Desktop | 1. Click the Wi-Fi icon: it is OFF. 2. Switch to the browser. | "My friend Subarna runs out of money before payday. So I built him Broke Date. Wi-Fi is off: everything runs on this laptop, a basic i3. The data you'll see is synthetic." (33) |
| 2 | 0:22 | **Import** (Tab A) | 1. Drag `statement.csv` in. 2. The green "reconciled" line. 3. The "These look like your paydays" list. | "It reads a bank statement and checks every row against the running balance, to the paisa. It found his paydays on its own." (23) |
| 3 | 0:40 | **Overview** (Tab B) | 1. "Futures that make it: 423 / 500". 2. "Payday in 24 days". 3. "Nothing is safe today". 4. The forecast band on the balance chart. | "TabPFN played out the rest of his month five hundred times. Four hundred twenty-three make it to payday. That's a fifteen percent chance of running out, over his comfort line, so it says nothing is safe to spend today." (39) |
| 4 | 1:05 | **Ask** | 1. Type `Can I afford a ₹400 movie on Saturday?` 2. Let the first line stream in. 3. The answer card: futures before and after, cost in days. | "You can just ask it. Can I afford a four hundred rupee movie on Saturday? The browser reruns all five hundred futures with the movie in them. Gemma writes only the first friendly line. It never sees a number, so it can't invent one." (44) |
| 5 | 1:35 | **Insights** | 1. The ₹699 Jio recharge row: "about 1 in 249". 2. Its usual-range bar. 3. The "Odds check" line under the list. | "It also spots odd spends, with real odds. This recharge is about one in two hundred forty-nine for him. That comes from TabPFN's full predicted distribution, and the app checks that its odds are honest." (35) |
| 6 | 2:00 | **How good am I?** (go to `?subject=sim#/grade`) | 1. The "4 of 5 ahead" badge. 2. Time machine: click **Jan 26** (caught 27 days early). 3. Click **Mar 26** (a false alarm). 4. The calibration chart beside it. | "Does it work? This is a simulated student who really runs out. The time machine replays each past month using only the days before it. It warned ahead in four of five months that ran out. And it shows where it was wrong." (42) |
| 7 | 2:30 | **How it works** | 1. "Requests that left this laptop: 0". 2. The Offline card in the sidebar. | "And the offline part is measured, not promised: zero requests left this laptop." (13) |
| 8 | 2:40 | Overview | Hold on the dashboard for two seconds. | "Broke Date. Built for Subarna." (5) |

## Why these tabs

- **Import** proves it starts from a real file and checks it.
- **Overview** is the product in one screen: the 500 futures and the answer.
- **Ask** is the most human part, and where the "Gemma never touches a number" rule is visible.
- **Insights** shows the TabPFN feature nobody else uses (real odds), in the product.
- **How good am I?** is what no rival has: it shows its own misses.
- **How it works** is the offline proof, which is the whole point.

## If something goes wrong

- **Gemma's line doesn't appear:** fine. The checked answer still shows, and that is the design. Keep going.
- **A wait runs long:** cut it in the edit. Don't speed the footage up; just trim.
- **"Can't reach the local engine":** restart the engine (docs/submission/RUNBOOK.md, section 2) and warm up again.
- **Running over 3:00:** drop shot 2 (Import) first. It saves about 18 seconds.

## After recording

Turn Wi-Fi back on, upload the video (YouTube unlisted or Loom), and paste the link into the post where it says
`[[YouTube / Loom embed, recorded in airplane mode]]`. The airplane-mode sentences marked `(confirm)` are then true.
