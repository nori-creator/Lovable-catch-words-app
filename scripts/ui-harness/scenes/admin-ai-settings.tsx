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
import { computeAiModelStats, type AiStatsRow } from "@/lib/ai-model-stats";
import { AI_TEST_PHOTOS } from "@/lib/ai-test-photos";
import { AI_FEATURES } from "@/lib/ai-features";
import { AI_TASK_INFOS } from "@/lib/ai-task-settings";
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
    tasks: AI_TASK_INFOS.map((t) => ({
      id: t.id,
      feature: t.feature,
      needsVision: t.needsVision,
      ios: t.ios,
      label: t.label,
      description: t.description,
      value: "auto",
      backup: "auto",
      provider: "google",
      model: t.feature === "scan" ? "latest-flash-lite" : "latest-flash",
      resolved: t.feature === "scan" ? "gemini-3.8-flash-lite" : "gemini-3.8-flash",
      backupProvider: "openrouter",
      backupModel: "google/gemini-2.5-flash",
      backupResolved: "google/gemini-2.5-flash",
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

/**
 * 速さと正確さの表の見本（本物の数え方 `computeAiModelStats` に、決まった行を通す）。
 * スキャンは Flash-Lite と Claude Haiku を見比べている途中、という想定。
 */
export function adminAiStatsFixture(days: 1 | 7 | 30 = 7, mine = false) {
  const now = Date.UTC(2026, 9, 11, 9);
  const rows: AiStatsRow[] = [];
  const at = (i: number) => new Date(now - i * 60_000).toISOString();
  const add = (task: string, feature: string, model: string, ms: number[], extra = {}) =>
    ms.forEach((m, i) =>
      rows.push({
        user_id: "u",
        loop: "ai_call",
        created_at: at(i),
        meta: { feature, task, model, ms: m, ok: true, in: 1850, out: 320, ...extra },
      }),
    );
  const lite = "google:gemini-3.8-flash-lite";
  const haiku = "anthropic:claude-haiku-5-5";
  add("photo_candidates", "scan", lite, [1900, 2100, 2300, 2500, 2800, 3400, 2000, 2200]);
  add("photo_candidates", "scan", haiku, [1500, 1700, 1600, 2600]);
  rows.push({
    user_id: "u",
    loop: "ai_call",
    created_at: at(1),
    meta: {
      feature: "scan",
      task: "photo_candidates",
      model: lite,
      ms: 18000,
      ok: false,
      code: "timeout",
    },
  });
  add("card", "card", "google:gemini-3.8-flash", [12400, 15800, 18600, 21000], {
    in: 10200,
    out: 2050,
  });
  add("reader_meaning", "card", "google:gemini-3.8-flash", [1300, 1500, 1800]);
  add("journal_correct", "journal", "openrouter:anthropic/claude-sonnet-4.5", [6100, 7400]);
  const suggest = (i: number, via: string, outcome = "ok") =>
    rows.push({
      user_id: "u",
      loop: "capture_suggest",
      created_at: at(i),
      meta: { ok: true, via, attempts: [{ label: via, outcome }] },
    });
  const pick = (i: number, rank: number | null) =>
    rows.push({
      user_id: "u",
      loop: "candidate_pick",
      created_at: at(i),
      meta: rank ? { via: "photo", rank, n: 5 } : { via: "native_search" },
    });
  [1, 1, 2, 1, null, 1, 3].forEach((r, i) => {
    suggest(100 + i * 10, lite);
    pick(99 + i * 10, r);
  });
  [1, 1, 2].forEach((r, i) => {
    suggest(300 + i * 10, haiku);
    pick(299 + i * 10, r);
  });
  suggest(400, lite, "unusable");
  // `"timeout"` = 答えが返らなかった写真（時間に入れず、正解の率では外れ）。
  const test = (model: string, ranks: Array<number | null | "timeout">, ms: number) =>
    ranks.forEach((rank, i) =>
      rows.push({
        user_id: "u",
        loop: "ai_test",
        created_at: at(i),
        meta: {
          task: "photo_candidates",
          model,
          photo: AI_TEST_PHOTOS[i % AI_TEST_PHOTOS.length].id,
          lang: "zh-TW",
          ok: rank !== "timeout",
          ms: rank === "timeout" ? 30_000 : ms + i * 40,
          in: 1700,
          out: 300,
          ...(typeof rank === "number" ? { rank } : {}),
          ...(rank === "timeout" ? { code: "timeout" } : {}),
        },
      }),
    );
  test(lite, [1, 1, 1, 2, 1, null, 1, 1, 3, 1], 2100);
  test(haiku, [1, 2, 1, null, 1, 1, "timeout", 2, 1, 1], 1600);
  return {
    isAdmin: true as const,
    truncated: false,
    ...computeAiModelStats(rows, {
      days,
      mine,
      since: new Date(now - days * 86_400_000).toISOString(),
    }),
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
    testImage: async (draft): Promise<ImageTestResult> => {
      await wait();
      return {
        provider: draft.provider,
        model: draft.model,
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
    getStats: async ({ days, mine }) => {
      await wait();
      return adminAiStatsFixture(days, mine);
    },
    testPhoto: async ({ value, photo }) => {
      await wait();
      const i = AI_TEST_PHOTOS.findIndex((p) => p.id === photo);
      const p = AI_TEST_PHOTOS[i];
      const rank = i % 5 === 3 ? null : i % 4 === 2 ? 2 : 1;
      const want = p.labels["zh-TW"][0];
      return {
        ok: true,
        ms: 1500 + (i % 7) * 230,
        model: value === "auto" ? "google:gemini-3.8-flash-lite" : value,
        variant: null,
        rank,
        heads: rank === 1 ? [want, "杯子"] : rank === 2 ? ["杯子", want] : ["杯子", "桌子"],
        want,
        code: null,
      };
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
