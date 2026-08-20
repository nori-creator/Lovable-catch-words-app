import { describe, it, expect } from "vitest";
import { nextAutoFillQueue, MAX_AUTO_FILL } from "./auto-fill";
import { REGEN_SECTIONS, type RegenSection } from "./card-sections";

const ALL = [...REGEN_SECTIONS] as RegenSection[];

describe("nextAutoFillQueue", () => {
  it("画面に並ぶ順のまま返す(並べ替えない)", () => {
    const q = nextAutoFillQueue(ALL, new Set(), ALL.length);
    expect(q).toEqual(ALL);
  });

  it("渡された順を尊重する — 利用者が節を並べ替えていても上から", () => {
    const custom: RegenSection[] = ["taiwan_note", "meaning", "example"];
    expect(nextAutoFillQueue(custom, new Set(), 10)).toEqual(custom);
  });

  it("上限で切る", () => {
    expect(nextAutoFillQueue(ALL, new Set()).length).toBe(MAX_AUTO_FILL);
    expect(nextAutoFillQueue(ALL, new Set(), 2)).toEqual(ALL.slice(0, 2));
  });

  it("**試した節は二度と入らない**(失敗した節も含む)", () => {
    const attempted = new Set<string>(["meaning", "example"]);
    const q = nextAutoFillQueue(ALL, attempted, 3);
    expect(q).not.toContain("meaning");
    expect(q).not.toContain("example");
    expect(q).toHaveLength(3);
  });

  it("全部試し終わったら空", () => {
    expect(nextAutoFillQueue(ALL, new Set(ALL))).toEqual([]);
  });

  it("作る物が無ければ空", () => {
    expect(nextAutoFillQueue([], new Set())).toEqual([]);
  });

  it("上限0なら何も作らない(蓋が効くことを確かめる)", () => {
    expect(nextAutoFillQueue(ALL, new Set(), 0)).toEqual([]);
  });
});
