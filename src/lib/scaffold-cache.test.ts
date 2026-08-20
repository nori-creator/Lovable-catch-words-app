import { describe, it, expect } from "vitest";
import { captionFingerprint, readScaffoldBox, scaffoldCacheKey } from "./scaffold-cache";

/**
 * ここで守るのは1つ:
 * **一言を書き直したら、質問も作り直される。**
 * 古い一言から作った問いが残ると、本人にとって身に覚えのないことを聞かれる。
 */
describe("captionFingerprint", () => {
  it("同じ一言なら同じ指紋", () => {
    expect(captionFingerprint("美味しかった")).toBe(captionFingerprint("美味しかった"));
  });

  it("**書き直したら変わる**", () => {
    expect(captionFingerprint("美味しかった")).not.toBe(captionFingerprint("美味しくなかった"));
  });

  it("前後の空白は同じものとして扱う(書き直しではない)", () => {
    expect(captionFingerprint(" 美味しかった ")).toBe(captionFingerprint("美味しかった"));
  });

  it("無い場合は決まった印。空文字と null を区別しない", () => {
    expect(captionFingerprint(null)).toBe("none");
    expect(captionFingerprint("")).toBe("none");
    expect(captionFingerprint("   ")).toBe("none");
    expect(captionFingerprint(undefined)).toBe("none");
  });

  it("長い一言でも鍵は短いまま(控えを太らせない)", () => {
    expect(captionFingerprint("あ".repeat(500)).length).toBeLessThan(12);
  });
});

describe("scaffoldCacheKey", () => {
  it("表示言語・母語・一言のどれが変わっても別の鍵", () => {
    const base = { lang: "ja", l1: "ja", caption: "美味しかった" };
    const k = scaffoldCacheKey(base);
    expect(scaffoldCacheKey({ ...base, lang: "en" })).not.toBe(k);
    expect(scaffoldCacheKey({ ...base, l1: "en" })).not.toBe(k);
    expect(scaffoldCacheKey({ ...base, caption: "疲れた" })).not.toBe(k);
    expect(scaffoldCacheKey(base)).toBe(k);
  });
});

describe("readScaffoldBox", () => {
  const parse = (v: unknown) => {
    if (typeof v !== "object" || v === null) throw new Error("bad");
    return v as { q: string };
  };

  it("鍵が合えば中身を返す", () => {
    expect(readScaffoldBox({ key: "k", scaffold: { q: "問い" } }, "k", parse)).toEqual({
      q: "問い",
    });
  });

  it("**鍵が違えば使わない**(作り直す)", () => {
    expect(readScaffoldBox({ key: "old", scaffold: { q: "問い" } }, "k", parse)).toBeNull();
  });

  it("形が壊れていても落ちない", () => {
    expect(readScaffoldBox({ key: "k", scaffold: "こわれ" }, "k", parse)).toBeNull();
    expect(readScaffoldBox(null, "k", parse)).toBeNull();
    expect(readScaffoldBox("なにか", "k", parse)).toBeNull();
    expect(readScaffoldBox({}, "k", parse)).toBeNull();
  });
});
