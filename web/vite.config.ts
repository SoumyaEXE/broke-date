import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// base: GitHub Pages serves the repo at /<repo>/; set VITE_BASE when building the demo.
export default defineConfig(({ mode }) => ({
  base: process.env.VITE_BASE ?? (mode === "demo" ? "./" : "/"),
  plugins: [react(), tailwindcss()],
  define: { __DEMO__: JSON.stringify(mode === "demo") },
  server: { port: 5173, strictPort: true },
  build: { sourcemap: false, chunkSizeWarningLimit: 900 },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
}));
