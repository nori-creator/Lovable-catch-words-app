/**
 * A browser navigation, reload, or closed connection aborts the in-flight
 * request. Some server adapters wrap that DOMException in an HTTP error, so
 * inspect the cause chain rather than relying on instanceof alone.
 */
export function isRequestAbortError(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;

  while (current != null && !seen.has(current)) {
    seen.add(current);

    if (current instanceof DOMException && current.name === "AbortError") return true;
    if (typeof current !== "object") return false;

    const candidate = current as {
      name?: unknown;
      code?: unknown;
      message?: unknown;
      cause?: unknown;
    };
    if (candidate.name === "AbortError" || candidate.code === "ABORT_ERR") return true;
    if (
      typeof candidate.message === "string" &&
      /^(?:This operation was aborted|The operation was aborted|aborted)$/i.test(candidate.message)
    ) {
      return true;
    }
    current = candidate.cause;
  }

  return false;
}