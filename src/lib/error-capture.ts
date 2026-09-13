import { isRequestAbortError } from "./abort-error";

// Captures the original Error out-of-band so server.ts can recover the stack
// when h3 has already swallowed the throw into a generic 500 Response.

let lastCapturedError: { error: unknown; at: number } | undefined;
const TTL_MS = 5_000;

function record(error: unknown) {
  // Keep aborts too: h3 may replace them with an opaque HTTPError response,
  // and server.ts needs the original cause to avoid rendering a fatal page.
  lastCapturedError = { error, at: Date.now() };
}

// Node itself raises `Error: aborted` (ECONNRESET, thrown from
// node:_http_server abortIncoming) when a browser closes the connection
// mid-request — navigation, reload, or a cancelled image range request.
// That happens below the fetch handler, so server.ts never sees it and the
// dev runtime reports it as a fatal blank-screen error. Absorb it here.
const nodeProcess = (globalThis as { process?: NodeJS.Process }).process;
if (nodeProcess && typeof nodeProcess.on === "function") {
  const isConnectionReset = (error: unknown) =>
    isRequestAbortError(error) ||
    (error != null &&
      typeof error === "object" &&
      (error as { code?: unknown }).code === "ECONNRESET");

  nodeProcess.on("uncaughtException", (error) => {
    if (isConnectionReset(error)) return;
    record(error);
    console.error(error);
  });
  nodeProcess.on("unhandledRejection", (reason) => {
    if (isConnectionReset(reason)) return;
    record(reason);
  });
}

if (typeof globalThis.addEventListener === "function") {
  globalThis.addEventListener("error", (event) => record((event as ErrorEvent).error ?? event));
  globalThis.addEventListener("unhandledrejection", (event) =>
    record((event as PromiseRejectionEvent).reason),
  );
}

export function consumeLastCapturedError(): unknown {
  if (!lastCapturedError) return undefined;
  if (Date.now() - lastCapturedError.at > TTL_MS) {
    lastCapturedError = undefined;
    return undefined;
  }
  const { error } = lastCapturedError;
  lastCapturedError = undefined;
  return error;
}
