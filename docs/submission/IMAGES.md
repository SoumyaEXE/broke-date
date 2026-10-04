# Images for the DEV post

12 images, all in `docs/images/`. Upload them to DEV in this order (the order they appear in the post), then
give me the DEV links and I'll swap them in. Until then the post points at the GitHub copies, which work after a push.

| # | File | Where it goes |
|---|---|---|
| 1 | `cover.png` | Cover image (post header) |
| 2 | `fig1_futures.png` | 500 futures until payday |
| 3 | `ui_overview.png` | Overview dashboard |
| 4 | `ui_ask.png` | Ask: can I afford a ₹400 movie? |
| 5 | `fig0_pipeline.png` | How a question gets answered |
| 6 | `fig11_tail_demo.png` | The TabPFN feature almost nobody uses |
| 7 | `fig6_tails.png` | Are TabPFN's odds honest? |
| 8 | `fig7_chat.png` | Same Gemma, different job |
| 9 | `fig9_months.png` | Every month, replayed |
| 10 | `fig12_heldout.png` | A held-out month |
| 11 | `fig3_calibration.png` | Calibration |
| 12 | `fig4_brier.png` | Brier scores |

The other screens (Futures, Plans, Insights, How good am I?, How it works) are shown in the video, not as images.

Rebuild them any time:

```powershell
uv --project engine run --no-sync python scripts/make_post_figures.py   # cover.png + 9 charts
cd web; pnpm run build:demo; node scripts/screenshots.mjs               # ui_overview.png, ui_ask.png
```
