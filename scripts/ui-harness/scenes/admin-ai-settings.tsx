/**
 * **設定 → 開発者 →「AI の設定（開発者）」**（オーナー決定 2026-10-09「開発者の AI 設定が
 * 散らかっている。整理・削除・統合して」）。本番と同じ部品（`AdminAiSettingsView`）を、
 * 決まった見本の値で描く。保存・試しの操作は見本の中だけで動く（サーバへは行かない）。
 */
import { useState } from "react";
import {
  AdminAiSettingsView,
  type AdminAiActions,
  type ImageTestResult,
} from "@/components/AdminAiSettingsCard";
import type { AdminAiSettings } from "@/lib/admin-ai.server";
import { AI_FEATURES } from "@/lib/ai-features";
import { DICT, UI_LANGS, type UiLang } from "@/lib/i18n";
import { TAIWAN_AZURE_VOICES, TTS_PROVIDERS } from "@/lib/tts-providers";

type Ready = Extract<AdminAiSettings, { isAdmin: true }>;

const label = (key: string) =>
  Object.fromEntries(UI_LANGS.map((l) => [l, DICT[key]?.[l] ?? key])) as Record<UiLang, string>;

/** 見本の値（Google と OpenRouter の鍵だけが入っている、という想定）。 */
export function adminAiFixture(overrides: Partial<Ready> = {}): Ready {
  const googleModels = [
    "latest-flash-lite",
    "latest-flash",
    "latest-pro",
    "gemini-3.8-flash",
    "gemini-3.8-flash-lite",
    "gemini-3.5-pro",
  ];
  const orModels = ["anthropic/claude-sonnet-4.5", "openai/gpt-5-mini", "deepseek/deepseek-chat"];
  return {
    isAdmin: true,
    status: { ok: true, provider: "google", error: null },
    features: AI_FEATURES.map((f) => ({
      id: f.id,
      tier: f.tier,
      needsVision: f.needsVision,
      labelKey: f.labelKey,
      label: label(f.labelKey),
      description: label(f.descKey),
      value: f.id === "journal" ? "openrouter:anthropic/claude-sonnet-4.5" : "auto",
      provider: f.id === "journal" ? "openrouter" : "google",
      model:
        f.id === "journal"
          ? "anthropic/claude-sonnet-4.5"
          : f.tier === "flash-lite"
            ? "latest-flash-lite"
            : "latest-flash",
      resolved:
        f.id === "journal"
          ? "anthropic/claude-sonnet-4.5"
          : f.tier === "flash-lite"
            ? "gemini-3.8-flash-lite"
            : "gemini-3.8-flash",
      error: null,
    })),
    providers: [
      {
        id: "google",
        name: "Google Gemini",
        hasKey: true,
        models: googleModels,
        visionModels: googleModels,
        error: null,
      },
      {
        id: "openai",
        name: "OpenAI (ChatGPT)",
        hasKey: false,
        models: [],
        visionModels: [],
        error: null,
      },
      {
        id: "anthropic",
        name: "Anthropic Claude",
        hasKey: false,
        models: [],
        visionModels: [],
        error: null,
      },
      {
        id: "deepseek",
        name: "DeepSeek",
        hasKey: false,
        models: [],
        visionModels: [],
        error: null,
      },
      {
        id: "kimi",
        name: "Kimi (Moonshot)",
        hasKey: false,
        models: [],
        visionModels: [],
        error: null,
      },
      {
        id: "lovable",
        name: "Lovable Gateway",
        hasKey: false,
        models: [],
        visionModels: [],
        error: null,
      },
      {
        id: "openrouter",
        name: "OpenRouter",
        hasKey: true,
        models: orModels,
        visionModels: orModels.slice(0, 2),
        error: null,
      },
    ],
    image: {
      provider: "lovable",
      model: "openai/gpt-image-1-mini",
      saved: null,
      providers: [
        {
          id: "lovable",
          name: "Lovable AI",
          hasKey: true,
          defaultModel: "openai/gpt-image-1-mini",
        },
        {
          id: "openrouter",
          name: "OpenRouter",
          hasKey: true,
          defaultModel: "bytedance-seed/seedream-5-0-pro",
        },
        {
          id: "google",
          name: "Google AI Studio",
          hasKey: true,
          defaultModel: "gemini-2.5-flash-image",
        },
        { id: "openai", name: "OpenAI", hasKey: false, defaultModel: "gpt-image-1-mini" },
        {
          id: "higgsfield",
          name: "Higgsfield",
          hasKey: false,
          defaultModel: "bytedance/seedream/v4/text-to-image",
        },
        { id: "off", name: "Off", hasKey: true, defaultModel: "" },
      ],
    },
    tts: {
      defaultEngine: "OpenAI-compatible TTS",
      languages: {
        "zh-TW": {
          provider: "azure",
          voice: TAIWAN_AZURE_VOICES.female[0],
          model: null,
          gender: "female",
          incomplete: false,
        },
        en: { provider: "default", voice: "", model: null, gender: null, incomplete: false },
        ja: { provider: "default", voice: "", model: null, gender: null, incomplete: false },
      },
      providers: TTS_PROVIDERS.map((p) => ({
        id: p.id,
        name: p.label,
        hasKey: p.id !== "elevenlabs",
        keyEnvs: p.keyEnvs,
        models: p.models,
        voices: {
          "zh-TW":
            p.id === "azure"
              ? [...TAIWAN_AZURE_VOICES.female, ...TAIWAN_AZURE_VOICES.male]
              : [...(p.voices["zh-TW"] ?? [])],
          en: [...(p.voices.en ?? [])],
          ja: [...(p.voices.ja ?? [])],
        },
      })),
    },
    ...overrides,
  };
}

/** 見本の中だけで動く道具（保存すると画面の「いま」が変わる）。 */
export function useFixtureActions(
  data: Ready,
  setData: (d: Ready) => void,
  extra: Partial<AdminAiActions> = {},
): AdminAiActions {
  const wait = () => new Promise((r) => setTimeout(r, 300));
  return {
    setFeature: async (feature, value) => {
      await wait();
      setData({
        ...data,
        features: data.features.map((f) => {
          if (f.id !== feature) return f;
          if (value === "auto")
            return {
              ...f,
              value,
              provider: "google",
              model: f.tier === "flash-lite" ? "latest-flash-lite" : "latest-flash",
              resolved: f.tier === "flash-lite" ? "gemini-3.8-flash-lite" : "gemini-3.8-flash",
            };
          const i = value.indexOf(":");
          const model = value.slice(i + 1);
          const resolved = model === "latest-flash" ? "gemini-3.8-flash" : model;
          return { ...f, value, provider: value.slice(0, i), model, resolved };
        }),
      });
    },
    setImage: async (provider, model) => {
      await wait();
      setData({
        ...data,
        image: { ...data.image, provider: provider as Ready["image"]["provider"], model },
      });
    },
    testImage: async (): Promise<ImageTestResult> => {
      await wait();
      return {
        provider: data.image.provider,
        model: data.image.model,
        credentialName: null,
        ok: true,
        image:
          "data:image/svg+xml;utf8," +
          encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#ffe08a"/><circle cx="50" cy="52" r="30" fill="#f4b400"/><path d="M50 22 q8 -10 18 -6" stroke="#3a7d2c" stroke-width="5" fill="none"/></svg>',
          ),
        error: null,
        ms: 4200,
      };
    },
    setTts: async (input) => {
      await wait();
      setData({
        ...data,
        tts: {
          ...data.tts,
          languages: {
            ...data.tts.languages,
            [input.language]: {
              provider: input.provider,
              voice: input.provider === "default" ? "" : input.voice,
              model: input.model ?? null,
              gender: input.gender ?? null,
              incomplete: false,
            },
          },
        },
      });
    },
    previewTts: async () => {
      throw new Error("見本のページでは声を鳴らしません（設定 → 開発者 で試してください）");
    },
    ...extra,
  };
}

export function AdminAiSettingsScene() {
  const [data, setData] = useState<Ready>(() => adminAiFixture());
  const actions = useFixtureActions(data, setData);
  return (
    <div className="mx-auto max-w-xl p-4">
      <AdminAiSettingsView defaultOpen data={data} actions={actions} />
    </div>
  );
}

/** 鍵が1つも無く AI が止まっている時（最初の行が赤い）。 */
export function AdminAiSettingsNoKeyScene() {
  const [data, setData] = useState<Ready>(() =>
    adminAiFixture({
      status: {
        ok: false,
        provider: null,
        error: "AIキーが未設定です。デプロイ環境の環境変数に GEMINI_API_KEY を追加してください。",
      },
    }),
  );
  const actions = useFixtureActions(data, setData);
  return (
    <div className="mx-auto max-w-xl p-4">
      <AdminAiSettingsView defaultOpen data={data} actions={actions} />
    </div>
  );
}
