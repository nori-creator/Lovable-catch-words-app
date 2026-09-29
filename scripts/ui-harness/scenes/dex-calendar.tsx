/**
 * 図鑑のカレンダーと、日付を押したときの「その日のタイムライン」。
 * （オーナー指示 2026-09-22「カレンダーの日付をタップするとその日の
 *  タイムラインが分かるようにして。その時間に撮った写真が少し浮き上がる」）
 *
 * 写真のある日・無い日・1日に何枚もある日・今日を混ぜる。
 * `?variant=day` で今日のタイムラインを開いた形。
 */
import { useState } from "react";
import { DexCalendar } from "@/components/DexCalendar";
import { DexDayMap } from "@/components/DexDayMap";
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
  // **日付を押すと、その日の地図**（R14「カレンダーの日付をタップしたらマップが表示される
  // ように今まで通りに」）。本番の図鑑と同じ流れ（`DexDayMap` の暦 → `onPickDay`）。
  const [picked, setPicked] = useState<string | null>(null);
  if (picked)
    return (
      <div>
        <button
          type="button"
          onClick={() => setPicked(null)}
          style={{
            minHeight: 44,
            margin: "0 16px 8px",
            padding: "0 14px",
            borderRadius: 999,
            border: "1px solid rgba(0,0,0,.12)",
            background: "#fff",
            fontWeight: 600,
          }}
        >
          ‹ カレンダーに戻る
        </button>
        <DexDayMap stickers={stickers} onOpen={() => {}} initialDay={picked} forceFallback />
      </div>
    );
  return (
    <DexCalendar
      stickers={stickers}
      onOpen={() => {}}
      todayKey={today}
      initialDay={q.get("variant") === "day" ? today : null}
      onPickDay={q.get("variant") === "day" ? undefined : setPicked}
    />
  );
}
