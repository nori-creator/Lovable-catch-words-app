/**
 * 図鑑の絞り込み(カテゴリー・日付)を決める唯一の場所。
 *
 * オーナー指摘 2026-08-21:
 * > 「図鑑のカテゴリーや日付の選択は、**選択肢をすべて表示するのではなく、
 * >  ボタンを押したら選択肢が出てきて選べる**ようにして。またカテゴリーと
 * >  日付のボタンは**あなたの図鑑の欄に収めて**。」
 *
 * ## なぜ「選択肢を全部並べる」のをやめるか
 * カテゴリーは持っている数だけ増える。60語も集めれば十数個の丸が横に
 * 伸び、**画面の3行**を絞り込みが占める。図鑑は集めた物を見る画面なのに、
 * 集めた物より道具のほうが場所を取っていた。
 *
 * ## なぜ日付をここへ上げるか
 * 日付の絞り込みは**地図の中にしか無かった**。同じ「いつ撮ったか」で
 * 絞りたいのに、一覧・棚・カレンダーには手段が無い。しかも地図の中の
 * 状態なので、地図を離れると黙って消える。カテゴリーと**並びの取れた
 * 1組**にするために、判断をここへ出す。
 *
 * 外の世界に触れるものをここに入れないこと。
 */

import { asCategoryKey } from "./category";
import { localDayKey } from "./album-span";

/** 絞り込みの状態。どちらも `null` は「すべて」。 */
export type DexFilter = {
  category: string | null;
  /** `YYYY-MM-DD`(地方時)。 */
  day: string | null;
};

export const NO_FILTER: DexFilter = { category: null, day: null };

/** 選択肢1つ。件数まで持つ — 押す前に「何件あるか」が読めるようにする。 */
export type FilterOption = { key: string; count: number };

/** 札が持つ、絞り込みに要る所だけ。 */
export type FilterableSticker = {
  created_at: string;
  word: { category_key?: string | null };
};

/**
 * 日付の鍵。**UTC に変換しない** — 夜に撮った物が翌日へずれる。
 * 日の切り方はアルバムと同じ物(`localDayKey`)を使う。図鑑とアルバムで
 * 「その日」の境目が違うと、同じ札が別の日に現れる。
 */
export function stickerDayKey(iso: string): string {
  return localDayKey(new Date(iso));
}

/**
 * カテゴリーの選択肢。**持っている物だけ**を多い順に。
 *
 * 正規化してから数える。生の鍵で数えると、DBに残る古い鍵(`place` /
 * `object`)が「その他」と同じ名前の別の選択肢になり、同じ名前が2つ
 * 並んで押すたび違う結果が出る。
 */
export function categoryOptions(stickers: readonly FilterableSticker[]): FilterOption[] {
  const map = new Map<string, number>();
  for (const s of stickers) {
    const k = asCategoryKey(s.word.category_key);
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return (
    [...map.entries()]
      .map(([key, count]) => ({ key, count }))
      // 同じ件数のときは名前で決める。並びが回るたび変わると、
      // 「さっき上から3つ目にあった物」を探し直すことになる。
      .sort((a, b) => b.count - a.count || (a.key < b.key ? -1 : 1))
  );
}

/** 日付の選択肢。**撮った日だけ**を新しい順に。 */
export function dayOptions(stickers: readonly FilterableSticker[]): FilterOption[] {
  const map = new Map<string, number>();
  for (const s of stickers) {
    const k = stickerDayKey(s.created_at);
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => (a.key < b.key ? 1 : -1));
}

/** 絞り込みをかける。両方が立っていれば**両方**にかかる。 */
export function applyDexFilter<T extends FilterableSticker>(
  stickers: readonly T[],
  filter: DexFilter,
): T[] {
  return stickers.filter(
    (s) =>
      (!filter.category || asCategoryKey(s.word.category_key) === filter.category) &&
      (!filter.day || stickerDayKey(s.created_at) === filter.day),
  );
}

/**
 * 選択肢から消えた絞り込みを「すべて」に戻す。
 *
 * **空の画面で詰まらせない。** 最後の1枚を消したり、別の絞り込みで
 * その日が居なくなったりすると、選んだままの値が何にも当たらなくなる。
 * 画面には「0件」とだけ出て、何を解けば戻れるのか読めない。
 */
export function pruneFilter(
  filter: DexFilter,
  options: { categories: readonly FilterOption[]; days: readonly FilterOption[] },
): DexFilter {
  const category =
    filter.category && options.categories.some((o) => o.key === filter.category)
      ? filter.category
      : null;
  const day = filter.day && options.days.some((o) => o.key === filter.day) ? filter.day : null;
  // **同じなら同じ物を返す。** 毎回新しい物を返すと、これを見ている
  // `useEffect` が回り続ける。
  return category === filter.category && day === filter.day ? filter : { category, day };
}

/** 何か絞り込んでいるか(ボタンの見た目と「解除」の出し分けに使う)。 */
export function isFiltering(filter: DexFilter): boolean {
  return filter.category != null || filter.day != null;
}
