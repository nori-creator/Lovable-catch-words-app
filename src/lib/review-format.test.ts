import { describe, it, expect } from "vitest";
import { memoryLevel } from "./memory";
import {
  formatForLevel,
  normalizeReviewMode,
  reviewFormatFor,
  saidTarget,
  type ReviewFormat,
} from "./review-format";

describe("normalizeReviewMode", () => {
  it("集合に在る3つだけを通す", () => {
    expect(normalizeReviewMode("speaking")).toBe("speaking");
    expect(normalizeReviewMode("choice")).toBe("choice");
    expect(normalizeReviewMode("hybrid")).toBe("hybrid");
  });

  // **わざと変な値を入れて落ちることを確かめる。**
  // `Number(null) === 0` で「中立」を既定にしてしまった件と同じ罠を
  // ここで作らない — 通ってはいけない物が通らないことを試験で押さえる。
  it.each([null, undefined, "", " ", "Hybrid", "HYBRID", 0, 1, true, false, {}, []])(
    "%p は既定の speaking に落ちる",
    (bad) => {
      expect(normalizeReviewMode(bad)).toBe("speaking");
    },
  );
});

describe("formatForLevel", () => {
  it("6段が3つの形に割り当たる", () => {
    expect(formatForLevel(0)).toBe("choice");
    expect(formatForLevel(1)).toBe("choice");
    expect(formatForLevel(2)).toBe("say");
    expect(formatForLevel(3)).toBe("say");
    expect(formatForLevel(4)).toBe("compose");
    expect(formatForLevel(5)).toBe("compose");
  });

  it("3つの形が全部使われる(1つも死に札にしない)", () => {
    const used = new Set<ReviewFormat>([0, 1, 2, 3, 4, 5].map(formatForLevel));
    expect([...used].sort()).toEqual(["choice", "compose", "say"]);
  });
});

describe("reviewFormatFor", () => {
  const fresh = { retention: 100, intervalDays: 1, repetitions: 0 };

  it("「いつも4択」を選んだ人の画面は段階で動かさない", () => {
    expect(reviewFormatFor({ pref: "choice", ...fresh })).toBe("choice");
    expect(
      reviewFormatFor({ pref: "choice", retention: 5, intervalDays: 90, repetitions: 30 }),
    ).toBe("choice");
  });

  it("「いつも発話」を選んだ人はこれまで通り作文発話のまま", () => {
    expect(reviewFormatFor({ pref: "speaking", ...fresh })).toBe("compose");
    expect(
      reviewFormatFor({ pref: "speaking", retention: 1, intervalDays: 1, repetitions: 0 }),
    ).toBe("compose");
  });

  it("おまかせ: 忘れかけの語は4択に落ちる", () => {
    expect(
      reviewFormatFor({ pref: "hybrid", retention: 20, intervalDays: 10, repetitions: 5 }),
    ).toBe("choice");
  });

  it("おまかせ: うろ覚えは発音", () => {
    expect(
      reviewFormatFor({ pref: "hybrid", retention: 60, intervalDays: 5, repetitions: 2 }),
    ).toBe("say");
  });

  it("おまかせ: 長く覚えている語は作文発話", () => {
    expect(
      reviewFormatFor({ pref: "hybrid", retention: 90, intervalDays: 60, repetitions: 10 }),
    ).toBe("compose");
  });

  /**
   * ここが `modeFor(repetitions)` では出せなかった答え。
   * 20回やったが1か月放置して記憶率10%まで落ちた語は、
   * 回数で決めると**いちばん難しい作文発話**が来る。
   * 画面には赤い「忘れかけ」のバッジが出ているのに。
   */
  it("何度もやったが忘れかけている語には、易しい形が来る", () => {
    expect(
      reviewFormatFor({ pref: "hybrid", retention: 10, intervalDays: 30, repetitions: 20 }),
    ).toBe("choice");
  });

  it("撮ったばかりで一度も復習していない語に作文発話は来ない", () => {
    for (let r = 0; r <= 2; r++) {
      const f = reviewFormatFor({
        pref: "hybrid",
        retention: 100,
        intervalDays: 1,
        repetitions: r,
      });
      expect(f).not.toBe("compose");
    }
  });

  it("フレーズの札は発音の段でも会話のまま(発音する1語が無い)", () => {
    const band = { pref: "hybrid" as const, retention: 60, intervalDays: 5, repetitions: 2 };
    expect(reviewFormatFor(band)).toBe("say");
    expect(reviewFormatFor({ ...band, entryType: "phrase" })).toBe("compose");
  });

  it("フレーズでも、忘れかけなら4択で拾い直す", () => {
    expect(
      reviewFormatFor({
        pref: "hybrid",
        retention: 20,
        intervalDays: 10,
        repetitions: 5,
        entryType: "phrase",
      }),
    ).toBe("choice");
  });

  it("保存されている値が壊れていても、これまでの見た目(作文発話)に落ちる", () => {
    expect(reviewFormatFor({ pref: null, ...fresh })).toBe("compose");
    expect(reviewFormatFor({ pref: "hybird", ...fresh })).toBe("compose");
  });

  /**
   * **バッジと出題形式が同じ数字から来ていることを縛る。**
   * どちらかを後から触ったときに、静かにずれるのを止める門。
   */
  it("画面のバッジと同じ記憶レベルから決まっている", () => {
    for (const retention of [0, 10, 29, 30, 49, 50, 69, 70, 84, 85, 100]) {
      for (const intervalDays of [1, 7, 29, 30, 90]) {
        for (const repetitions of [0, 2, 3, 10]) {
          const lv = memoryLevel(retention, intervalDays, repetitions).level;
          expect(reviewFormatFor({ pref: "hybrid", retention, intervalDays, repetitions })).toBe(
            formatForLevel(lv),
          );
        }
      }
    }
  });
});

describe("saidTarget", () => {
  it("その語がそのまま聞こえていれば通す", () => {
    expect(saidTarget("面紙", "面紙")).toBe(true);
  });

  it("文の中に混ざっていても通す", () => {
    expect(saidTarget("我要買面紙。", "面紙")).toBe(true);
  });

  it("句読点と空白は無視する", () => {
    expect(saidTarget(" 面 紙 ！", "面紙")).toBe(true);
    expect(saidTarget("面、紙", "面紙")).toBe(true);
  });

  it("違う語なら落とす", () => {
    expect(saidTarget("衛生紙", "面紙")).toBe(false);
  });

  // **何も言っていない人に○を出さない。**
  it.each([
    ["", "面紙"],
    ["   ", "面紙"],
    ["。。。", "面紙"],
    ["面紙", ""],
    ["面紙", "   "],
  ])("空(%p / %p)は必ず false", (said, target) => {
    expect(saidTarget(said, target)).toBe(false);
  });
});
