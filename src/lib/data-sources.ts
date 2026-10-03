/**
 * 取り込んだデータの**出典**。
 *
 * ## なぜコードに置くのか
 * このアプリは**商用**（オーナー 2026-08-24「このアプリは商業的である」）。
 * 使っているデータのうち2つは**出典を明記することが利用の条件**で、
 * 出典を出さずに配ると条件を満たさない。
 *
 *   CC BY 4.0        … 表示が義務
 *   CEFR-J           … 商用可だが出典明記が条件（東京外大 投野研）
 *
 * README に書くだけでは足りない — 条件は**利用者に見える所**に要る。
 * だから設定の中に頁を作り、その中身をここに置く。
 *
 * ## 消えないようにする
 * 出典は「あとで足す」と忘れる種類のもので、忘れても画面は壊れない。
 * `data-sources.test.ts` が**取り込んだデータの数と出典の数が合っているか**を
 * 数えている。データを足して出典を足し忘れたら落ちる。
 *
 * 外の世界に触れるものをここに入れないこと（`href` は文字列で持つだけ）。
 */

/** そのデータを何に使っているか。 */
export type DataUse =
  /** 種辞書（意味・発音・活用・頻度） */
  | "lexicon"
  /** 級（語彙） */
  | "vocab_level"
  /** 級（文法） */
  | "grammar_level"
  /** 字の変換 */
  | "script";

export type DataSource = {
  id: string;
  /** 出す名前。**原典の表記のまま**（訳さない）。 */
  name: string;
  /** 誰が作ったか。CEFR-J はここの明記が条件。**原典の表記**（日本語の画面はこれを出す）。 */
  author: string;
  /**
   * 作り手の名前を表示言語で（翻訳キー）。原典が日本語のものだけ持つ — 英語・繁體中文の
   * 画面に日本語のまま出ていた（2026-10-03 全画面の点検）。無ければ `author` をそのまま出す。
   */
  authorKey?: string;
  /** ライセンスの名前。 */
  license: string;
  /** ライセンスの名前を表示言語で（翻訳キー）。`authorKey` と同じ理由。 */
  licenseKey?: string;
  /** **表示が義務かどうか。** true のものは頁から外せない。 */
  attributionRequired: boolean;
  href: string;
  uses: readonly DataUse[];
  /** 何に使っているかの一言（翻訳キー）。 */
  noteKey: string;
};

/**
 * いま取り込んでいるデータ。
 *
 * **ライセンスは確認済み（2026-08-24〜25）。全て商用可。**
 * 増やすときは必ずここにも足すこと（試験が数えている）。
 */
export const DATA_SOURCES: readonly DataSource[] = [
  {
    id: "ecdict",
    name: "ECDICT",
    author: "skywind3000",
    license: "MIT",
    attributionRequired: false,
    href: "https://github.com/skywind3000/ECDICT",
    uses: ["lexicon"],
    noteKey: "sources.ecdict",
  },
  {
    id: "cmudict",
    name: "CMU Pronouncing Dictionary",
    author: "Carnegie Mellon University",
    license: "BSD-2-Clause",
    attributionRequired: false,
    href: "https://github.com/cmusphinx/cmudict",
    uses: ["lexicon"],
    noteKey: "sources.cmudict",
  },
  {
    id: "cefrj-wordlist",
    name: "CEFR-J Wordlist Version 1.6",
    // **ここを削らない。** 明記が利用の条件。
    author: "投野由紀夫研究室（東京外国語大学）",
    authorKey: "sources.cefrjAuthor",
    license: "CEFR-J（商用可）",
    licenseKey: "sources.cefrjLicense",
    attributionRequired: true,
    href: "https://www.cefr-j.org/download.html",
    uses: ["vocab_level"],
    noteKey: "sources.cefrjWordlist",
  },
  {
    id: "cefrj-grammar",
    name: "CEFR-J Grammar Profile",
    author: "投野由紀夫研究室（東京外国語大学）",
    authorKey: "sources.cefrjAuthor",
    license: "CEFR-J（商用可）",
    licenseKey: "sources.cefrjLicense",
    attributionRequired: true,
    href: "https://www.cefr-j.org/download.html",
    uses: ["grammar_level"],
    noteKey: "sources.cefrjGrammar",
  },
  {
    id: "opencc",
    name: "OpenCC",
    author: "BYVoid",
    license: "Apache-2.0",
    attributionRequired: false,
    href: "https://github.com/BYVoid/OpenCC",
    uses: ["script"],
    noteKey: "sources.opencc",
  },
  {
    // 台湾華語の読みの検査（`tw-reading.server.ts`、2026-10-03）。AI の拼音が字と
    // 合わないとき、この辞書の読みに差し替える。
    id: "pinyin-pro",
    name: "pinyin-pro",
    author: "zh-lx",
    license: "MIT",
    attributionRequired: false,
    href: "https://github.com/zh-lx/pinyin-pro",
    uses: ["lexicon"],
    noteKey: "sources.pinyinPro",
  },
];

/** 表示が義務のもの。**頁から外せない。** */
export function requiredSources(): DataSource[] {
  return DATA_SOURCES.filter((s) => s.attributionRequired);
}

/** その用途に使っているデータ。 */
export function sourcesFor(use: DataUse): DataSource[] {
  return DATA_SOURCES.filter((s) => s.uses.includes(use));
}
