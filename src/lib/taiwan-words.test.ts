import { describe, expect, it } from "vitest";
import { MAINLAND_TO_TAIWAN, taiwanHeadword, toTaiwanWords } from "./taiwan-words";
import { finishPhotoCandidates } from "./photo-candidates";

const keep = <T>(_l: string, _h: string, item: T) => item;

describe("大陸の言い方 → 台湾の言い方（2026-10-22「単語の候補に正しい台湾華語がないのはストレス」）", () => {
  it("見出し語が丸ごと表にあれば置き換える。読みは空にする（辞書が作り直す）", () => {
    expect(taiwanHeadword("塑料袋")).toBe("塑膠袋");
    expect(taiwanHeadword("西紅柿")).toBe("番茄");
    expect(taiwanHeadword("鼠標")).toBe("滑鼠");
    // 一部だけ当たる語・台湾の語は触らない。
    expect(taiwanHeadword("塑膠袋")).toBe("塑膠袋");
    expect(taiwanHeadword("菠蘿麵包")).toBe("菠蘿麵包");
    expect(taiwanHeadword("面紙")).toBe("面紙");
    const [a] = toTaiwanWords([
      {
        headword: "充電寶",
        pinyin: "chōng diàn bǎo",
        reading_zhuyin: "ㄔㄨㄥ ㄉㄧㄢˋ ㄅㄠˇ",
        group: 0,
      },
    ]);
    expect(a).toMatchObject({ headword: "行動電源", pinyin: "", reading_zhuyin: "" });
  });

  it("置き換えて同じ物の前の候補と同じ語になれば落とす（別の物の同じ語は残す）", () => {
    const out = toTaiwanWords([
      { headword: "塑膠袋", group: 0 },
      { headword: "塑料袋", group: 0 },
      { headword: "塑料袋", group: 1 },
    ]);
    expect(out.map((o) => [o.headword, o.group])).toEqual([
      ["塑膠袋", 0],
      ["塑膠袋", 1],
    ]);
  });

  it("台湾でも使う意味がある語（土豆・酸奶）は表に無い", () => {
    expect(MAINLAND_TO_TAIWAN["土豆"]).toBeUndefined();
    expect(MAINLAND_TO_TAIWAN["酸奶"]).toBeUndefined();
    // 表の台湾の言い方が、また表の大陸の言い方になっていない。
    for (const tw of Object.values(MAINLAND_TO_TAIWAN))
      expect(MAINLAND_TO_TAIWAN[tw]).toBeUndefined();
  });

  it("写真の候補にも効く（台湾華語の学習者だけ）", () => {
    const out = finishPhotoCandidates(
      [
        { headword: "西紅柿", meaning_ja: "トマト", register: "common", label: "トマト", group: 0 },
        { headword: "番茄", meaning_ja: "トマト", register: "colloquial", group: 0 },
      ],
      "ja",
      "zh-TW",
      keep,
    );
    expect(out.map((c) => c.headword)).toEqual(["番茄"]);
    expect(out[0].object_label).toBe("トマト");
  });
});
