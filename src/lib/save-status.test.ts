/** 設定の「保存しました」（ARCHITECTURE「Preferences」: lightweight saved/error state）。 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSaveStatus, SAVED_VISIBLE_MS } from "./save-status";

describe("保存の状態", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("送って成功したら「保存しました」を出し、しばらくして引っ込める", () => {
    const s = createSaveStatus();
    const seen: string[] = [];
    s.subscribe(() => seen.push(s.get()));
    s.saving();
    expect(s.get()).toBe("saving");
    s.saved();
    expect(s.get()).toBe("saved");
    vi.advanceTimersByTime(SAVED_VISIBLE_MS);
    expect(s.get()).toBe("idle");
    expect(seen).toEqual(["saving", "saved", "idle"]);
  });

  it("端末だけの設定はいきなり「保存しました」", () => {
    const s = createSaveStatus();
    s.saved();
    expect(s.get()).toBe("saved");
  });

  it("2つ送っている間は、先に終わった方で「保存しました」と言わない", () => {
    const s = createSaveStatus();
    s.saving();
    s.saving();
    s.saved();
    expect(s.get()).toBe("saving");
    s.saved();
    expect(s.get()).toBe("saved");
  });

  it("失敗は error（理由はトーストで言う）、一部だけ保存は黙って idle", () => {
    const s = createSaveStatus();
    s.saving();
    s.failed();
    expect(s.get()).toBe("error");
    s.saving();
    s.settled();
    expect(s.get()).toBe("idle");
  });

  it("続けて保存すると、表示の時間は最後の保存から数え直す", () => {
    const s = createSaveStatus(1000);
    s.saved();
    vi.advanceTimersByTime(800);
    s.saved();
    vi.advanceTimersByTime(800);
    expect(s.get()).toBe("saved");
    vi.advanceTimersByTime(200);
    expect(s.get()).toBe("idle");
  });
});

describe("設定画面の配線", () => {
  const src = readFileSync(resolve(__dirname, "../components/screens/SettingsScreen.tsx"), "utf8");

  it("成功で saved、失敗で failed + トースト（エラーのトーストは残す）", () => {
    expect(src).toMatch(/settingsSaveStatus\.saving\(\);/);
    expect(src).toMatch(/settingsSaveStatus\.failed\(\);\s*toast\.error\(/);
    expect(src).toMatch(/<SaveStatusPill \/>/);
  });

  it("端末だけの設定（動き・キャッチの演出・音）も保存を知らせる", () => {
    expect(src).toMatch(/setChoice\(on \? "full" : "reduce"\);\s*settingsSaveStatus\.saved\(\);/);
    expect(src).toMatch(/writeCatchAnimation\(v\);\s*settingsSaveStatus\.saved\(\);/);
    expect(src).toMatch(/setLevelState\(v\);\s*settingsSaveStatus\.saved\(\);/);
  });
});
