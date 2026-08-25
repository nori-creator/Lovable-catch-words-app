import { describe, it, expect } from "vitest";
import { pickVoice, voiceScore, type VoiceLike } from "./speak";
import { DEFAULT_TARGET_LANGUAGE, TARGET_LANGUAGES } from "./target-lang";

/**
 * 「音声の声がたまに異なる。様々な別のソフトの声がする」への答え。
 * 守るのは2つだけ:
 *   1. 台湾の声があるなら**必ず**それを選ぶ(大陸の声で埋めない)
 *   2. 同じ一覧なら**必ず同じ声**が出る(並び順に左右されない)
 */
const v = (name: string, lang: string): VoiceLike => ({ name, lang });

const TW = v("Meijia", "zh-TW");
const TW_PLAIN = v("Chinese (Traditional)", "zh-Hant");
const CN = v("Tingting", "zh-CN");
const CN2 = v("Google 普通话（中国大陆）", "zh-CN");
const HK = v("Sinji", "zh-HK");

describe("voiceScore", () => {
  it("台湾の声が一番高い", () => {
    expect(voiceScore(TW)).toBeGreaterThan(voiceScore(TW_PLAIN));
    expect(voiceScore(TW_PLAIN)).toBeGreaterThan(voiceScore(HK));
  });

  it("**大陸の普通話には点を与えない**(台湾華語とは別物)", () => {
    expect(voiceScore(CN)).toBe(0);
    expect(voiceScore(CN2)).toBe(0);
  });
});

describe("pickVoice — 台湾華語", () => {
  it("大陸の声しか無ければ選ばない — 端末に決めさせる", () => {
    expect(pickVoice([CN, CN2])).toBeNull();
  });

  it("台湾の声があれば、一覧のどこにあっても選ぶ", () => {
    expect(pickVoice([CN, CN2, TW])).toBe(TW);
    expect(pickVoice([TW, CN])).toBe(TW);
  });

  it("**並び順を変えても同じ声**(ここが『たまに異なる』の芯)", () => {
    const list = [CN, HK, TW_PLAIN, TW, CN2];
    const a = pickVoice(list);
    const b = pickVoice([...list].reverse());
    expect(a).toBe(b);
    expect(a).toBe(TW);
  });

  it("同点なら名前順で割る(端末をまたいでも決まり方が同じ)", () => {
    const x = v("B voice", "zh-TW");
    const y = v("A voice", "zh-TW");
    expect(pickVoice([x, y])?.name).toBe("A voice");
    expect(pickVoice([y, x])?.name).toBe("A voice");
  });

  it("空の一覧でも落ちない", () => {
    expect(pickVoice([])).toBeNull();
  });
});

/**
 * 英語を学習言語に足した日(2026-08-25、第4段)から、**英語の語が
 * 台湾華語の声で読まれる**危険が生まれた。しかも `voiceScore` は
 * 英語の声に 0 を付けるので、声が当たらないまま `lang` だけ `zh-TW` で
 * 渡り、端末が英語を中国語として読む。
 */
describe("pickVoice — 英語", () => {
  const US = v("Samantha", "en-US");
  const GB = v("Daniel", "en-GB");
  const AU = v("Karen", "en-AU");

  it("アメリカ英語を最優先(オーナー決定 2026-08-24)", () => {
    expect(pickVoice([GB, AU, US], "en")).toBe(US);
    expect(pickVoice([US, GB], "en")).toBe(US);
  });

  it("アメリカの声が無ければ他の英語(黙るよりまし)", () => {
    // 同点は名前順で割る。"Daniel" < "Karen" なので GB。
    expect(pickVoice([GB, AU], "en")).toBe(GB);
    expect(pickVoice([AU, GB], "en")).toBe(GB);
  });

  it("**中国語の声は選ばない**(英語を中国語の声で読ませない)", () => {
    expect(pickVoice([TW, CN, HK], "en")).toBeNull();
  });

  it("**英語の声は台湾華語に選ばれない**(逆も同じ)", () => {
    expect(pickVoice([US, GB], DEFAULT_TARGET_LANGUAGE)).toBeNull();
  });

  it("並び順を変えても同じ声", () => {
    const list = [GB, US, AU];
    expect(pickVoice(list, "en")).toBe(pickVoice([...list].reverse(), "en"));
  });
});

describe("言語ごとに表が在る", () => {
  const US = v("Samantha", "en-US");

  it("**選べる学習言語には全部、点の付け方が在る**", () => {
    // 表が無い言語を足すと、既定(台湾華語)の表で英語の声を採点する
    // ことになり、どの声も 0 点で黙る。
    for (const lang of TARGET_LANGUAGES) {
      const pool = [TW, TW_PLAIN, CN, HK, US, v("Daniel", "en-GB")];
      expect(pickVoice(pool, lang), lang).not.toBeNull();
    }
  });

  it("知らない言語は既定(台湾華語)の表で見る", () => {
    expect(pickVoice([TW, US], "kl-GL")).toBe(TW);
  });

  it("引数を省くと台湾華語(古い呼び方が意味を変えない)", () => {
    expect(voiceScore(TW)).toBe(voiceScore(TW, DEFAULT_TARGET_LANGUAGE));
    expect(pickVoice([TW, US])).toBe(TW);
  });
});
