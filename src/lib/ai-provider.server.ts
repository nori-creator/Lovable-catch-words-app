import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, Output } from "ai";
import type { z } from "zod";

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
// 既定モデル。**OpenAI互換エンドポイントに実在するIDだけを書く**。
// 2026-07-27の障害: `-latest` エイリアス(gemini-flash-latest 等)は
// このエンドポイントでは解決されず 404 "Not Found" を返し、
// カード生成とスピーキング添削が全滅した。最新版へ乗り換えたいときは
// 設定の「使うAIを切り替える」から明示的に指定する(env でも可)。
const GOOGLE_DEFAULT_FAST = "gemini-2.5-flash";
const GOOGLE_DEFAULT_RICH = "gemini-2.5-flash";
/** 課金ユーザー向け: Gemini Pro。 */
const GOOGLE_DEFAULT_PREMIUM = "gemini-2.5-pro";

/**
 * 実行時のモデル切替(app_config.key='ai_models')。
 * 管理画面から provider / モデル名を書き換えられるので、ChatGPT・Claude・
 * DeepSeek・Kimi へ再デプロイなしで乗り換えられる。env はフォールバック。
 */
export type AiModelOverride = {
  provider?: string;
  base_url?: string;
  /** APIキーは env 名で参照する(鍵そのものはDBに置かない)。 */
  api_key_env?: string;
  fast?: string;
  rich?: string;
  rich_premium?: string;
};

let overrideCache: { at: number; value: AiModelOverride | null } = { at: 0, value: null };

/** 30秒キャッシュ付きでモデル上書き設定を読む(呼び出しごとのDB往復を避ける)。 */
export async function getAiModelOverride(): Promise<AiModelOverride | null> {
  const now = Date.now();
  if (now - overrideCache.at < 30_000) return overrideCache.value;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // app_config は生成済みの型定義より新しいテーブル(マイグレーション
    // 20260727100000)。型を再生成するまでは緩いクライアントとして扱う。
    const db = supabaseAdmin as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (k: string, v: string) => { maybeSingle: () => Promise<{ data: unknown }> };
        };
      };
    };
    const { data } = await db
      .from("app_config")
      .select("value")
      .eq("key", "ai_models")
      .maybeSingle();
    const value = ((data as { value?: AiModelOverride } | null)?.value ?? null) as AiModelOverride | null;
    overrideCache = { at: now, value };
    return value;
  } catch {
    overrideCache = { at: now, value: null };
    return null;
  }
}

/** 既知プロバイダの OpenAI 互換エンドポイント。 */
export const PROVIDER_PRESETS: Record<string, { base_url: string; api_key_env: string; label: string }> = {
  google: { base_url: GOOGLE_BASE_URL, api_key_env: "GEMINI_API_KEY", label: "Google Gemini" },
  openai: { base_url: "https://api.openai.com/v1", api_key_env: "OPENAI_API_KEY", label: "OpenAI (ChatGPT)" },
  anthropic: { base_url: "https://api.anthropic.com/v1", api_key_env: "ANTHROPIC_API_KEY", label: "Anthropic Claude" },
  deepseek: { base_url: "https://api.deepseek.com/v1", api_key_env: "DEEPSEEK_API_KEY", label: "DeepSeek" },
  kimi: { base_url: "https://api.moonshot.ai/v1", api_key_env: "MOONSHOT_API_KEY", label: "Kimi (Moonshot)" },
  lovable: { base_url: LOVABLE_BASE_URL, api_key_env: "LOVABLE_API_KEY", label: "Lovable Gateway" },
};

/**
 * app_config の上書きがあればそれを使って AiConfig を組む。
 * 上書きが無い/キーが無いときは env ベースの getAi() に落ちる。
 */
export async function getAiRuntime(): Promise<AiConfig> {
  const ov = await getAiModelOverride();
  if (!ov?.provider) return getAi();
  const preset = PROVIDER_PRESETS[ov.provider];
  const baseURL = ov.base_url ?? preset?.base_url;
  const keyEnv = ov.api_key_env ?? preset?.api_key_env;
  const key = keyEnv ? process.env[keyEnv] : undefined;
  if (!baseURL || !key) return getAi(); // 設定が不完全なら安全に env 側へ
  const fast = ov.fast ?? GOOGLE_DEFAULT_FAST;
  const rich = ov.rich ?? fast;
  return {
    provider: "openai-compatible",
    gateway: createOpenAICompatible({
      name: ov.provider,
      baseURL,
      headers:
        ov.provider === "anthropic"
          ? { "x-api-key": key, "anthropic-version": "2023-06-01" }
          : { Authorization: `Bearer ${key}` },
    }),
    modelFast: fast,
    modelRich: rich,
    modelRichPremium: ov.rich_premium ?? rich,
  };
}

/**
 * モデルIDが存在しないと provider は 404 "Not Found" を返し、その機能が
 * まるごと死ぬ(2026-07-27の障害)。**モデル指定ミスでアプリを止めない**ため、
 * 404/400 のときだけ既知の安定モデルで1回だけやり直すラッパー。
 *
 * 使い方: `withModelFallback(ai, ai.modelRichPremium, (m) => generateText({model: ai.gateway(m), ...}))`
 */
export async function withModelFallback<T>(
  ai: AiConfig,
  preferred: string,
  run: (model: string) => Promise<T>,
): Promise<T> {
  try {
    return await run(preferred);
  } catch (e) {
    const msg = (e as Error)?.message ?? "";
    const looksMissingModel =
      /not found|404|does not exist|unknown model|invalid model|unsupported model/i.test(msg);
    const fallback = ai.provider === "google" ? GOOGLE_DEFAULT_FAST : ai.modelRich;
    if (!looksMissingModel || fallback === preferred) throw e;
    console.warn(`[ai] model "${preferred}" unavailable (${msg.slice(0, 120)}) — falling back to "${fallback}"`);
    return await run(fallback);
  }
}

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
      modelFast: process.env.AI_MODEL_FAST ?? GOOGLE_DEFAULT_FAST,
      modelRich: process.env.AI_MODEL_RICH ?? GOOGLE_DEFAULT_RICH,
      // 課金ユーザーは Gemini Pro(最新)。env で上書きも可能。
      modelRichPremium: process.env.AI_MODEL_RICH_PREMIUM ?? GOOGLE_DEFAULT_PREMIUM,
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

/** Pull a JSON object out of AI text that may carry fences or prose around it. */
export function parseJsonFromAiText(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return JSON.parse(fenced[1]);
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
  return JSON.parse(trimmed);
}

/**
 * Structured generation that survives Gemini's flaky OpenAI-compatible
 * structured output. `result.experimental_output` is a getter that THROWS
 * "No object generated: response did not match schema" — so `out ?? fallback`
 * never falls back; every feature built on Output.object (card, journal,
 * speaking, audit, synth) was failing whenever the provider hiccuped.
 *
 * Order of attempts:
 *  1. Output.object, then the same response's raw text re-parsed as JSON
 *  2. a fresh plain-text call with a "JSONのみ" instruction (the pattern that
 *     keeps suggestWords stable), parsed + schema-validated
 */
export async function generateStructured<S extends z.ZodTypeAny>(opts: {
  model: Parameters<typeof generateText>[0]["model"];
  prompt: string;
  schema: S;
  /** モデルが存在しない(404)ときに1度だけ使う代替モデル。 */
  fallbackModel?: Parameters<typeof generateText>[0]["model"];
}): Promise<z.infer<S>> {
  try {
    const result = await generateText({
      model: opts.model,
      prompt: opts.prompt,
      experimental_output: Output.object({ schema: opts.schema }) as never,
    });
    try {
      const out = (result as unknown as { experimental_output?: unknown }).experimental_output;
      if (out != null) return opts.schema.parse(out);
    } catch {
      /* NoObjectGeneratedError — try the raw text below */
    }
    try {
      return opts.schema.parse(parseJsonFromAiText(result.text));
    } catch {
      /* fall through to the plain-text retry */
    }
  } catch {
    /* the call itself failed — retry once in plain-text mode */
  }

  // 最後の砦: プレーンテキストでもう一度。モデルIDが無効(404)なら
  // fallbackModel で1回だけ試す — モデル指定ミスで機能を殺さない。
  const plainPrompt =
    `${opts.prompt}\n\n` +
    `重要: 出力は要求されたキーを持つ有効なJSONオブジェクトのみ。` +
    `説明文・前置き・後書きは一切書かない(\`\`\`jsonフェンスは可)。`;
  try {
    const retry = await generateText({ model: opts.model, prompt: plainPrompt });
    return opts.schema.parse(parseJsonFromAiText(retry.text));
  } catch (e) {
    const msg = (e as Error)?.message ?? "";
    if (!opts.fallbackModel || !/not found|404|does not exist|unknown model|invalid model/i.test(msg)) {
      throw e;
    }
    console.warn(`[ai] structured call fell back to the safe model (${msg.slice(0, 120)})`);
    const retry = await generateText({ model: opts.fallbackModel, prompt: plainPrompt });
    return opts.schema.parse(parseJsonFromAiText(retry.text));
  }
}

/**
 * 学習者の目標レベル(profiles.level_goal, 例 "TOCFL-2")。AIプロンプトの
 * 語彙難易度をユーザーレベルに合わせるために使う。失敗時はβの既定値。
 */
export async function getUserLevelGoal(userId: string): Promise<string> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("level_goal")
      .eq("id", userId)
      .maybeSingle();
    const goal = (data as { level_goal?: string } | null)?.level_goal;
    return goal && goal.trim() ? goal : "TOCFL-2";
  } catch {
    return "TOCFL-2";
  }
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
    if ((data as { plan?: string } | null)?.plan === "pro") return true;
    // 開発者(admin)は Pro 扱い — 課金機能を自分で試せないと検証できない。
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    return Boolean(isAdmin);
  } catch {
    return false;
  }
}

/**
 * 学習者の現在レベルと目標レベル(TOCFL)。生成物の語彙・文法は
 * 「現在レベル〜目標レベル」の帯に収めるのが最も伸びる(i+1)。
 * current_level が未設定なら目標の1つ下を現在とみなす。
 */
export async function getUserLevels(userId: string): Promise<{ current: string; goal: string }> {
  const goal = await getUserLevelGoal(userId);
  const goalNum = Number(goal.match(/(\d)/)?.[1] ?? 2);
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("current_level")
      .eq("id", userId)
      .maybeSingle();
    const cur = (data as { current_level?: string | null } | null)?.current_level;
    if (cur && cur.trim()) return { current: cur, goal };
  } catch { /* 列が無い環境ではフォールバック */ }
  return { current: `TOCFL-${Math.max(1, goalNum - 1)}`, goal };
}

/** プロンプトに差し込むレベル指示の共通文(現在→目標の帯に収める)。 */
export async function levelInstruction(userId: string): Promise<string> {
  const { current, goal } = await getUserLevels(userId);
  return (
    `学習者の現在レベル: ${current}、目標レベル: ${goal}(TOCFL)。` +
    `語彙・文法は ${current} を土台に ${goal} までの範囲で選び、` +
    `${goal} を超える難語・難構文は使わない(どうしても必要なら短い注釈を添える)。`
  );
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
