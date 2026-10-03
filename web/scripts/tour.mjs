// dev helper: visit every tab of the built demo, screenshot it and report layout bugs
// (horizontal overflow, nested scroll regions, console errors). Not part of the product.
import { chromium } from "@playwright/test";
const base = process.argv[2] ?? "http://127.0.0.1:4173/";
const outDir = process.argv[3] ?? "D:/devtools/tmp/tour";
const width = Number(process.argv[4] ?? 1440);
const height = Number(process.argv[5] ?? 1000);
const routes = (process.argv[6] ?? "overview,ask,futures,plans,activity,grade,settings,about").split(",");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));
const report = {};
for (const r of routes) {
  await page.goto(`${base}#/${r}`, { waitUntil: "load" });
  await page.waitForTimeout(3000);
  report[r] = await page.evaluate(() => {
    const doc = document.documentElement;
    const scrollers = [...document.querySelectorAll("*")].filter((el) => {
      const s = getComputedStyle(el);
      return (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1) ||
             (/(auto|scroll)/.test(s.overflowX) && el.scrollWidth > el.clientWidth + 1);
    }).map((el) => `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}.${String(el.className).split(" ").slice(0, 3).join(".")}`);
    const wide = [...document.querySelectorAll("body *")].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
      .slice(0, 5).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 3).join(".")}`);
    return { hOverflow: doc.scrollWidth > doc.clientWidth, scrollers, wide };
  });
  await page.screenshot({ path: `${outDir}/${width}-${r}.png` });
}
console.log(JSON.stringify({ errors, report }, null, 1));
await browser.close();
