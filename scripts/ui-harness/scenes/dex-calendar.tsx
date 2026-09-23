/**
 * 図鑑のカレンダーと、日付を押したときの「その日のタイムライン」。
 * （オーナー指示 2026-09-22「カレンダーの日付をタップするとその日の
 *  タイムラインが分かるようにして。その時間に撮った写真が少し浮き上がる」）
 *
 * 写真のある日・無い日・1日に何枚もある日・今日を混ぜる。
 * `?variant=day` で今日のタイムラインを開いた形。
 */
import { DexCalendar } from "@/components/DexCalendar";
import { stickerDayKey } from "@/lib/dex-filter";
import { FIXTURES, makeSticker } from "./home";

// 何日前に、どの見本を何枚撮ったか。
const DAYS: Array<[number, number[]]> = [
  [0, [0, 1, 2, 3, 4, 5]],
  [1, [2]],
  [3, [1, 4]],
  [4, [5]],
  [7, [0, 3, 6]],
  [9, [2]],
  [12, [1, 5]],
];

export function DexCalendarScene({ q }: { q: URLSearchParams }) {
  const stickers = DAYS.flatMap(([day, idx]) =>
    idx.filter((i) => FIXTURES[i]).map((i) => makeSticker(FIXTURES[i], i, day)),
  );
  const today = stickerDayKey(new Date().toISOString());
  return (
    <DexCalendar
      stickers={stickers}
      onOpen={() => {}}
      todayKey={today}
      initialDay={q.get("variant") === "day" ? today : null}
    />
  );
}
