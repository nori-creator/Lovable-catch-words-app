/**
 * 図鑑のカレンダーと、日付を押したときの「その日のタイムライン」の
 * 置き方（描画から切り離した計算だけ）。
 *
 * （オーナー指示 2026-09-22「カレンダーの日付をタップするとその日の
 *  タイムラインが分かるようにして。その時間に撮った写真が少し浮き上がる
 *  ように」— 参考は RONDO の縦の時間軸）
 */

/** 月の升目。日曜はじまり。前後の月の日は null（空の升）。 */
export function monthCells(y: number, m: number): Array<number | null> {
  const leading = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const cells: Array<number | null> = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
  // 最後の週も7つに揃える（升の行が途中で切れると、下の段がずれて見える）。
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** `YYYY-MM-DD`（その端末の暦の日）。 */
export function dayKeyOf(y: number, m: number, d: number): string {
  return `${y}-${`${m + 1}`.padStart(2, "0")}-${`${d}`.padStart(2, "0")}`;
}

/** その日を含む週（日曜はじまり）の7日ぶんの日付の鍵。 */
export function weekOf(key: string): string[] {
  const [y, m, d] = key.split("-").map(Number);
  const base = new Date(y, m - 1, d);
  const start = new Date(y, m - 1, d - base.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return dayKeyOf(x.getFullYear(), x.getMonth(), x.getDate());
  });
}

export type TimelineRow = { id: string; y: number; minutes: number };
export type TimelineTick = { hour: number; y: number };

/**
 * 縦の時間軸に写真を置く。**撮った時刻の間が空くほど、縦の間も空く**
 * （RONDO の読み方: 下へ行くほど時間が進み、間の長さが時間の長さ）。
 *
 * ただし比例のままだと、1分違いの2枚は重なり、朝と夜の2枚は画面の外まで
 * 離れる。間は `minGap`（札1枚ぶん）〜 `maxGap` に収める。
 *
 * 間に挟まる**ちょうどの時刻**（10:00 など）は目盛りとして返す。長い間が
 * 空いたとき、軸の上で「そのあいだに何時間たったか」が読めるように。
 */
export function layoutTimeline(
  items: Array<{ id: string; minutes: number }>,
  opts: { pxPerMin?: number; minGap?: number; maxGap?: number } = {},
): { rows: TimelineRow[]; ticks: TimelineTick[]; height: number } {
  const pxPerMin = opts.pxPerMin ?? 1.2;
  const minGap = opts.minGap ?? 108;
  const maxGap = opts.maxGap ?? 220;
  const sorted = [...items].sort((a, b) => a.minutes - b.minutes);
  const rows: TimelineRow[] = [];
  const ticks: TimelineTick[] = [];
  let y = 0;
  sorted.forEach((it, i) => {
    if (i > 0) {
      const prev = sorted[i - 1];
      const prevY = y;
      const gap = Math.min(maxGap, Math.max(minGap, (it.minutes - prev.minutes) * pxPerMin));
      y = prevY + gap;
      // 間に挟まるちょうどの時刻を、間の中に比例で置く。
      const firstHour = Math.floor(prev.minutes / 60) + 1;
      const lastHour = Math.floor(it.minutes / 60);
      const span = it.minutes - prev.minutes;
      for (let h = firstHour; h <= lastHour; h++) {
        if (h * 60 === it.minutes) continue;
        const k = span > 0 ? (h * 60 - prev.minutes) / span : 0;
        ticks.push({ hour: h, y: prevY + gap * k });
      }
    }
    rows.push({ id: it.id, y, minutes: it.minutes });
  });
  // 目盛りが札の上に重なって読めなくならないよう、札の近く（±28px）は落とす。
  const clear = ticks.filter((tk) => rows.every((r) => Math.abs(r.y - tk.y) > 28));
  // 同じ間に目盛りが詰まりすぎたら間引く（28px 未満の間隔は落とす）。
  const spaced: TimelineTick[] = [];
  for (const tk of clear) {
    const last = spaced[spaced.length - 1];
    if (last && tk.y - last.y < 28) continue;
    spaced.push(tk);
  }
  return { rows, ticks: spaced, height: y + minGap };
}

/** その時刻の、その日の 0 時からの分。 */
export function minutesOfDay(iso: string): number {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 0;
  return d.getHours() * 60 + d.getMinutes();
}
