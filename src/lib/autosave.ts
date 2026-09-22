/** Serial, last-write-wins persistence. A failed revision stays dirty until retry. */
export type SaveState = "saved" | "pending" | "saving" | "error";
export function createAutosave<T>(options: {
  initial: T;
  save: (value: T) => Promise<void>;
  onState?: (state: SaveState) => void;
  onDraft?: (value: T | null) => void;
  delay?: number;
}) {
  let desired = options.initial;
  let saved = JSON.stringify(desired);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> | undefined;
  let state: SaveState = "saved";
  let cancelled = false;
  const notify = (next: SaveState) => {
    state = next;
    options.onState?.(next);
  };
  const dirty = () => JSON.stringify(desired) !== saved;
  const flush = (): Promise<void> => {
    clearTimeout(timer);
    if (cancelled) return Promise.resolve();
    if (running) return running;
    if (!dirty()) {
      notify("saved");
      return Promise.resolve();
    }
    running = (async () => {
      while (dirty() && !cancelled) {
        const value = desired;
        const key = JSON.stringify(value);
        notify("saving");
        try {
          await options.save(value);
        } catch {
          notify("error");
          return;
        }
        saved = key;
      }
      if (cancelled) return;
      options.onDraft?.(null);
      notify("saved");
    })().finally(() => {
      running = undefined;
    });
    return running;
  };
  return {
    update(value: T) {
      if (cancelled) return;
      desired = value;
      clearTimeout(timer);
      // A revert during a request must still be queued: the in-flight value
      // may become the server's value even when this matches the old baseline.
      if (!dirty() && !running) {
        options.onDraft?.(null);
        notify("saved");
        return;
      }
      options.onDraft?.(value);
      if (!running) notify("pending");
      timer = setTimeout(() => {
        void flush();
      }, options.delay ?? 450);
    },
    flush,
    getState: () => state,
    cancel() {
      cancelled = true;
      clearTimeout(timer);
    },
    dispose() {
      clearTimeout(timer);
      void flush();
    },
  };
}
