import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/**
 * Single switch point for every AI call in the app.
 *
 * Providers (env AI_PROVIDER):
 * - "lovable" (default): Lovable AI Gateway. Needs LOVABLE_API_KEY.
 * - "google": Gemini API via its OpenAI-compatible endpoint. Needs GEMINI_API_KEY.
 * - "openai-compatible": any OpenAI-compatible server. Needs AI_BASE_URL + AI_API_KEY.
 *
 * When AI_PROVIDER is unset we auto-detect from which key is present, keeping
 * the Lovable-hosted deployment working unchanged.
 *
 * Models can be overridden with AI_MODEL_FAST (vision/suggestions/distractors)
 * and AI_MODEL_RICH (card generation, journal correction).
 */

const LOVABLE_BASE_URL = "https://ai.gateway.lovable.dev/v1";
const GOOGLE_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";

const LOVABLE_DEFAULT_MODEL = "google/gemini-3-flash-preview";
const GOOGLE_DEFAULT_MODEL = "gemini-2.5-flash";

export type AiConfig = {
  provider: "lovable" | "google" | "openai-compatible";
  gateway: ReturnType<typeof createOpenAICompatible>;
  modelFast: string;
  modelRich: string;
  /** Proユーザー向け上位モデル(AI_MODEL_RICH_PREMIUM)。未設定なら modelRich。 */
  modelRichPremium: string;
};

function detectProvider(): AiConfig["provider"] {
  const explicit = process.env.AI_PROVIDER;
  if (explicit === "google" || explicit === "openai-compatible" || explicit === "lovable") {
    return explicit;
  }
  // Lovable-free by default: prefer a direct provider. Lovable is opt-in only
  // (AI_PROVIDER=lovable), so a leftover LOVABLE_API_KEY from the old hosting
  // never silently routes AI through the (now unsubscribed) gateway.
  if (process.env.GEMINI_API_KEY) return "google";
  if (process.env.AI_BASE_URL && process.env.AI_API_KEY) return "openai-compatible";
  if (process.env.LOVABLE_API_KEY) return "lovable";
  return "google"; // getAi() throws a clear "set GEMINI_API_KEY" if it's missing
}

export function getAi(): AiConfig {
  const provider = detectProvider();

  if (provider === "google") {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("Missing GEMINI_API_KEY (AI_PROVIDER=google)");
    return {
      provider,
      gateway: createOpenAICompatible({
        name: "google",
        baseURL: GOOGLE_BASE_URL,
        headers: { Authorization: `Bearer ${key}` },
      }),
      modelFast: process.env.AI_MODEL_FAST ?? GOOGLE_DEFAULT_MODEL,
      modelRich: process.env.AI_MODEL_RICH ?? GOOGLE_DEFAULT_MODEL,
      modelRichPremium:
        process.env.AI_MODEL_RICH_PREMIUM ?? process.env.AI_MODEL_RICH ?? GOOGLE_DEFAULT_MODEL,
    };
  }

  if (provider === "openai-compatible") {
    const baseURL = process.env.AI_BASE_URL;
    const key = process.env.AI_API_KEY;
    const model = process.env.AI_MODEL_RICH ?? process.env.AI_MODEL_FAST;
    if (!baseURL || !key) throw new Error("Missing AI_BASE_URL / AI_API_KEY (AI_PROVIDER=openai-compatible)");
    if (!model) throw new Error("Set AI_MODEL_FAST / AI_MODEL_RICH for AI_PROVIDER=openai-compatible");
    return {
      provider,
      gateway: createOpenAICompatible({
        name: "custom",
        baseURL,
        headers: { Authorization: `Bearer ${key}` },
      }),
      modelFast: process.env.AI_MODEL_FAST ?? model,
      modelRich: process.env.AI_MODEL_RICH ?? model,
      modelRichPremium: process.env.AI_MODEL_RICH_PREMIUM ?? process.env.AI_MODEL_RICH ?? model,
    };
  }

  const key = process.env.LOVABLE_API_KEY;
  if (!key) {
    throw new Error(
      "AIキーが設定されていません。LOVABLE_API_KEY か、AI_PROVIDER=google + GEMINI_API_KEY を .env に設定してください。",
    );
  }
  return {
    provider: "lovable",
    gateway: createOpenAICompatible({
      name: "lovable",
      baseURL: LOVABLE_BASE_URL,
      headers: {
        "Lovable-API-Key": key,
        "X-Lovable-AIG-SDK": "vercel-ai-sdk",
      },
    }),
    modelFast: process.env.AI_MODEL_FAST ?? LOVABLE_DEFAULT_MODEL,
    modelRich: process.env.AI_MODEL_RICH ?? LOVABLE_DEFAULT_MODEL,
    modelRichPremium:
      process.env.AI_MODEL_RICH_PREMIUM ?? process.env.AI_MODEL_RICH ?? LOVABLE_DEFAULT_MODEL,
  };
}

/**
 * Proプラン判定(Phase C の土台)。profiles.plan はサーバー/管理者だけが
 * 変更できる(ユーザー側updateMyProfileの許可リストに含めない)。判定に
 * 失敗したら必ず free 扱い — 課金判定のフェイルオープンはしない。
 */
export async function isProUser(userId: string): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("plan")
      .eq("id", userId)
      .maybeSingle();
    if (error) return false;
    return (data as { plan?: string } | null)?.plan === "pro";
  } catch {
    return false;
  }
}

/**
 * TTS goes through the same gateway idea but a different endpoint.
 * Default: Lovable gateway with an OpenAI TTS model. Override with
 * TTS_BASE_URL + TTS_API_KEY (+ TTS_MODEL) for any OpenAI-compatible
 * /audio/speech server.
 */
export type TtsConfig = {
  url: string;
  headers: Record<string, string>;
  model: string;
};

export function getTts(): TtsConfig {
  const baseURL = process.env.TTS_BASE_URL;
  const key = process.env.TTS_API_KEY;
  if (baseURL && key) {
    return {
      url: `${baseURL.replace(/\/$/, "")}/audio/speech`,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      model: process.env.TTS_MODEL ?? "gpt-4o-mini-tts",
    };
  }
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!lovableKey) {
    throw new Error(
      "TTSキーが設定されていません。LOVABLE_API_KEY か TTS_BASE_URL + TTS_API_KEY を設定してください。",
    );
  }
  return {
    url: `${LOVABLE_BASE_URL}/audio/speech`,
    headers: { "Content-Type": "application/json", "Lovable-API-Key": lovableKey },
    model: process.env.TTS_MODEL ?? "openai/gpt-4o-mini-tts",
  };
}

type UsageClient = {
  from: (table: "usage_events") => {
    insert: (row: { user_id: string; kind: string }) => PromiseLike<{ error: unknown }>;
  };
};

/**
 * Best-effort AI usage metering. Never throws: metering must not break the
 * feature being metered (and the usage_events table may not exist yet).
 */
export async function logUsage(supabase: unknown, userId: string, kind: string): Promise<void> {
  try {
    await (supabase as UsageClient).from("usage_events").insert({ user_id: userId, kind });
  } catch {
    /* noop */
  }
}

/**
 * Phase B-2 abuse guard: rolling-24h soft cap per user per AI kind.
 * This is NOT a paywall (constitution: スキャンに課金壁を置かない) — the limits
 * are far above any human usage and only stop runaway loops / scripted abuse
 * from burning the AI budget. Counted via the service role because the
 * authenticated role has no SELECT grant on usage_events.
 */
const DAILY_CAPS: Record<string, number> = {
  scan_detect: 300,
  scan_parts: 300,
  speaking_feedback: 200,
  tts: 500,
  correction: 100,
  card: 200,
  phrase_card: 100,
  suggest: 300,
  removebg: 100, // paid per image — tighter than the free-tier guards
};

export async function assertWithinDailyCap(userId: string, kind: string): Promise<void> {
  const limit = DAILY_CAPS[kind];
  if (!limit) return;
  let count: number | null = null;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const res = await supabaseAdmin
      .from("usage_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("kind", kind)
      .gte("created_at", since);
    if (!res.error) count = res.count;
  } catch {
    // Fail open: a broken meter must never block scanning (§2 保存の摩擦を増やさない).
  }
  if (count != null && count >= limit) {
    throw new Error(
      `1日の利用上限(${limit}回)に達しました。24時間以内に自動で回復します。通常の学習でここに届くことはないため、心当たりがない場合はお問い合わせください。`,
    );
  }
}
