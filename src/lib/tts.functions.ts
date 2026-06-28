import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({
  text: z.string().min(1).max(400),
  voice: z.string().optional().default("alloy"),
  speed: z.number().optional().default(0.95),
});

/**
 * Server-side TTS via Lovable AI Gateway (openai/gpt-4o-mini-tts).
 * Returns a base64 data URL the browser can play directly.
 */
export const synthesizeSpeech = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini-tts",
        input: data.text,
        voice: data.voice,
        response_format: "mp3",
        speed: data.speed,
        instructions:
          "Speak naturally in Taiwan Mandarin (zh-TW) with a warm, friendly tone. Use authentic Taiwanese pronunciation, not mainland Mandarin.",
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`TTS failed: ${res.status} ${t}`);
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    let binary = "";
    for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
    const b64 = btoa(binary);
    return { audio_data_url: `data:audio/mpeg;base64,${b64}` };
  });
