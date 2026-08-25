import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { DATA_SOURCES, requiredSources, sourcesFor } from "./data-sources";
import { DICT } from "./i18n";

/**
 * 出典の門。
 *
 * このアプリは商用なので、CEFR-J（商用可・**出典明記が条件**）を使う以上、
 * 出典は利用者に見える所に無ければならない。**忘れても画面は壊れない**
 * 種類のものなので、機械で押さえる。
 */

describe("出典そのもの", () => {
  it("**空の欄を持たない**(名前の無い出典を画面に出さない)", () => {
    for (const s of DATA_SOURCES) {
      expect(s.id.trim()).toBeTruthy();
      expect(s.name.trim()).toBeTruthy();
      expect(s.author.trim()).toBeTruthy();
      expect(s.license.trim()).toBeTruthy();
      expect(s.uses.length).toBeGreaterThan(0);
      expect(s.href).toMatch(/^https:\/\//);
    }
  });

  it("id が重複していない", () => {
    expect(new Set(DATA_SOURCES.map((s) => s.id)).size).toBe(DATA_SOURCES.length);
  });

  it("**文言のキーが実在する**(出典の頁にキー名が出ない)", () => {
    for (const s of DATA_SOURCES) {
      expect(DICT[s.noteKey], `${s.id} の ${s.noteKey} が i18n に無い`).toBeDefined();
    }
  });
});

describe("表示が義務のもの", () => {
  it("**CEFR-J の2つは必ず義務**(明記が利用の条件)", () => {
    const ids = requiredSources().map((s) => s.id);
    expect(ids).toContain("cefrj-wordlist");
    expect(ids).toContain("cefrj-grammar");
  });

  it("**作った人の名前が入っている**(ここが条件の本体)", () => {
    for (const s of requiredSources()) {
      expect(s.author).toContain("投野");
      expect(s.author).toContain("東京外国語大学");
    }
  });
});

describe("使っているデータに出典が付いている", () => {
  it("種辞書 — ECDICT と CMUdict", () => {
    const ids = sourcesFor("lexicon").map((s) => s.id);
    expect(ids).toContain("ecdict");
    expect(ids).toContain("cmudict");
  });

  it("語彙の級 — CEFR-J Wordlist", () => {
    expect(sourcesFor("vocab_level").map((s) => s.id)).toContain("cefrj-wordlist");
  });

  it("文法の級 — CEFR-J Grammar Profile", () => {
    expect(sourcesFor("grammar_level").map((s) => s.id)).toContain("cefrj-grammar");
  });

  it("字の変換 — OpenCC", () => {
    expect(sourcesFor("script").map((s) => s.id)).toContain("opencc");
  });

  it("**どの用途にも出典がある**(使っているのに出していない物が無い)", () => {
    for (const use of ["lexicon", "vocab_level", "grammar_level", "script"] as const) {
      expect(sourcesFor(use).length, `${use} の出典が無い`).toBeGreaterThan(0);
    }
  });
});

describe("取り込みの道具が使っているデータと食い違っていない", () => {
  /**
   * **数え忘れを止める。** 取り込みの道具に材料を足して出典を足し忘れると、
   * 画面は壊れないまま条件を満たさなくなる。道具のソースに書いてある
   * 名前を数えて突き合わせる。
   */
  it("`scripts/import-lexicon.mjs` が挙げている材料が全部ここに在る", () => {
    const src = fs.readFileSync(path.join("scripts", "import-lexicon.mjs"), "utf8");
    for (const name of ["ECDICT", "CMUdict", "OpenCC", "CEFR-J"]) {
      expect(src, `道具に ${name} が出てこない`).toContain(name);
      expect(
        DATA_SOURCES.some((s) => s.name.includes(name) || s.id.includes(name.toLowerCase())),
        `${name} の出典が data-sources.ts に無い`,
      ).toBe(true);
    }
  });
});
