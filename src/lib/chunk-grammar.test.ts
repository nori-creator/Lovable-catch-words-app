import { describe, expect, it } from "vitest";
import { isSwappableSlot, tidyUsageParts } from "./chunk-grammar";
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
    expect(tidyUsageParts(has, "zh-TW")).toEqual(has);
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
