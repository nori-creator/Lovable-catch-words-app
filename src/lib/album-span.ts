/**
 * アルバムの束ね方 — 日 / 週 / 月(オーナー指摘⑪)。
 *
 * ## なぜ切り替えが要るのか
 * ホームは日付ごとに1ページ。毎日撮る人にとっては正しいが、**3ヶ月ぶん
 * 遡ると90ページ**になる。オーナーがメモに5回書いた「昔に撮ったもの見ない」
 * 「下にスクロールするモチベーションない」はここに直接効く。
 * 週や月でまとめれば、同じ量が12ページ・3ページになる。
 *
 * ## 週の始まりは月曜
 * 台湾も日本も月曜始まり。ISO の週番号(`2026-W34`)は使わない —
 * 年をまたぐ週で番号が飛ぶ規則が入り、**見出しに出す文字列としては
 * 誰も読めない**。代わりに「その週の月曜の日付」を鍵にする。
 * 鍵が日付のままなので、並べ替えも見出しの組み立ても素直にできる。
 *
 * ## 地方時で数える
 * `toISOString()` で切ると UTC になり、UTC より西の人は**1日ずれる**。
 * この app は既に同じ穴を `new Date("YYYY-MM-DD")` で踏んでいる。
 * ここでは地方時の年月日だけを見る。
 *
 * 外の世界に触れるものをここに入れないこと。
 */

export type AlbumSpan = "day" | "week" | "month";
export const ALBUM_SPANS: readonly AlbumSpan[] = ["day", "week", "month"];

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** 地方時の `YYYY-MM-DD`。 */
export function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * その日が属する束の**始まりの日**を鍵にする。
 * - day   … その日
 * - week  … その週の月曜
 * - month … その月の1日
 */
export function spanStartKey(d: Date, span: AlbumSpan): string {
  if (span === "month") return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
  if (span === "week") {
    // 日曜(0)は「前の週の月曜」に寄せる。ここを 0 のまま引くと、
    // 日曜だけが**翌週の頭**に入る。
    const back = (d.getDay() + 6) % 7;
    const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - back);
    return localDayKey(mon);
  }
  return localDayKey(d);
}

/** 鍵(`YYYY-MM-DD`)を地方時の Date に戻す。**`new Date(key)` は UTC なので使わない。** */
export function keyToDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/**
 * 束ねて、**新しい順**に返す。
 * 束の中の並びは渡された順のまま(呼ぶ側が既に並べている)。
 */
export function groupBySpan<T>(
  items: readonly T[],
  dateOf: (item: T) => Date,
  span: AlbumSpan,
): Array<[string, T[]]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const d = dateOf(item);
    if (Number.isNaN(d.getTime())) continue; // 壊れた日付で束を作らない
    const k = spanStartKey(d, span);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
}

/**
 * 束の見出し。
 *
 * 日は `DayHeader` が組むので、ここが作るのは**週と月**だけ。
 * 週は「8月17日 の週」のように**始まりの日**で言う — 週番号は読めない。
 */
export function spanHeading(key: string, span: AlbumSpan, locale: string): string {
  const d = keyToDate(key);
  if (span === "month") {
    return d.toLocaleDateString(locale, { year: "numeric", month: "long" });
  }
  if (span === "week") {
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 6);
    const from = d.toLocaleDateString(locale, { month: "short", day: "numeric" });
    const to = end.toLocaleDateString(locale, { month: "short", day: "numeric" });
    return `${from} – ${to}`;
  }
  return d.toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" });
}
