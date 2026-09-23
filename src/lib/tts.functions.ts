import { createServerFn } from "@tanstack/react-start";
import { DEFAULT_TARGET_LANGUAGE } from "./target-lang";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertWithinDailyCap, getTts, logUsage } from "./ai-provider.server";
import { ttsObjectPath, TTS_VOICE_DEFAULT } from "./tts-cache";
import { ttsVoiceFor, withVoiceOverride } from "./tts-voice";
import { cleanTtsConfig, TTS_LANGUAGES, TTS_PROVIDERS, type TtsChoice } from "./tts-providers";

const DEFAULT_SPEED = 0.95;
const SIGNED_URL_TTL = 60 * 60 * 6;

const Input = z.object({
  text: z.string().min(1).max(400),
  voice: z.string().optional().default(TTS_VOICE_DEFAULT),
  speed: z.number().optional().default(DEFAULT_SPEED),
  language: z.string().optional().default(DEFAULT_TARGET_LANGUAGE),
});

/**
 * Server-side TTS with a storage cache: each (language, voice, text) is
 * synthesized once, stored as mp3 in the `tts` bucket, and served via signed
 * URL afterwards. If the bucket doesn't exist yet (migration not applied) we
 * fall back to returning a base64 data URL so playback still works.
 */
/**
 * Synthesize `text` to MP3 bytes **in the learner's target language**.
 * - Preferred: Google Cloud Text-to-Speech (neural) when GOOGLE_TTS_API_KEY
 *   is set — one consistent accent for every device, so pronunciation never
 *   depends on which voices a phone ships.
 * - Fallback: any OpenAI-compatible /audio/speech server (getTts()).
 * Throws when no server TTS is configured; callers keep a device-voice fallback.
 *
 * **声の表はここに書かない**(`tts-voice.ts`)。以前ここに台湾華語の声が
 * 3箇所バラバラに直書きされていて、英語を足した日に全部が食い違った。
 */
/** レート制限(429)・一時的な5xxは待って再試行する。 */
async function fetchWithBackoff(url: string, init: RequestInit, attempts = 4): Promise<Response> {
  let lastStatus = 0;
  let lastBody = "";
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(url, init);
    if (res.ok) return res;
    lastStatus = res.status;
    lastBody = await res.text().catch(() => "");
    const retryable = res.status === 429 || res.status === 503 || res.status >= 500;
    if (!retryable || i === attempts - 1) break;
    // Retry-After があれば従い、無ければ 0.8s → 1.6s → 3.2s。
    const ra = Number(res.headers.get("retry-after"));
    const waitMs = Number.isFinite(ra) && ra > 0 ? ra * 1000 : 800 * 2 ** i;
    await new Promise((r) => setTimeout(r, Math.min(waitMs, 6000)));
  }
  throw new Error(`TTS ${lastStatus} ${lastBody.slice(0, 160)}`);
}

async function synthesizeMp3(text: string, speed: number, language: string): Promise<Uint8Array> {
  const voice = withVoiceOverride(ttsVoiceFor(language), language, process.env.GOOGLE_TTS_VOICE);
  const gKey = process.env.GOOGLE_TTS_API_KEY;
  if (gKey) {
    const res = await fetchWithBackoff(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${gKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode: voice.googleLanguageCode, name: voice.googleVoice },
          audioConfig: { audioEncoding: "MP3", speakingRate: speed },
        }),
      },
    );
    const json = (await res.json()) as { audioContent?: string };
    if (!json.audioContent) throw new Error("TTS empty response");
    const bin = atob(json.audioContent);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  const tts = getTts();
  const res = await fetchWithBackoff(tts.url, {
    method: "POST",
    headers: tts.headers,
    body: JSON.stringify({
      model: tts.model,
      input: text,
      voice: TTS_VOICE_DEFAULT,
      response_format: "mp3",
      speed,
      instructions: voice.instructions,
    }),
  });
  return new Uint8Array(await res.arrayBuffer());
}

export const synthesizeSpeech = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    /**
     * **声は開発者の設定で決める**（`tts_voice`、オーナー指示 2026-09-23）。
     * 置き場所には声の札を混ぜる — 声を変えたら別の置き場所になり、古い声は
     * 鳴らない。何も選んでいなければ札は `data.voice`（= これまでの `alloy`）。
     */
    const { activeChoice } = await import("./tts-provider.server");
    const { voiceTag } = await import("./tts-providers");
    const choice = await activeChoice(data.language);
    const tag = choice ? voiceTag(choice) : data.voice;
    const keyFor = (t: string) => (data.speed === DEFAULT_SPEED ? t : `${t}@${data.speed}`);
    let path = await ttsObjectPath(data.language, keyFor(tag), data.text);

    const { data: cached } = await supabase.storage
      .from("tts")
      .createSignedUrl(path, SIGNED_URL_TTL);
    if (cached?.signedUrl) return { audio_url: cached.signedUrl };

    // Cache hits above are free and unlimited — the cap only meters real synthesis.
    await assertWithinDailyCap(userId, "tts");
    let buf: Uint8Array;
    if (choice) {
      try {
        const { synthesizeWithChoice } = await import("./tts-provider.server");
        buf = await synthesizeWithChoice(choice, data.text, data.speed, data.language);
      } catch (e) {
        // 選んだ会社が駄目なとき（鍵が無い・落ちている）は、黙らせずに
        // これまでの声で鳴らす。**その音はこれまでの置き場所に貯める** —
        // 新しい声の置き場所に古い声を入れると、直った後も古い声が鳴り続ける。
        console.warn("[tts] provider failed, falling back:", (e as Error).message);
        buf = await synthesizeMp3(data.text, data.speed, data.language);
        path = await ttsObjectPath(data.language, keyFor(TTS_VOICE_DEFAULT), data.text);
      }
    } else {
      buf = await synthesizeMp3(data.text, data.speed, data.language);
    }
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
      const { data: signed } = await supabase.storage
        .from("tts")
        .createSignedUrl(path, SIGNED_URL_TTL);
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
  /**
   * どの学習言語の辞書を音声化するか。
   *
   * **引く行と合成する声が同じ値を見る**ようにするための引数。
   * 前は問い合わせが `DEFAULT_TARGET_LANGUAGE` で絞り、合成の側は
   * 台湾華語の声を直に持っていたので、片方だけ直すと**中国語の行に
   * 英語の声**(またはその逆)が付き、しかも音は保存済みなので
   * 誰かが聞くまで気づけない。
   */
  language: z.string().optional().default(DEFAULT_TARGET_LANGUAGE),
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

    // **引く行と合成する声で同じ値を使う。** 別々に書くと食い違う。
    const { normalizeTargetLanguage } = await import("./target-lang");
    const language = normalizeTargetLanguage(data.language);
    // 開発者が選んだ声（無ければこれまでの声）。**声を変えたら作り直す** —
    // 前の声の置き場所を指している行も「まだ」に数える。
    const { activeChoice, synthesizeWithChoice } = await import("./tts-provider.server");
    const { voiceTag } = await import("./tts-providers");
    const choice = await activeChoice(language);
    const tag = voiceTag(choice);

    // tocfl_level が null の語(スキャンやAI合成で自動蓄積された新語)も対象に
    // 含める — 「すべての語に音声」が目標。
    const pending = () =>
      supabaseAdmin
        .from("dictionary_entries")
        .select("id, headword", { count: "exact" })
        .eq("language", language)
        .or(`audio_path.is.null,audio_path.not.like.${language}/${tag}/*`)
        .or(`tocfl_level.lte.${data.level_max},tocfl_level.is.null`);

    const { count: remainingBefore } = await pending().limit(0);
    if (data.dry_run) {
      return { done: 0, failed: 0, remaining: remainingBefore ?? 0, errors: [] as string[] };
    }

    // **やさしい語・よく出る語から先に音を付ける。**
    // `tocfl_level` は台湾華語の欄で、英語の行は全部 null。それだけで
    // 並べると英語は事実上アルファベット順になり、25,595 語のうち
    // 最初に音が付くのが "aardvark" になる。級(`level_step`)→
    // 頻度(`freq_rank`)→綴り、の順で見る。どちらの言語でも意味を持つ。
    const { data: entries, error } = await pending()
      .order("level_step", { ascending: true, nullsFirst: false })
      .order("freq_rank", { ascending: true, nullsFirst: false })
      .order("headword", { ascending: true })
      .limit(data.batch);
    if (error) throw new Error(error.message);

    const deadline = Date.now() + 40_000; // stay inside the server-fn window
    let done = 0;
    let failed = 0;
    const errors: string[] = [];

    let consecutiveRateLimited = 0;
    for (const entry of entries ?? []) {
      if (Date.now() > deadline) break;
      // 429が3連続したらこのバッチは中断 — 叩き続けても失敗が増えるだけ。
      if (consecutiveRateLimited >= 3) break;
      try {
        const path = await ttsObjectPath(language, tag, entry.headword);
        // Reuse audio already cached by on-demand taps.
        const { data: existing } = await supabaseAdmin.storage
          .from("tts")
          .createSignedUrl(path, 60);
        if (!existing?.signedUrl) {
          // 作り置きでは落とさない（落とすと、新しい声の置き場所に古い声が入る）。
          const buf = choice
            ? await synthesizeWithChoice(choice, entry.headword, DEFAULT_SPEED, language)
            : await synthesizeMp3(entry.headword, DEFAULT_SPEED, language);
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
        consecutiveRateLimited = 0;
      } catch (e) {
        failed += 1;
        const msg = (e as Error).message;
        if (/\b429\b|rate_limited/i.test(msg)) consecutiveRateLimited += 1;
        else consecutiveRateLimited = 0;
        if (errors.length < 3) errors.push(`${entry.headword}: ${msg}`);
      }
    }

    await logUsage(supabase, userId, "tts_pregen");
    return { done, failed, remaining: Math.max(0, (remainingBefore ?? 0) - done), errors };
  });

// --- 発音の声（開発者だけが選ぶ。オーナー指示 2026-09-23）--------------------

/**
 * 学習言語ごとの**声の札**。端末は音をこの札つきの鍵で貯めるので、開発者が
 * 声を変えたら端末の古い音も使われなくなる。誰でも読める（値は札だけ）。
 */
export const getTtsVoiceTags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { currentVoiceTag } = await import("./tts-provider.server");
    const tags: Record<string, string> = {};
    for (const lang of TTS_LANGUAGES) tags[lang] = await currentVoiceTag(lang);
    return { tags };
  });

async function assertAdmin(context: { supabase: unknown; userId: string }) {
  const sb = context.supabase as {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  };
  const { data: isAdmin, error } = await sb.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!isAdmin) throw new Error("管理者のみ");
}

/** いまの設定と、各社の鍵が揃っているか（鍵の値は返さない）。 */
export const getTtsVoiceAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { providerKeysPresent } = await import("./tts-provider.server");
    const { data, error } = await context.supabase
      .from("app_config")
      .select("value")
      .eq("key", "tts_voice")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      config: cleanTtsConfig((data as { value?: unknown } | null)?.value ?? {}),
      providers: TTS_PROVIDERS.map((p) => ({
        ...p,
        voices: p.voices as Record<string, string[]>,
        keys_present: providerKeysPresent(p.id),
      })),
      languages: [...TTS_LANGUAGES],
      legacy: process.env.GOOGLE_TTS_API_KEY ? "Google Cloud TTS" : "OpenAI 互換 TTS",
    };
  });

export const setTtsVoiceAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ config: z.unknown() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const clean = cleanTtsConfig(data.config);
    const { error } = await context.supabase.from("app_config").upsert({
      key: "tts_voice",
      value: clean,
      updated_at: new Date().toISOString(),
      updated_by: context.userId,
    });
    if (error) throw new Error("設定を保存できませんでした");
    const { forgetTtsVoiceConfig } = await import("./tts-provider.server");
    forgetTtsVoiceConfig();
    return { ok: true, config: clean };
  });

/**
 * **試しに鳴らす**（保存も課金の記録もしない）。かかった時間も返す —
 * 「速さと正確性が命」なので、会社ごとの速さをその場で比べられるように。
 */
export const previewTtsVoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        language: z.string(),
        text: z.string().min(1).max(200),
        choice: z.object({
          provider: z.string(),
          voice: z.string(),
          model: z.string().optional(),
        }),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const cleaned = cleanTtsConfig({ languages: { [data.language]: data.choice } });
    const choice = cleaned.languages?.[data.language] as TtsChoice | undefined;
    if (!choice) throw new Error("この会社・声は使えません（未接続か、声の ID が空）");
    const { synthesizeWithChoice } = await import("./tts-provider.server");
    const t0 = Date.now();
    const buf = await synthesizeWithChoice(choice, data.text, DEFAULT_SPEED, data.language);
    const ms = Date.now() - t0;
    let binary = "";
    for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
    return { audio_url: `data:audio/mpeg;base64,${btoa(binary)}`, ms };
  });
