import { createServerFn } from "@tanstack/react-start";
import { MAP_DISPLAY_LANGUAGE } from "./target-lang";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { pickAreaName, pickPlaceName, placeLine, type GeocodeResult } from "./place-name";

const Input = z.object({
  lat: z.number(),
  lng: z.number(),
  /**
   * 地名をどの言葉で受け取るか。
   *
   * **渡さないときは、その人の表示言語で受け取る。**
   * ここは `zh-TW` の決め打ちだった。呼んでいる2箇所(撮る道・かざす道)は
   * どちらも渡していないので、**日本語の画面の人にも中文の地名**が返って
   * いた。地名は「読んで場所を思い出す」ためのものなので、読める言葉で要る。
   *
   * `zh-TW` に意味が無いわけではない — 台湾では看板に実際にそう書いてある。
   * だから読める言葉が取れないときの落とし所は今までどおり `zh-TW`。
   */
  language: z.string().optional(),
});

export const geocodeLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    const lovableKey = process.env.LOVABLE_API_KEY;
    if (!apiKey || !lovableKey) {
      return { location_name: null as string | null, place: null, area: null };
    }
    const lang = encodeURIComponent(data.language || (await readerMapLanguage(userId)));
    const url = `https://connector-gateway.lovable.dev/google_maps/maps/api/geocode/json?latlng=${data.lat},${data.lng}&language=${lang}`;
    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": apiKey,
        },
      });
      if (!res.ok) return { location_name: null, place: null, area: null };
      const json = (await res.json()) as { results?: GeocodeResult[] };
      // **いちばん具体的な名前を採る**(`lib/place-name.ts`、試験14件)。
      // 以前は行政区画しか見ておらず、区が取れない点では**市の名前**に
      // 落ちていた。「台北市」では撮った場所の記憶は戻ってこない。
      const specific = pickPlaceName(json.results);
      const area = pickAreaName(json.results);
      return {
        location_name: placeLine(specific, area),
        /** 保存や表示で使い分けられるよう、粒度も返す。 */
        place: specific,
        area,
      };
    } catch (e) {
      console.error("geocode error", e);
      return { location_name: null, place: null, area: null };
    }
  });

/**
 * 地名を受け取る言葉。**表示言語に従う。**
 *
 * 読めない字の地名は、地名が無いのとほとんど同じ
 * (オーナー指摘「位置情報は『地図を開く』でなく具体的な地名を表示して」の
 * 裏側 — 名前は在っても読めなければ押す気にならない)。
 * 読めなければ台湾の看板の言葉に落とす。
 */
async function readerMapLanguage(userId: string): Promise<string> {
  try {
    const { getExplanationLanguage } = await import("./ai-provider.server");
    return await getExplanationLanguage(userId);
  } catch {
    return MAP_DISPLAY_LANGUAGE;
  }
}
