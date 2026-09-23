import { describe, expect, it } from "vitest";
import { putScanHandoff, takeScanHandoff } from "./scan-handoff";

const H = {
  image: "data:image/jpeg;base64,xx",
  headword: "奶茶",
  hint: {
    reading_zhuyin: "ㄋㄞˇ ㄔㄚˊ",
    pinyin: "nǎi chá",
    meaning_ja: "ミルクティー",
    category_key: "drink",
  },
  alternatives: [],
  loc: { lat: 25, lng: 121, name: "台北" },
};

describe("スキャン → 撮影モードの受け渡し", () => {
  it("1回だけ受け取れる（戻る・再読み込みで二重に足さない）", () => {
    putScanHandoff(H, 1000);
    expect(takeScanHandoff(2000)?.headword).toBe("奶茶");
    expect(takeScanHandoff(2000)).toBeNull();
  });
  it("2分より古い物は捨てる", () => {
    putScanHandoff(H, 0);
    expect(takeScanHandoff(2 * 60_000 + 1)).toBeNull();
  });
});
