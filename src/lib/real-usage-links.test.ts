import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { realUsageLinks } from "./real-usage-links";
import { DEFAULT_TARGET_LANGUAGE, TARGET_LANGUAGES } from "./target-lang";
import { UI_LANGS, DICT } from "./i18n";

/**
 * 守っているのは「**英語の語を調べるボタンが台湾のサイトへ飛ばない**」こと。
 *
 * これは自動の検査では捕まらなかった。絵を見て初めて、英語のカードに
 * 「台湾の若者のSNS」「台湾教育部の公式辞書」が7本並んでいるのが分かった。
 * 一度見つけた形は、次からは数えられるようにする。
 */

const TW_HOSTS = ["dcard.tw", "moe.edu.tw", "naer.edu.tw", "sinica.edu.tw"];
const TW_PARAMS = ["gl=TW", "hl=zh-TW", "countryTW", "lang_zh-TW", "/chinese/"];

describe("realUsageLinks", () => {
  it("**どの学習言語でも、行き先が空にならない**", () => {
    for (const lang of TARGET_LANGUAGES) {
      expect(realUsageLinks("test", lang).length, lang).toBeGreaterThan(3);
    }
  });

  it("**英語のカードに台湾の行き先が1つも無い**", () => {
    for (const l of realUsageLinks("umbrella", "en")) {
      for (const bad of [...TW_HOSTS, ...TW_PARAMS]) {
        expect(l.href.includes(bad), `${l.id}: ${l.href} に ${bad}`).toBe(false);
      }
    }
  });

  /**
   * **1本ずつ見る。** 最初は全部の href を繋いだ文字列で
   * `includes("gl=TW")` を見ていたが、`gl=TW` は2本が持っているので
   * **片方から消しても通ってしまった**(わざと壊して分かった)。
   * どの札がどう絞られているかを、札ごとに書く。
   */
  const TW_EXPECT: Record<string, string> = {
    yt: "gl=TW",
    ygl: "/chinese/tw",
    dcard: "dcard.tw",
    news: "countryTW",
    moe: "moe.edu.tw",
    threads: "threads.com",
  };

  it("**台湾華語のカードは今までどおり台湾に絞る**(札ごとに見る)", () => {
    const links = realUsageLinks("雨傘", DEFAULT_TARGET_LANGUAGE);
    for (const [id, want] of Object.entries(TW_EXPECT)) {
      const l = links.find((x) => x.id === id);
      expect(l, `${id} の札が無い`).toBeDefined();
      expect(l!.href.includes(want), `${id}: ${l!.href} に ${want}`).toBe(true);
    }
  });

  const EN_EXPECT: Record<string, string> = {
    yt: "gl=US",
    ygl: "/english/us",
    reddit: "reddit.com",
    news: "countryUS",
    mw: "merriam-webster.com",
    instagram: "instagram.com",
  };

  it("**英語のカードは英語圏に絞る**(札ごとに見る)", () => {
    const links = realUsageLinks("umbrella", "en");
    for (const [id, want] of Object.entries(EN_EXPECT)) {
      const l = links.find((x) => x.id === id);
      expect(l, `${id} の札が無い`).toBeDefined();
      expect(l!.href.includes(want), `${id}: ${l!.href} に ${want}`).toBe(true);
    }
  });

  it("英語はアメリカ英語に寄せる(オーナー決定 2026-08-24)", () => {
    const all = realUsageLinks("umbrella", "en")
      .map((l) => l.href)
      .join(" ");
    expect(all).toContain("/english/us");
    expect(all).toContain("gl=US");
    expect(all).toContain("merriam-webster.com");
  });

  it("見出し語は必ず encode される(空白や記号で URL が壊れない)", () => {
    for (const lang of TARGET_LANGUAGES) {
      for (const l of realUsageLinks("night market", lang)) {
        expect(l.href.includes(" "), `${lang}/${l.id}`).toBe(false);
        expect(l.href).toContain("night%20market");
      }
    }
  });

  it("id が重複しない(React の鍵が衝突しない)", () => {
    for (const lang of TARGET_LANGUAGES) {
      const ids = realUsageLinks("x", lang).map((l) => l.id);
      expect(new Set(ids).size, lang).toBe(ids.length);
    }
  });

  it("**文言の鍵が全部そろっている**(未定義だと鍵の名前がそのまま画面に出る)", () => {
    for (const lang of TARGET_LANGUAGES) {
      for (const l of realUsageLinks("x", lang)) {
        expect(DICT[l.labelKey], `${lang}: ${l.labelKey}`).toBeDefined();
        expect(DICT[l.hintKey], `${lang}: ${l.hintKey}`).toBeDefined();
      }
    }
  });

  /**
   * **絵で見つけた形。** 一言(`hintKey`)だけ英語版に替えて名前
   * (`labelKey`)を使い回したので、英語のカードに
   * 「在台灣的網站搜尋（台湾のサイトで検索）」と出ていた。
   * 一言が正しいので、文章を読むと合っているように見えるのが厄介だった。
   *
   * 言語ごとに中身が変わる札は、**名前と一言の両方**を替えること。
   */
  /**
   * **これが実際に捕まえた門。** `card.newsLabel`(「台湾のサイトで検索」)を
   * 英語の札に使い回していたので、英語のカードに
   * 「在台灣的網站搜尋」と出ていた — 一言のほうは
   * 「只限英語網站的搜尋結果」と正しかったので、**読むと合っているように
   * 見える**のが厄介だった。
   *
   * 「行き先が国で違うなら鍵も違うはず」という門も書いてみたが、**嘘の
   * 警告を出す**ので捨てた — YouTube の札(「YouTubeで聞く」)も対訳の札
   * (「文の中での使われ方」)も、名前に国が入っていないので使い回して
   * 正しい。嘘の警告を出す門は、そのうち誰も見なくなる。
   *
   * 見るのは**国の名前そのもの**。合わない国の名前が札に出ていたら、
   * それは必ず間違い。
   */
  const COUNTRY_WORDS: Record<string, string[]> = {
    en: ["台湾", "台灣", "Taiwan"],
    "zh-TW": ["英語圏", "英語圈", "English-speaking", "American English", "アメリカ英語"],
  };

  it("**札の名前に、その言語と合わない国の名前が入っていない**", () => {
    for (const target of TARGET_LANGUAGES) {
      const bad = COUNTRY_WORDS[target] ?? [];
      for (const l of realUsageLinks("x", target)) {
        const label = DICT[l.labelKey];
        for (const ui of UI_LANGS) {
          for (const word of bad) {
            expect(label[ui].includes(word), `${target}/${l.id}.${ui}: ${label[ui]}`).toBe(false);
          }
        }
      }
    }
  });

  it("知らない言語は既定に落とす(空の欄を作らない)", () => {
    expect(realUsageLinks("x", "kl-GL")).toEqual(realUsageLinks("x", DEFAULT_TARGET_LANGUAGE));
    expect(realUsageLinks("x", null)).toEqual(realUsageLinks("x", DEFAULT_TARGET_LANGUAGE));
  });

  it("全部 https(平文で外へ飛ばさない)", () => {
    for (const lang of TARGET_LANGUAGES) {
      for (const l of realUsageLinks("x", lang)) {
        expect(l.href.startsWith("https://"), `${lang}/${l.id}: ${l.href}`).toBe(true);
      }
    }
  });
});

describe("外した行き先", () => {
  it("**Reverso はどの学習言語でも出さない**(オーナー指示 2026-08-26)", () => {
    for (const lang of TARGET_LANGUAGES) {
      const links = realUsageLinks("x", lang);
      expect(
        links.find((l) => l.id === "context"),
        lang,
      ).toBeUndefined();
      for (const l of links) {
        expect(l.href.includes("reverso"), `${lang}/${l.id}`).toBe(false);
      }
    }
  });

  it("**英語のときは Threads ではなく Instagram**", () => {
    const en = realUsageLinks("lamp", "en");
    expect(en.find((l) => l.id === "instagram")).toBeTruthy();
    expect(en.find((l) => l.id === "threads")).toBeUndefined();
    // 台湾華語のほうは Threads のまま(そちらで短文が流れているのが理由)。
    const zh = realUsageLinks("燈", DEFAULT_TARGET_LANGUAGE);
    expect(zh.find((l) => l.id === "threads")).toBeTruthy();
  });

  it("**英語のときは Dcard も教育部の辞書も出さない**", () => {
    const en = realUsageLinks("lamp", "en");
    for (const id of ["dcard", "moe"]) {
      expect(
        en.find((l) => l.id === id),
        id,
      ).toBeUndefined();
    }
    // 代わりに英語圏の権威ある辞書。
    expect(en.find((l) => l.id === "mw")?.href).toContain("merriam-webster.com");
  });

  it("**英語のときは英語圏の検索結果**(台湾に絞らない)", () => {
    for (const l of realUsageLinks("lamp", "en")) {
      expect(l.href.includes("gl=TW"), l.id).toBe(false);
      expect(l.href.includes("lang_zh-TW"), l.id).toBe(false);
      expect(l.href.includes("dcard.tw"), l.id).toBe(false);
      expect(l.href.includes("moe.edu.tw"), l.id).toBe(false);
    }
    expect(realUsageLinks("lamp", "en").find((l) => l.id === "ygl")?.href).toContain("english/us");
  });
});

describe("画面に写しが残っていない", () => {
  /**
   * この一覧は `WordCard.tsx` の中に直に書かれていた。戻ると、
   * また英語のカードが台湾のサイトへ飛ぶ。
   */
  it("`WordCard.tsx` に台湾の URL が直に書かれていない", () => {
    const src = fs.readFileSync("src/components/WordCard.tsx", "utf8");
    for (const bad of ["dcard.tw", "moe.edu.tw", "youglish.com", "gl=TW"]) {
      expect(src.includes(bad), `WordCard.tsx に ${bad}`).toBe(false);
    }
  });
});
