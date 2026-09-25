/**
 * **チャンクの札の形の案。**
 *
 * 2026-09-24 に A〜D（浮遊・塗り・縁取り・ガラス）を出し、2026-09-25 に
 * オーナーが「ガラスの色付きで、押し込むと A のように弾む」を選んだ。
 * 質感はガラスに決まり、押すと沈んで弾む（`.chunk-bubble:active`）。
 *
 * 同じ日の続きの指示で、**形**の案を並べ直した:
 * 「バブルだとそれぞれの品詞が独立してる。視覚的に塊として覚えにくい。
 *  パズルのように / 囲う品詞を限定 / 該当の単語だけ囲う / 囲わず品詞の
 *  色分けだけ / 定理や公式のように 跟＋人＋見面」
 *
 * 案はここに並べ、確認用ページで見比べる。本番の見た目は `CHUNK_DESIGN`
 * の1つだけ（単語の詳細と復習の解説が同じ値を読む = 必ず揃う）。
 * オーナーが1つ選んだら、残りの案は消す。
 */
export const CHUNK_DESIGNS = [
  "glass",
  "puzzle",
  "content",
  "headword",
  "color",
  "formula",
] as const;
export type ChunkDesign = (typeof CHUNK_DESIGNS)[number];

export const CHUNK_DESIGN_LABEL: Record<ChunkDesign, string> = {
  glass: "A ガラスの丸（品詞ごと）",
  puzzle: "B パズル（札がかみ合って1つの塊）",
  content: "C 中身の語だけ丸（名詞・動詞・形容詞）",
  headword: "D その単語だけ丸",
  color: "E 丸なし・色分けだけ",
  formula: "F 公式（跟 ＋ 人 ＋ 見面）",
};

/** 本番で使う案。単語の詳細と復習の解説はどちらもこれを読む。 */
export const CHUNK_DESIGN: ChunkDesign = "glass";
