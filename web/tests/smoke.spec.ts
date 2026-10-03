import { expect, test } from "@playwright/test";

test("static demo loads, toggles a plan, makes no external requests", async ({ page }) => {
  const errors: string[] = [];
  const external: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("request", (r) => { if (!r.url().startsWith("http://127.0.0.1") && !r.url().startsWith("data:")) external.push(r.url()); });
  await page.goto("/");
  await expect(page.getByText("Safe to spend today", { exact: false })).toBeVisible();
  await expect(page.getByText(/of \d+ futures make it/)).toBeVisible();
  const sw = page.getByRole("switch").first();
  const before = await sw.getAttribute("aria-checked");
  const t0 = Date.now();
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", before === "true" ? "false" : "true");
  expect(Date.now() - t0).toBeLessThan(3000);
  await page.getByRole("button", { name: "How good am I?" }).click();
  await expect(page.getByText(/Brier/).first()).toBeVisible();
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});
