import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

// Offline, enforced by the browser: the built page may only talk to itself and (the full app) the local engine on
// 127.0.0.1. Any other request is refused before it leaves the machine. Build only: Vite's dev server needs inline
// scripts and a websocket.
const csp = (demo: boolean) => [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data:",
  "font-src 'self' data:", `connect-src 'self'${demo ? "" : " http://127.0.0.1:8787 http://localhost:8787"}`,
  "object-src 'none'", "base-uri 'self'", "form-action 'none'",
].join("; ");

// base: GitHub Pages serves the repo at /<repo>/; set VITE_BASE when building the demo.
export default defineConfig(({ mode }) => ({
  base: process.env.VITE_BASE ?? (mode === "demo" ? "./" : "/"),
  plugins: [react(), tailwindcss(), {
    name: "offline-csp",
    apply: "build",
    transformIndexHtml: () => [{ tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: csp(mode === "demo") }, injectTo: "head-prepend" }],
  }],
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  define: { __DEMO__: JSON.stringify(mode === "demo") },
  server: { port: 5173, strictPort: true },
  build: { sourcemap: false, chunkSizeWarningLimit: 900 },
  // one forked process: the worker-thread pool crashed on Windows, and one process keeps memory flat
  test: { environment: "node", include: ["src/**/*.test.ts"], pool: "forks", poolOptions: { forks: { singleFork: true } } },
}));
