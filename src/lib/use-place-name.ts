import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { geocodeLocation } from "@/lib/geocode.functions";

/**
 * **座標しか無い札にも、その場所の名前を出す。**
 *
 * オーナー報告 2026-08-26:
 * > 「単語の詳細のどこで取ったかの情報が地図で開くとしか表示されない。
 * >  単語の詳細の項目では地図上の詳しい具体的な地名を表示したい。」
 *
 * ## 撮り直しでは直らない
 * 保存のときに地名を書き留める道は直した（`use-catch-location.tsx`）が、
 * それは**これから撮る札**の話。すでに保存されている札は
 * `location_name` が空のままで、画面はそれを「撮影地」という
 * ボタンの名前で埋めていた — **そこが「撮影地」という場所に見える。**
 *
 * 座標は入っているので、**開いたときに引き直す**。
 *
 * ## 書き戻さない
 * 引いた名前は画面に出すだけで、行には書かない。書きに行くと、
 * カードを開いただけで保存が走ることになるし、`stickers` を
 * 更新する server fn をこのために増やすことになる。
 * 名前は毎回同じ座標から同じように引けるので、持たなくても困らない
 * （React Query が同じ座標の答えを憶えている）。
 *
 * ## 地名が本当に無い場所もある
 * 山の中や海の上では逆引きが何も返さない。そのときは `null` のままで、
 * 呼ぶ側が今までどおりボタンの名前に落ちる。
 */
export function usePlaceName(
  lat: number | null | undefined,
  lng: number | null | undefined,
  /** すでに名前が在るなら引かない。 */
  known?: string | null,
): string | null {
  const fetchFn = useServerFn(geocodeLocation);
  // **座標を丸めて鍵にする。** 同じ場所で撮った札が何枚もあるので、
  // 丸めないと1枚ごとに引きに行く。4桁 ≒ 11m。
  const key = lat != null && lng != null ? `${lat.toFixed(4)},${lng.toFixed(4)}` : null;
  const { data } = useQuery({
    queryKey: ["place-name", key],
    queryFn: () => fetchFn({ data: { lat: lat as number, lng: lng as number } }),
    enabled: !known && key != null,
    // 地名は動かない。長く憶えておいてよい。
    staleTime: 24 * 60 * 60 * 1000,
    retry: false,
  });
  return known ?? data?.location_name ?? null;
}
