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
  /**
   * **本物の `public/` を配る。**
   *
   * ここを書いていなかったので、vite は既定の `<root>/public`
   * （＝`scripts/ui-harness/public`、存在しない）を見ていた。つまり
   * **`/fonts/*` が1つも配られておらず、`.handwritten`（Caveat）は
   * 検査の絵の中で一度も本物の字で出ていなかった** — ずっと端末の
   * 既定の書体に落ちた絵を見て「手書きになっている」と判断していた。
   * 和文の手書き書体を入れた日に、絵が変わらないので気付いた。
   */
  publicDir: path.resolve(import.meta.dirname, "../../public"),
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
      {
        // 行き先の仕組みだけ差し替える。描かれる markup は本物のまま。
        find: /^@tanstack\/react-router$/,
        replacement: path.resolve(import.meta.dirname, "stubs/react-router.tsx"),
      },
      { find: "@", replacement: path.resolve(import.meta.dirname, "../../src") },
    ],
  },
  build: {
    outDir: path.resolve(import.meta.dirname, "../../.ui-harness"),
    emptyOutDir: true,
  },
});
