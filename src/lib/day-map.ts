/**
 * 図鑑の「地図」（地図とカレンダーを1つにした表示）の計算だけ。
 *
 * （オーナー指示 2026-09-23「図鑑の種類に、地図とカレンダーを統合し、画面を
 *  開いたら地図が表示され、下で日付を横にスクロールでき、カレンダーを開いて
 *  特定の日付をタップすることもできる。ある日付を指定したらその日何時に
 *  どこで何を撮ったかがタイムラインで辿れて、時間を移動するとその都度その時
 *  撮った画像が地図上でポンと少しほかのポップより浮き上がる」— 参考は RONDO）
 */

export type StopItem = {
  id: string;
  takenAt: string;
  lat: number | null;
  lng: number | null;
  place: string | null;
};

/**
 * 立ち寄り = 同じ場所で続けて撮った写真のまとまり（RONDO の「スポット」）。
 * 地図のピン1本・時間軸の1行になる。
 */
export type Stop<T extends StopItem = StopItem> = {
  id: string;
  items: T[];
  start: string;
  end: string;
  lat: number | null;
  lng: number | null;
  place: string | null;
};

const R = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

/** 2点の間の距離（km、大円）。 */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * 1日の写真を、撮った順に立ち寄りへまとめる。
 * 前の写真から **80m 以内・40分以内** なら同じ立ち寄り。場所の無い写真は
 * 前の立ち寄りに時間が近ければそこへ、そうでなければ場所なしの立ち寄りになる。
 */
export function groupStops<T extends StopItem>(
  items: T[],
  opts: { meters?: number; minutes?: number } = {},
): Stop<T>[] {
  const maxKm = (opts.meters ?? 80) / 1000;
  const maxMs = (opts.minutes ?? 40) * 60_000;
  const sorted = [...items].sort((a, b) => +new Date(a.takenAt) - +new Date(b.takenAt));
  const stops: Stop<T>[] = [];
  for (const it of sorted) {
    const last = stops[stops.length - 1];
    const t = +new Date(it.takenAt);
    const near =
      last &&
      t - +new Date(last.end) <= maxMs &&
      (it.lat == null ||
        it.lng == null ||
        last.lat == null ||
        last.lng == null ||
        haversineKm({ lat: last.lat, lng: last.lng }, { lat: it.lat, lng: it.lng }) <= maxKm);
    if (last && near) {
      last.items.push(it);
      last.end = it.takenAt;
      if (last.lat == null && it.lat != null && it.lng != null) {
        last.lat = it.lat;
        last.lng = it.lng;
      }
      if (!last.place && it.place) last.place = it.place;
    } else {
      stops.push({
        id: it.id,
        items: [it],
        start: it.takenAt,
        end: it.takenAt,
        lat: it.lat,
        lng: it.lng,
        place: it.place,
      });
    }
  }
  return stops;
}

/**
 * 地図が読めないとき（鍵が無い・圏外・見本）の**簡易の面**に置く位置。
 * 場所のある立ち寄りを、縦横比を保ったまま箱に収める（余白 `pad`）。
 * 1か所しか無いときは真ん中。
 */
export function projectStops(
  stops: Stop[],
  box: { w: number; h: number },
  pad = 36,
): Map<string, { x: number; y: number }> {
  const pts = stops.filter((s) => s.lat != null && s.lng != null) as Array<
    Stop & { lat: number; lng: number }
  >;
  const out = new Map<string, { x: number; y: number }>();
  if (pts.length === 0) return out;
  const minLat = Math.min(...pts.map((p) => p.lat));
  const maxLat = Math.max(...pts.map((p) => p.lat));
  const minLng = Math.min(...pts.map((p) => p.lng));
  const maxLng = Math.max(...pts.map((p) => p.lng));
  // 経度は緯度で縮む（正距円筒のままだと東西に間延びする）。
  const kx = Math.cos(rad((minLat + maxLat) / 2));
  const spanX = Math.max(1e-6, (maxLng - minLng) * kx);
  const spanY = Math.max(1e-6, maxLat - minLat);
  const w = Math.max(1, box.w - pad * 2);
  const h = Math.max(1, box.h - pad * 2);
  const single = pts.length === 1 || (maxLat === minLat && maxLng === minLng);
  const s = Math.min(w / spanX, h / spanY);
  const ox = pad + (w - spanX * s) / 2;
  const oy = pad + (h - spanY * s) / 2;
  for (const p of pts) {
    out.set(
      p.id,
      single
        ? { x: box.w / 2, y: box.h / 2 }
        : { x: ox + (p.lng - minLng) * kx * s, y: oy + (maxLat - p.lat) * s },
    );
  }
  return out;
}

/** 前後の「写真のある日」。無ければ null。`days` は昇順の鍵。 */
export function neighborDay(days: string[], current: string, dir: -1 | 1): string | null {
  const i = days.indexOf(current);
  if (i < 0) {
    const after = days.find((d) => d > current);
    const before = [...days].reverse().find((d) => d < current);
    return dir === 1 ? (after ?? null) : (before ?? null);
  }
  return days[i + dir] ?? null;
}
