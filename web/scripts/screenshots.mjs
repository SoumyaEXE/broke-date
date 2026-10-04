// UI screenshots for the post, taken from the built sample-data preview (simulated student, no engine, no network).
//   pnpm run build:demo && node scripts/screenshots.mjs        (serves dist/ on 127.0.0.1:4173 itself)
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const BASE = "http://127.0.0.1:4173/";
const OUT = fileURLToPath(new URL("../../docs/images/", import.meta.url));
mkdirSync(OUT, { recursive: true });

const server = spawn("pnpm", ["exec", "vite", "preview", "--mode", "demo", "--host", "127.0.0.1", "--port", "4173", "--strictPort"],
  { shell: true, stdio: "ignore" });
const outside = [];
try {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(BASE)).ok) break; } catch { /* not up yet */ }
    await sleep(500);
  }
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: "light" });
  page.on("request", (r) => { if (!r.url().startsWith(BASE)) outside.push(r.url()); });

  const shot = async (route, name, act) => {
    await page.goto(`${BASE}#/${route}`);
    await page.waitForLoadState("networkidle");
    await sleep(1800); // reveal animations
    if (act) await act();
    await page.screenshot({ path: `${OUT}ui_${name}.png` });
    console.log("wrote", `ui_${name}.png`);
  };

  await shot("overview", "overview");
  await shot("ask", "ask", async () => {
    const box = page.getByRole("textbox").last();
    await box.fill("Can I afford a ₹400 movie on Saturday?");
    await box.press("Enter");
    await sleep(6000); // the checked answer types out word by word
  });
  await shot("futures", "futures");
  await shot("plans", "plans");
  await shot("insights", "insights");
  await shot("grade", "grade", async () => {
    await page.getByText("Time machine").first().scrollIntoViewIfNeeded();
    await sleep(1200);
  });
  await shot("about", "about");
  await browser.close();
  console.log(outside.length ? `REQUESTS THAT LEFT THE LAPTOP: ${outside.join(", ")}` : "requests outside 127.0.0.1: 0");
  writeFileSync(`${OUT}screenshots_requests.json`, JSON.stringify({ base: BASE, pages: 7, outside_requests: outside }, null, 2));
} finally {
  server.kill();
  if (process.platform === "win32") spawn("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
}
