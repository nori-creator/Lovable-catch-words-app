import { describe, expect, it } from "vitest";
import { canWarmUp, warmUpTarget } from "./warm-up";

describe("選ぶ前の下ごしらえ（候補のいちばん上の発音と持っているかの確認）", () => {
  it("ふつうの回線では先に取る", () => {
    expect(canWarmUp({ onLine: true })).toBe(true);
    expect(canWarmUp({ onLine: true, connection: { effectiveType: "4g" } })).toBe(true);
  });

  it("圏外・データセーバー・遅い回線では取らない", () => {
    expect(canWarmUp({ onLine: false })).toBe(false);
    expect(canWarmUp({ onLine: true, connection: { saveData: true } })).toBe(false);
    expect(canWarmUp({ onLine: true, connection: { effectiveType: "2g" } })).toBe(false);
    expect(canWarmUp({ onLine: true, connection: { effectiveType: "slow-2g" } })).toBe(false);
    expect(canWarmUp(null)).toBe(false);
  });

  it("下ごしらえするのは並びの先頭の1語だけ（空の見出しは飛ばす）", () => {
    expect(warmUpTarget([{ headword: " " }, { headword: "雨傘" }, { headword: "傘" }])).toEqual({
      headword: "雨傘",
    });
    expect(warmUpTarget([])).toBeNull();
  });
});
