import { describe, it, expect } from "vitest";
import { pickZhTWVoice, voiceScore, type VoiceLike } from "./speak";

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

describe("pickZhTWVoice", () => {
  it("大陸の声しか無ければ選ばない — 端末に決めさせる", () => {
    expect(pickZhTWVoice([CN, CN2])).toBeNull();
  });

  it("台湾の声があれば、一覧のどこにあっても選ぶ", () => {
    expect(pickZhTWVoice([CN, CN2, TW])).toBe(TW);
    expect(pickZhTWVoice([TW, CN])).toBe(TW);
  });

  it("**並び順を変えても同じ声**(ここが『たまに異なる』の芯)", () => {
    const list = [CN, HK, TW_PLAIN, TW, CN2];
    const a = pickZhTWVoice(list);
    const b = pickZhTWVoice([...list].reverse());
    expect(a).toBe(b);
    expect(a).toBe(TW);
  });

  it("同点なら名前順で割る(端末をまたいでも決まり方が同じ)", () => {
    const x = v("B voice", "zh-TW");
    const y = v("A voice", "zh-TW");
    expect(pickZhTWVoice([x, y])?.name).toBe("A voice");
    expect(pickZhTWVoice([y, x])?.name).toBe("A voice");
  });

  it("空の一覧でも落ちない", () => {
    expect(pickZhTWVoice([])).toBeNull();
  });
});
