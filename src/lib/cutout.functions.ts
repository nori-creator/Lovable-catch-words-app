import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertWithinDailyCap, logUsage } from "./ai-provider.server";

const Input = z.object({
  // Same 8MB base64 cap as detectScan.
  imageBase64: z.string().min(100).max(8_000_000),
});

/**
 * Professional cutout via remove.bg (roadmap B2: 最速で精度の高いもの).
 * Enabled by setting REMOVE_BG_API_KEY in Lovable secrets — without the key
 * this returns { available: false } and the client keeps the free in-browser
 * pipeline (@imgly). Paid per image, so it gets its own tight daily cap.
 */
export const removeBackgroundApi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ context, data }) => {
    const key = process.env.REMOVE_BG_API_KEY;
    if (!key) return { available: false as const, image: null };

    const { supabase, userId } = context;
    await assertWithinDailyCap(userId, "removebg");

    const b64 = data.imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const res = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: { "X-Api-Key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        image_file_b64: b64,
        // "auto" = full resolution (1 credit). REMOVE_BG_SIZE=preview uses the
        // free/cheap 0.25MP tier — fine for sticker-size cutouts.
        size: process.env.REMOVE_BG_SIZE ?? "auto",
        format: "png",
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`remove.bg failed: ${res.status} ${t.slice(0, 200)}`);
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    await logUsage(supabase, userId, "removebg");

    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < buf.length; i += chunk) {
      binary += String.fromCharCode(...buf.subarray(i, i + chunk));
    }
    return { available: true as const, image: `data:image/png;base64,${btoa(binary)}` };
  });
