import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AI_ATTEMPT_TIMEOUT,
  AiAttemptsFailed,
  attemptErrorCode,
  runAiAttempts,
} from "./ai-attempts";

/** 返事をしない AI（中断されたら止まる）。 */
function hangs() {
  const seen: AbortSignal[] = [];
  const run = vi.fn(
    (signal: AbortSignal) =>
      new Promise<string>((_, reject) => {
        seen.push(signal);
        signal.addEventListener("abort", () => reject(new Error("aborted by signal")));
      }),
  );
  return { run, seen };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("runAiAttempts", () => {
  it("returns the first provider's answer without touching the fallback", async () => {
    const backup = vi.fn(async () => "backup");
    const result = await runAiAttempts([
      { label: "a:fast", timeoutMs: 20_000, run: async () => "primary" },
      { label: "b:fast", timeoutMs: 20_000, run: backup },
    ]);
    expect(result.value).toBe("primary");
    expect(backup).not.toHaveBeenCalled();
    expect(result.attempts).toEqual([expect.objectContaining({ label: "a:fast", outcome: "ok" })]);
  });

  it("aborts a stalled provider at its deadline and falls back once", async () => {
    vi.useFakeTimers();
    const slow = hangs();
    const failed = vi.fn();
    const pending = runAiAttempts(
      [
        { label: "a:fast", timeoutMs: 20_000, run: slow.run },
        { label: "b:fast", timeoutMs: 20_000, run: async () => "backup" },
      ],
      { onAttemptFailed: failed },
    );
    await vi.advanceTimersByTimeAsync(19_999);
    expect(slow.seen[0].aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const result = await pending;
    expect(slow.seen[0].aborted).toBe(true);
    expect(result.value).toBe("backup");
    expect(result.attempts.map((a) => [a.label, a.outcome])).toEqual([
      ["a:fast", "timeout"],
      ["b:fast", "ok"],
    ]);
    expect(result.attempts[0].ms).toBe(20_000);
    expect(failed).toHaveBeenCalledWith(
      expect.objectContaining({ label: "a:fast", outcome: "timeout" }),
      "b:fast",
    );
  });

  it("moves on even when a provider ignores the abort signal", async () => {
    vi.useFakeTimers();
    const pending = runAiAttempts([
      { label: "a", timeoutMs: 1_000, run: () => new Promise<string>(() => {}) },
      { label: "b", timeoutMs: 1_000, run: async () => "ok" },
    ]);
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(pending).resolves.toMatchObject({ value: "ok" });
  });

  it("falls back on a provider error and records its status code", async () => {
    const err = Object.assign(new Error("Too Many Requests"), { statusCode: 429 });
    const result = await runAiAttempts([
      {
        label: "a",
        timeoutMs: 1_000,
        run: async () => {
          throw err;
        },
      },
      { label: "b", timeoutMs: 1_000, run: async () => 42 },
    ]);
    expect(result.value).toBe(42);
    expect(result.attempts[0]).toMatchObject({ outcome: "error", code: "http_429" });
  });

  it("throws the timeout code when every attempt timed out, and is not chargeable", async () => {
    vi.useFakeTimers();
    const a = hangs();
    const b = hangs();
    const pending = runAiAttempts(
      [
        { label: "a", timeoutMs: 20_000, run: a.run },
        { label: "b", timeoutMs: 20_000, run: b.run },
      ],
      { timeoutMessage: "FIRST_CATCH_ANALYSIS_TIMEOUT" },
    );
    const settled = pending.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(40_000);
    const error = await settled;
    expect(error).toBeInstanceOf(AiAttemptsFailed);
    const failed = error as AiAttemptsFailed;
    expect(failed.message).toBe("FIRST_CATCH_ANALYSIS_TIMEOUT");
    expect(failed.timedOut).toBe(true);
    expect(failed.chargeable).toBe(false);
    expect(failed.attempts.map((x) => x.outcome)).toEqual(["timeout", "timeout"]);
    expect(a.run).toHaveBeenCalledTimes(1);
    expect(b.run).toHaveBeenCalledTimes(1);
  });

  it("keeps the reply-format code and counts the call when a reply arrived", async () => {
    const error = await runAiAttempts(
      [
        {
          label: "a",
          timeoutMs: 1_000,
          run: async () => {
            throw new Error("FIRST_CATCH_AI_FORMAT");
          },
        },
        {
          label: "b",
          timeoutMs: 1_000,
          run: async () => {
            throw new Error("socket hang up");
          },
        },
      ],
      { isUnusableReply: (e) => e instanceof Error && e.message === "FIRST_CATCH_AI_FORMAT" },
    ).catch((e: unknown) => e as AiAttemptsFailed);
    expect(error.attempts.map((x) => x.outcome)).toEqual(["unusable", "error"]);
    expect(error.chargeable).toBe(true);
    expect(error.timedOut).toBe(false);
    // 最後に本当に起きた失敗の文を返す（締め切りの印で上書きしない）。
    expect(error.message).toBe("socket hang up");
  });

  it("uses a mixed timeout + network failure as not chargeable", async () => {
    vi.useFakeTimers();
    const a = hangs();
    const pending = runAiAttempts([
      { label: "a", timeoutMs: 500, run: a.run },
      {
        label: "b",
        timeoutMs: 500,
        run: async () => {
          throw new TypeError("fetch failed");
        },
      },
    ]).catch((e: unknown) => e as AiAttemptsFailed);
    await vi.advanceTimersByTimeAsync(500);
    const error = await pending;
    expect(error.chargeable).toBe(false);
    expect(error.message).toBe("fetch failed");
    expect(error.attempts[1].code).toBe("TypeError");
  });
});

describe("attemptErrorCode", () => {
  it("keeps only short codes, never free text", () => {
    expect(attemptErrorCode(new Error(AI_ATTEMPT_TIMEOUT))).toBe(AI_ATTEMPT_TIMEOUT);
    expect(attemptErrorCode(new Error("user photo of my house at 3 Main St"))).toBe("error");
    expect(attemptErrorCode("nope")).toBe("unknown");
  });
});
