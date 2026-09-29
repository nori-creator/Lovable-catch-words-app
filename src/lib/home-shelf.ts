/**
 * **ホームの一番上の本棚**の中身を決める（オーナー指示 2026-09-29「ホームのアルバムの一番上に
 * 本棚を一列作って。またアルバムを開くとその月の最初のページが開くようにして」）。
 *
 * 1か月＝1冊。背の厚さはその月に撮った枚数、色は月ごとに決まった布の色。
 * 本を開くと、その月の日が1日＝1見開き（左＝その日のアルバム、右＝その日の日記）で
 * 古い日から並ぶ。ここは画面や 3D に依らない計算だけ（試験できるように）。
 *
 * 日付はホームのアルバムと同じく**端末の暦**で数える（ホームで「9月28日」に貼られた写真は、
 * 本でも 9月28日の見開きに入る）。
 */

/** 布装の背の色（月の順に巡る。深い色 — 背の金の箔が読める濃さ）。 */
export const SHELF_COLORS = [
  "#23365e",
  "#7d2430",
  "#2f5a45",
  "#b58a2c",
  "#1f5f66",
  "#9a4a2e",
  "#5a3564",
  "#5d6a2e",
  "#3e4a5c",
  "#a7552c",
  "#262a33",
  "#6c8a6e",
] as const;

export type ShelfMonth = { key: string; y: number; m: number; count: number; color: string };

/** 1段に並べる冊数の上限（3D の棚の幅に収まる数。`shelf3d/engine.ts` の ROW_MAX と同じ）。 */
export const SHELF_ROW_MAX = 8;

export function monthKey(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, "0")}`;
}

/**
 * 撮った物から、棚に並べる月の本（古い月 → 新しい月、左 → 右）。新しい月から `max` 冊。
 * 色は月で決まる（並びが変わっても同じ月は同じ色）。
 */
export function shelfMonths(
  items: ReadonlyArray<{ created_at: string }>,
  max = SHELF_ROW_MAX,
): ShelfMonth[] {
  const counts = new Map<string, { y: number; m: number; count: number }>();
  for (const s of items) {
    const d = new Date(s.created_at);
    if (Number.isNaN(d.getTime())) continue;
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const key = monthKey(y, m);
    const have = counts.get(key);
    if (have) have.count++;
    else counts.set(key, { y, m, count: 1 });
  }
  return [...counts.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .slice(-max)
    .map(([key, v]) => ({
      key,
      ...v,
      color: SHELF_COLORS[(v.y * 12 + v.m - 1) % SHELF_COLORS.length],
    }));
}

/**
 * その月の日ごとの束（**古い日から**。束の中も撮った順）。1冊の本の見開きになる。
 * 1見開きに貼る写真は `perDay` 枚まで（ページの大きさに収まる数）。
 */
export function monthDays<T extends { created_at: string }>(
  items: ReadonlyArray<T>,
  y: number,
  m: number,
  perDay = 4,
): Array<{ d: number; items: T[] }> {
  const byDay = new Map<number, T[]>();
  for (const s of items) {
    const at = new Date(s.created_at);
    if (Number.isNaN(at.getTime())) continue;
    if (at.getFullYear() !== y || at.getMonth() + 1 !== m) continue;
    const d = at.getDate();
    const list = byDay.get(d);
    if (list) list.push(s);
    else byDay.set(d, [s]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a - b)
    .map(([d, list]) => ({
      d,
      items: [...list]
        .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
        .slice(0, perDay),
    }));
}

/**
 * 3D の本と棚の寸法（m。Blender の `scripts/blender/book_and_shelf.py` と `shelf3d/engine.ts`
 * が使う値）。ホームの帯に置く小さな棚の縦横比を、3D を読み込む前に決めるためここに置く。
 */
export const SHELF_DIMS = {
  bookH: 0.21,
  bookT: 0.04,
  gap: 0.0025,
  innerH: 0.26,
  innerW: 0.4 - 2 * 0.018,
  board: 0.018,
} as const;

/**
 * **本にぴったりの棚**の外形（m）（オーナー指示 2026-09-29「本棚と本の上部は空間を作らず
 * ぴったり収まるようにして」）。n 冊が並ぶ幅＋側板、本の高さちょうどの内側＋上下の板。
 */
export function tightShelfSize(n: number): { w: number; h: number } {
  const k = Math.max(1, Math.min(SHELF_ROW_MAX, n));
  const inner = k * SHELF_DIMS.bookT + (k - 1) * SHELF_DIMS.gap + 0.004;
  const sy = (SHELF_DIMS.bookH + 0.002) / SHELF_DIMS.innerH;
  return {
    w: inner + 2 * SHELF_DIMS.board * (inner / SHELF_DIMS.innerW),
    h: SHELF_DIMS.bookH + 0.002 + 2 * SHELF_DIMS.board * sy,
  };
}
