/**
 * 図鑑の地図（地図とカレンダーを1つにした表示）。（オーナー指示 2026-09-23）
 *
 * 見本は地図を読みに行かない（`forceFallback`）— 鍵も通信も無いので、
 * 同じピンと線を簡易の面に描く。実物では Google の地図の上に同じピンが乗る。
 * 1日の中で場所を移り、同じ場所で続けて撮った写真はまとまる形を入れる。
 * `?at=N` で時間軸を N 行目まで送った形（その立ち寄りのピンが浮く）。
 */
import { useEffect } from "react";
import { DexDayMap } from "@/components/DexDayMap";
import { stickerDayKey } from "@/lib/dex-filter";
import { FIXTURES, makeSticker } from "./home";

const ROUTE: Array<[number, number, string]> = [
  [25.0478, 121.517, "台北駅"],
  [25.0478, 121.5171, "台北駅"],
  [25.0421, 121.5076, "西門町"],
  [25.0339, 121.5645, "台北101"],
  [25.0329, 121.5296, "永康街"],
  [25.088, 121.5241, "士林夜市"],
  [25.088, 121.5242, "士林夜市"],
];

export function DexMapScene({ q }: { q: URLSearchParams }) {
  const today = FIXTURES.map((f, i) => {
    const s = makeSticker(f, i, 0);
    const [lat, lng, place] = ROUTE[i % ROUTE.length];
    return { ...s, lat, lng, location_name: place };
  });
  const past = [1, 3, 7].flatMap((d) =>
    FIXTURES.slice(0, 3).map((f, i) => {
      const s = makeSticker(f, i, d);
      const [lat, lng, place] = ROUTE[(i + d) % ROUTE.length];
      return { ...s, lat, lng, location_name: place };
    }),
  );
  const at = Number(q.get("at") ?? 0);
  useEffect(() => {
    if (!at) return;
    const id = window.setTimeout(() => {
      const rows = document.querySelectorAll<HTMLElement>("[data-stop-row]");
      rows[Math.min(at, rows.length - 1)]?.click();
    }, 120);
    return () => window.clearTimeout(id);
  }, [at]);
  return (
    <div className="px-4">
      <DexDayMap
        stickers={[...today, ...past]}
        onOpen={() => {}}
        initialDay={stickerDayKey(new Date().toISOString())}
        forceFallback
      />
    </div>
  );
}
