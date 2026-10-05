import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllGlobals());

describe("existing-account entry", () => {
  it("survives reload and never applies to a different account", async () => {
    const values = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      setItem: (key: string, value: string) => values.set(key, value),
      getItem: (key: string) => values.get(key) ?? null,
    });
    vi.resetModules();
    const first = await import("./returning-signin");
    expect(first.hasReturningSignin("existing")).toBe(false);
    first.rememberReturningSignin("existing");
    vi.resetModules();
    const reloaded = await import("./returning-signin");
    expect(reloaded.hasReturningSignin("existing")).toBe(true);
    expect(reloaded.hasReturningSignin("new-signup")).toBe(false);
  });

  it("still enters the app if browser storage is blocked", async () => {
    vi.stubGlobal("sessionStorage", {
      setItem: () => {
        throw new Error("blocked");
      },
      getItem: () => {
        throw new Error("blocked");
      },
    });
    vi.resetModules();
    const entry = await import("./returning-signin");
    expect(entry.hasReturningSignin("existing")).toBe(false);
    entry.rememberReturningSignin("existing");
    expect(entry.hasReturningSignin("existing")).toBe(true);
    expect(entry.hasReturningSignin("anonymous")).toBe(false);
  });
});
