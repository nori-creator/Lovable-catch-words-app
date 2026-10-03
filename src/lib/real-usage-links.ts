/**
 * 「実際の使われ方」の**行き先**を、学習言語ごとに1箇所で持つ。
 *
 * ## なぜ切り出したか
 * この一覧は `WordCard.tsx` の中に、台湾向けの URL を7本直に書いた形で
 * 埋まっていた(`gl=TW` / `hl=zh-TW` / `dcard.tw` / `moe.edu.tw` …)。
 * 英語を学習言語に足した日(2026-08-25、第4段)から、**英語の語を調べる
 * ボタンが台湾のサイトへ飛ぶ**。実際、英語のカードを撮った絵では
 * 「台湾の若者のSNS」「台湾教育部の公式辞書」が7本並んでいた。
 *
 * 画面の中に居る限り試験から触れないので、純粋な物として出す。
 * ここは**表を組み立てるだけ**で、外の世界には触れない。
 *
 * ## 当て推量の URL を貼らない
 * オーナー指摘(2026-08-20):「飛んだ先が違う」。この環境からは外向きの
 * 通信が塞がっていて URL の形を確かめられないので、**既に台湾側で
 * 使っている形と同じ形だけ**を英語に写す:
 *
 *   youglish.com/pronounce/{w}/chinese/tw → …/english/us
 *   google.com/search?…&gl=TW&lr=lang_zh-TW → …&gl=US&lr=lang_en
 *
 * 形が同じなら、当てているのは**言語の名前だけ**になる。
 *
 * ## 対訳(Reverso)は外した
 * オーナー指示 2026-08-26「reverso の項目は学習言語に関わらず削除して」。
 * 例文の対訳はカードの中に既に在るので、外へ飛ばす値打ちが薄かった。
 */

import { DEFAULT_TARGET_LANGUAGE, normalizeTargetLanguage } from "./target-lang";

export type RealUsageLink = {
  id: string;
  emoji: string;
  /** 表示名の翻訳キー。 */
  labelKey: string;
  /** 一言の翻訳キー。 */
  hintKey: string;
  href: string;
};

/**
 * その語の「実際の使われ方」の行き先。
 *
 * @param headword 見出し語(URL に入れる。呼ぶ側で encode しない)
 * @param targetLanguage 学習言語。知らない値は既定に落とす
 */
export function realUsageLinks(
  headword: string,
  targetLanguage: string | null | undefined = DEFAULT_TARGET_LANGUAGE,
  readerLanguage?: string | null,
): RealUsageLink[] {
  const links = linksFor(headword, targetLanguage);
  /**
   * **読む人の言語でしか読めない場所は、その人にだけ出す**（2026-10-03 全画面の点検:
   * 繁體中文の表示で「Yahoo!知恵袋」が出ていた）。知恵袋は日本語話者同士の質問と答えで、
   * 同じ役をする場所が台湾・英語圏に無い。表示言語が日本語の人にだけ残す
   * （表示言語を渡さない呼び出しは今まで通り全部）。
   */
  if (readerLanguage && readerLanguage !== "ja")
    return links.filter((l) => !JA_READER_ONLY.has(l.id));
  return links;
}

/** 表示言語が日本語の人にだけ出す行き先。 */
const JA_READER_ONLY = new Set(["chiebukuro"]);

function linksFor(headword: string, targetLanguage: string | null | undefined): RealUsageLink[] {
  const q = encodeURIComponent(headword);
  const lang = normalizeTargetLanguage(targetLanguage);

  if (lang === "ja") {
    // 日本語(2026-10-01)。**日本の人が実際に使う所**へ飛ばす。台湾・英語圏と
    // 同じ役の札を、日本で同じ役をしている場所に置き換える:
    //   動画 → YouTube(日本に絞る) / 発音 → YouGlish の日本語 /
    //   短文 → X(日本でいちばん短文が流れている所) / 普通の人の文 → Yahoo!知恵袋 /
    //   検索 → 日本の日本語の頁に絞った Google / 辞書 → Weblio・コトバンク・Jisho。
    // goo辞書は 2025年に終わったので使わない(飛んだ先が空になる)。
    return [
      {
        id: "yt",
        emoji: "\u{1F3AC}",
        labelKey: "card.ytLabel",
        hintKey: "card.ytHintJa",
        href: `https://www.youtube.com/results?search_query=${q}&sp=EgIQAQ%253D%253D&gl=JP&hl=ja`,
      },
      {
        id: "ygl",
        emoji: "\u{1F5E3}\u{FE0F}",
        labelKey: "card.yglLabel",
        hintKey: "card.yglHintJa",
        href: `https://youglish.com/pronounce/${q}/japanese`,
      },
      {
        id: "x",
        emoji: "\u{1F4AC}",
        // Dcard / Reddit にあたる所。日本ではいま短文がいちばん流れている。
        labelKey: "card.xLabel",
        hintKey: "card.xHint",
        href: `https://x.com/search?q=${q}&lang=ja`,
      },
      {
        id: "chiebukuro",
        emoji: "\u{1F64B}",
        // 普通の人が質問と答えを書く場所。「この言い方は失礼?」のような、
        // 辞書に載らない使い分けの話がそのまま読める。
        labelKey: "card.chiebukuroLabel",
        hintKey: "card.chiebukuroHint",
        href: `https://chiebukuro.yahoo.co.jp/search?p=${q}`,
      },
      {
        id: "news",
        emoji: "\u{1F4F0}",
        // **名前も日本版にする**(英語で踏んだ「名前を使い回して台湾と出る」の再発を防ぐ)。
        labelKey: "card.newsLabelJa",
        hintKey: "card.newsHintJa",
        href: `https://www.google.com/search?q=${q}&hl=ja&gl=JP&cr=countryJP&lr=lang_ja`,
      },
      {
        id: "weblio",
        emoji: "\u{1F4D6}",
        // 国語辞典・類語・用例をまとめて引ける、日本で広く使われている辞書。
        labelKey: "card.weblioLabel",
        hintKey: "card.weblioHint",
        href: `https://www.weblio.jp/content/${q}`,
      },
      {
        id: "kotobank",
        emoji: "\u{1F4DA}",
        // 複数の辞書・事典(デジタル大辞泉・日本大百科全書など)を横に並べて読める。
        labelKey: "card.kotobankLabel",
        hintKey: "card.kotobankHint",
        href: `https://kotobank.jp/search?q=${q}`,
      },
      {
        id: "jisho",
        emoji: "\u{1F524}",
        // 学習者向け。英語の語釈・漢字の音訓・JLPT の目安が1つの頁に出る。
        labelKey: "card.jishoLabel",
        hintKey: "card.jishoHint",
        href: `https://jisho.org/search/${q}`,
      },
    ];
  }

  if (lang === "en") {
    return [
      {
        id: "yt",
        emoji: "\u{1F3AC}",
        labelKey: "card.ytLabel",
        hintKey: "card.ytHintEn",
        // 台湾側と同じ形で、地域と言語だけ英語圏に替える。
        // `sp=EgIQAQ%3D%3D` は「動画」に絞る並べ替えの符号(台湾側と同じ)。
        href: `https://www.youtube.com/results?search_query=${q}&sp=EgIQAQ%253D%253D&gl=US&hl=en`,
      },
      {
        id: "ygl",
        emoji: "\u{1F5E3}\u{FE0F}",
        labelKey: "card.yglLabel",
        hintKey: "card.yglHintEn",
        // オーナー決定「アメリカ英語を既定」。地域まで指定する。
        href: `https://youglish.com/pronounce/${q}/english/us`,
      },
      {
        id: "reddit",
        emoji: "\u{1F4AC}",
        // Dcard(台湾の若者のSNS)にあたる所。**普通の人が書いた短文**が
        // 並ぶ場所で、辞書には無い言い回しがそのまま読める。
        labelKey: "card.redditLabel",
        hintKey: "card.redditHint",
        href: `https://www.reddit.com/search/?q=${q}`,
      },
      {
        id: "instagram",
        emoji: "\u{1F4F7}",
        // オーナー指示 2026-08-26「Threads ではなく Instagram にして」。
        // Threads は台湾で短文が流れている所という理由で選んだので、
        // 英語圏では理由がそのまま当てはまらない。
        labelKey: "card.igLabel",
        hintKey: "card.igHint",
        href: `https://www.instagram.com/explore/tags/${q}/`,
      },
      {
        id: "news",
        emoji: "\u{1F4F0}",
        // **名前も英語版にする。** 一言だけ替えて名前を使い回すと、
        // 英語のカードに「台湾のサイトで検索」と出る。
        labelKey: "card.newsLabelEn",
        hintKey: "card.newsHintEn",
        href: `https://www.google.com/search?q=${q}&hl=en&gl=US&cr=countryUS&lr=lang_en`,
      },
      {
        id: "mw",
        emoji: "\u{1F4D6}",
        // 教育部國語辭典にあたる、その言語の**公の辞書**。
        // アメリカ英語を既定にしているので Merriam-Webster。
        labelKey: "card.mwLabel",
        hintKey: "card.mwHint",
        href: `https://www.merriam-webster.com/dictionary/${q}`,
      },
    ];
  }

  return [
    {
      id: "yt",
      emoji: "\u{1F3AC}",
      // **台湾の動画に絞る**(オーナー指摘 2026-08-20)。
      // `youglish` は仕組み上1本ずつしか見せないので、「複数見たい」に
      // 応えるのはこちら側。地域と言語を指定して、台湾で撮られた動画に寄せる。
      labelKey: "card.ytLabel",
      hintKey: "card.ytHint",
      href: `https://www.youtube.com/results?search_query=${q}&sp=EgIQAQ%253D%253D&gl=TW&hl=zh-TW`,
    },
    {
      id: "ygl",
      emoji: "\u{1F5E3}\u{FE0F}",
      labelKey: "card.yglLabel",
      hintKey: "card.yglHint",
      href: `https://youglish.com/pronounce/${q}/chinese/tw`,
    },
    {
      id: "dcard",
      emoji: "\u{1F4AC}",
      labelKey: "card.dcardLabel",
      hintKey: "card.dcardHint",
      href: `https://www.dcard.tw/search?query=${q}`,
    },
    {
      id: "threads",
      emoji: "\u{1F9F5}",
      // Threads(オーナー指摘)。いま台湾でいちばん短文が流れている所で、
      // 「その語が実際にどう使われているか」がそのまま並ぶ。
      labelKey: "card.threadsLabel",
      hintKey: "card.threadsHint",
      href: `https://www.threads.com/search?q=${q}`,
    },
    {
      id: "news",
      emoji: "\u{1F4F0}",
      // **Google 検索にして台湾の記事だけに限定**(オーナー指摘)。
      // `news.google.com` は見出しの一覧で、本文の中でどう使われているかが
      // 読めない。`cr=countryTW` と `lr=lang_zh-TW` で台湾の中国語の頁に絞る。
      labelKey: "card.newsLabel",
      hintKey: "card.newsHint",
      href: `https://www.google.com/search?q=${q}&hl=zh-TW&gl=TW&cr=countryTW&lr=lang_zh-TW`,
    },
    {
      id: "moe",
      emoji: "\u{1F4D6}",
      labelKey: "card.moeLabel",
      hintKey: "card.moeHint",
      href: `https://dict.concised.moe.edu.tw/search.jsp?word=${q}`,
    },
  ];
}
