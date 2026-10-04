"""Pocket file: one self-contained offline HTML for the phone (SPEC 17). No external requests."""

from __future__ import annotations

import json
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

import numpy as np

from brokedate.config import REPO_ROOT, is_synthetic, load_config
from brokedate.db import DB


def snapshot(resp: dict[str, Any], letter: dict[str, Any] | None, n_paths: int = 100) -> dict[str, Any]:
    idx = np.linspace(0, len(resp["paths"]["balances_paise"]) - 1, n_paths).astype(int)
    return {
        "generated_at": datetime.now(UTC).isoformat(timespec="minutes"), "as_of": resp["as_of"],
        "subject": resp["subject"], "simulated": is_synthetic(resp["subject"]),
        "next_anchor_date": resp["next_anchor_date"], "horizon_days": resp["horizon_days"],
        "balance_now_paise": resp["balance_now_paise"], "broke_line_paise": resp["broke_line_paise"],
        "safe_to_spend_paise": resp["safe_to_spend_paise"], "nothing_safe": resp["nothing_safe"],
        "risk_tolerance": resp["risk_tolerance"], "risk_now": resp["risk_now"],
        "n_make_it": resp["n_make_it"], "n_futures": resp["n_futures"], "broke_day": resp["broke_day"],
        "curve": resp["safe_curve"], "band": resp["band"], "days": resp["paths"]["days"],
        "paths": [resp["paths"]["balances_paise"][i] for i in idx],
        "first_broke": [resp["paths"]["first_broke"][i] for i in idx],
        "plans": resp["plans"],
        "plan_scenarios": {k: {"n_make_it": v["n_make_it"], "broke_day": v["broke_day"]}
                           for k, v in resp["plan_scenarios"].items()},
        "letter": letter["text_rendered"] if letter else None,
    }


HTML = r"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Broke Date · pocket</title>
<style>
:root{--bg:#f7f5f0;--bg2:#efebe3;--fg:#14110f;--mut:#6b6460;--rule:#d8d2c6;--made:#0f766e;--broke:#d9480f}
@media (prefers-color-scheme:dark){:root{--bg:#121110;--bg2:#1c1a18;--fg:#ece7df;--mut:#a39b93;--rule:#34302c}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:480px;margin:0 auto;padding:16px}
.num{font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;font-variant-numeric:tabular-nums}
.mut{color:var(--mut)}.card{background:var(--bg2);border-radius:14px;padding:16px;margin:12px 0}
h1{font-size:22px;margin:0}.hero{font-size:56px;font-weight:700;line-height:1;margin:6px 0}
.row{display:flex;justify-content:space-between;gap:8px;padding:4px 0}
input{font:inherit;padding:10px;border:1px solid var(--rule);border-radius:10px;background:var(--bg);color:var(--fg);width:100%}
button{font:inherit;padding:10px 14px;border-radius:10px;border:0;background:var(--fg);color:var(--bg)}
.ans{margin-top:10px;font-weight:600}.warn{color:var(--broke)}.ok{color:var(--made)}
.tog{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px dashed var(--rule)}
.tog input{width:auto}.chip{border:1px solid var(--broke);color:var(--broke);border-radius:99px;padding:2px 8px;font-size:13px}
canvas{width:100%;height:180px;display:block}
.banner{background:var(--fg);color:var(--bg);text-align:center;font-size:13px;padding:6px}
</style></head><body>
<div class="banner" id="banner"></div>
<main>
<h1>Broke<span style="color:var(--broke)">.</span>Date <span class="mut" style="font-size:13px">pocket</span></h1>
<p class="mut num" id="stamp"></p>
<div class="card"><div class="mut" style="font-size:12px;letter-spacing:.15em">SAFE TO SPEND TODAY</div>
<div class="hero num" id="safe"></div><div class="mut" id="safeSub"></div>
<div class="row"><span class="mut">Balance</span><span class="num" id="bal"></span></div>
<div class="row"><span class="mut">Allowance</span><span class="num" id="pay"></span></div></div>
<p style="font-size:20px"><b class="num ok" id="made"></b> of <span class="num" id="nf"></span> futures make it to payday.</p>
<canvas id="cv" aria-label="simulated futures"></canvas>
<div class="card"><b>Can I afford ₹X today?</b>
<div style="display:flex;gap:8px;margin-top:8px"><input id="ask" inputmode="decimal" placeholder="₹ amount"><button id="askBtn">Check</button></div>
<div class="ans" id="askAns" aria-live="polite"></div></div>
<div class="card"><b>I spent ₹X</b> <span class="mut" style="font-size:13px">(estimate until your next laptop sync)</span>
<div style="display:flex;gap:8px;margin-top:8px"><input id="spent" inputmode="decimal" placeholder="₹ amount"><button id="spentBtn">Log</button></div>
<div class="mut num" id="logged" style="margin-top:6px"></div></div>
<div class="card" id="plansCard"><b>Plans</b><div id="plans"></div></div>
<div class="card" id="letterCard" style="background:var(--fg);color:var(--bg)"><div style="font-size:12px;letter-spacing:.15em;opacity:.7">A LETTER FROM A FUTURE THAT WENT BROKE</div><p id="letter"></p></div>
<p class="mut" style="font-size:12px">Offline snapshot from the Broke Date engine on your laptop. Nothing here talks to the internet.</p>
</main>
<script>
const S = __SNAPSHOT__;
const $ = (id) => document.getElementById(id);
const inr = (p) => { const r = Math.round(p / 100); const s = String(Math.abs(r)); let h = s.slice(0, -3), t = s.slice(-3), parts = [];
  while (h.length > 2) { parts.unshift(h.slice(-2)); h = h.slice(0, -2); } if (h) parts.unshift(h);
  return (r < 0 ? "-" : "") + "₹" + (parts.length ? parts.join(",") + "," + t : t); };
const KEY = "bd:pocket:" + S.as_of;
let log = []; try { log = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { log = []; }
const spentSoFar = () => log.reduce((a, b) => a + b, 0);
function riskAt(extraPaise) {
  const c = S.curve; if (!c.length) return S.risk_now;
  if (extraPaise <= c[0].spend_paise) return c[0].p_broke;
  for (let i = 1; i < c.length; i++) if (extraPaise <= c[i].spend_paise) {
    const a = c[i-1], b = c[i], w = (extraPaise - a.spend_paise) / Math.max(b.spend_paise - a.spend_paise, 1);
    return a.p_broke + w * (b.p_broke - a.p_broke); }
  return 1;
}
function render() {
  const age = (Date.now() - Date.parse(S.generated_at)) / 86400000;
  $("banner").textContent = (S.simulated ? "Sample data (simulated). " : "") + (age > 3 ? "This snapshot is getting old: sync with your laptop." : "Works offline.");
  $("stamp").textContent = "snapshot " + S.generated_at.replace("T", " ") + " · as of " + S.as_of;
  const used = spentSoFar();
  const safe = Math.max(S.safe_to_spend_paise - used, 0);
  $("safe").textContent = S.nothing_safe ? inr(0) : inr(safe);
  $("safeSub").textContent = S.nothing_safe ? "Nothing is safe today (" + Math.round(S.risk_now * 100) + "% risk already)."
    : "Keeps the chance of going broke before payday at or below " + Math.round(S.risk_tolerance * 100) + "%.";
  $("bal").textContent = inr(S.balance_now_paise - used) + (used ? " (est.)" : "");
  $("pay").textContent = S.next_anchor_date + " · " + S.horizon_days + "d";
  $("made").textContent = S.n_make_it; $("nf").textContent = S.n_futures;
  $("logged").textContent = log.length ? "logged today: " + inr(used) : "";
  $("plans").innerHTML = "";
  S.plans.forEach((p) => { const d = document.createElement("div"); d.className = "tog";
    const sc = S.plan_scenarios[p.id];
    d.innerHTML = '<input type="checkbox" ' + (p.active ? "checked" : "") + ' aria-label="toggle"><span style="flex:1">' + p.name +
      ' <span class="mut num">' + inr(p.amount_paise) + '</span></span><span class="chip num">' + p.day_cost.toFixed(1) + ' days</span>';
    d.querySelector("input").onchange = (e) => { const on = e.target.checked; const n = on === p.active ? S.n_make_it : sc.n_make_it;
      $("made").textContent = n; };
    $("plans").appendChild(d); });
  if (!S.plans.length) $("plansCard").style.display = "none";
  if (S.letter) $("letter").textContent = S.letter; else $("letterCard").style.display = "none";
  draw();
}
function draw() {
  const cv = $("cv"), dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = 180;
  cv.width = w * dpr; cv.height = h * dpr; const g = cv.getContext("2d"); g.scale(dpr, dpr);
  const H = S.horizon_days; let max = S.balance_now_paise; S.band.p90.forEach((v) => max = Math.max(max, v)); max *= 1.08;
  const x = (t) => 4 + t / H * (w - 8), y = (v) => 6 + (1 - Math.max(v, 0) / max) * (h - 12);
  S.paths.forEach((p, i) => { const fb = S.first_broke[i], broke = fb >= 1 && fb <= H, end = broke ? fb : H;
    g.strokeStyle = broke ? "rgba(217,72,15,.25)" : "rgba(15,118,110,.18)"; g.beginPath();
    for (let t = 0; t <= end; t++) t ? g.lineTo(x(t), y(p[t])) : g.moveTo(x(t), y(p[t])); g.stroke(); });
  g.strokeStyle = getComputedStyle(document.body).color; g.lineWidth = 2; g.beginPath();
  S.band.p50.forEach((v, t) => t ? g.lineTo(x(t), y(v)) : g.moveTo(x(t), y(v))); g.stroke();
  g.setLineDash([5, 4]); g.strokeStyle = "#d9480f"; g.lineWidth = 1; g.beginPath(); g.moveTo(0, y(S.broke_line_paise)); g.lineTo(w, y(S.broke_line_paise)); g.stroke();
}
$("askBtn").onclick = () => { const v = Math.round(parseFloat($("ask").value) * 100); if (!(v >= 0)) return;
  const r = riskAt(v + spentSoFar()); const ok = r <= S.risk_tolerance;
  $("askAns").className = "ans " + (ok ? "ok" : "warn");
  $("askAns").textContent = (ok ? "Yes. " : "Risky. ") + "Chance of going broke before payday: " + Math.round(r * 100) + "%."; };
$("spentBtn").onclick = () => { const v = Math.round(parseFloat($("spent").value) * 100); if (!(v > 0)) return;
  log.push(v); try { localStorage.setItem(KEY, JSON.stringify(log)); } catch (e) {} $("spent").value = ""; render(); };
render(); window.addEventListener("resize", draw);
</script></body></html>
"""


def write_pocket(resp: dict[str, Any], letter: dict[str, Any] | None, dest: Path) -> Path:
    snap = json.dumps(snapshot(resp, letter), ensure_ascii=False).replace("</", "<\\/")
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(HTML.replace("__SNAPSHOT__", snap), encoding="utf-8")
    return dest


def export_pocket(subject: str, as_of: date | None) -> Path:
    from brokedate.cli import out_dir
    from brokedate.narrate.letter import write_letter
    from brokedate.service import forecast_for

    cfg = load_config()
    db = DB(cfg.db_path)
    bundle = forecast_for(db, cfg, subject, as_of)
    letter = write_letter(bundle, cfg)
    dest = out_dir(subject) / "pocket" / f"pocket-{subject}.html"
    return write_pocket(bundle.response, letter, dest)


def export_demo_pocket() -> Path:
    """Pocket file for the public demo, from the exported SIMULATED forecast."""
    demo = REPO_ROOT / "web" / "public" / "demo"
    resp = json.loads((demo / "forecast.json").read_text(encoding="utf-8"))
    letters = json.loads((demo / "letters.json").read_text(encoding="utf-8")) if (demo / "letters.json").exists() \
        else {}
    return write_pocket(resp, letters.get("Benglish"), demo / "pocket.html")
