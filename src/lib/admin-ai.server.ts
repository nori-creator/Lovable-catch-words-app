/**
 * **開発者の「AI の設定」の中身**（Web の設定画面と iOS の開発者画面の両方が使う）。
 *
 * 約束（`docs/admin-ai-api.md` に JSON の例つきで書いてある — iOS はそちらを読む）:
 * - 呼べるのは管理者だけ。管理者でない人の読み取りは `{ isAdmin: false }` だけを返し、
 *   書き込みは `Forbidden` で断る（`/api/native-fn` では 403）。
 * - **鍵の値は絶対に返さない。** 返すのは「鍵が入っているか」（`hasKey`）だけ。
 * - 保存先はどれも `app_config`（`ai_models` / `image_generation` / `tts_voice`）。
 *
 * 中身は**差し込める道具（`AdminAiDeps`）**の上に書いてある — 試験では DB・鍵・通信を
 * 偽物に差し替えて、権限・秘密の漏れ・保存と読み戻しを確かめる（`admin-ai.test.ts`）。
 * 本物の道具は `realAdminAiDeps`（`admin-ai.functions.ts` から使う）。
 */
import { z } from "zod";
import {
  AI_FEATURES,
  AUTO,
  isAiFeature,
  normalizeFeatureValue,
  parseFeatureValue,
  type AiFeature,
  type AiTier,
} from "./ai-features";
import { parseModelList, supportsVision } from "./ai-provider-models";
import { DICT, UI_LANGS, type UiLang } from "./i18n";
import {
  DEFAULT_HIGGSFIELD_IMAGE_MODEL,
  DEFAULT_GOOGLE_IMAGE_MODEL,
  DEFAULT_LOVABLE_IMAGE_MODEL,
  DEFAULT_OPENAI_IMAGE_MODEL,
  DEFAULT_OPENROUTER_IMAGE_MODEL,
  resolveImageConfig,
  type ImageProviderId,
} from "./image-provider";
import {
  TAIWAN_AZURE_VOICES,
  TAIWAN_LANGUAGE,
  TTS_LANGUAGES,
  TTS_PROVIDERS,
  cleanTtsConfig,
  taiwanChoice,
  type TaiwanGender,
  type TtsVoiceConfig,
} from "./tts-providers";

/** 管理者でない人が書こうとした時の文言（`native-fn.ts` が 403 にする）。 */
export const ADMIN_ONLY_MESSAGE = "Forbidden: 管理者だけが使えます";

export type AppConfigKey = "ai_models" | "image_generation" | "tts_voice";

/** AI の会社の一覧の1行（鍵の値は持たない）。 */
export type AiProviderListing = {
  id: string;
  name: string;
  hasKey: boolean;
  /** その鍵でいま使えるモデル（鍵の無い会社は空）。 */
  models: string[];
  /** そのうち写真を読めるモデル（スキャンに選べる物）。 */
  visionModels: string[];
  /** 一覧を取れなかった理由（鍵はある）。 */
  error: string | null;
};

export type AdminAiDeps = {
  isAdmin: () => Promise<boolean>;
  readConfig: (key: AppConfigKey) => Promise<unknown>;
  writeConfig: (key: AppConfigKey, value: unknown) => Promise<void>;
  /** AI の会社の一覧（鍵の有無とモデル）。 */
  aiProviders: () => Promise<AiProviderListing[]>;
  /** その機能がいま実際に使う会社とモデル。 */
  describeFeature: (
    feature: AiFeature,
  ) => Promise<{ provider: string; model: string; resolved: string } | { error: string }>;
  /** 既定の AI が動くか（鍵が1つも無いと全部止まる）。 */
  aiStatus: () => { ok: boolean; provider: string | null; error: string | null };
  imageKeys: () => Record<Exclude<ImageProviderId, "off">, boolean>;
  imageEnv: () => Record<string, string | undefined>;
  ttsHasKey: (provider: string) => boolean;
  /** 発音の「既定の声」（何も選ばない時に鳴る仕組み）の名前。 */
  ttsDefaultEngine: () => string;
  /** 保存の後に、ためてある設定を捨てる（次の呼び出しから新しい設定で動く）。 */
  afterWrite?: (key: AppConfigKey) => void;
};

/**
 * **送った値が使えない**（知らない機能・会社、形の違う「会社:モデル」、鍵の無い会社、
 * 写真を読めないモデルのスキャン、使えない声 等）。`native-fn.ts` が 400 にする
 * （直せるのは送る側なので 500 にしない）。
 */
export class BadRequestError extends Error {
  override name = "BadRequestError";
}

async function assertAdmin(deps: AdminAiDeps) {
  if (!(await deps.isAdmin())) throw new Error(ADMIN_ONLY_MESSAGE);
}

/** 表示言語ごとの文言（iOS は自分の辞書を持たずにこれを出せる）。 */
type Label = Record<UiLang, string>;
function label(key: string): Label {
  const out = {} as Label;
  for (const lang of UI_LANGS) out[lang] = DICT[key]?.[lang] ?? DICT[key]?.ja ?? key;
  return out;
}

// ---- 画像 ----------------------------------------------------------------

export const IMAGE_PROVIDERS: Array<{
  id: ImageProviderId;
  name: string;
  defaultModel: string;
}> = [
  { id: "lovable", name: "Lovable AI", defaultModel: DEFAULT_LOVABLE_IMAGE_MODEL },
  { id: "openrouter", name: "OpenRouter", defaultModel: DEFAULT_OPENROUTER_IMAGE_MODEL },
  { id: "google", name: "Google AI Studio", defaultModel: DEFAULT_GOOGLE_IMAGE_MODEL },
  { id: "openai", name: "OpenAI", defaultModel: DEFAULT_OPENAI_IMAGE_MODEL },
  { id: "higgsfield", name: "Higgsfield", defaultModel: DEFAULT_HIGGSFIELD_IMAGE_MODEL },
  { id: "off", name: "Off", defaultModel: "" },
];

// ---- 読み取り ------------------------------------------------------------

export type AdminAiFeatureRow = {
  id: AiFeature;
  tier: AiTier;
  needsVision: boolean;
  labelKey: string;
  label: Label;
  description: Label;
  /** 保存されている値（`"auto"` か `"会社:モデル"`）。 */
  value: string;
  /** いま実際に使う会社（`google` など）。 */
  provider: string | null;
  /** いま実際に使うモデル（合言葉のまま。例 `latest-flash`）。 */
  model: string | null;
  /** 実際に呼ぶ版付きのモデル（例 `gemini-3.8-flash`）。 */
  resolved: string | null;
  /** 選んだ会社の鍵が無く、既定に落ちている等の説明。 */
  error: string | null;
};

export type TtsLanguageRow = {
  /** `default` = 何も選んでいない（これまでの声）。 */
  provider: "default" | "azure" | "gemini" | "elevenlabs";
  voice: string;
  model: string | null;
  /** 台湾華語で Azure / Gemini を選んだ時の性別（アプリ全体で1つの台湾の声）。 */
  gender: TaiwanGender | null;
  /** 選んだが声が決まっておらず、既定の声で鳴っている。 */
  incomplete: boolean;
};

export type AdminAiSettings =
  | { isAdmin: false }
  | {
      isAdmin: true;
      status: { ok: boolean; provider: string | null; error: string | null };
      features: AdminAiFeatureRow[];
      providers: AiProviderListing[];
      image: {
        provider: ImageProviderId;
        model: string;
        /** 保存されている値（無ければ環境変数の既定で動いている）。 */
        saved: { provider: string; model: string } | null;
        providers: Array<{
          id: ImageProviderId;
          name: string;
          hasKey: boolean;
          defaultModel: string;
        }>;
      };
      tts: {
        defaultEngine: string;
        languages: Record<string, TtsLanguageRow>;
        providers: Array<{
          id: string;
          name: string;
          hasKey: boolean;
          keyEnvs: string[];
          models: string[];
          voices: Record<string, string[]>;
        }>;
      };
    };

function featureValues(raw: unknown): Partial<Record<AiFeature, string>> {
  const f = (raw as { features?: unknown } | null)?.features;
  if (!f || typeof f !== "object") return {};
  const out: Partial<Record<AiFeature, string>> = {};
  for (const [k, v] of Object.entries(f as Record<string, unknown>)) {
    if (isAiFeature(k) && typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out;
}

/** 発音の設定から、言語ごとの1行を作る（台湾の声は台湾華語の行にまとめる）。 */
export function ttsLanguageRows(config: TtsVoiceConfig): Record<string, TtsLanguageRow> {
  const rows: Record<string, TtsLanguageRow> = {};
  for (const lang of TTS_LANGUAGES) {
    if (lang === TAIWAN_LANGUAGE && config.taiwan) {
      const tw = config.taiwan;
      const choice = taiwanChoice(tw);
      rows[lang] = {
        provider: tw.provider,
        voice: choice?.voice ?? tw.voices?.[tw.gender] ?? "",
        model: choice?.model ?? tw.model ?? null,
        gender: tw.gender,
        incomplete: !choice,
      };
      continue;
    }
    const c = config.languages?.[lang];
    rows[lang] = c
      ? {
          provider: c.provider,
          voice: c.voice,
          model: c.model ?? null,
          gender: null,
          incomplete: false,
        }
      : { provider: "default", voice: "", model: null, gender: null, incomplete: false };
  }
  return rows;
}

export async function getAdminAiSettings(deps: AdminAiDeps): Promise<AdminAiSettings> {
  // 管理者でなければ、**何も読まずに**返す（会社の一覧・鍵の有無も見せない）。
  if (!(await deps.isAdmin())) return { isAdmin: false };
  const [aiRaw, imageRaw, ttsRaw, providers] = await Promise.all([
    deps.readConfig("ai_models"),
    deps.readConfig("image_generation"),
    deps.readConfig("tts_voice"),
    deps.aiProviders(),
  ]);
  const values = featureValues(aiRaw);
  const features = await Promise.all(
    AI_FEATURES.map(async (f): Promise<AdminAiFeatureRow> => {
      const value = values[f.id] ?? AUTO;
      const d = await deps.describeFeature(f.id);
      const spec = parseFeatureValue(value);
      let error: string | null = "error" in d ? d.error : null;
      if (!error && spec?.provider && "provider" in d && d.provider !== spec.provider) {
        error = `${spec.provider} の鍵が無いため既定の AI で動いています`;
      }
      return {
        id: f.id,
        tier: f.tier,
        needsVision: f.needsVision,
        labelKey: f.labelKey,
        label: label(f.labelKey),
        description: label(f.descKey),
        value: spec ? value : AUTO,
        provider: "provider" in d ? d.provider : null,
        model: "model" in d ? d.model : null,
        resolved: "resolved" in d ? d.resolved : null,
        error,
      };
    }),
  );

  const saved = (imageRaw ?? null) as { provider?: string; model?: string } | null;
  const effective = resolveImageConfig(deps.imageEnv(), saved);
  const imageKeys = deps.imageKeys();

  const ttsConfig = cleanTtsConfig(ttsRaw ?? {});
  return {
    isAdmin: true,
    status: deps.aiStatus(),
    features,
    providers,
    image: {
      provider: effective.provider,
      model: effective.model,
      saved:
        saved && typeof saved.provider === "string"
          ? { provider: saved.provider, model: saved.model ?? "" }
          : null,
      providers: IMAGE_PROVIDERS.map((p) => ({
        ...p,
        hasKey: p.id === "off" ? true : imageKeys[p.id],
      })),
    },
    tts: {
      defaultEngine: deps.ttsDefaultEngine(),
      languages: ttsLanguageRows(ttsConfig),
      providers: TTS_PROVIDERS.map((p) => {
        const voices: Record<string, string[]> = {};
        for (const lang of TTS_LANGUAGES) {
          voices[lang] =
            p.id === "azure" && lang === TAIWAN_LANGUAGE
              ? [...TAIWAN_AZURE_VOICES.female, ...TAIWAN_AZURE_VOICES.male]
              : [...(p.voices[lang] ?? [])];
        }
        return {
          id: p.id,
          name: p.label,
          hasKey: deps.ttsHasKey(p.id),
          keyEnvs: p.keyEnvs,
          models: p.models,
          voices,
        };
      }),
    },
  };
}

// ---- 書き込み: 機能ごとの AI ------------------------------------------------

export const SetAiFeatureInput = z.object({
  feature: z.string(),
  value: z.string().max(200),
});

/** 写真を読めるモデルか（合言葉・Lovable の Gemini も読める側）。 */
export function canReadImages(provider: string, model: string): boolean {
  if (/^latest-(flash|flash-lite|pro)$/i.test(model) || model.toLowerCase() === AUTO) return true;
  if (provider === "lovable") return /gemini|gpt-4o|gpt-4\.1|gpt-5/i.test(model);
  return supportsVision(provider, model);
}

export async function setAdminAiFeature(
  deps: AdminAiDeps,
  input: unknown,
): Promise<{ ok: true; feature: AiFeature; value: string }> {
  await assertAdmin(deps);
  const data = SetAiFeatureInput.parse(input);
  if (!isAiFeature(data.feature)) throw new BadRequestError(`知らない機能です: ${data.feature}`);
  const feature = data.feature;
  let value: string;
  try {
    value = normalizeFeatureValue(data.value);
  } catch (e) {
    throw new BadRequestError(e instanceof Error ? e.message : String(e));
  }
  if (value !== AUTO) {
    const spec = parseFeatureValue(value)!;
    const providers = await deps.aiProviders();
    const p = providers.find((x) => x.id === spec.provider);
    if (!p) throw new BadRequestError(`知らない会社です: ${spec.provider}`);
    if (!p.hasKey)
      throw new BadRequestError(
        `${p.name} の鍵がサーバにありません。先に Secrets に鍵を入れてください。`,
      );
    const info = AI_FEATURES.find((f) => f.id === feature)!;
    if (info.needsVision && !canReadImages(spec.provider, spec.model))
      throw new BadRequestError(`${spec.model} は写真を読めないため、スキャンには使えません。`);
  }
  // 機能ごとの割り当て**だけ**を残す（古い全体の上書きはここで消える）。
  const features = featureValues(await deps.readConfig("ai_models"));
  if (value === AUTO) delete features[feature];
  else features[feature] = value;
  await deps.writeConfig("ai_models", { features });
  deps.afterWrite?.("ai_models");
  return { ok: true, feature, value };
}

// ---- 書き込み: 画像 ----------------------------------------------------------

export const SetImageConfigInput = z.object({
  provider: z.enum(["lovable", "openrouter", "google", "openai", "higgsfield", "off"]),
  model: z
    .string()
    .trim()
    .max(120)
    .regex(/^[a-zA-Z0-9._/:-]*$/)
    .default(""),
});

export async function setAdminImageConfig(
  deps: AdminAiDeps,
  input: unknown,
): Promise<{ ok: true; provider: ImageProviderId; model: string }> {
  await assertAdmin(deps);
  const { provider, model } = checkImageChoice(deps, SetImageConfigInput.parse(input));
  await deps.writeConfig("image_generation", { provider, model });
  deps.afterWrite?.("image_generation");
  return { ok: true, provider, model };
}

/** 画像の会社・モデルを確かめ、保存する形（モデルが空なら会社の既定）にする。 */
function checkImageChoice(
  deps: AdminAiDeps,
  data: { provider: ImageProviderId; model: string },
): { provider: ImageProviderId; model: string } {
  const info = IMAGE_PROVIDERS.find((p) => p.id === data.provider)!;
  if (data.provider !== "off" && !deps.imageKeys()[data.provider])
    throw new BadRequestError(
      `${info.name} の鍵がサーバにありません。先に Secrets に鍵を入れてください。`,
    );
  return {
    provider: data.provider,
    model: data.provider === "off" ? "" : data.model || info.defaultModel,
  };
}

/** 「試しに1枚作る」が受け取る物。`provider` を付けると、保存せずにその選び方で試す。 */
export const TestImageInput = z.object({
  query: z.string().min(1).max(60).default("柚子"),
  provider: SetImageConfigInput.shape.provider.optional(),
  model: z
    .string()
    .trim()
    .max(120)
    .regex(/^[a-zA-Z0-9._/:-]*$/)
    .optional(),
});

/**
 * 「試しに1枚作る」で使う選び方を決める（管理者だけ）。`provider` が無ければ `draft: null`
 * — 保存してある設定で試す（これまでの呼び方。iOS は `{ query? }` だけを送る）。
 * `provider` があれば、保存と同じ確かめ（鍵があるか等）をして**保存せずに**返す。
 */
export async function resolveAdminImageTest(
  deps: AdminAiDeps,
  input: unknown,
): Promise<{ query: string; draft: { provider: ImageProviderId; model: string } | null }> {
  await assertAdmin(deps);
  const data = TestImageInput.parse(input ?? {});
  if (!data.provider) {
    if (data.model)
      throw new BadRequestError("model だけでは試せません。provider も送ってください。");
    return { query: data.query, draft: null };
  }
  return {
    query: data.query,
    draft: checkImageChoice(deps, { provider: data.provider, model: data.model ?? "" }),
  };
}

// ---- 書き込み: 発音の声 ------------------------------------------------------

export const SetTtsVoiceInput = z.object({
  language: z.enum(TTS_LANGUAGES as unknown as [string, ...string[]]),
  provider: z.enum(["default", "azure", "gemini", "elevenlabs"]),
  voice: z.string().max(100).default(""),
  model: z.string().max(100).optional(),
  gender: z.enum(["female", "male"]).optional(),
});

/**
 * 1つの言語の声を決める。台湾華語で Azure / Gemini を選ぶと**アプリ全体の台湾の声**
 * （`taiwan`。性別つき・ほかの声へ切り替えない）として保存する。
 */
export async function setAdminTtsVoice(
  deps: AdminAiDeps,
  input: unknown,
): Promise<{ ok: true; language: string; row: TtsLanguageRow }> {
  await assertAdmin(deps);
  const data = SetTtsVoiceInput.parse(input);
  const lang = data.language;
  if (data.provider !== "default" && !deps.ttsHasKey(data.provider)) {
    const p = TTS_PROVIDERS.find((x) => x.id === data.provider);
    throw new BadRequestError(
      `${p?.label ?? data.provider} の鍵がサーバにありません（${p?.keyEnvs.join(", ") ?? ""}）。`,
    );
  }
  const cur = cleanTtsConfig((await deps.readConfig("tts_voice")) ?? {});
  const languages = { ...(cur.languages ?? {}) };
  let taiwan = cur.taiwan;
  delete languages[lang];
  if (lang === TAIWAN_LANGUAGE) taiwan = undefined;
  const voice = data.voice.trim();
  const model = data.model?.trim() || undefined;

  if (data.provider !== "default") {
    if (lang === TAIWAN_LANGUAGE && (data.provider === "azure" || data.provider === "gemini")) {
      const gender: TaiwanGender =
        data.gender ??
        (data.provider === "azure" && TAIWAN_AZURE_VOICES.male.includes(voice) ? "male" : "female");
      if (data.provider === "azure" && voice && !TAIWAN_AZURE_VOICES[gender].includes(voice))
        throw new BadRequestError(
          `${voice} は台湾（zh-TW）の${gender === "male" ? "男性" : "女性"}の声ではありません。`,
        );
      if (data.provider === "gemini" && !voice)
        throw new BadRequestError(
          "Gemini の声を選んでください（「診断」で台湾の声の一覧が出ます）。",
        );
      taiwan = {
        provider: data.provider,
        gender,
        ...(model ? { model } : {}),
        ...(voice ? { voices: { [gender]: voice } } : {}),
      };
    } else {
      if (!voice) throw new BadRequestError("声の ID を入れてください。");
      languages[lang] = {
        provider: data.provider,
        voice,
        ...(model ? { model } : {}),
      };
    }
  }
  const next = cleanTtsConfig({
    ...(taiwan ? { taiwan } : {}),
    ...(Object.keys(languages).length ? { languages } : {}),
  });
  const row = ttsLanguageRows(next)[lang];
  if (data.provider !== "default" && row.provider === "default")
    throw new BadRequestError("この声の ID・モデル名は使えません（英数字と _ . - : ( ) だけ）。");
  await deps.writeConfig("tts_voice", next);
  deps.afterWrite?.("tts_voice");
  return { ok: true, language: lang, row };
}

// ---- 本物の道具 --------------------------------------------------------------

let providerModelsCache: { at: number; value: AiProviderListing[] } | null = null;

/** 鍵が入っている会社ごとに、いま使えるモデルを聞く（1時間ためる。鍵の値は返さない）。 */
export async function liveAiProviders(): Promise<AiProviderListing[]> {
  if (providerModelsCache && Date.now() - providerModelsCache.at < 60 * 60_000)
    return providerModelsCache.value;
  const { PROVIDER_PRESETS, findKey, LOVABLE_MODELS } = await import("./ai-provider.server");
  const value = await Promise.all(
    Object.entries(PROVIDER_PRESETS).map(async ([id, preset]): Promise<AiProviderListing> => {
      const key = findKey(id);
      const base = { id, name: preset.label, hasKey: Boolean(key), error: null as string | null };
      const done = (models: string[], error: string | null = null): AiProviderListing => ({
        ...base,
        models,
        visionModels: models.filter((m) => canReadImages(id, m)),
        error,
      });
      if (!key) return done([]);
      // Lovable の口はモデルの一覧を出さない。動くと分かっている物を並べる。
      if (id === "lovable") return done([...LOVABLE_MODELS]);
      const keywords = id === "google" ? ["latest-flash-lite", "latest-flash", "latest-pro"] : [];
      try {
        const headers: Record<string, string> =
          id === "anthropic"
            ? { "x-api-key": key.value, "anthropic-version": "2023-06-01" }
            : { Authorization: `Bearer ${key.value}` };
        const res = await fetch(`${preset.base_url.replace(/\/$/, "")}/models`, {
          headers,
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return done([...keywords, ...parseModelList(await res.json()).map((m) => m.id)]);
      } catch (e) {
        return done(keywords, e instanceof Error ? e.message : String(e));
      }
    }),
  );
  // 失敗した一覧はためない（次に開いた時にもう一度聞く）。
  if (value.every((p) => !p.error)) providerModelsCache = { at: Date.now(), value };
  return value;
}

type ConfigClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  from: (t: string) => {
    select: (c: string) => {
      eq: (
        k: string,
        v: string,
      ) => { maybeSingle: () => PromiseLike<{ data: unknown; error: { message: string } | null }> };
    };
    upsert: (row: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>;
  };
};

/**
 * 本物の道具。DB は**呼んだ人の権限**で読む・書く（`app_config` は RLS で管理者だけ）。
 * 管理者かどうかは `has_role` で見る（`checkIsAdmin` と同じ）。
 */
export function realAdminAiDeps(context: { supabase: unknown; userId: string }): AdminAiDeps {
  const sb = context.supabase as ConfigClient;
  let adminMemo: Promise<boolean> | null = null;
  return {
    isAdmin: () =>
      (adminMemo ??= Promise.resolve(
        sb.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      ).then(({ data, error }) => {
        if (error) throw new Error(error.message);
        return Boolean(data);
      })),
    readConfig: async (key) => {
      const { data, error } = await sb
        .from("app_config")
        .select("value")
        .eq("key", key)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as { value?: unknown } | null)?.value ?? null;
    },
    writeConfig: async (key, value) => {
      const { error } = await sb.from("app_config").upsert({
        key,
        value,
        updated_at: new Date().toISOString(),
        updated_by: context.userId,
      });
      if (error) {
        console.warn("[admin-ai] save failed", { key, message: error.message });
        throw new Error("設定を保存できませんでした");
      }
    },
    aiProviders: liveAiProviders,
    describeFeature: async (feature) => {
      const { describeFeature } = await import("./ai-provider.server");
      return describeFeature(feature);
    },
    aiStatus: () => aiStatusNow(),
    imageKeys: () => imageKeysNow(),
    imageEnv: () => process.env,
    ttsHasKey: (id) => ttsKeysNow(id),
    ttsDefaultEngine: () =>
      process.env.GOOGLE_TTS_API_KEY ? "Google Cloud TTS" : "OpenAI-compatible TTS",
    afterWrite: (key) => void forgetCaches(key),
  };
}

// 同期で使いたい物は、最初に読み込んだ server の道具を覚えておく。
let serverMods: {
  ai: typeof import("./ai-provider.server");
  tts: typeof import("./tts-provider.server");
  img: typeof import("./image-provider");
} | null = null;

/** `realAdminAiDeps` を使う前に1回呼ぶ（同期の道具が要る物を読み込む）。 */
export async function loadAdminAiServerModules(): Promise<void> {
  if (serverMods) return;
  const [ai, tts, img] = await Promise.all([
    import("./ai-provider.server"),
    import("./tts-provider.server"),
    import("./image-provider"),
  ]);
  serverMods = { ai, tts, img };
}

function mods() {
  if (!serverMods) throw new Error("loadAdminAiServerModules() を先に呼んでください");
  return serverMods;
}

function aiStatusNow(): { ok: boolean; provider: string | null; error: string | null } {
  try {
    const ai = mods().ai.getAi();
    return { ok: true, provider: ai.name ?? ai.provider, error: null };
  } catch (e) {
    return { ok: false, provider: null, error: e instanceof Error ? e.message : String(e) };
  }
}

function imageKeysNow(): Record<Exclude<ImageProviderId, "off">, boolean> {
  const { ai, img } = mods();
  return {
    lovable: Boolean(process.env.LOVABLE_API_KEY),
    openrouter: ai.findKey("openrouter") !== null,
    google: Boolean(process.env.GEMINI_API_KEY),
    openai: Boolean(process.env.OPENAI_API_KEY),
    higgsfield: Boolean(img.readHiggsfieldCredentials(process.env)),
  };
}

function ttsKeysNow(id: string): boolean {
  return mods().tts.providerKeysPresent(id);
}

function forgetCaches(key: AppConfigKey) {
  if (key === "ai_models") mods().ai.forgetAiModelOverride();
  if (key === "tts_voice") mods().tts.forgetTtsVoiceConfig();
}
