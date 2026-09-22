import { afterEach, describe, expect, it, vi } from "vitest";
import { createAutosave } from "./autosave";
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
afterEach(() => vi.useRealTimers());
describe("autosave persistence", () => {
  it("does not write untouched settings and coalesces rapid changes", async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue(undefined);
    const q = createAutosave({ initial: 0, save });
    q.update(0);
    expect(save).not.toHaveBeenCalled();
    q.update(1);
    q.update(2);
    await vi.advanceTimersByTimeAsync(500);
    expect(save.mock.calls).toEqual([[2]]);
    expect(q.getState()).toBe("saved");
  });
  it("serializes a newer change behind a slow request", async () => {
    const first = deferred();
    const save = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined);
    const q = createAutosave({ initial: 0, save });
    q.update(1);
    const done = q.flush();
    q.update(2);
    expect(save).toHaveBeenCalledTimes(1);
    first.resolve();
    await done;
    expect(save.mock.calls).toEqual([[1], [2]]);
    q.dispose();
  });
  it("persists a revert even when the previous save was in flight", async () => {
    const first = deferred();
    const save = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined);
    const q = createAutosave({ initial: 0, save });
    q.update(1);
    const done = q.flush();
    q.update(0);
    first.resolve();
    await done;
    expect(save.mock.calls).toEqual([[1], [0]]);
    q.dispose();
  });
  it("keeps a failed draft and retries without falsely reporting saved", async () => {
    const save = vi.fn().mockRejectedValueOnce(Error("offline")).mockResolvedValue(undefined);
    const draft = vi.fn();
    const q = createAutosave({ initial: 0, save, onDraft: draft });
    q.update(1);
    await q.flush();
    expect(q.getState()).toBe("error");
    expect(draft).not.toHaveBeenCalledWith(null);
    await q.flush();
    expect(q.getState()).toBe("saved");
    expect(draft).toHaveBeenLastCalledWith(null);
  });
  it("flushes a pending change when navigating away", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const q = createAutosave({ initial: 0, save });
    q.update(1);
    q.dispose();
    await q.flush();
    expect(save).toHaveBeenCalledWith(1);
  });
  it("cancels queued account writes while retaining the draft", async () => {
    vi.useFakeTimers();
    const save = vi.fn();
    const draft = vi.fn();
    const q = createAutosave({ initial: 0, save, onDraft: draft });
    q.update(1);
    q.cancel();
    await vi.advanceTimersByTimeAsync(500);
    await q.flush();
    expect(save).not.toHaveBeenCalled();
    expect(draft).toHaveBeenLastCalledWith(1);
  });
  it("does not send the next revision after account cancellation", async () => {
    const first = deferred();
    const save = vi.fn().mockReturnValue(first.promise);
    const draft = vi.fn();
    const q = createAutosave({ initial: 0, save, onDraft: draft });
    q.update(1);
    const done = q.flush();
    q.update(2);
    q.cancel();
    first.resolve();
    await done;
    expect(save.mock.calls).toEqual([[1]]);
    expect(draft).toHaveBeenLastCalledWith(2);
  });
});
