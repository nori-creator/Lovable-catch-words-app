/**
 * 台湾華語のコーパスへの**リンク**。
 *
 * オーナーの決定(これが前提):
 * > 「**コーパス許可取ってないから**、コーパスで貴重な情報が乗っている
 * >  ところに**飛べるようなリンクを貼る**。コーパスの詳しいデータのリンクで
 * >  単語の詳細の項目の解説を補完するようにしたい。」
 *
 * ## 取り込まない
 * データを1語も持ってこない。頻度表も感情の正負も、このアプリの表には
 * 入れない。**許可を取っていないから**であり、それは licence を確かめれば
 * 変わる話ではなく、確かめるまでは変わらない話。ここにあるのは
 * 「見に行く先」だけ。
 *
 * ## なぜ語をクエリに埋めないのか
 * 埋めたい。埋めれば1タップ減る。**ただし、どの系統も検索の URL の形を
 * この環境から確かめられなかった**(外向きの通信が塞がっている)。
 * 前に「実際の使われ方」のリンクを当て推量で書いて、オーナーに
 * 「飛んだ先が違う」と指摘されている。当て推量の URL を貼るくらいなら、
 * **語を写してから開く**ほうが確実に用が足りる。
 * 形が確かめられた系統から順に `query` を持たせて直に飛ばす。
 *
 * ## NTUSD(臺大情緒字典)がここに無い理由
 * あれは**語彙表のファイル**で、語ごとに見に行ける頁が無い。
 * 学習者を GitHub の語彙表に送っても「この語はよい意味か」は分からない。
 * 気持ちの欄を実データで裏打ちするには取り込みが要るが、それは許可の話に
 * 戻るので、いまは載せない。
 *
 * ここには外の世界に触れるものを入れないこと。
 */

/** どの節の下に出すか。`card-sections.ts` の `SectionId` の部分集合。 */
export type CorpusSection = "usage_context" | "related_words" | "usage_chunks" | "real_usage";

export type CorpusSource = {
  id: string;
  /** 表示名の翻訳キー。 */
  labelKey: string;
  /** その系統で**何が読めるか**の翻訳キー。 */
  hintKey: string;
  /** 入口の URL。語は埋めない(上の注釈)。 */
  href: string;
  /** ログインや申請が要る系統は、開く前に分かるようにする。 */
  needsLogin?: true;
  /** この系統を出す節。 */
  sections: readonly CorpusSection[];
};

export const CORPUS_SOURCES: readonly CorpusSource[] = [
  {
    id: "coct-level",
    labelKey: "corpus.coctLevel",
    hintKey: "corpus.coctLevelHint",
    href: "https://coct.naer.edu.tw/word.jsp",
    sections: ["usage_context"],
  },
  {
    id: "coct-core",
    labelKey: "corpus.coctCore",
    hintKey: "corpus.coctCoreHint",
    href: "https://coct.naer.edu.tw/corevoc.jsp",
    sections: ["usage_context"],
  },
  {
    id: "sinica",
    labelKey: "corpus.sinica",
    hintKey: "corpus.sinicaHint",
    href: "https://asbc.iis.sinica.edu.tw/",
    sections: ["usage_context", "usage_chunks"],
  },
  {
    id: "cwn",
    labelKey: "corpus.cwn",
    hintKey: "corpus.cwnHint",
    href: "https://lopentu.github.io/CwnWeb/",
    sections: ["related_words"],
  },
  {
    id: "coct-bilingual",
    labelKey: "corpus.coctBilingual",
    hintKey: "corpus.coctBilingualHint",
    href: "https://coct.naer.edu.tw/bc.jsp",
    sections: ["real_usage"],
  },
  {
    id: "sketch",
    labelKey: "corpus.sketch",
    hintKey: "corpus.sketchHint",
    href: "https://www.sketchengine.eu/",
    needsLogin: true,
    sections: ["usage_chunks"],
  },
];

/** その節の下に出すコーパス。並びは `CORPUS_SOURCES` の順のまま。 */
export function corpusLinksFor(section: CorpusSection): CorpusSource[] {
  return CORPUS_SOURCES.filter((s) => s.sections.includes(section));
}

/** 語を写してから開くか(いまは全部そう。形が確かめられた系統から外していく)。 */
export function copiesWord(source: CorpusSource): boolean {
  return !source.href.includes("{w}");
}

/** 実際に開く URL。`{w}` を持つ系統だけ語を差し込む。 */
export function corpusHref(source: CorpusSource, headword: string): string {
  return source.href.replace("{w}", encodeURIComponent(headword));
}
