/**
 * 棚の検査ハーネスだけを組むための設定。
 * アプリ本体のビルド(TanStack Start / Nitro)とは別物で、
 * **本物のコンポーネントと本物の styles.css** だけを束ねる。
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  root: path.resolve(import.meta.dirname),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "../../src") },
  },
  build: {
    outDir: path.resolve(import.meta.dirname, "../../.shelf-harness"),
    emptyOutDir: true,
  },
});
