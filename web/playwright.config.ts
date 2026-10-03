import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  use: { baseURL: "http://127.0.0.1:4173" },
  webServer: { command: "pnpm exec vite preview --mode demo --host 127.0.0.1 --port 4173 --strictPort", port: 4173, reuseExistingServer: true },
});
