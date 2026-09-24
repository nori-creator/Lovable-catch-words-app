/**
 * **チャンクの札（バブル）の見た目の案。**（オーナー指示 2026-09-24
 * 「チャンクのそれぞれの品詞を丸で囲う…バブルの色をもう少し鮮やかに、
 *  いろんなデザインを複数出して。一つは軽い感じ・浮き上がってる・浮遊して
 *  いる・バウンスする感じ。単語の詳細のチャンクと復習の解説のチャンクは
 *  同じデザインに統一して」）
 *
 * 案はここに並べ、確認用ページで見比べる。本番の見た目は `CHUNK_DESIGN`
 * の1つだけ（単語の詳細と復習の解説が同じ値を読む = 必ず揃う）。
 * オーナーが1つ選んだら、残りの案は消す。
 */
export const CHUNK_DESIGNS = ["float", "solid", "outline", "glass"] as const;
export type ChunkDesign = (typeof CHUNK_DESIGNS)[number];

export const CHUNK_DESIGN_LABEL: Record<ChunkDesign, string> = {
  float: "A 浮遊（軽く浮いて、押すと弾む）",
  solid: "B 塗り（濃い色に白い字）",
  outline: "C 縁取り（白地に太い色の縁）",
  glass: "D ガラス（色付きの透明感）",
};

/** 本番で使う案。単語の詳細と復習の解説はどちらもこれを読む。 */
export const CHUNK_DESIGN: ChunkDesign = "float";
