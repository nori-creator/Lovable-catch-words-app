import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { geocodeLocation } from "@/lib/geocode.functions";
import { shouldGeocode } from "@/lib/geo-warm";

/**
 * キャッチしたときの「どこで」を取る所。
 *
 * ## なぜ1箇所にまとめたか(2026-08-20)
 * オーナー指摘「単語をキャッチしたときの地図のデータが保存されてない」。
 * 数えたら、3つのキャッチの経路が**それぞれ別の取り方**をしていた:
 *
 * | 経路 | 取り方 | 結果 |
 * |---|---|---|
 * | かざす(`scan.tsx`) | 画面を開いた時から `watchPosition` で温める | ◎ 正しい |
 * | 撮る(`capture.tsx`) | 解析の頭で `getCurrentPosition` を投げっぱなし | △ 保存時にまだ届いていないと null |
 * | 文字(`InputCatchSheet`) | **取っていない** | ✗ 必ず null |
 *
 * かざす側には正しい解が既にあり、その注釈にはこう書いてある —
 * 「以前は撮影時に timeout 800ms の一発勝負で、初回フィックスが間に合わず
 * 場所がほぼ保存されなかった」。**一度解いた問題が、他の2経路に伝わって
 * いなかった。** 声の写し(`speakZhTW`)で踏んだのと同じ形。
 *
 * だから取り方はここだけに置く。
 *
 * ## 待つが、待ちすぎない
 * 位置は**あれば嬉しい物**であって、キャッチを止めてよい物ではない。
 * 開いた時から温めておき、保存の直前に**短く待つだけ**にする。
 * 温まっていれば即返り、冷えていても数百ミリ秒で諦めて先へ進む。
 */

export type CatchLocation = { lat: number | null; lng: number | null; name: string | null };

export const EMPTY_LOCATION: CatchLocation = { lat: null, lng: null, name: null };

/** 温めた位置がこれより古ければ取り直す。 */
const WARM_MAX_AGE_MS = 2 * 60_000;
/** 保存の直前に待つ上限。**ここを長くしない** — キャッチが止まって見える。 */
const WAIT_MS = 1_500;
/**
 * 地名がまだ温まっていないときに待つ上限。
 *
 * **座標より短くする。** 座標が無いと地図そのものが出せないが、
 * 地名は「あれば読みやすい」だけ。温まっていれば 0ms で返るので、
 * ここに来るのは「開いてすぐ撮った」回だけ。
 */
const NAME_WAIT_MS = 900;

export function useCatchLocation() {
  const geocodeFn = useServerFn(geocodeLocation);
  const warmRef = useRef<{
    lat: number;
    lng: number;
    at: number;
    /** その座標の地名。**ここも温める**（下の注）。 */
    name: string | null;
  } | null>(null);
  const [loc, setLoc] = useState<CatchLocation>(EMPTY_LOCATION);

  /**
   * 地名を引いて、温めた所へ書き込む。
   *
   * **同じ場所で二重に引かない。** `pending` は「いま引いている座標」で、
   * 位置は数秒おきに届くので、これが無いと同じ場所を何度も叩く。
   */
  const pendingRef = useRef<string | null>(null);
  const warmName = useCallback(
    async (lat: number, lng: number): Promise<string | null> => {
      const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
      if (pendingRef.current === key) return warmRef.current?.name ?? null;
      pendingRef.current = key;
      try {
        const { location_name } = await geocodeFn({ data: { lat, lng } });
        const name = location_name || null;
        const w = warmRef.current;
        if (w && w.lat === lat && w.lng === lng) w.name = name;
        if (name) setLoc((cur) => (cur.lat === lat && cur.lng === lng ? { ...cur, name } : cur));
        return name;
      } catch {
        return null;
      } finally {
        if (pendingRef.current === key) pendingRef.current = null;
      }
    },
    [geocodeFn],
  );

  // 画面を開いた時から追従する。撮る瞬間の一発勝負にしない。
  useEffect(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const prev = warmRef.current;
        /**
         * **地名も座標と一緒に温める**(オーナー報告 2026-08-26、3度目
         * 「撮った地図の地名が表示されてない」)。
         *
         * ## なぜ保存されていなかったか
         * `resolve()` は地名を「待たない」ことにして、引くのを
         * `void` で投げ、返ってきたら `setLoc` で**画面だけ**直していた。
         * ところが保存に渡るのは `resolve()` の**戻り値**なので、
         * そこには `name: null` しか入っていない。
         * つまり地名は一度も行に書かれていなかった —
         * 画面の写しだけが後から名前を持ち、次に開くと消えている。
         *
         * ## 待たずに間に合わせる
         * 座標が届いた時点で引いておけば、撮る頃には名前が手元にある。
         * 撮る道は1ミリ秒も遅くならず、行にも名前が入る。
         */
        const carry = prev && prev.lat === lat && prev.lng === lng ? prev.name : null;
        warmRef.current = { lat, lng, at: Date.now(), name: carry };
        if (shouldGeocode(prev, { lat, lng })) void warmName(lat, lng);
      },
      () => {},
      { enableHighAccuracy: false, maximumAge: 60_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [warmName]);

  /**
   * いまの位置を返す。温まっていなければ**短く待つ**。
   * 取れなければ空を返す — 位置が無いことでキャッチを失敗させない。
   */
  const resolve = useCallback(async (): Promise<CatchLocation> => {
    const warm = warmRef.current;
    let lat: number | null = null;
    let lng: number | null = null;
    let name: string | null = null;
    if (warm && Date.now() - warm.at < WARM_MAX_AGE_MS) {
      lat = warm.lat;
      lng = warm.lng;
      name = warm.name;
    } else if (typeof navigator !== "undefined" && "geolocation" in navigator) {
      try {
        const pos = await new Promise<GeolocationPosition>((res, rej) => {
          navigator.geolocation.getCurrentPosition(res, rej, {
            timeout: WAIT_MS,
            maximumAge: 120_000,
          });
        });
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      } catch {
        /* 取れなくてもキャッチは続ける */
      }
    }
    if (lat == null || lng == null) {
      const empty: CatchLocation = { lat, lng, name: null };
      setLoc(empty);
      return empty;
    }

    /**
     * 温まっていれば 0ms。冷えていたときだけ**短く待つ**。
     *
     * 待たずに `null` を返していたのが報告の中身（上の注）。ただし
     * 待つのは `NAME_WAIT_MS` まで — 名前は「あれば読みやすい」だけで、
     * キャッチを止めてよい物ではない。間に合わなくても引くのは続き、
     * 画面の側には後から追いつく。
     */
    if (!name) {
      const asked = warmName(lat, lng);
      name = await Promise.race([
        asked,
        new Promise<null>((res) => setTimeout(() => res(null), NAME_WAIT_MS)),
      ]);
    }
    const next: CatchLocation = { lat, lng, name };
    setLoc(next);
    return next;
  }, [warmName]);

  /**
   * 保存に渡す形。**`resolve` を待ってから呼ぶこと** —
   * `loc` を直に読むと、まだ届いていない回で null のまま保存してしまう。
   */
  return { loc, resolve, setLoc };
}
