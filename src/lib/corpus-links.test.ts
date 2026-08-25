import { describe, it, expect } from "vitest";
import {
  CORPUS_SOURCES,
  corpusLinksFor,
  corpusHref,
  copiesWord,
  type CorpusSection,
} from "./corpus-links";
import { SECTION_IDS } from "./card-sections";
import { DEFAULT_TARGET_LANGUAGE, TARGET_LANGUAGES } from "./target-lang";

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
  /**
   * 「全部が語を写してから開く」ではなくなった(2026-08-25、第4段)。
   * 最初からの約束は「**形が確かめられた系統から順に `query` を持たせて
   * 直に飛ばす**」で、Merriam-Webster の類語がその1本目。
   *
   * 見るべき不変は**2つの道が食い違わないこと** — `{w}` を持つ系統は
   * 写さずに飛ばし、持たない系統は写す。片方だけ直すと、
   * 「写した」と出るのに語の入っていない頁が開く(またはその逆)。
   */
  it("**`{w}` の有無と、写すかどうかが必ず一致する**", () => {
    for (const s of CORPUS_SOURCES) {
      const embeds = s.href.includes("{w}");
      expect(copiesWord(s), s.id).toBe(!embeds);
      if (!embeds) expect(corpusHref(s, "雨傘"), s.id).toBe(s.href);
      else expect(corpusHref(s, "雨傘"), s.id).not.toContain("{w}");
    }
  });

  it("入口だけの系統がまだ大半(URL の形を当て推量で書かない)", () => {
    const copy = CORPUS_SOURCES.filter(copiesWord).length;
    expect(copy).toBeGreaterThan(CORPUS_SOURCES.length / 2);
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

describe("学習言語で絞る（第4段）", () => {
  /**
   * 英語を足すまで、台湾華語のコーパス6本が**どの語のカードにも**出ていた。
   * 英語のカードに「國教院・語の級」「中研院・平衡語料庫」が並ぶ絵で
   * 見つけた形。自動の検査では捕まらなかったので、ここで数える。
   */
  const TW_HOSTS = ["naer.edu.tw", "sinica.edu.tw", "lopentu.github.io"];

  it("**英語のカードに台湾のコーパスが1つも無い**", () => {
    for (const section of SECTIONS) {
      for (const s of corpusLinksFor(section, "en")) {
        for (const host of TW_HOSTS) {
          expect(s.href.includes(host), `${section}/${s.id}: ${s.href}`).toBe(false);
        }
      }
    }
  });

  it("**台湾華語のカードに英語だけのコーパスが出ない**", () => {
    const enOnly = new Set(["coca", "bnc", "wordnet"]);
    for (const section of SECTIONS) {
      for (const s of corpusLinksFor(section, DEFAULT_TARGET_LANGUAGE)) {
        expect(enOnly.has(s.id), `${section}: ${s.id}`).toBe(false);
      }
    }
  });

  it("**どの言語でも、少なくとも1つの節に行き先が在る**(空の欄を作らない)", () => {
    for (const lang of TARGET_LANGUAGES) {
      const total = SECTIONS.reduce((n, sec) => n + corpusLinksFor(sec, lang).length, 0);
      expect(total, lang).toBeGreaterThan(0);
    }
  });

  it("複数の言語を持つ系統は両方に出る(Sketch Engine)", () => {
    const inZh = corpusLinksFor("usage_chunks", DEFAULT_TARGET_LANGUAGE).map((s) => s.id);
    const inEn = corpusLinksFor("usage_chunks", "en").map((s) => s.id);
    expect(inZh).toContain("sketch");
    expect(inEn).toContain("sketch");
  });

  it("知らない言語は既定に落とす", () => {
    for (const section of SECTIONS) {
      expect(corpusLinksFor(section, "kl-GL")).toEqual(
        corpusLinksFor(section, DEFAULT_TARGET_LANGUAGE),
      );
    }
  });

  it("**選べる学習言語には全部、`languages` が書いてある**", () => {
    for (const s of CORPUS_SOURCES) {
      expect(s.languages.length, s.id).toBeGreaterThan(0);
      for (const l of s.languages) {
        expect(TARGET_LANGUAGES as readonly string[], `${s.id}: ${l}`).toContain(l);
      }
    }
  });
});
