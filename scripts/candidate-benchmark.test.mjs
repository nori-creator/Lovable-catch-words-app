import { describe, expect, it } from "vitest";
import { hitRank, normHead, percentile, planFor, summarize } from "./candidate-benchmark.mjs";

/** 候補の精度の測り（`docs/engineering/candidate-benchmark.md`）の数え方。 */
describe("candidate-benchmark", () => {
  it("正解の語が候補の何番目にあったか（空白・大文字の揺れは同じ語）", () => {
    const s = [{ headword: "雨傘" }, { headword: "傘" }, { headword: "Umbrella " }];
    expect(hitRank(s, ["傘"])).toBe(2);
    expect(hitRank(s, ["umbrella"])).toBe(3);
    expect(hitRank(s, ["陽傘"])).toBeNull();
    expect(normHead(" 雨　傘 ")).toBe("雨傘");
  });

  it("Top-1 / Top-3 と待ち時間の p50 / p90 / p99 を出す（失敗した回も分母と待ち時間に入れる）", () => {
    const s = summarize([
      { ms: 1000, rank: 1 },
      { ms: 2000, rank: 3 },
      { ms: 3000, rank: null },
      { ms: 20000, rank: null, error: "timeout" },
    ]);
    expect(s).toMatchObject({ n: 4, errors: 1, top1: 1, top3: 2, top1Pct: 25, top3Pct: 50 });
    expect(s.p50).toBe(2000);
    expect(s.p99).toBe(20000);
    expect(percentile([], 50)).toBeNull();
  });

  it("写真が1枚も無くても落ちない（何を置けばよいかを出す側へ）", () => {
    const p = planFor("xx-none");
    expect(p.items).toEqual([]);
    expect(p.unlabeled).toEqual([]);
    expect(p.missing).toEqual([]);
  });
});
