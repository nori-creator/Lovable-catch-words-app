import { describe, expect, it } from "vitest";
import {
  isSwappableSlot,
  mergeCompounds,
  swappedTranslation,
  tidyUsageParts,
  withoutSeparatorParts,
} from "./chunk-grammar";
import { chunkSpeechText } from "./extras";

const alts = [{ text: "煮", ja: "煮る" }];

describe("isSwappableSlot（点線は入れ替えられる具体物だけ）", () => {
  it("動詞に slot が付いていても点線にしない（加熱）", () => {
    expect(isSwappableSlot({ text: "加熱", pos: "V", slot: true, alts })).toBe(false);
  });
  it("名詞・量詞で、ほかの語が在れば点線", () => {
    expect(
      isSwappableSlot({ text: "男朋友", pos: "N", slot: true, alts: [{ text: "朋友", ja: "" }] }),
    ).toBe(true);
    expect(
      isSwappableSlot({ text: "一杯", pos: "M", slot: true, alts: [{ text: "兩杯", ja: "" }] }),
    ).toBe(true);
  });
  it("ほかの語が無い slot は点線にしない", () => {
    expect(isSwappableSlot({ text: "朋友", pos: "N", slot: true })).toBe(false);
    expect(
      isSwappableSlot({ text: "朋友", pos: "N", slot: true, alts: [{ text: "朋友", ja: "" }] }),
    ).toBe(false);
  });
});

describe("tidyUsageParts（ネイティブが言う形に）", () => {
  it("滷味＋入味 → 滷味＋很＋入味", () => {
    const out = tidyUsageParts(
      [
        { text: "滷味", pos: "N" },
        { text: "入味", pos: "Vs" },
      ],
      "zh-TW",
    );
    expect(out.map((p) => p.text)).toEqual(["滷味", "很", "入味"]);
    expect(chunkSpeechText({ parts: out, ja: "" }, "zh-TW")).toBe("滷味很入味");
  });
  it("既に程度の語が在る・限定用法・英語は触らない。2度通しても同じ", () => {
    const has = [
      { text: "滷味", pos: "N" },
      { text: "超", pos: "Adv" },
      { text: "入味", pos: "Vs" },
    ];
    // 語の並びは変えない（超 は入れ替えられる札になる — 下の C5 の試験）。
    expect(tidyUsageParts(has, "zh-TW").map((p) => p.text)).toEqual(["滷味", "超", "入味"]);
    const merged = [
      { text: "滷味", pos: "N" },
      { text: "很入味", pos: "Vs" },
    ];
    expect(tidyUsageParts(merged, "zh-TW")).toEqual(merged);
    const attr = [
      { text: "好吃的", pos: "Vs-attr" },
      { text: "滷味", pos: "N" },
    ];
    expect(tidyUsageParts(attr, "zh-TW")).toEqual(attr);
    const en = [
      { text: "the soup", pos: "N" },
      { text: "hot", pos: "Vs" },
    ];
    expect(tidyUsageParts(en, "en")).toEqual(en);
    const once = tidyUsageParts(
      [
        { text: "滷味", pos: "N" },
        { text: "入味", pos: "Vs" },
      ],
      "zh-TW",
    );
    expect(tidyUsageParts(once, "zh-TW")).toEqual(once);
  });
  it("読み上げも画面と同じ形を読む", () => {
    expect(
      chunkSpeechText(
        {
          parts: [
            { text: "滷味", pos: "N" },
            { text: "入味", pos: "Vs" },
          ],
          ja: "",
        },
        "zh-TW",
      ),
    ).toBe("滷味很入味");
  });
});

describe("swappedTranslation（語を入れ替えた型の訳。R20）", () => {
  const boyfriend = [
    { text: "跟", pos: "Prep" },
    {
      text: "男朋友",
      pos: "N",
      slot: true,
      ja: "彼氏",
      alts: [
        { text: "女朋友", ja: "彼女" },
        { text: "同事", ja: "同僚" },
      ],
    },
    { text: "吵架", pos: "V" },
  ];
  it("元の語の意味（ja）を、入れ替えた語の意味に差し替える", () => {
    expect(swappedTranslation("彼氏と喧嘩する", boyfriend, { 1: 0 })).toBe("彼女と喧嘩する");
    expect(swappedTranslation("彼氏と喧嘩する", boyfriend, { 1: 1 })).toBe("同僚と喧嘩する");
  });
  it("元に戻した（-1）時は元の訳", () => {
    expect(swappedTranslation("彼氏と喧嘩する", boyfriend, { 1: -1 })).toBe("彼氏と喧嘩する");
  });
  it("ja の無い古いカード: 訳に同じ字が出ていればそこを差し替える", () => {
    const luwei = [
      { text: "買", pos: "V" },
      { text: "豆干", pos: "N", slot: true, alts: [{ text: "海帶", ja: "昆布" }] },
      { text: "滷味", pos: "N" },
    ];
    expect(swappedTranslation("豆干の滷味を買う", luwei, { 1: 0 })).toBe("昆布の滷味を買う");
  });
  it("訳の中に見つからない時は作り替えず、何を替えたかを添える", () => {
    const old = [
      { text: "跟", pos: "Prep" },
      { text: "男朋友", pos: "N", slot: true, alts: [{ text: "女朋友", ja: "彼女" }] },
      { text: "吵架", pos: "V" },
    ];
    expect(swappedTranslation("彼氏と喧嘩する", old, { 1: 0 })).toBe(
      "彼氏と喧嘩する（男朋友 → 女朋友: 彼女）",
    );
  });
});

describe("チャンクの表示ルール C5/C7（2026-10-01「芒果冰は分けない」「程度も変更できるように」）", () => {
  it("1語（芒果＋冰）は1つの四角にする", () => {
    expect(
      mergeCompounds(
        [
          { text: "芒果", pos: "N" },
          { text: "冰", pos: "N" },
        ],
        "芒果",
        "zh-TW",
      ).map((p) => p.text),
    ).toEqual(["芒果冰"]);
    expect(
      mergeCompounds(
        [
          { text: "吃", pos: "V" },
          { text: "芒果", pos: "N" },
          { text: "冰", pos: "N" },
        ],
        "芒果",
        "zh-TW",
      ).map((p) => p.text),
    ).toEqual(["吃", "芒果冰"]);
  });
  it("英語は合わせない（語の継ぎ目が空白）", () => {
    const en = [
      { text: "mango", pos: "N" },
      { text: "juice", pos: "N" },
    ];
    expect(mergeCompounds(en, "mango", "en")).toEqual(en);
  });
  it("補った 很 は入れ替えられる（超・非常・有點・蠻、読む人の言語の訳付き）", () => {
    const out = tidyUsageParts(
      [
        { text: "芒果", pos: "N" },
        { text: "甜", pos: "Vs" },
      ],
      "zh-TW",
      { headword: "芒果", reader: "ja" },
    );
    expect(out.map((p) => p.text)).toEqual(["芒果", "很", "甜"]);
    expect(isSwappableSlot(out[1], "zh-TW")).toBe(true);
    expect(out[1].ja).toBe("とても");
    expect(out[1].alts?.map((a) => a.text)).toEqual(["超", "非常", "有點", "蠻"]);
    expect(out[1].alts?.[2].ja).toBe("ちょっと");
    // 学ぶ語は入れ替えない（C2）。
    expect(isSwappableSlot(out[0], "zh-TW")).toBe(false);
    // 訳も入れ替わる（C12）。
    const parts = out;
    expect(swappedTranslation("マンゴーはとても甘い", parts, { 1: 2 })).toBe(
      "マンゴーはちょっと甘い",
    );
  });
  it("英語の読者には英語の訳", () => {
    const out = tidyUsageParts(
      [
        { text: "芒果", pos: "N" },
        { text: "甜", pos: "Vs" },
      ],
      "zh-TW",
      { headword: "芒果", reader: "en" },
    );
    expect(out[1].ja).toBe("very");
    expect(out[1].alts?.[0].ja).toBe("super");
  });
  it("程度以外の副詞・動詞・形容詞は点線にしない", () => {
    const alts = [{ text: "x", ja: "" }];
    expect(isSwappableSlot({ text: "也", pos: "Adv", slot: true, alts }, "zh-TW")).toBe(false);
    expect(isSwappableSlot({ text: "甜", pos: "Vs", slot: true, alts }, "zh-TW")).toBe(false);
  });
});

describe("withoutSeparatorParts（「+」を札にしない。オーナー報告 2026-10-08）", () => {
  it("「+」「＋」「・」「/」だけの札を落とす（牛蒡 [+] 炒 → 牛蒡 炒）", () => {
    const out = withoutSeparatorParts([
      { text: "牛蒡", pos: "N" },
      { text: "+", pos: "" },
      { text: "炒", pos: "V" },
      { text: " ＋ ", pos: "" },
      { text: "・", pos: "" },
      { text: "／", pos: "" },
      { text: "  ", pos: "" },
    ]);
    expect(out.map((p) => p.text)).toEqual(["牛蒡", "炒"]);
  });

  it("「牛蒡+炒」は + で切って別の札にする（品詞は受け継ぐ）", () => {
    const out = withoutSeparatorParts([{ text: "牛蒡+炒", pos: "V", slot: true, ja: "x" }]);
    expect(out).toEqual([
      { text: "牛蒡", pos: "V" },
      { text: "炒", pos: "V" },
    ]);
    expect(withoutSeparatorParts([{ text: "牛蒡 ＋ 很", pos: "" }]).map((p) => p.text)).toEqual([
      "牛蒡",
      "很",
    ]);
  });

  it("端の + だけを落とした札は、ほかの欄を残す", () => {
    const alts = [{ text: "煮", ja: "煮る" }];
    expect(withoutSeparatorParts([{ text: "炒+", pos: "V", alts }])).toEqual([
      { text: "炒", pos: "V", alts },
    ]);
  });

  it("英字に付いた + は語の一部として残す（C++）", () => {
    expect(withoutSeparatorParts([{ text: "C++", pos: "N" }]).map((p) => p.text)).toEqual(["C++"]);
    expect(withoutSeparatorParts([{ text: "learn + C++", pos: "" }]).map((p) => p.text)).toEqual([
      "learn",
      "C++",
    ]);
  });

  it("保存済みの語も描く前に正す（tidyUsageParts）。何度通しても同じ", () => {
    const stored = [
      { text: "牛蒡", pos: "N" },
      { text: "+", pos: "" },
      { text: "很", pos: "Adv" },
      { text: "健康", pos: "Vs" },
    ];
    const once = tidyUsageParts(stored, "zh-TW", { headword: "牛蒡" });
    expect(once.map((p) => p.text)).toEqual(["牛蒡", "很", "健康"]);
    expect(tidyUsageParts(once, "zh-TW", { headword: "牛蒡" })).toEqual(once);
  });
});
