// Build-time privacy check: the built bundle must not reference external URLs (SPEC 18).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// tailwindcss.com appears only in the MIT licence banner comment of the CSS (not a request);
// redux / redux-toolkit / bit.ly (immer) appear only inside error-message strings of the store bundled by Recharts.
const ALLOW = [/^https:\/\/tailwindcss\.com$/, /^https?:\/\/github\.com\//, /^http:\/\/127\.0\.0\.1:8787/, /^http:\/\/www\.w3\.org\//, /^https?:\/\/react\.dev/, /^https?:\/\/reactjs\.org/,
  /^https:\/\/redux\.js\.org\/Errors/, /^https:\/\/redux-toolkit\.js\.org\/Errors/, /^https:\/\/bit\.ly\/3cXEKWf$/];
const bad = [];
function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|css|html)$/.test(f)) {
      const txt = readFileSync(p, "utf8");
      for (const m of txt.matchAll(/https?:\/\/[^\s"'`)<>]+/g)) {
        if (!ALLOW.some((r) => r.test(m[0]))) bad.push(`${p}: ${m[0]}`);
      }
    }
  }
}
walk("dist");
if (bad.length) {
  console.error("external URLs found in dist:\n" + bad.slice(0, 30).join("\n"));
  process.exit(1);
}
console.log("check-external: no external URLs in dist");
