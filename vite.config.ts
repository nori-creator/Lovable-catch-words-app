// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";
import { configDefaults } from "vitest/config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [mcpPlugin()],
    /**
     * **試験は作業用の写し（`.claude/**`）を見ない**（監査 2026-10-03）。リポジトリの直下に
     * 置かれた別の作業の写し（worktree）の試験まで拾うと、`npm run check` がその写しの
     * 途中の状態で落ちる。既定の除外（node_modules など）はそのまま残す。
     */
    // `test` は vitest が読む欄（vite の型には無いので、形だけ外して渡す）。
    ...({ test: { exclude: [...configDefaults.exclude, ".claude/**"] } } as object),
    environments: {
      /**
       * **zod は自分の塊に分ける**（2026-10-03 最初の読み込みの監査）。分けないと、
       * 束ね方の都合で React Query の中身と同じ塊（`schemas-*.js`）に入り、最初の画面が
       * 使わない zod（約 30KB gz）まで最初に読んでいた。zod を使う画面・関数は今まで
       * どおり、その塊を読む時に一緒に読む。
       *
       * **画面側（client）の束ね方にだけ掛ける。** 全体の `build` に置くと、サーバの束ね方
       * （nitro。自分で `codeSplitting` を決める）にも渡り、「manualChunks option is ignored
       * because the codeSplitting option is specified」の警告が毎回出ていた。サーバは
       * 最初の読み込みの重さと関係ないので、分ける必要もない。
       */
      client: {
        build: {
          rollupOptions: {
            output: {
              manualChunks(id: string) {
                if (id.includes("/node_modules/zod/")) return "zod";
                return undefined;
              },
            },
          },
        },
      },
    },
  },
});
