import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { geocodeLocation } from "@/lib/geocode.functions";

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

export function useCatchLocation() {
  const geocodeFn = useServerFn(geocodeLocation);
  const warmRef = useRef<{ lat: number; lng: number; at: number } | null>(null);
  const [loc, setLoc] = useState<CatchLocation>(EMPTY_LOCATION);

  // 画面を開いた時から追従する。撮る瞬間の一発勝負にしない。
  useEffect(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        warmRef.current = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          at: Date.now(),
        };
      },
      () => {},
      { enableHighAccuracy: false, maximumAge: 60_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  /**
   * いまの位置を返す。温まっていなければ**短く待つ**。
   * 取れなければ空を返す — 位置が無いことでキャッチを失敗させない。
   */
  const resolve = useCallback(async (): Promise<CatchLocation> => {
    const warm = warmRef.current;
    let lat: number | null = null;
    let lng: number | null = null;
    if (warm && Date.now() - warm.at < WARM_MAX_AGE_MS) {
      lat = warm.lat;
      lng = warm.lng;
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
    const next: CatchLocation = { lat, lng, name: null };
    setLoc(next);
    if (lat == null || lng == null) return next;

    // 地名(「士林」級)は**待たない**。座標さえ入っていれば地図は出せるし、
    // 名前は後から画面に追いつけばいい。
    void geocodeFn({ data: { lat, lng } })
      .then(({ location_name }) => {
        if (!location_name) return;
        setLoc((cur) =>
          cur.lat === lat && cur.lng === lng ? { ...cur, name: location_name } : cur,
        );
      })
      .catch(() => {});
    return next;
  }, [geocodeFn]);

  /**
   * 保存に渡す形。**`resolve` を待ってから呼ぶこと** —
   * `loc` を直に読むと、まだ届いていない回で null のまま保存してしまう。
   */
  return { loc, resolve, setLoc };
}
