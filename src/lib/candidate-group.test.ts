import { describe, expect, it } from "vitest";
import { groupCandidates } from "./candidate-order";

describe("groupCandidates — 写真の物ごとに束ねる", () => {
  it("同じ物の呼び方は1束。先頭はふだんの呼び方、残りは2段目", () => {
    const g = groupCandidates([
      { headword: "文旦", group: 0, register: "specific" as const },
      { headword: "柚子", group: 0, register: "common" as const },
      { headword: "桌子", group: 1, register: "common" as const },
      { headword: "麻豆文旦", group: 0, register: "proper" as const },
    ]);
    expect(g.map((x) => x.main.headword)).toEqual(["柚子", "桌子"]);
    expect(g[0].others.map((x) => x.headword)).toEqual(["文旦", "麻豆文旦"]);
    // 別の呼び方が無い物は2段目を出さない（others が空）。
    expect(g[1].others).toEqual([]);
  });

  it("番号が無ければ1つで1束（今までの1列のまま）", () => {
    const g = groupCandidates<{ headword: string; group?: number }>([
      { headword: "面紙" },
      { headword: "衛生紙" },
    ]);
    expect(g).toHaveLength(2);
    expect(g.every((x) => x.others.length === 0)).toBe(true);
  });
});
