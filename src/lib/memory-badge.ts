import { memoryOf, type MemoryInput, type MemoryLevelInfo } from "./memory";

/**
 * 札の画像の右上に出す**記憶の印**の中身（オーナー指示 2026-09-22
 * 「図鑑や復習の単語の画像の右上にその単語の記憶の状態と記憶数値を
 *  書きたして」）。
 *
 * **数も段も `memoryOf` の1つの数から出す。** 復習の記憶一覧と同じ関数
 * なので、同じ語なら図鑑と復習で**必ず同じ段・同じ %** になる
 * （画面ごとに計算すると、片方だけ直したときに食い違う — 2026-09-16 に
 *  段と % が逆転した）。% は**いま思い出せる確率**で、忘却曲線の縦軸と
 * 同じ数（オーナー指示 2026-09-23）。
 */
export type MemoryBadgeInfo = { percent: number; level: MemoryLevelInfo };

/** 札の id → 記憶の印。まだ復習の記録が無い札は入らない（印を出さない）。 */
export function memoryBadgeMap(
  words: ReadonlyArray<MemoryInput & { sticker_id: string }> | undefined,
): Map<string, MemoryBadgeInfo> {
  const m = new Map<string, MemoryBadgeInfo>();
  for (const w of words ?? []) {
    if (!Number.isFinite(w.retention) || !Number.isFinite(w.interval_days)) continue;
    m.set(w.sticker_id, memoryOf(w));
  }
  return m;
}
