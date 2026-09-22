import { useEffect, useRef, useState } from "react";
import { createAutosave, type SaveState } from "./autosave";

export function readSettingsDraft<T>(userId: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(`cw-settings-draft:${userId}`) ?? "null") as T | null;
  } catch {
    return null;
  }
}

type Session = {
  queue: ReturnType<typeof createAutosave<unknown>>;
  save: (value: unknown) => Promise<void>;
  listeners: Set<(state: SaveState) => void>;
};
// Keep a pending writer across route unmount/remount. Two independently mounted
// queues could otherwise let an older request overwrite a newer settings save.
const sessions = new Map<string, Session>();

export function useSettingsAutosave<T>(
  value: T,
  ready: boolean,
  userId: string,
  save: (value: T) => Promise<void>,
  initialDirty = false,
) {
  const [state, setState] = useState<SaveState>("saved");
  const latest = useRef({ value, save, initialDirty, userId });
  latest.current = { value, save, initialDirty, userId };
  const current = useRef<Session | null>(null);
  const owner = useRef(userId);

  useEffect(() => {
    if (owner.current !== userId) {
      const previous = sessions.get(owner.current);
      previous?.queue.cancel();
      sessions.delete(owner.current);
      owner.current = userId;
    }
    if (!ready || !userId) return;
    let session = sessions.get(userId);
    if (!session) {
      const listeners = new Set<(state: SaveState) => void>();
      session = {
        listeners,
        save: (draft) => latest.current.save(draft as T),
        queue: createAutosave<unknown>({
          initial:
            latest.current.initialDirty || readSettingsDraft(userId) ? null : latest.current.value,
          save: (draft) => {
            if (latest.current.userId !== userId)
              return Promise.reject(new Error("Account changed"));
            return session!.save(draft);
          },
          onState: (next) => {
            for (const listener of listeners) listener(next);
          },
          onDraft: (draft) => {
            try {
              if (draft === null) localStorage.removeItem(`cw-settings-draft:${userId}`);
              else localStorage.setItem(`cw-settings-draft:${userId}`, JSON.stringify(draft));
            } catch {
              /* Server persistence remains available. */
            }
          },
        }),
      };
      sessions.set(userId, session);
    }
    current.current = session;
    session.save = (draft) => latest.current.save(draft as T);
    session.listeners.add(setState);
    setState(session.queue.getState());
    return () => {
      session.listeners.delete(setState);
      current.current = null;
      // Flush while navigating, but keep a failed draft for the next visit.
      void session.queue.flush().finally(() => {
        if (
          !session.listeners.size &&
          session.queue.getState() === "saved" &&
          sessions.get(userId) === session
        )
          sessions.delete(userId);
      });
    };
  }, [ready, userId]);

  useEffect(() => {
    if (ready && current.current) current.current.queue.update(value);
  }, [value, ready, userId]);

  return { state, retry: () => current.current?.queue.flush() };
}
