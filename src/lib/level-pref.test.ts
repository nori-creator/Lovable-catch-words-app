import { describe, it, expect, beforeEach } from "vitest";
import { storedLevels, setStoredLevels, EMPTY_LEVELS } from "./level-pref";

/**
 * オーナー報告 2026-08-26（3度目）の「級が1と2に戻る」の受け皿。
 * ここが守るのは **学習言語ごとに別々に憶える** ことだけ。
 */

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  clear() {
    this.map.clear();
  }
}

beforeEach(() => {
  const store = new MemoryStorage();
  Object.defineProperty(globalThis, "localStorage", { value: store, configurable: true });
  Object.defineProperty(globalThis, "window", { value: globalThis, configurable: true });
});

describe("level-pref", () => {
  it("選んでいなければ「無い」を返す（既定を返さない）", () => {
    expect(storedLevels("en")).toEqual(EMPTY_LEVELS);
  });

  it("憶えた級をそのまま返す", () => {
    setStoredLevels("en", { current: "B1", goal: "B2" });
    expect(storedLevels("en")).toEqual({ current: "B1", goal: "B2" });
  });

  it("**学習言語ごとに別々**（台湾華語の2級と英語の B1 は同じ人の別の値）", () => {
    setStoredLevels("en", { current: "B1", goal: "B2" });
    setStoredLevels("zh-TW", { current: "TOCFL-2", goal: "TOCFL-3" });
    expect(storedLevels("en")).toEqual({ current: "B1", goal: "B2" });
    expect(storedLevels("zh-TW")).toEqual({ current: "TOCFL-2", goal: "TOCFL-3" });
  });

  it("片方だけ書いてももう片方を消さない", () => {
    setStoredLevels("en", { current: "B1", goal: "B2" });
    setStoredLevels("en", { goal: "C1" });
    expect(storedLevels("en")).toEqual({ current: "B1", goal: "C1" });
  });

  it("壊れた値が入っていても落ちない", () => {
    localStorage.setItem("level-pref-v1", "{{{");
    expect(storedLevels("en")).toEqual(EMPTY_LEVELS);
  });
});
