import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({
  lat: z.number(),
  lng: z.number(),
});

export const geocodeLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    const lovableKey = process.env.LOVABLE_API_KEY;
    if (!apiKey || !lovableKey) {
      return { location_name: null as string | null };
    }
    const url = `https://connector-gateway.lovable.dev/google_maps/maps/api/geocode/json?latlng=${data.lat},${data.lng}&language=ja`;
    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": apiKey,
        },
      });
      if (!res.ok) return { location_name: null };
      const json = (await res.json()) as {
        results?: Array<{ formatted_address?: string; address_components?: Array<{ long_name: string; types: string[] }> }>;
      };
      const first = json.results?.[0];
      if (!first) return { location_name: null };
      // Pick a friendly short name
      const comps = first.address_components ?? [];
      const locality =
        comps.find((c) => c.types.includes("sublocality_level_1") || c.types.includes("sublocality"))?.long_name ||
        comps.find((c) => c.types.includes("locality"))?.long_name ||
        comps.find((c) => c.types.includes("administrative_area_level_1"))?.long_name;
      return { location_name: locality ?? first.formatted_address ?? null };
    } catch (e) {
      console.error("geocode error", e);
      return { location_name: null };
    }
  });
