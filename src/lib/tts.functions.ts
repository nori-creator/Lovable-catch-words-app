import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertWithinDailyCap, getTts, logUsage } from "./ai-provider.server";
import { ttsObjectPath, TTS_VOICE_DEFAULT } from "./tts-cache";

const DEFAULT_SPEED = 0.95;
const SIGNED_URL_TTL = 60 * 60 * 6;
// One voice for the whole app (§4.3) — must match scripts/tts-batch too.
const TTS_INSTRUCTIONS =
  "Speak naturally in Taiwan Mandarin (zh-TW) with a warm, friendly tone. Use authentic Taiwanese pronunciation, not mainland Mandarin.";

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

    // Cache hits above are free and unlimited — the cap only meters real synthesis.
    await assertWithinDailyCap(userId, "tts");
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
        instructions: TTS_INSTRUCTIONS,
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`TTS failed: ${res.status} ${t}`);
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    await logUsage(supabase, userId, "tts");

    // Cache writes go through the service role: the shared tts cache must not
    // be client-writable (audio poisoning would corrupt pronunciations for
    // everyone), and the user role has read-only storage access to this bucket.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: upErr } = await supabaseAdmin.storage.from("tts").upload(path, buf, {
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

// --- Admin: pre-generate dictionary audio (§4.3) -----------------------------
//
// Runs INSIDE the deployed server where the TTS key already lives, so no
// service-role key ever has to leave Lovable. The admin page calls this in
// batches until `remaining` hits 0. Cost ≈ 0.1円/語.

const PregenInput = z.object({
  // 2026-07-15: 全音声化 — デフォルトを全レベル(7)に拡大。
  level_max: z.number().int().min(1).max(7).default(7),
  batch: z.number().int().min(1).max(50).default(25),
  dry_run: z.boolean().default(false),
});

export const pregenerateDictionaryTts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PregenInput.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: isAdmin, error: roleErr } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Forbidden: admin role required");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // tocfl_level が null の語(スキャンやAI合成で自動蓄積された新語)も対象に
    // 含める — 「すべての語に音声」が目標。
    const pending = () =>
      supabaseAdmin
        .from("dictionary_entries")
        .select("id, headword", { count: "exact" })
        .eq("language", "zh-TW")
        .is("audio_path", null)
        .or(`tocfl_level.lte.${data.level_max},tocfl_level.is.null`);

    const { count: remainingBefore } = await pending().limit(0);
    if (data.dry_run) {
      return { done: 0, failed: 0, remaining: remainingBefore ?? 0, errors: [] as string[] };
    }

    const { data: entries, error } = await pending()
      .order("tocfl_level", { ascending: true, nullsFirst: false })
      .order("headword", { ascending: true })
      .limit(data.batch);
    if (error) throw new Error(error.message);

    const tts = getTts();
    const deadline = Date.now() + 40_000; // stay inside the server-fn window
    let done = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const entry of entries ?? []) {
      if (Date.now() > deadline) break;
      try {
        const path = await ttsObjectPath("zh-TW", TTS_VOICE_DEFAULT, entry.headword);
        // Reuse audio already cached by on-demand taps.
        const { data: existing } = await supabaseAdmin.storage.from("tts").createSignedUrl(path, 60);
        if (!existing?.signedUrl) {
          const res = await fetch(tts.url, {
            method: "POST",
            headers: tts.headers,
            body: JSON.stringify({
              model: tts.model,
              input: entry.headword,
              voice: TTS_VOICE_DEFAULT,
              response_format: "mp3",
              speed: DEFAULT_SPEED,
              instructions: TTS_INSTRUCTIONS,
            }),
          });
          if (!res.ok) throw new Error(`TTS ${res.status}`);
          const buf = new Uint8Array(await res.arrayBuffer());
          const { error: upErr } = await supabaseAdmin.storage
            .from("tts")
            .upload(path, buf, { contentType: "audio/mpeg", upsert: true });
          if (upErr) throw new Error(`upload: ${upErr.message}`);
        }
        const { error: dbErr } = await supabaseAdmin
          .from("dictionary_entries")
          .update({ audio_path: path })
          .eq("id", entry.id);
        if (dbErr) throw new Error(`db: ${dbErr.message}`);
        done += 1;
      } catch (e) {
        failed += 1;
        if (errors.length < 3) errors.push(`${entry.headword}: ${(e as Error).message}`);
      }
    }

    await logUsage(supabase, userId, "tts_pregen");
    return { done, failed, remaining: Math.max(0, (remainingBefore ?? 0) - done), errors };
  });
