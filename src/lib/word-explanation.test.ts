import { describe, it, expect } from "vitest";
import {
  LEGACY_KEY,
  explanationKey,
  needsGeneration,
  pickExplanation,
  sameKey,
  resolveDisplayWord,
  shouldWriteSharedColumns,
  type ExplanationRow,
} from "./word-explanation";
import { emptyExtras } from "./extras";

/**
 * 「開くたびに解説を作り直して上書きし合う」を止めた所の門。
 *
 * ここで一番怖いのは**作り直しが復活すること** — 直っているように見えて、
 * 実際には利用者が増えるほど遅く・高くなる。型でもビルドでも落ちないので、
 * 試験で押さえる。
 */

const full = { ...emptyExtras(), mnemonic: "覚え方", usage_context: "よく見る" };

function row(over: Partial<ExplanationRow> = {}): ExplanationRow {
  return {
    explain_lang: "ja",
    l1: "ja",
    meaning: "自転車",
    extras: full,
    source: "ai",
    ...over,
  };
}

describe("explanationKey", () => {
  it("そのまま使う", () => {
    expect(explanationKey("zh-TW", "zh")).toEqual({ explainLang: "zh-TW", l1: "zh" });
  });

  it("**空・null は旧データの既定に落とす**(日本語話者向けの日本語)", () => {
    expect(explanationKey(null, null)).toEqual(LEGACY_KEY);
    expect(explanationKey("", "")).toEqual(LEGACY_KEY);
    expect(explanationKey(undefined, undefined)).toEqual(LEGACY_KEY);
  });

  it("前後の空白を落とす(空白違いで別の解説にしない)", () => {
    expect(explanationKey(" en ", " zh ")).toEqual({ explainLang: "en", l1: "zh" });
  });
});

describe("sameKey", () => {
  it("3つ揃いで1つ", () => {
    expect(sameKey({ explainLang: "ja", l1: "ja" }, { explainLang: "ja", l1: "ja" })).toBe(true);
    expect(sameKey({ explainLang: "ja", l1: "ja" }, { explainLang: "ja", l1: "ko" })).toBe(false);
    expect(sameKey({ explainLang: "en", l1: "ja" }, { explainLang: "ja", l1: "ja" })).toBe(false);
  });
});

describe("pickExplanation", () => {
  it("ぴったり合う物を選ぶ", () => {
    const rows = [row({ l1: "ko", meaning: "한국어" }), row({ l1: "ja", meaning: "自転車" })];
    expect(pickExplanation(rows, { explainLang: "ja", l1: "ja" })?.meaning).toBe("自転車");
  });

  it("**母語が違っても、読める言語の物には落ちる**", () => {
    const rows = [row({ l1: "ko", meaning: "日本語で書いた韓国語話者向け" })];
    const got = pickExplanation(rows, { explainLang: "ja", l1: "ja" });
    expect(got?.explain_lang).toBe("ja");
  });

  it("**読めない言語の解説には落ちない**(何も出さないほうがまし)", () => {
    const rows = [row({ explain_lang: "zh-TW", l1: "zh", meaning: "腳踏車" })];
    expect(pickExplanation(rows, { explainLang: "ja", l1: "ja" })).toBeNull();
  });

  it("言語だけ合う物が複数あれば、**人が確かめた物を先に**", () => {
    const rows = [
      row({ l1: "ko", source: "ai", meaning: "AI" }),
      row({ l1: "vi", source: "verified", meaning: "確認済み" }),
    ];
    expect(pickExplanation(rows, { explainLang: "ja", l1: "ja" })?.meaning).toBe("確認済み");
  });

  it("空・null でも落ちない", () => {
    expect(pickExplanation([], LEGACY_KEY)).toBeNull();
    expect(pickExplanation(null, LEGACY_KEY)).toBeNull();
    expect(pickExplanation(undefined, LEGACY_KEY)).toBeNull();
  });
});

describe("needsGeneration — ここが作り直しを止める所", () => {
  it("**その組み合わせの解説があれば、何度開いても作らない**", () => {
    const picked = row();
    expect(needsGeneration(picked, { explainLang: "ja", l1: "ja" })).toBe(false);
  });

  it("**母語が違う人が開いても、その人向けの解説があれば作らない**", () => {
    // 直したかった不具合そのもの: 前はここが true で、開くたびに作り直していた。
    const picked = row({ l1: "ko" });
    expect(needsGeneration(picked, { explainLang: "ja", l1: "ko" })).toBe(false);
  });

  it("その人向けが無く、言語だけ合う物で間に合わせているなら作る", () => {
    const picked = row({ l1: "ko" });
    expect(needsGeneration(picked, { explainLang: "ja", l1: "ja" })).toBe(true);
  });

  it("1つも無ければ作る", () => {
    expect(needsGeneration(null, LEGACY_KEY)).toBe(true);
  });

  it("**半端な解説は「在る」と数えない**(途中で失敗した回を固定しない)", () => {
    expect(needsGeneration(row({ meaning: "" }), LEGACY_KEY)).toBe(true);
    expect(needsGeneration(row({ meaning: "   " }), LEGACY_KEY)).toBe(true);
    expect(needsGeneration(row({ extras: emptyExtras() }), LEGACY_KEY)).toBe(true);
    expect(needsGeneration(row({ extras: null }), LEGACY_KEY)).toBe(true);
  });
});

describe("shouldWriteSharedColumns", () => {
  it("**共有の列が揃っていれば書きに行かない**(他人のカードを書き換えない)", () => {
    expect(
      shouldWriteSharedColumns({ meaning: "自転車", reading: "ㄐㄧㄠˇ", example: "我騎腳踏車" }),
    ).toBe(false);
  });

  it("どれか1つでも欠けていれば書く", () => {
    expect(shouldWriteSharedColumns({ meaning: "", reading: "ㄐ", example: "文" })).toBe(true);
    expect(shouldWriteSharedColumns({ meaning: "自転車", reading: "", example: "文" })).toBe(true);
    expect(shouldWriteSharedColumns({ meaning: "自転車", reading: "ㄐ", example: "" })).toBe(true);
  });

  it("空白だけは「在る」と数えない", () => {
    expect(shouldWriteSharedColumns({ meaning: "  ", reading: "ㄐ", example: "文" })).toBe(true);
  });

  it("null・undefined でも落ちない", () => {
    expect(shouldWriteSharedColumns({})).toBe(true);
    expect(shouldWriteSharedColumns({ meaning: null, reading: null, example: null })).toBe(true);
  });
});

describe("resolveDisplayWord", () => {
  const shared = { meaning: "共有の意味", exampleTranslation: "共有の訳", extras: "共有" };

  it("**共有キャッシュがあればそちらを出す**", () => {
    const got = resolveDisplayWord(shared, {
      meaning: "キャッシュの意味",
      example_translation: "キャッシュの訳",
      extras: "キャッシュ",
    });
    expect(got).toEqual({
      meaning: "キャッシュの意味",
      exampleTranslation: "キャッシュの訳",
      extras: "キャッシュ",
    });
  });

  it("**キャッシュに無ければ古い列に落ちる**(移行前でも動く)", () => {
    expect(resolveDisplayWord(shared, null)).toEqual({
      meaning: "共有の意味",
      exampleTranslation: "共有の訳",
      extras: "共有",
    });
  });

  it("意味が空のキャッシュでは古い列に落ちる(空の意味を出さない)", () => {
    const got = resolveDisplayWord(shared, {
      meaning: "",
      example_translation: null,
      extras: "キャッシュ",
    });
    expect(got.meaning).toBe("共有の意味");
    expect(got.exampleTranslation).toBe("共有の訳");
  });

  it("**解説は行が在れば空でもそちら**(裏で埋めている途中を古い物で潰さない)", () => {
    const got = resolveDisplayWord(shared, {
      meaning: "キャッシュの意味",
      example_translation: null,
      extras: "",
    });
    expect(got.extras).toBe("");
  });

  it("空白だけの意味は「在る」と数えない", () => {
    const got = resolveDisplayWord(shared, {
      meaning: "   ",
      example_translation: "  ",
      extras: "キャッシュ",
    });
    expect(got.meaning).toBe("共有の意味");
    expect(got.exampleTranslation).toBe("共有の訳");
  });

  it("共有の側も空なら空で返す(落ちない)", () => {
    const got = resolveDisplayWord({ extras: null }, null);
    expect(got).toEqual({ meaning: "", exampleTranslation: null, extras: null });
  });
});
