import { describe, expect, it } from "vitest";
import { CandidatePickInput, countsAsFunnelPick } from "./candidate-pick.functions";

/** 候補を選んだ1回の受け口（順位・数・道だけ。語は受け取らない）。 */
describe("candidate_pick の受け口", () => {
  it("順位・候補の数・道を受け取り、語などほかの欄は落とす", () => {
    expect(
      CandidatePickInput.parse({ via: "photo", rank: 2, n: 5, headword: "雨傘" } as unknown),
    ).toEqual({ via: "photo", rank: 2, n: 5 });
    expect(CandidatePickInput.parse({ via: "native_search", rank: 1, n: 1 })).toEqual({
      via: "native_search",
      rank: 1,
      n: 1,
    });
  });

  it("候補の数より後ろの順位・0・小数・知らない道は受け取らない", () => {
    expect(() => CandidatePickInput.parse({ via: "photo", rank: 6, n: 5 })).toThrow();
    expect(() => CandidatePickInput.parse({ via: "photo", rank: 0, n: 5 })).toThrow();
    expect(() => CandidatePickInput.parse({ via: "photo", rank: 1.5, n: 5 })).toThrow();
    expect(() => CandidatePickInput.parse({ via: "guess", rank: 1, n: 5 })).toThrow();
    expect(() => CandidatePickInput.parse({ via: "photo", rank: 1, n: 51 })).toThrow();
  });

  it("ファネルの「候補を選んだ」は一覧が在った回だけ（打った1語・スキャンの1語は数えない）", () => {
    expect(countsAsFunnelPick({ via: "photo", n: 5 })).toBe(true);
    expect(countsAsFunnelPick({ via: "native_search", n: 1 })).toBe(true);
    expect(countsAsFunnelPick({ via: "typed", n: 3 })).toBe(true);
    expect(countsAsFunnelPick({ via: "typed", n: 1 })).toBe(false);
    expect(countsAsFunnelPick({ via: "scan", n: 1 })).toBe(false);
  });
});
