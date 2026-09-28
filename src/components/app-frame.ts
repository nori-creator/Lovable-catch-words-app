/** Shared screen geometry; guides must not override app dimensions. */
export function appFrameClass(fixedViewport = false) {
  return fixedViewport
    ? "h-dvh overflow-hidden bg-background"
    : "min-h-screen bg-background pb-[calc(6rem+env(safe-area-inset-bottom))]";
}
export function appMainClass({ bare = false, immersive = false, fixedViewport = false } = {}) {
  return bare
    ? "h-dvh"
    : immersive
      ? "mx-auto max-w-3xl px-4"
      : fixedViewport
        ? "mx-auto flex h-[calc(100dvh-var(--app-header-h)-env(safe-area-inset-top)-6rem-env(safe-area-inset-bottom))] max-w-3xl flex-col overflow-hidden px-4 py-2"
        : "mx-auto max-w-3xl px-4 py-4";
}
