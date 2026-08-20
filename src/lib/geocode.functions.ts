import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { pickAreaName, pickPlaceName, placeLine, type GeocodeResult } from "./place-name";

const Input = z.object({
  lat: z.number(),
  lng: z.number(),
  /**
   * 地名をどの言葉で受け取るか。
   * **既定は台湾華語**(`zh-TW`) — このアプリが教える言葉で、
   * その場の看板に実際に書かれている名前でもある。
   * `Taipei City` のような英語が出ていたのは、ここが指定されないまま
   * 呼ばれた古い経路の名残(オーナー指摘 2026-08-20)。
   */
  language: z.string().default("zh-TW"),
});

export const geocodeLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    const lovableKey = process.env.LOVABLE_API_KEY;
    if (!apiKey || !lovableKey) {
      return { location_name: null as string | null, place: null, area: null };
    }
    const lang = encodeURIComponent(data.language || "zh-TW");
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
