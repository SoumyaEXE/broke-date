// dev helper: screenshot the demo with the chat open and a question asked
import { chromium } from "@playwright/test";
const [url = "http://127.0.0.1:4173/", out = "D:/devtools/tmp/chat.png", q = "Can I afford ₹600 biryani on Saturday?"] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
p.on("pageerror", (e) => errors.push(String(e)));
p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await p.goto(url, { waitUntil: "networkidle" });
await p.waitForTimeout(800);
await p.getByLabel("ask Broke Date").fill(q);
await p.keyboard.press("Enter");
await p.waitForTimeout(2500);
await p.screenshot({ path: out });
console.log(JSON.stringify({ errors }));
await b.close();
