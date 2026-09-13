// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";
import type { IncomingMessage } from "node:http";
import type { Plugin } from "vite";

function isExpectedDisconnect(error: unknown): boolean {
  if (error == null || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; name?: unknown; message?: unknown };
  return (
    candidate.code === "ECONNRESET" ||
    candidate.code === "ABORT_ERR" ||
    candidate.name === "AbortError" ||
    (typeof candidate.message === "string" &&
      /^(?:aborted|This operation was aborted|The operation was aborted)$/i.test(candidate.message))
  );
}

/**
 * Node emits `Error: aborted` on IncomingMessage when a browser closes a
 * navigation request. Install the listener at Vite's HTTP boundary, before
 * TanStack SSR sees the request, so the dev error overlay cannot mistake a
 * routine disconnect for an application crash.
 */
function requestDisconnectGuard(): Plugin {
  const guard = (request: IncomingMessage) => {
    request.on("error", (error) => {
      if (isExpectedDisconnect(error)) return;
      queueMicrotask(() => {
        throw error;
      });
    });
  };

  return {
    name: "request-disconnect-guard",
    enforce: "pre",
    configureServer(server) {
      server.httpServer?.prependListener("request", guard);
    },
    configurePreviewServer(server) {
      server.httpServer?.prependListener("request", guard);
    },
  };
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [requestDisconnectGuard(), mcpPlugin()],
  },
});
