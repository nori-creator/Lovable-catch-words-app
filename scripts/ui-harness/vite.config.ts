/**
 * 画面の検査ハーネスだけを組むための設定。
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
    // 配列で書くのは**順番と完全一致が要る**から。オブジェクトで
    // `"@tanstack/react-start"` だけ書くと `…/server` にも前方一致して
    // `react-start.ts/server` を探しに行く(実際にそれで落ちた)。
    alias: [
      {
        find: "@tanstack/react-start/server",
        replacement: path.resolve(import.meta.dirname, "stubs/react-start-server.ts"),
      },
      {
        // **通信だけ**を差し替える。理由は stubs/react-start.ts に書いてある。
        // markup は本物のままでなければ、この検査に意味が無い。
        find: /^@tanstack\/react-start$/,
        replacement: path.resolve(import.meta.dirname, "stubs/react-start.ts"),
      },
      { find: "@", replacement: path.resolve(import.meta.dirname, "../../src") },
    ],
  },
  build: {
    outDir: path.resolve(import.meta.dirname, "../../.ui-harness"),
    emptyOutDir: true,
  },
});
