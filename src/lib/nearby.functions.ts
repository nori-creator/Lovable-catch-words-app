import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * 「いまいる場所で撮った言葉」を探す。
 *
 * 街を歩いていて、前に単語を撮った場所を通りかかったときに
 * 「ここで『芒果』撮ったね。覚えてる?」と出すための問い合わせ。
 *
 * ## なぜ場所と記憶を結びつけるのか
 * 記憶は出会った文脈ごと思い出すほうが強い。単語帳の順番で思い出すより、
 * 「あの店の看板で見た」という手がかりのほうが自然に引き出せる。
 * このアプリが写真と位置を残しているのは、そのためでもある。
 */

const Input = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  /** 何メートル以内を「ここ」とみなすか。既定150m。 */
  radius_m: z.number().min(30).max(2000).default(150),
  limit: z.number().min(1).max(20).default(5),
});

export type NearbyMemory = {
  sticker_id: string;
  headword: string;
  meaning_ja: string | null;
  location_name: string | null;
  /** 撮ってから何日経ったか。 */
  days_ago: number;
  /** 撮った日そのもの。通知の文面は「何日前」ではなく**日付**で出す。 */
  taken_at: string;
  /** いまいる場所からの距離(m)。 */
  distance_m: number;
  image_url: string | null;
};

/**
 * 2点間の距離(m)。地球を半径6371kmの球とみなすハバーサイン公式。
 * 数百m〜数kmの範囲ならこの近似で十分(誤差は0.5%未満)。
 */
function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const getNearbyMemories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ context, data }): Promise<NearbyMemory[]> => {
    const { supabase, userId } = context;

    // 緯度1度 ≒ 111km。経度は緯度が上がるほど縮む(cosをかける)。
    // まず粗い矩形でDB側を絞ってから、正確な距離で仕上げる。
    // 全件を持ってきて計算すると、単語が増えたときに遅くなる。
    const latPad = data.radius_m / 111_000;
    const lngPad = data.radius_m / (111_000 * Math.max(0.2, Math.cos((data.lat * Math.PI) / 180)));

    const { data: rows, error } = await supabase
      .from("stickers")
      .select(
        "id, lat, lng, location_name, created_at, object_image_url, cutout_image_url, placeholder_image_url, words(headword, meaning_ja)",
      )
      .eq("user_id", userId)
      .not("lat", "is", null)
      .not("lng", "is", null)
      .gte("lat", data.lat - latPad)
      .lte("lat", data.lat + latPad)
      .gte("lng", data.lng - lngPad)
      .lte("lng", data.lng + lngPad)
      .limit(200);
    if (error) throw new Error(error.message);

    type Row = {
      id: string;
      lat: number;
      lng: number;
      location_name: string | null;
      created_at: string;
      object_image_url: string | null;
      cutout_image_url: string | null;
      placeholder_image_url: string | null;
      words: { headword: string; meaning_ja: string | null } | null;
    };

    const now = Date.now();
    return (
      ((rows ?? []) as unknown as Row[])
        .filter((r) => r.words)
        .map((r) => ({
          sticker_id: r.id,
          headword: r.words!.headword,
          meaning_ja: r.words!.meaning_ja,
          location_name: r.location_name,
          days_ago: Math.floor((now - new Date(r.created_at).getTime()) / 86_400_000),
          taken_at: r.created_at,
          distance_m: Math.round(distanceMeters(data.lat, data.lng, r.lat, r.lng)),
          // 落ち方は `sticker-photo.ts` と同じ順(元写真 → 切り抜き →
          // 自撮り → ネット画像)。**サーバ側なので保存パスで持っている**が、
          // 順番だけは画面と揃える。
          image_url: r.object_image_url ?? r.cutout_image_url ?? r.placeholder_image_url,
        }))
        .filter((m) => m.distance_m <= data.radius_m)
        // 撮ったばかりの物を「覚えてる?」と聞いても意味がないので、
        // **1日以上経ったもの**だけを対象にする。
        .filter((m) => m.days_ago >= 1)
        .sort((a, b) => a.distance_m - b.distance_m)
        .slice(0, data.limit)
    );
  });
