# Morning runbook (submission day, deadline Mon 2026-10-05 06:59 UTC = 12:29 IST)

Run in order, one PowerShell window per long-running server. Everything stays on D:. Close Roblox and other heavy
apps first: TabPFN + Gemma want ~3 GB free.

## 0. One-time download (needs internet, ~1 min)

TabPFN's classifier weights (the categorizer stage) are not on disk yet; the regressor weights are.

```powershell
. .\scripts\env.ps1
uv --project engine run --no-sync python -c "from brokedate.models.tabpfn_adapter import TabPFNClf; import numpy as np; TabPFNClf().fit(np.random.rand(20,3), np.array([0,1]*10)); print('classifier weights ready')"
```

## 1. Engine checks (offline)

```powershell
.\scripts\dev.ps1 check                      # ruff, mypy, fast tests, web typecheck + tests
uv --project engine run --no-sync pytest engine/tests -m slow -q   # real TabPFN: anomaly + forecasts
```

## 2. Servers (two windows)

```powershell
.\scripts\dev.ps1 ollama                     # window 1: Gemma, 1 model / 1 request, unloads after 5 idle min
.\scripts\dev.ps1 engine                     # window 2: API on 127.0.0.1:8787; warms forecast + Gemma (~60 s)
```

Live data through yesterday (so the app starts from today's date):

```powershell
.\scripts\dev.ps1 sim-today                  # regenerates the sim statement to yesterday and imports it
```

## 3. Numbers for the post (all computed, never typed)

```powershell
uv --project engine run --no-sync brokedate eval-labels -s sim          # rules vs +TabPFN vs +Gemma vs all
uv --project engine run --no-sync brokedate eval-anomaly -s sim         # TabPFN vs 2 rule baselines on planted anomalies
uv --project engine run --no-sync brokedate eval-chat                   # Gemma 1B/4B: drafts accepted, why rejected, speed
uv --project engine run --no-sync brokedate export-demo --as-of 2026-09-20   # demo JSON + insights.json + labels.json
uv --project engine run --no-sync brokedate post-numbers                 # prints every [[f: ...]] value
```

Pick the demo date so the story works: 2026-09-20 puts Durga Puja ~4 weeks out and Diwali (which has a measured
last-year comparison) inside the 60-day heads-up window. Check `insights.json` has at least one unusual spend;
if not, say "nothing unusual" honestly in the post rather than changing thresholds.

## 4. Web build + checks

```powershell
cd web; pnpm run build:demo                  # also runs check-external (fails on any external URL)
pnpm run test
```

The built `dist/index.html` now carries a Content-Security-Policy meta tag (connect-src 'self' + 127.0.0.1:8787).
Open the preview and confirm DevTools → Console shows no CSP violations.

## 5. Video (the real demo: airplane mode)

Follow docs/VIDEO_SCRIPT.md. Turn Wi-Fi OFF on camera first. Show: Overview → Ask "Can I afford a ₹400 movie on
Saturday?" (Gemma streaming) → "turn on the movie" (Undo) → Insights (unusual spends, Puja heads-up) → Plans
timeline → How good am I?

## 6. Post

`docs/POST_DRAFT.md` → fill every `[[...]]` from post-numbers and the video → read aloud once → publish on DEV with
tags devchallenge, weekendchallenge, hf26challenge. Category: Best Use of TabPFN. Subarna approves first.

## 7. Commit

Everything changed tonight is uncommitted (see `git status`). Commit before publishing so the repo matches the post.
