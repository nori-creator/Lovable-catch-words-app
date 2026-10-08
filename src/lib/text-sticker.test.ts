import { describe, expect, it } from "vitest";
import {
  chooseStickerArt,
  estimateEm,
  findTextStickerImage,
  textStickerDataUrl,
  textStickerFontSize,
  textStickerSvg,
} from "./text-sticker";

describe("語を組んだ札（文字で調べた語）", () => {
  it("1文字の語は大きく、長い語ほど小さく組む（上限と下限の間）", () => {
    const one = textStickerFontSize("貓");
    const four = textStickerFontSize("珍珠奶茶");
    const latin = textStickerFontSize("umbrella");
    expect(one).toBeGreaterThan(four);
    expect(one).toBeLessThanOrEqual(148);
    expect(four).toBeGreaterThanOrEqual(30);
    expect(latin).toBeGreaterThanOrEqual(30);
    // ラテン文字は全角より細く数える。
    expect(estimateEm("ab")).toBeLessThan(estimateEm("貓貓"));
  });

  it("語が必ず載り、XML として壊れない（記号は逃がす）", () => {
    const svg = textStickerSvg({ headword: `<a&"b'>`, lang: "en" });
    expect(svg).toContain("&lt;a&amp;&quot;b&apos;&gt;");
    expect(svg).not.toContain("<a&");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("貓".length ? "</text>" : "");
  });

  it("長すぎる語は字間を詰めて枠に収める", () => {
    const svg = textStickerSvg({ headword: "internationalization specialist" });
    expect(svg).toMatch(/textLength="216" lengthAdjust="spacingAndGlyphs"/);
    expect(textStickerSvg({ headword: "貓" })).not.toMatch(/textLength=/);
  });

  it("空の語でも空の札にしない", () => {
    expect(textStickerSvg({ headword: "  " })).toContain(">?</text>");
  });

  it("札にそのまま渡せる data URL（外の書体・画像を参照しない）", () => {
    const url = textStickerDataUrl({ headword: "貓", lang: "zh-TW" });
    expect(url.startsWith("data:image/svg+xml")).toBe(true);
    const svg = decodeURIComponent(url.slice(url.indexOf(",") + 1));
    expect(svg).toContain(">貓</text>");
    expect(svg).not.toMatch(/href=|@import|url\(http/);
  });
});

describe("札に載せる絵の順（写真 → ネットの画像 → 語の札）", () => {
  it("写真がある回は写真だけ（ネットの画像で上書きしない）", () => {
    expect(chooseStickerArt({ photo: "p", webImage: "w", textArt: "t" })).toEqual({
      url: "p",
      kind: "photo",
    });
  });
  it("写真が無ければネットの画像、それも無ければ語の札", () => {
    expect(chooseStickerArt({ photo: null, webImage: "w", textArt: "t" }).kind).toBe("web");
    expect(chooseStickerArt({ photo: null, webImage: null, textArt: "t" })).toEqual({
      url: "t",
      kind: "text",
    });
  });
});

describe("ネットの画像を1枚決める", () => {
  it("小さい方（thumb）を画面に出せるか確かめてから返す", async () => {
    const seen: string[] = [];
    const got = await findTextStickerImage({
      query: "猫",
      search: async () => ({ candidates: [{ url: "big", thumb: "small" }] }),
      preload: async (u) => {
        seen.push(u);
      },
    });
    expect(got?.shown).toBe("small");
    expect(seen).toEqual(["small"]);
  });

  it("先頭が読めなければ次の1枚、どれも無ければ null（語の札で進む）", async () => {
    const got = await findTextStickerImage({
      query: "猫",
      search: async () => ({ candidates: [{ url: "broken" }, { url: "ok" }, { url: "never" }] }),
      preload: async (u) => {
        if (u === "broken") throw new Error("x");
      },
    });
    expect(got?.candidate.url).toBe("ok");
    const none = await findTextStickerImage({
      query: "猫",
      search: async () => ({ candidates: [] }),
      preload: async () => {},
    });
    expect(none).toBeNull();
  });

  it("空の検索は投げない", async () => {
    let called = false;
    const got = await findTextStickerImage({
      query: " ",
      search: async () => {
        called = true;
        return { candidates: [] };
      },
      preload: async () => {},
    });
    expect(got).toBeNull();
    expect(called).toBe(false);
  });
});
