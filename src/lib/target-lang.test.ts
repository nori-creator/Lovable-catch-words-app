import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  TARGET_LANGUAGES,
  DEFAULT_TARGET_LANGUAGE,
  normalizeTargetLanguage,
  speechLangOf,
  MAP_DISPLAY_LANGUAGE,
} from "./target-lang";

describe("normalizeTargetLanguage", () => {
  it("知っている言語はそのまま", () => {
    for (const l of TARGET_LANGUAGES) expect(normalizeTargetLanguage(l)).toBe(l);
  });

  it("**知らない値は既定に落とす**(未知の言語で黙って動かさない)", () => {
    expect(normalizeTargetLanguage("en-US")).toBe(DEFAULT_TARGET_LANGUAGE);
    expect(normalizeTargetLanguage("zh-CN")).toBe(DEFAULT_TARGET_LANGUAGE);
    expect(normalizeTargetLanguage("")).toBe(DEFAULT_TARGET_LANGUAGE);
    expect(normalizeTargetLanguage(null)).toBe(DEFAULT_TARGET_LANGUAGE);
    expect(normalizeTargetLanguage(undefined)).toBe(DEFAULT_TARGET_LANGUAGE);
  });

  it("前後の空白は落とす", () => {
    expect(normalizeTargetLanguage("  zh-TW ")).toBe("zh-TW");
  });

  it("既定は必ず一覧の中にある", () => {
    expect(TARGET_LANGUAGES).toContain(DEFAULT_TARGET_LANGUAGE);
  });
});

describe("speechLangOf", () => {
  it("引数なしでも既定を返す", () => {
    expect(speechLangOf()).toBe(DEFAULT_TARGET_LANGUAGE);
  });

  it("壊れた値でも読み上げが止まらない", () => {
    expect(speechLangOf("こわれた")).toBe(DEFAULT_TARGET_LANGUAGE);
  });
});

describe("MAP_DISPLAY_LANGUAGE", () => {
  /**
   * **学習言語と別に持つことが要点。** 同じ定数にまとめてしまうと、
   * 英語版を足したときに「士林夜市」が "Shilin Night Market" に化ける。
   * 地名はその場所の名前なので、学ぶ言語に付いていってはいけない。
   */
  it("地図の言語は台湾の地名が返る言語で固定", () => {
    expect(MAP_DISPLAY_LANGUAGE).toBe("zh-TW");
  });
});

/**
 * 決め打ちが**戻ってこない**ことを見る門(指摘⑬ の下ごしらえ)。
 *
 * 42箇所を1箇所へ寄せたが、次に足す人がまた `"zh-TW"` と直に書けば
 * 元に戻る。**戻ったこと自体をここで落とす。** 型でもビルドでも
 * 落ちない種類の後戻りなので、数を数える以外に止める手が無い。
 */
describe("決め打ちが増えていない", () => {
  const ROOTS = ["src/components", "src/lib", "src/routes"];
  /**
   * 残してよい場所。
   * - `target-lang.ts` … **学習言語**の決め打ちを持つ当人
   * - `i18n.tsx`       … **表示言語**の決め打ちを持つ当人（2026-08-25）。
   *   `UI_LANGS` と 1,021件の辞書の鍵がここに在る。学習言語とは別の話で、
   *   英語版では「学習言語=en / 表示言語=zh-TW」のように食い違う。
   * - `*.test.ts`      … 試験は値そのものを書く
   */
  const ALLOWED = /(target-lang\.ts|i18n\.tsx|\.test\.tsx?)$/;

  function walk(dir: string): string[] {
    const out: string[] = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) out.push(...walk(p));
      else if (/\.tsx?$/.test(e.name)) out.push(p);
    }
    return out;
  }

  it('`"zh-TW"` を直に書いたファイルが増えていない', () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        if (ALLOWED.test(file)) continue;
        let text: string;
        try {
          text = fs.readFileSync(file, "utf8");
        } catch {
          continue; // 読めない物(生成物など)は見ない
        }
        if (text.includes('"zh-TW"')) offenders.push(file);
      }
    }
    // 見つかったら、その file を `target-lang.ts` の定数に寄せること。
    expect(offenders).toEqual([]);
  });
});
