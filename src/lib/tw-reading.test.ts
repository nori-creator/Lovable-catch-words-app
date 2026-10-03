import { describe, expect, it } from "vitest";
import { checkTaiwanReading, correctTaiwanReading } from "./tw-reading.server";
import { parsePinyin, pinyinToZhuyin, parseZhuyin } from "./pinyin-zhuyin";

describe("拼音 ⇄ 注音の変換", () => {
  it("声調記号・数字・続け書きを読む", () => {
    expect(pinyinToZhuyin("ná tiě")).toBe("ㄋㄚˊ ㄊㄧㄝˇ");
    expect(pinyinToZhuyin("na2 tie3")).toBe("ㄋㄚˊ ㄊㄧㄝˇ");
    expect(pinyinToZhuyin("kāfēi")).toBe("ㄎㄚ ㄈㄟ");
    expect(pinyinToZhuyin("jué de")).toBe("ㄐㄩㄝˊ ˙ㄉㄜ");
    expect(pinyinToZhuyin("lǜ shī")).toBe("ㄌㄩˋ ㄕ");
    expect(pinyinToZhuyin("qù yóu jú")).toBe("ㄑㄩˋ ㄧㄡˊ ㄐㄩˊ");
    expect(pinyinToZhuyin("xióng")).toBe("ㄒㄩㄥˊ");
  });
  it("続け書きは字の数に合う分け方を選ぶ", () => {
    expect(parsePinyin("biàn lì shāngdiàn", 4)?.length).toBe(4);
    expect(parsePinyin("nálǎtiě", 2)?.length).toBe(3);
  });
  it("注音も読む（空白なしでも）", () => {
    expect(parseZhuyin("ㄋㄚˊㄊㄧㄝˇ", 2)?.map((s) => s.base)).toEqual(["na", "tie"]);
    expect(parseZhuyin("ㄐㄩㄝˊ ˙ㄉㄜ")?.map((s) => s.tone)).toEqual([2, 5]);
  });
});

/** 辞書の読み（AI の読みが空のときに入る物）。 */
const dict = (headword: string) => checkTaiwanReading(headword, "", "");

describe("台湾華語の読みの検査（2026-10-03「拿鐵」が nálǎtiě と出た件）", () => {
  it("拿鐵 → ná tiě（音節の数が違う AI の読みを直す）", () => {
    const r = checkTaiwanReading("拿鐵", "nálǎtiě", "ㄋㄚˊ ㄌㄚˇ ㄊㄧㄝˇ");
    expect(r.pinyin).toBe("ná tiě");
    expect(r.zhuyin).toBe("ㄋㄚˊ ㄊㄧㄝˇ");
    expect(r.reason).toBe("count");
    expect(r.source).toBe("dictionary");
  });

  it.each([
    ["咖啡", "kā fēi", "ㄎㄚ ㄈㄟ"],
    ["銀行", "yín háng", "ㄧㄣˊ ㄏㄤˊ"],
    ["行人", "xíng rén", "ㄒㄧㄥˊ ㄖㄣˊ"],
    ["便利商店", "biàn lì shāng diàn", "ㄅㄧㄢˋ ㄌㄧˋ ㄕㄤ ㄉㄧㄢˋ"],
  ])("%s → %s（繁体字の多音字も語として読む）", (head, py, zy) => {
    expect(dict(head)).toMatchObject({ pinyin: py, zhuyin: zy });
  });

  it("合っている AI の読みは書かれたまま残す", () => {
    const r = checkTaiwanReading("咖啡", "kāfēi", "ㄎㄚ ㄈㄟ");
    expect(r).toEqual({ pinyin: "kāfēi", zhuyin: "ㄎㄚ ㄈㄟ", fixed: [] });
    const item = { headword_zh: "銀行", pinyin: "yín háng", reading_zhuyin: "ㄧㄣˊ ㄏㄤˊ" };
    expect(correctTaiwanReading("zh-TW", "銀行", item)).toBe(item);
  });

  it("音節の数が違う読みを直す（足りない・多い）", () => {
    expect(checkTaiwanReading("便利商店", "biàn lì diàn", "").pinyin).toBe("biàn lì shāng diàn");
    expect(checkTaiwanReading("咖啡", "kā fēi tīng", "").pinyin).toBe("kā fēi");
  });

  it("その字に無い読みの音節を直す", () => {
    const r = checkTaiwanReading("銀行", "yín xíng", "ㄧㄣˊ ㄒㄧㄥˊ");
    // 「行」は xíng とも読むので、音節としてはありうる → 残す（語の読みまでは決めない）。
    expect(r.fixed).toEqual([]);
    const bad = checkTaiwanReading("行人", "háng lén", "");
    expect(bad).toMatchObject({ pinyin: "xíng rén", reason: "syllable" });
  });

  it("拼音が崩れていても注音が合っていれば注音から起こす", () => {
    const r = checkTaiwanReading("拿鐵", "", "ㄋㄚˊ ㄊㄧㄝˇ");
    expect(r).toMatchObject({ pinyin: "ná tiě", zhuyin: "ㄋㄚˊ ㄊㄧㄝˇ", source: "ai_zhuyin" });
  });

  it("注音が拼音と食い違えば、拼音から作り直す", () => {
    const r = checkTaiwanReading("咖啡", "kā fēi", "ㄎㄚˇ ㄈㄟ");
    expect(r).toEqual({ pinyin: "kā fēi", zhuyin: "ㄎㄚ ㄈㄟ", fixed: ["zhuyin"] });
  });

  it("台湾の読みを優先する（垃圾・企鵝・星期）", () => {
    expect(checkTaiwanReading("垃圾", "lā jī", "ㄌㄚ ㄐㄧ")).toMatchObject({
      pinyin: "lè sè",
      zhuyin: "ㄌㄜˋ ㄙㄜˋ",
      reason: "taiwan",
    });
    expect(checkTaiwanReading("企鵝", "qǐ é", "")).toMatchObject({
      pinyin: "qì é",
      zhuyin: "ㄑㄧˋ ㄜˊ",
    });
    expect(dict("星期")).toMatchObject({ pinyin: "xīng qí", zhuyin: "ㄒㄧㄥ ㄑㄧˊ" });
    // 語の中に含まれていても当てる。
    expect(dict("垃圾車").pinyin).toBe("lè sè chē");
    // すでに台湾の読みなら触らない。
    expect(checkTaiwanReading("星期", "xīng qí", "ㄒㄧㄥ ㄑㄧˊ").fixed).toEqual([]);
  });

  it("2字目以降の軽声と「一」「不」の変調は認める", () => {
    expect(checkTaiwanReading("覺得", "jué de", "ㄐㄩㄝˊ ˙ㄉㄜ").fixed).toEqual([]);
    expect(checkTaiwanReading("一個", "yí gè", "ㄧˊ ㄍㄜˋ").fixed).toEqual([]);
    expect(checkTaiwanReading("不要", "bú yào", "ㄅㄨˊ ㄧㄠˋ").fixed).toEqual([]);
  });

  it("英語の学習語・漢字以外が混ざる見出しは触らない", () => {
    const en = { headword_zh: "apple", pinyin: "", reading_zhuyin: "/ˈæp.əl/" };
    expect(correctTaiwanReading("en", "apple", en)).toBe(en);
    // 英語を学ぶ人の語に漢字が来ても、台湾華語の検査はしない。
    const enHan = { pinyin: "nálǎtiě", reading_zhuyin: "" };
    expect(correctTaiwanReading("en", "拿鐵", enHan)).toBe(enHan);
    const ja = { pinyin: "", reading_zhuyin: "たまご" };
    expect(correctTaiwanReading("ja", "卵", ja)).toBe(ja);
    expect(checkTaiwanReading("T恤", "T xù", "").fixed).toEqual([]);
    expect(checkTaiwanReading("2個", "liǎng gè", "").fixed).toEqual([]);
  });
});
