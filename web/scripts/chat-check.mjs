// dev helper: ask the Ask page a question, time the stream, report who wrote the words. Not part of the product.
import { chromium } from "@playwright/test";
const base = process.argv[2] ?? "http://127.0.0.1:5175/";
const question = process.argv[3] ?? "Can I afford a ₹400 movie on Saturday?";
const out = process.argv[4] ?? "D:/devtools/tmp/chat.png";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(`${base}#/ask`, { waitUntil: "load" });
await page.waitForSelector("#agent-composer-input", { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector("button[disabled].rounded-full"), null, { timeout: 120000 }).catch(() => {});
const t0 = Date.now();
await page.fill("#agent-composer-input", question);
await page.keyboard.press("Enter");
let first = null;
const label = page.getByText(/Words by|Checked answer/).first();
while (Date.now() - t0 < 180000) {
  if (first === null) {
    const txt = await page.locator("p.leading-relaxed").last().innerText().catch(() => "");
    if (txt.trim().length > 0) first = Date.now() - t0;
  }
  if (await label.isVisible().catch(() => false)) break;
  await page.waitForTimeout(50);
}
const total = Date.now() - t0;
const reply = await page.locator("p.leading-relaxed").last().innerText().catch(() => "");
const by = await label.innerText().catch(() => "(no label)");
const note = await page.locator("p.text-caption-1-medium.text-text-tertiary").last().innerText().catch(() => "");
await page.screenshot({ path: out });
console.log(JSON.stringify({ question, first_token_ms: first, total_ms: total, by, reply, note, errors }, null, 1));
await browser.close();
