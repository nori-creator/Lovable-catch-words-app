/**
 * **温めた位置を取り直すかどうか。**
 *
 * `use-catch-location.tsx` の判断だけをここに出す（画面の中に置くと、
 * 直したかどうかを絵でしか確かめられない）。
 */

/** これだけ動いたら別の場所とみなして地名を引き直す。 */
export const REGEOCODE_METERS = 120;

/**
 * 2点の距離(m)。**haversine を使わない** — 数百m を見分けるだけなので、
 * 緯度で補正した平面近似で足りる（地球の丸みが効くのは数十km から）。
 */
export function metersBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const latM = 111_320;
  const dy = (b.lat - a.lat) * latM;
  const dx = (b.lng - a.lng) * latM * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

/**
 * その新しい位置で地名を引き直すか。
 *
 * - まだ一度も引いていない … 引く
 * - 名前が取れていない … 引く（前回は返らなかっただけかもしれない）
 * - **`REGEOCODE_METERS` 以上動いた** … 引く
 *
 * それ以外は引かない。位置は数秒おきに届くので、毎回引くと
 * 歩いているだけで何十回も server を叩くことになる。
 */
export function shouldGeocode(
  prev: { lat: number; lng: number; name: string | null } | null,
  next: { lat: number; lng: number },
): boolean {
  if (!prev) return true;
  if (!prev.name) return true;
  return metersBetween(prev, next) >= REGEOCODE_METERS;
}
