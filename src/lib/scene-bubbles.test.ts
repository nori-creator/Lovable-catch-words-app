import { describe, it, expect } from "vitest";
import { MAX_BUBBLES, sceneBubbles, seasonOf } from "./scene-bubbles";
import type { WordExtrasDTO } from "./extras";

/**
 * オーナー指示 2026-08-27 ⑤:
 * > 「ある場所でしか見かけないとかある場所や季節のもの、ある場所の特産の
 * >  ものを 〇〇限定、とか場所のラベルを表示したい。（台南限定、台湾限定、
 * >  ポケモンの〇〇地方のポケモンみたいな）」
 *
 * `region_scope` と `season_months` は extras に前から在るのに、
 * **画面のどこにも出ていなかった**。ここで札にする。
 */

const base = (over: Partial<WordExtrasDTO> = {}) => ({ ...over }) as WordExtrasDTO;
const io = {
  limitedTo: (p: string) => `${p}限定`,
  seasonName: (k: string) => ({ spring: "春", summer: "夏", autumn: "秋", winter: "冬" })[k] ?? k,
};

describe("seasonOf", () => {
  it("1つの季節に収まればその季節", () => {
    expect(seasonOf([3, 4, 5])).toBe("spring");
    expect(seasonOf([12, 1, 2])).toBe("winter");
  });

  it("季節をまたぐ旬は季節の話ではない", () => {
    expect(seasonOf([5, 6])).toBeNull();
  });

  it("通年(空)も、ほぼ通年(10か月以上)も null", () => {
    expect(seasonOf([])).toBeNull();
    expect(seasonOf(null)).toBeNull();
    expect(seasonOf([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBeNull();
  });

  it("月として通らない値は無視する", () => {
    expect(seasonOf([0, 13, 3.5, 4])).toBe("spring");
  });
});

describe("sceneBubbles", () => {
  it("**限定の札を作る**(前は画面のどこにも出ていなかった)", () => {
    expect(sceneBubbles({ extras: base({ region_scope: "台南" }), ...io })).toEqual([
      { id: "limited:台南限定", kind: "limited", label: "台南限定" },
    ]);
  });

  it("季節の限定も作る", () => {
    const got = sceneBubbles({ extras: base({ season_months: [3, 4, 5] }), ...io });
    expect(got.map((b) => b.label)).toEqual(["春限定"]);
  });

  it("**限定が先頭**(いちばん珍しい話だから)", () => {
    const got = sceneBubbles({
      extras: base({
        region_scope: "台湾",
        encounter_labels: [{ kind: "place", label: "夜市" }],
      }),
      ...io,
    });
    expect(got.map((b) => b.kind)).toEqual(["limited", "place"]);
  });

  it("同じ字の札を2つ出さない(「台南」と「台南限定」を並べない)", () => {
    const got = sceneBubbles({
      extras: base({
        region_scope: "台南",
        encounter_labels: [
          { kind: "place", label: "台南" },
          { kind: "place", label: "夜市" },
        ],
      }),
      ...io,
    });
    expect(got.map((b) => b.label)).toEqual(["台南限定", "夜市"]);
  });

  it("種類の順に並ぶ(同じ種類が散らばらない)", () => {
    const got = sceneBubbles({
      extras: base({
        encounter_labels: [
          { kind: "season", label: "春" },
          { kind: "place", label: "駅" },
          { kind: "time", label: "夜" },
          { kind: "place", label: "道" },
        ],
      }),
      ...io,
    });
    expect(got.map((b) => b.kind)).toEqual(["place", "place", "time", "season"]);
  });

  it("重複と空白だけの札を落とす", () => {
    const got = sceneBubbles({
      extras: base({
        encounter_labels: [
          { kind: "place", label: "駅" },
          { kind: "media", label: "駅" },
          { kind: "place", label: "   " },
        ],
      }),
      ...io,
    });
    expect(got).toHaveLength(1);
  });

  it("上限で切る(増やすと札が小さくなって字が読めない)", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      kind: "place" as const,
      label: `場所${i}`,
    }));
    expect(sceneBubbles({ extras: base({ encounter_labels: many }), ...io })).toHaveLength(
      MAX_BUBBLES,
    );
  });

  it("何も無ければ空(地の文に落ちる合図)", () => {
    expect(sceneBubbles({ extras: base(), ...io })).toEqual([]);
    expect(sceneBubbles({ extras: null, ...io })).toEqual([]);
  });

  it("id は並びの中で一意(物理の輪が札を追える)", () => {
    const got = sceneBubbles({
      extras: base({
        region_scope: "台湾",
        encounter_labels: [
          { kind: "place", label: "夜市" },
          { kind: "time", label: "夜" },
        ],
      }),
      ...io,
    });
    expect(new Set(got.map((b) => b.id)).size).toBe(got.length);
  });
});
