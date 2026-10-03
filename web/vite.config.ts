import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

// base: GitHub Pages serves the repo at /<repo>/; set VITE_BASE when building the demo.
export default defineConfig(({ mode }) => ({
  base: process.env.VITE_BASE ?? (mode === "demo" ? "./" : "/"),
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  define: { __DEMO__: JSON.stringify(mode === "demo") },
  server: { port: 5173, strictPort: true },
  build: { sourcemap: false, chunkSizeWarningLimit: 900 },
  // one forked process: the worker-thread pool crashed on Windows, and one process keeps memory flat
  test: { environment: "node", include: ["src/**/*.test.ts"], pool: "forks", poolOptions: { forks: { singleFork: true } } },
}));
