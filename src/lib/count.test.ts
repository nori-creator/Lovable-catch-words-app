import { describe, expect, it } from "vitest";
import { formatCount } from "./count";

describe("formatCount", () => {
  it("三桁で区切る(4桁を超えると読めなくなる)", () => {
    expect(formatCount(1342)).toBe("1,342");
    expect(formatCount(1000)).toBe("1,000");
    expect(formatCount(999)).toBe("999");
  });

  it("小さい数はそのまま", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(6)).toBe("6");
  });

  // 表示にしか使わないので、**壊れた数でも落とさない**。
  it.each([NaN, Infinity, -Infinity])("有限でない数でも投げない(%s)", (n) => {
    expect(formatCount(n)).toBe("0");
  });

  it("負の数は0に寄せる(件数に負は無い)", () => {
    expect(formatCount(-5)).toBe("0");
  });

  it("整数でない数は丸める", () => {
    expect(formatCount(2.4)).toBe("2");
    expect(formatCount(2.6)).toBe("3");
  });

  it("知らない locale でも落とさない", () => {
    expect(formatCount(1342, "not-a-locale")).toMatch(/1.?342/);
  });
});
