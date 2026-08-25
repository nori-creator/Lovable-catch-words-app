import { describe, it, expect } from "vitest";
import {
  CEFR_EXAM_MAP,
  CEFR_SCALE,
  LEVEL_BANDS,
  LEVEL_INDEXES,
  LEVEL_OUT,
  TOCFL_SCALE,
  bandLabelKey,
  bandOf,
  examLabels,
  levelOptions,
  restoreLevel,
  parseLevelStep,
  stepColorVar,
  stepHeight,
  stepLabel,
  stepWidth,
  stepsInBand,
} from "./level-scale";

/**
 * 級の目盛りを2つの体系で共有する所の門。
 *
 * ここで一番怖いのは**取り違え** — `A1` の 1 を TOCFL の1級と読んだり、
 * `TOCFL-2` のハイフンを符号と読んだりすると、級が静かに間違う。
 * 級は「この語は自分に難しいか」の判断そのものなので、静かに間違うと
 * 学習の順番が崩れる。
 */

describe("parseLevelStep — TOCFL の形", () => {
  it("いろいろな書き方から段を取り出す", () => {
    expect(parseLevelStep("TOCFL-2")).toBe(2);
    expect(parseLevelStep("tocfl 5")).toBe(5);
    expect(parseLevelStep("3")).toBe(3);
    expect(parseLevelStep(4)).toBe(4);
    expect(parseLevelStep("第6級")).toBe(6);
  });

  it("**`TOCFL-2` のハイフンを符号と読まない**", () => {
    // `-?\d+` と書くと 2級が -2 になり、丸ごと級外へ落ちる。
    expect(parseLevelStep("TOCFL-2")).not.toBe(LEVEL_OUT);
  });
});

describe("parseLevelStep — CEFR の形", () => {
  it("A1〜C2 を1〜6に読む", () => {
    expect(parseLevelStep("A1")).toBe(1);
    expect(parseLevelStep("A2")).toBe(2);
    expect(parseLevelStep("B1")).toBe(3);
    expect(parseLevelStep("B2")).toBe(4);
    expect(parseLevelStep("C1")).toBe(5);
    expect(parseLevelStep("C2")).toBe(6);
  });

  it("小文字でも読む", () => {
    expect(parseLevelStep("b2")).toBe(4);
  });

  it("**綴りを数字より先に読む**(`A1` の 1 を1級と取り違えない)", () => {
    expect(parseLevelStep("A1")).toBe(1); // たまたま一致
    expect(parseLevelStep("C1")).toBe(5); // ここで取り違えが出る
    expect(parseLevelStep("B2")).toBe(4);
  });

  it("文の中に混ざっていても拾う", () => {
    expect(parseLevelStep("CEFR B1")).toBe(3);
  });
});

describe("parseLevelStep — 級外と「分からない」", () => {
  it("1〜6 の外は級外", () => {
    expect(parseLevelStep("TOCFL-0")).toBe(LEVEL_OUT);
    expect(parseLevelStep("TOCFL-7")).toBe(LEVEL_OUT);
    expect(parseLevelStep("99")).toBe(LEVEL_OUT);
  });

  it("**「級外」と「分からない」を混ぜない**", () => {
    expect(parseLevelStep(null)).toBeNull();
    expect(parseLevelStep(undefined)).toBeNull();
    expect(parseLevelStep("")).toBeNull();
    expect(parseLevelStep("   ")).toBeNull();
    expect(parseLevelStep("級外")).toBeNull();
    expect(parseLevelStep("unknown")).toBeNull();
  });

  it("壊れた数字で落ちない", () => {
    expect(parseLevelStep(Number.NaN)).toBeNull();
    expect(parseLevelStep("TOCFL-")).toBeNull();
  });
});

describe("段と帯の形が2つの体系で同じ", () => {
  it("どちらも6段", () => {
    expect(TOCFL_SCALE.labels).toHaveLength(6);
    expect(CEFR_SCALE.labels).toHaveLength(6);
  });

  it("**どの段もどれか1つの帯に入る**(抜けも重なりも無い)", () => {
    const all = LEVEL_BANDS.flatMap(stepsInBand);
    expect([...all].sort()).toEqual([...LEVEL_INDEXES]);
    expect(new Set(all).size).toBe(LEVEL_INDEXES.length);
  });

  it("帯ごとに2段ずつ、小さい順", () => {
    expect(stepsInBand("A")).toEqual([1, 2]);
    expect(stepsInBand("B")).toEqual([3, 4]);
    expect(stepsInBand("C")).toEqual([5, 6]);
  });

  it("**CEFR の綴りと帯が一致する**(B1/B2 は帯 B)", () => {
    for (const i of LEVEL_INDEXES) {
      expect(stepLabel(CEFR_SCALE, i).startsWith(bandOf(i))).toBe(true);
    }
  });

  it("帯ごとに違う文言を指す", () => {
    const keys = LEVEL_BANDS.map(bandLabelKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("stepHeight / stepColorVar", () => {
  it("段が上がるほど高くなる", () => {
    const hs = LEVEL_INDEXES.map(stepHeight);
    for (let i = 1; i < hs.length; i++) expect(hs[i]).toBeGreaterThan(hs[i - 1]);
  });

  it("いちばん低い段も見える高さを持つ(0 にしない)", () => {
    expect(stepHeight(1)).toBeGreaterThan(0.2);
  });

  it("いちばん高い段が 1", () => {
    expect(stepHeight(6)).toBeCloseTo(1, 6);
  });

  it("色は CSS のトークンで返す(素の16進を書かない)", () => {
    for (const i of LEVEL_INDEXES) expect(stepColorVar(i)).toBe(`var(--level-${i})`);
    expect(stepColorVar(LEVEL_OUT)).toBe("var(--level-out)");
  });

  it("**体系で色を分けない**(同じ深さは同じ濃さ)", () => {
    // TOCFL の3級と CEFR の B1 はどちらも3段目 = 同じ色。
    expect(stepColorVar(parseLevelStep("TOCFL-3") as number)).toBe(
      stepColorVar(parseLevelStep("B1") as number),
    );
  });
});

describe("toStored — 保存する形へ往復できる", () => {
  it("TOCFL", () => {
    for (const i of LEVEL_INDEXES) expect(parseLevelStep(TOCFL_SCALE.toStored(i))).toBe(i);
  });

  it("CEFR", () => {
    for (const i of LEVEL_INDEXES) expect(parseLevelStep(CEFR_SCALE.toStored(i))).toBe(i);
  });
});

describe("examLabels — TOEFL / IELTS は CEFR に添える", () => {
  it("B2 に両方付く", () => {
    const got = examLabels(CEFR_SCALE, 4);
    expect(got.toefl).toBeTruthy();
    expect(got.ielts).toBeTruthy();
  });

  it("**無い所は無いと言う**(埋めるために作り話をしない)", () => {
    // A1 はどちらの検定にも対応する帯が無い。
    expect(examLabels(CEFR_SCALE, 1)).toEqual({ toefl: null, ielts: null });
    // C2 は TOEFL iBT の上限より上。
    expect(examLabels(CEFR_SCALE, 6).toefl).toBeNull();
  });

  it("**TOCFL には検定の目盛りを付けない**(別の言語の話)", () => {
    for (const i of LEVEL_INDEXES) {
      expect(examLabels(TOCFL_SCALE, i)).toEqual({ toefl: null, ielts: null });
    }
  });

  it("換算表は6段ぶん揃っている", () => {
    for (const label of CEFR_SCALE.labels) expect(CEFR_EXAM_MAP[label]).toBeDefined();
  });

  it("**幅で出す**(1点に決めない)", () => {
    for (const v of Object.values(CEFR_EXAM_MAP)) {
      for (const s of [v.toefl, v.ielts]) {
        if (s) expect(s).toMatch(/[–-]/);
      }
    }
  });
});

describe("言い方は体系ごとに持つ", () => {
  it("**CEFR に「級」を付けない**(A1級 という体系は無い)", () => {
    expect(TOCFL_SCALE.levelInBandKey).not.toBe(CEFR_SCALE.levelInBandKey);
    expect(TOCFL_SCALE.outKey).not.toBe(CEFR_SCALE.outKey);
  });

  it("どちらの体系も言い方を持っている(空のキーを画面に出さない)", () => {
    for (const sc of [TOCFL_SCALE, CEFR_SCALE]) {
      expect(sc.levelInBandKey).toBeTruthy();
      expect(sc.outKey).toBeTruthy();
      expect(sc.id).toBeTruthy();
    }
  });
});

describe("stepWidth — 名前の長さで決める", () => {
  it("**TOCFL は 16px のまま**(1文字なので今までと1ドットも変わらない)", () => {
    expect(stepWidth(TOCFL_SCALE)).toBe(16);
  });

  it("**CEFR は広がる**(`A1 A2` がくっついて読めなかった — 絵で見つけた)", () => {
    expect(stepWidth(CEFR_SCALE)).toBeGreaterThan(stepWidth(TOCFL_SCALE));
  });

  it("名前が伸びるほど広い", () => {
    const long = { ...CEFR_SCALE, labels: ["A1+", "A2", "B1", "B2", "C1", "C2"] } as const;
    expect(stepWidth(long as unknown as typeof CEFR_SCALE)).toBeGreaterThan(stepWidth(CEFR_SCALE));
  });

  it("**指が届く幅を下回らない**(段そのものは押す物ではないが、細い棒にしない)", () => {
    for (const sc of [TOCFL_SCALE, CEFR_SCALE]) expect(stepWidth(sc)).toBeGreaterThanOrEqual(16);
  });
});

describe("levelOptions — 設定に並べる6つ", () => {
  it("**TOCFL の文言が変わっていない**", () => {
    expect(levelOptions(TOCFL_SCALE)).toEqual([
      { value: "TOCFL-1", label: "TOCFL Level 1" },
      { value: "TOCFL-2", label: "TOCFL Level 2" },
      { value: "TOCFL-3", label: "TOCFL Level 3" },
      { value: "TOCFL-4", label: "TOCFL Level 4" },
      { value: "TOCFL-5", label: "TOCFL Level 5" },
      { value: "TOCFL-6", label: "TOCFL Level 6" },
    ]);
  });

  it("**CEFR に `Level` を付けない**(A1級 という体系が無いのと同じ話)", () => {
    const got = levelOptions(CEFR_SCALE);
    expect(got[0]).toEqual({ value: "A1", label: "CEFR A1" });
    expect(got[5]).toEqual({ value: "C2", label: "CEFR C2" });
    for (const o of got) expect(o.label).not.toContain("Level");
  });

  it("**保存する形は読み返せる**(設定した級が次に開いたとき消えない)", () => {
    for (const sc of [TOCFL_SCALE, CEFR_SCALE]) {
      for (const o of levelOptions(sc)) expect(parseLevelStep(o.value)).not.toBeNull();
    }
  });
});

describe("restoreLevel — 学習言語を切り替えたときの級", () => {
  /**
   * 学習言語を選べるようにした日(2026-08-25、第4段)から、同じ人の
   * `level_goal` に `"TOCFL-2"` と `"A2"` の両方があり得る。
   * 載せ替えないと、設定の一覧に**無い値**が選ばれた状態になり、
   * 選択が空に見えて保存もできない。
   */
  it("段を引き継いで表記だけ載せ替える", () => {
    expect(restoreLevel(CEFR_SCALE, "TOCFL-2", 1)).toBe("A2");
    expect(restoreLevel(TOCFL_SCALE, "B1", 1)).toBe("TOCFL-3");
  });

  it("同じ目盛りならそのまま(触らない)", () => {
    for (const i of LEVEL_INDEXES) {
      const v = CEFR_SCALE.toStored(i);
      expect(restoreLevel(CEFR_SCALE, v, 1)).toBe(v);
      const t = TOCFL_SCALE.toStored(i);
      expect(restoreLevel(TOCFL_SCALE, t, 1)).toBe(t);
    }
  });

  it("**6段を往復しても壊れない**(切り替えを繰り返しても段が動かない)", () => {
    for (const i of LEVEL_INDEXES) {
      const start = TOCFL_SCALE.toStored(i);
      const there = restoreLevel(CEFR_SCALE, start, 1);
      const back = restoreLevel(TOCFL_SCALE, there, 1);
      expect(back, `段${i}`).toBe(start);
    }
  });

  it("読めない値は fallback(空の選択を作らない)", () => {
    for (const bad of [null, undefined, "", "  ", "級外", "unknown"]) {
      expect(restoreLevel(CEFR_SCALE, bad, 2), String(bad)).toBe("A2");
    }
  });

  it("**6段の外は fallback**(`toStored(7)` は一覧に無い値を作る)", () => {
    for (const out of ["TOCFL-7", "TOCFL-0", "9"]) {
      expect(restoreLevel(CEFR_SCALE, out, 1), out).toBe("A1");
    }
  });

  it("**返す値は必ず一覧の中に在る**(選択が空にならない)", () => {
    const inputs = [null, "", "TOCFL-2", "B1", "C2", "TOCFL-7", "級外", "unknown", 3];
    for (const scale of [TOCFL_SCALE, CEFR_SCALE]) {
      const values = levelOptions(scale).map((o) => o.value);
      for (const raw of inputs) {
        expect(values, `${scale.id}: ${raw}`).toContain(restoreLevel(scale, raw, 1));
      }
    }
  });
});
