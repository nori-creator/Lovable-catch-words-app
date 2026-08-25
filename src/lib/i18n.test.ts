import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import * as OpenCC from "opencc-js";
import { DICT, UI_LANGS, UI_LANG_LABEL_KEYS, htmlLangOf, localeOf, normalizeUiLang } from "./i18n";

/**
 * 表示言語の門。
 *
 * 2026-08-25 に繁體中文を足した（オーナー決定「日本語、英語、台湾華語に絞って」）。
 * ここで一番怖いのは**訳し忘れが静かに日本語で出ること** — `t()` は
 * `DICT[key]?.[lang] ?? DICT[key]?.ja` と書いてあるので、繁體中文が無ければ
 * **黙って日本語**が台湾の人の画面に出る。型でも lint でも落ちない。
 * （`scripts/i18n-check.mjs` が同じことを別の角度から見ている。）
 */

describe("UI_LANGS", () => {
  it("日本語・英語・繁體中文の3つ", () => {
    expect(UI_LANGS).toEqual(["ja", "en", "zh-TW"]);
  });

  it("**先頭が既定**(サーバー側と初回描画がこれ)", () => {
    expect(UI_LANGS[0]).toBe("ja");
    expect(normalizeUiLang(null)).toBe("ja");
  });

  it("知らない値は既定に落とす(未知の言語のまま描かない)", () => {
    for (const bad of [null, undefined, "", "  ", "zh-CN", "ko", "en-US"]) {
      expect([bad, normalizeUiLang(bad)]).toEqual([bad, "ja"]);
    }
  });

  it("知っている値はそのまま", () => {
    for (const l of UI_LANGS) expect(normalizeUiLang(l)).toBe(l);
  });

  it("名前の翻訳キーが全部そろっている(選べない言語を作らない)", () => {
    for (const l of UI_LANGS) {
      expect(UI_LANG_LABEL_KEYS[l], `${l} の名前が無い`).toBeTruthy();
      expect(DICT[UI_LANG_LABEL_KEYS[l]], `${UI_LANG_LABEL_KEYS[l]} が辞書に無い`).toBeDefined();
    }
  });
});

describe("localeOf — 日付の書式を1箇所に集める", () => {
  /**
   * これまで `useUiLang() === "en" ? "en-US" : "ja-JP"` が **13箇所**に
   * 散っていた。3つ目の言語を足すと、その全部で台湾の人が**日本語の
   * 日付書式**になる。型でもビルドでも lint でも落ちない。
   */
  it("言語ごとに違う locale を返す", () => {
    expect(localeOf("ja")).toBe("ja-JP");
    expect(localeOf("en")).toBe("en-US");
    expect(localeOf("zh-TW")).toBe("zh-TW");
  });

  it("**3つとも別々**(どれかが日本語に落ちていない)", () => {
    const all = UI_LANGS.map(localeOf);
    expect(new Set(all).size).toBe(UI_LANGS.length);
  });

  it("実際に日付の書式が変わる", () => {
    const d = new Date(Date.UTC(2026, 7, 25));
    const seen = UI_LANGS.map((l) => d.toLocaleDateString(localeOf(l), { timeZone: "UTC" }));
    expect(new Set(seen).size).toBeGreaterThan(1);
  });

  it("**三項演算子が残っていない**(1つでも残ると台湾の人がそこだけ日本語書式)", () => {
    const roots = ["src"];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
          const text = fs.readFileSync(p, "utf8");
          // `i18n.tsx` は locale の表を持つ当人なので除く。
          if (p.endsWith("i18n.tsx")) continue;
          if (text.includes('"en-US" : "ja-JP"')) offenders.push(p);
        }
      }
    };
    for (const r of roots) walk(r);
    expect(offenders).toEqual([]);
  });
});

describe("htmlLangOf — 漢字の字形", () => {
  /**
   * 漢字は同じ文字コードでも言語で字形が違う（直/直、每/毎）。
   * `zh-Hant` を付けないと日本語のフォントに落ちて、台湾の人に
   * 日本の字形が出る。
   */
  it("繁體中文は `zh-Hant` を必ず付ける", () => {
    expect(htmlLangOf("zh-TW")).toContain("zh-Hant");
  });

  it("日本語と英語はそのまま", () => {
    expect(htmlLangOf("ja")).toBe("ja");
    expect(htmlLangOf("en")).toBe("en");
  });
});

describe("辞書が3言語ぶんそろっている", () => {
  const keys = Object.keys(DICT);

  it("1,020項目ある", () => {
    expect(keys.length).toBe(1020);
  });

  /**
   * **わざと空にしてある所。**
   * `dex.dayUnit` はカレンダーの読み上げに付ける単位で、日本語と中文は
   * 「25日」、英語は「25」と数字だけで言う。名指しで許す — 許す物を
   * 数えておかないと、うっかり空にした項目まで通ってしまう。
   */
  const DELIBERATELY_EMPTY = new Set(["dex.dayUnit.en"]);

  it("**どの項目も3言語が埋まっている**(欠けると黙って日本語が出る)", () => {
    const missing: string[] = [];
    for (const k of keys) {
      for (const l of UI_LANGS) {
        if (DELIBERATELY_EMPTY.has(`${k}.${l}`)) continue;
        if (!DICT[k][l] || !DICT[k][l].trim()) missing.push(`${k}.${l}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("**わざと空にした所は本当に空**(許した物が使われないまま残らない)", () => {
    for (const id of DELIBERATELY_EMPTY) {
      const at = id.lastIndexOf(".");
      const [k, l] = [id.slice(0, at), id.slice(at + 1)];
      expect(DICT[k], `${k} が辞書に無い`).toBeDefined();
      expect(DICT[k][l as (typeof UI_LANGS)[number]]).toBe("");
    }
  });

  it("**鍵そのものは3言語ぶん在る**(空と「無い」を混ぜない)", () => {
    for (const k of keys) {
      for (const l of UI_LANGS) expect(l in DICT[k], `${k} に ${l} が無い`).toBe(true);
    }
  });

  it("**変数が3言語で一致する**(`{n}` が消えると数字が出ない文になる)", () => {
    const bad: string[] = [];
    for (const k of keys) {
      const vars = (s: string) => [...new Set(s.match(/\{\w+\}/g) ?? [])].sort().join(",");
      const ja = vars(DICT[k].ja);
      for (const l of UI_LANGS) {
        if (vars(DICT[k][l]) !== ja) bad.push(`${k}.${l}: ${vars(DICT[k][l])} ≠ ${ja}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe("繁體中文に簡体字が混ざっていない", () => {
  /**
   * 台湾の学習者に簡体字を出すのは、速さ以前に**間違い**。
   *
   * ## 変換器そのものを門にしない
   * OpenCC で「正体字へ変換して変わったら簡体字」と判定すると、
   * 台湾では使わない字へ寄せてくる分まで拾ってしまう:
   *
   *   台灣 → 臺灣 （臺 は公文書の形。日常は 台灣）
   *   家具 → 傢俱 ／ 扎根 → 紮根 ／ 儀表板 → 儀錶板 ／ 吃 → 喫
   *
   * なので**1文字ずつ**見て、下の許容の4字（香港の字形へ寄せられるだけで
   * 台湾では今の形が正しい）を除く。ここに新しい字が出たら、それは
   * 本当に簡体字が混ざっている。
   */
  const HK_VARIANTS = new Set(["說", "划", "群", "閱"]);
  const toHk = OpenCC.Converter({ from: "cn", to: "hk" });

  it("1文字ずつ見て、簡体字が1つも無い", () => {
    const bad: string[] = [];
    for (const [key, entry] of Object.entries(DICT)) {
      for (const c of entry["zh-TW"]) {
        if (!/[一-鿿]/.test(c)) continue;
        if (HK_VARIANTS.has(c)) continue;
        if (toHk(c) !== c) bad.push(`${key}: ${c} → ${toHk(c)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("**この門が本物の簡体字を捕まえる**(信じる前に確かめる)", () => {
    // 「这个说读单词复习」は全部簡体字。1つも許容に入っていない。
    for (const c of "这个说读单词复习图书门开关时会来样问题级证语") {
      expect([c, toHk(c) !== c], `${c} を捕まえられない`).toEqual([c, true]);
    }
  });

  it("台湾で使う形は捕まえない(誤検知で直しに行かせない)", () => {
    for (const s of ["台灣華語", "單字", "複習", "圖鑑", "儲存", "搜尋", "影片", "網路"]) {
      for (const c of s) {
        if (HK_VARIANTS.has(c)) continue;
        expect([s, c, toHk(c)], `${s} の ${c} が誤検知`).toEqual([s, c, c]);
      }
    }
  });
});
