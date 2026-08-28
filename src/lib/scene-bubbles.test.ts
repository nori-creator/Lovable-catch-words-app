import { describe, it, expect } from "vitest";
import type { WordExtrasDTO } from "./extras";
import {
  MAX_BUBBLES,
  MAX_PER_AXIS,
  limitedRegion,
  monthSpan,
  sceneBubbles,
  sceneGroups,
  seasonOf,
} from "./scene-bubbles";

/**
 * その語にどこで・いつ出会うか（オーナー指示 2026-08-27 ⑤ / 2026-08-28 ②）。
 *
 * ここで守るのは3つ:
 *   ① **理由の無い「限定」を出さない**（「立扇 → 台湾限定」を止める門）
 *   ② 旬が季節に寄っていれば季節限定、散っていれば言わない
 *   ③ 軸ごとに束ねる。同じ形で1列に並べない
 */

const io = {
  limitedTo: (p: string) => `${p}限定`,
  seasonName: (k: string) => ({ spring: "春", summer: "夏", autumn: "秋", winter: "冬" })[k] ?? k,
};

const base = (over: Partial<WordExtrasDTO> = {}): Partial<WordExtrasDTO> => ({
  encounter_labels: [],
  season_months: [],
  region_scope: "",
  region_scope_kind: null,
  ...over,
});

const labels = (...ls: [string, string][]) =>
  ls.map(([kind, label]) => ({ kind, label }) as WordExtrasDTO["encounter_labels"][number]);

describe("limitedRegion（理由の無い限定を通さない）", () => {
  it("**地域名だけでは限定を名乗れない**（立扇に台湾限定が出た原因）", () => {
    expect(limitedRegion("台湾", null)).toBeNull();
    expect(limitedRegion("台湾", "")).toBeNull();
    expect(limitedRegion("台湾", "unknown")).toBeNull();
  });

  it("理由が付いていれば通す", () => {
    expect(limitedRegion("台南", "specialty")).toBe("台南");
    expect(limitedRegion("台湾", "institution")).toBe("台湾");
    expect(limitedRegion("台湾", "regional_word")).toBe("台湾");
  });

  it("地域名が無ければ、理由が在っても通さない", () => {
    expect(limitedRegion("", "specialty")).toBeNull();
    expect(limitedRegion("   ", "specialty")).toBeNull();
    expect(limitedRegion(null, "specialty")).toBeNull();
  });
});

describe("monthSpan（年をまたいでも数えられる）", () => {
  it("並んだ月はその数", () => {
    expect(monthSpan([3, 4, 5])).toBe(3);
    expect(monthSpan([5, 6, 7, 8, 9])).toBe(5);
  });

  it("**年をまたぐ旬を「12ヶ月」と数えない**（11〜2月は4ヶ月）", () => {
    expect(monthSpan([11, 12, 1, 2])).toBe(4);
  });

  it("離れた2つは長い", () => {
    expect(monthSpan([1, 7])).toBe(7);
  });

  it("空・1つでも落ちない", () => {
    expect(monthSpan([])).toBe(0);
    expect(monthSpan([6])).toBe(1);
  });
});

describe("seasonOf", () => {
  it("1つの季節に収まればその季節", () => {
    expect(seasonOf([3, 4, 5])).toBe("spring");
    expect(seasonOf([11, 12, 1, 2])).toBe("winter");
  });

  it("**季節をまたいでも寄っていれば拾う**（文旦の 8〜10月は秋）", () => {
    expect(seasonOf([8, 9, 10])).toBe("autumn");
  });

  it("**長い旬は季節の話にしない**（扇風機の 5〜9月・エアコンの 5〜10月）", () => {
    expect(seasonOf([5, 6, 7, 8, 9])).toBeNull();
    expect(seasonOf([5, 6, 7, 8, 9, 10])).toBeNull();
  });

  it("通年・空・壊れた値は季節ではない", () => {
    expect(seasonOf([])).toBeNull();
    expect(seasonOf(null)).toBeNull();
    expect(seasonOf([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])).toBeNull();
    expect(seasonOf([0, 13, 1.5])).toBeNull();
  });
});

describe("sceneGroups", () => {
  it("軸ごとに束ね、限定を先頭に置く", () => {
    const got = sceneGroups({
      extras: base({
        region_scope: "台南",
        region_scope_kind: "specialty",
        encounter_labels: labels(["place", "夜市"], ["time", "夜"], ["emotion", "うれしい"]),
      }),
      ...io,
    });
    expect(got.map((g) => g.axis)).toEqual(["limited", "where", "when", "feeling"]);
    expect(got[0].items.map((i) => i.label)).toEqual(["台南限定"]);
  });

  it("**時刻と季節は同じ「いつ」に入る**（軸を増やしすぎない）", () => {
    const got = sceneGroups({
      extras: base({ encounter_labels: labels(["time", "朝"], ["season", "夏"]) }),
      ...io,
    });
    expect(got).toHaveLength(1);
    expect(got[0].axis).toBe("when");
    expect(got[0].items.map((i) => i.label)).toEqual(["朝", "夏"]);
  });

  it("状況と媒体は「どんな場面で」に入る", () => {
    const got = sceneGroups({
      extras: base({ encounter_labels: labels(["situation", "注文するとき"], ["media", "看板"]) }),
      ...io,
    });
    expect(got.map((g) => g.axis)).toEqual(["scene"]);
  });

  it("物の性質は別の束になる（出会う場所と混ぜない）", () => {
    const got = sceneGroups({
      extras: base({ encounter_labels: labels(["trait", "熱い"], ["place", "屋台"]) }),
      ...io,
    });
    expect(got.map((g) => g.axis)).toEqual(["where", "trait"]);
  });

  it("**同じ字の札を2つ出さない**（「台南」と「台南限定」を並べない）", () => {
    const got = sceneBubbles({
      extras: base({
        region_scope: "台南",
        region_scope_kind: "specialty",
        encounter_labels: labels(["place", "台南"], ["place", "夜市"]),
      }),
      ...io,
    });
    expect(got.map((b) => b.label)).toEqual(["台南限定", "夜市"]);
  });

  it("季節限定は限定の束に入る", () => {
    const got = sceneGroups({ extras: base({ season_months: [3, 4, 5] }), ...io });
    expect(got[0].axis).toBe("limited");
    expect(got[0].items[0].label).toBe("春限定");
  });

  it("1つの軸が全部を食べない", () => {
    const many = labels(
      ...Array.from({ length: 9 }, (_, i) => ["place", `所${i}`] as [string, string]),
    );
    const got = sceneGroups({ extras: base({ encounter_labels: many }), ...io });
    expect(got).toHaveLength(1);
    expect(got[0].items).toHaveLength(MAX_PER_AXIS);
  });

  it("総数の上限は束を跨いで効く", () => {
    const many = labels(
      ...(["place", "place", "place", "place"] as const).map(
        (k, i) => [k, `所${i}`] as [string, string],
      ),
      ...(["time", "time", "time", "time"] as const).map(
        (k, i) => [k, `時${i}`] as [string, string],
      ),
      ...(["situation", "situation", "situation"] as const).map(
        (k, i) => [k, `場${i}`] as [string, string],
      ),
    );
    expect(sceneBubbles({ extras: base({ encounter_labels: many }), ...io }).length).toBe(
      MAX_BUBBLES,
    );
  });

  it("何も無ければ束も作らない（空の見出しを出さない）", () => {
    expect(sceneGroups({ extras: base(), ...io })).toEqual([]);
    expect(sceneGroups({ extras: null, ...io })).toEqual([]);
    expect(sceneGroups({ extras: undefined, ...io })).toEqual([]);
  });

  it("空白だけの札は落とす", () => {
    const got = sceneBubbles({
      extras: base({ encounter_labels: labels(["place", "  "], ["place", "夜市"]) }),
      ...io,
    });
    expect(got.map((b) => b.label)).toEqual(["夜市"]);
  });

  it("知らない種類は場所に落とす（札そのものは捨てない）", () => {
    const got = sceneBubbles({
      extras: base({ encounter_labels: labels(["nope", "スーパー"]) }),
      ...io,
    });
    expect(got).toHaveLength(1);
    expect(got[0].axis).toBe("where");
  });
});

describe("本番で誤っていた語（2026-08-28 に確かめた実データ）", () => {
  const cases: [string, Partial<WordExtrasDTO>][] = [
    ["立扇(扇風機)", { region_scope: "台湾", season_months: [5, 6, 7, 8, 9] }],
    ["冷氣(エアコン)", { region_scope: "台湾", season_months: [5, 6, 7, 8, 9, 10] }],
    ["泡芙(シュークリーム)", { region_scope: "台湾", season_months: [] }],
    ["葡式蛋塔(エッグタルト)", { region_scope: "台湾", season_months: [] }],
    ["棒(すごい)", { region_scope: "台湾", season_months: [] }],
  ];
  for (const [name, ex] of cases) {
    it(`**${name} に限定を出さない**`, () => {
      const got = sceneBubbles({ extras: base(ex), ...io });
      expect(got.filter((b) => b.kind === "limited")).toEqual([]);
    });
  }

  it("理由の付いた語には限定を出す（文旦は秋の名物）", () => {
    const got = sceneBubbles({
      extras: base({
        region_scope: "台湾",
        region_scope_kind: "specialty",
        season_months: [8, 9, 10],
      }),
      ...io,
    });
    expect(got.map((b) => b.label)).toEqual(["台湾限定", "秋限定"]);
  });
});
