// dev helper: screenshot the built demo (not part of the product)
import { chromium } from "@playwright/test";
const url = process.argv[2] ?? "http://127.0.0.1:4173/";
const out = process.argv[3] ?? "D:/devtools/tmp/shot.png";
const width = Number(process.argv[4] ?? 1360);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));
const external = [];
page.on("request", (r) => { const u = r.url(); if (!u.startsWith("http://127.0.0.1") && !u.startsWith("data:")) external.push(u); });
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
if (process.argv[5] === "toggle") {
  await page.getByRole("switch").first().click();
  await page.waitForTimeout(1500);
}
await page.screenshot({ path: out, fullPage: true });
console.log(JSON.stringify({ errors, external }));
await browser.close();
