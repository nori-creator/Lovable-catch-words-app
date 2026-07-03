import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { getTts, logUsage } from "./ai-provider.server";
import { ttsObjectPath, TTS_VOICE_DEFAULT } from "./tts-cache";

const DEFAULT_SPEED = 0.95;
const SIGNED_URL_TTL = 60 * 60 * 6;

const Input = z.object({
  text: z.string().min(1).max(400),
  voice: z.string().optional().default(TTS_VOICE_DEFAULT),
  speed: z.number().optional().default(DEFAULT_SPEED),
  language: z.string().optional().default("zh-TW"),
});

/**
 * Server-side TTS with a storage cache: each (language, voice, text) is
 * synthesized once, stored as mp3 in the `tts` bucket, and served via signed
 * URL afterwards. If the bucket doesn't exist yet (migration not applied) we
 * fall back to returning a base64 data URL so playback still works.
 */
export const synthesizeSpeech = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const voiceKey = data.speed === DEFAULT_SPEED ? data.voice : `${data.voice}@${data.speed}`;
    const path = await ttsObjectPath(data.language, voiceKey, data.text);

    const { data: cached } = await supabase.storage.from("tts").createSignedUrl(path, SIGNED_URL_TTL);
    if (cached?.signedUrl) return { audio_url: cached.signedUrl };

    const tts = getTts();
    const res = await fetch(tts.url, {
      method: "POST",
      headers: tts.headers,
      body: JSON.stringify({
        model: tts.model,
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
    await logUsage(supabase, userId, "tts");

    const { error: upErr } = await supabase.storage.from("tts").upload(path, buf, {
      contentType: "audio/mpeg",
      upsert: true,
    });
    if (!upErr) {
      const { data: signed } = await supabase.storage.from("tts").createSignedUrl(path, SIGNED_URL_TTL);
      if (signed?.signedUrl) return { audio_url: signed.signedUrl };
    }

    let binary = "";
    for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
    return { audio_url: `data:audio/mpeg;base64,${btoa(binary)}` };
  });
