import { describe, it, expect } from "vitest";
import {
  CORPUS_SOURCES,
  corpusLinksFor,
  corpusHref,
  copiesWord,
  type CorpusSection,
} from "./corpus-links";
import { SECTION_IDS } from "./card-sections";

/**
 * コーパスは**取り込まない**(許可を取っていない)。ここで守るのは
 * 「見に行く先が壊れていないこと」と「節の名前が本物であること」。
 */

const SECTIONS: CorpusSection[] = ["usage_context", "related_words", "usage_chunks", "real_usage"];

describe("CORPUS_SOURCES", () => {
  it("id が重複しない", () => {
    const ids = CORPUS_SOURCES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("全部 https で、入口がある", () => {
    for (const s of CORPUS_SOURCES) {
      expect(s.href.startsWith("https://"), s.id).toBe(true);
    }
  });

  it("出す節の名前は、実在する節の id でなければならない", () => {
    // ここが合っていないと、リンクは**どの節にも出ない**まま検査を通る。
    for (const s of CORPUS_SOURCES) {
      for (const sec of s.sections) {
        expect((SECTION_IDS as readonly string[]).includes(sec), `${s.id} → ${sec}`).toBe(true);
      }
    }
  });

  it("節を1つも持たない系統を置かない(出しようがない)", () => {
    for (const s of CORPUS_SOURCES) {
      expect(s.sections.length, s.id).toBeGreaterThan(0);
    }
  });

  it("ログインが要る系統は、そうと分かる印を持つ", () => {
    const sketch = CORPUS_SOURCES.find((s) => s.id === "sketch");
    expect(sketch?.needsLogin).toBe(true);
  });
});

describe("corpusLinksFor", () => {
  it("節ごとに出す物が違う", () => {
    expect(corpusLinksFor("related_words").map((s) => s.id)).toEqual(["cwn"]);
    expect(corpusLinksFor("real_usage").map((s) => s.id)).toEqual(["coct-bilingual"]);
    expect(corpusLinksFor("usage_context").map((s) => s.id)).toEqual([
      "coct-level",
      "coct-core",
      "sinica",
    ]);
  });

  it("どの節にも最低1つは出る(空の見出しを作らない)", () => {
    for (const sec of SECTIONS) {
      expect(corpusLinksFor(sec).length, sec).toBeGreaterThan(0);
    }
  });

  it("並びは CORPUS_SOURCES の順のまま", () => {
    const order = CORPUS_SOURCES.map((s) => s.id);
    const got = corpusLinksFor("usage_chunks").map((s) => s.id);
    expect(got).toEqual(order.filter((id) => got.includes(id)));
  });
});

describe("corpusHref / copiesWord", () => {
  it("いまは全部「語を写してから開く」", () => {
    for (const s of CORPUS_SOURCES) {
      expect(copiesWord(s), s.id).toBe(true);
      expect(corpusHref(s, "雨傘")).toBe(s.href);
    }
  });

  it("{w} を持つ系統は語を差し込み、記号は逃がす", () => {
    const s = { ...CORPUS_SOURCES[0], href: "https://example.tw/q?w={w}" };
    expect(copiesWord(s)).toBe(false);
    expect(corpusHref(s, "珍珠奶茶")).toBe(
      `https://example.tw/q?w=${encodeURIComponent("珍珠奶茶")}`,
    );
    expect(corpusHref(s, "a b&c")).toBe("https://example.tw/q?w=a%20b%26c");
  });
});
