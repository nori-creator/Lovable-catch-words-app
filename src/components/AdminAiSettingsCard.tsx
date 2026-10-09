import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useReadableError } from "@/lib/errors";
import { useT } from "@/lib/i18n";
import { AUTO, type AiTier } from "@/lib/ai-features";
import {
  TAIWAN_AZURE_VOICES,
  TAIWAN_LANGUAGE,
  type GeminiDiagnosis,
  type TaiwanGender,
} from "@/lib/tts-providers";
import type { AdminAiSettings, TtsLanguageRow } from "@/lib/admin-ai.server";
import {
  adminGetAiSettings,
  adminSetAiFeature,
  adminSetImageConfig,
  adminSetTtsVoice,
} from "@/lib/admin-ai.functions";
import { adminTestImage } from "@/lib/images.functions";
import { diagnoseGeminiTts, previewTtsVoice } from "@/lib/tts.functions";

/**
 * **「AI の設定（開発者）」の1枚**（オーナー決定 2026-10-09「開発者の AI 設定が散らかって
 * いる。整理・削除・統合して」「アプリの全部の AI を Web と iOS の開発者設定から切り替える」）。
 *
 * 上から: ①動いているか ②機能ごとの AI（自動 = 最新の Gemini、または 会社:モデル）
 * ③文字検索の AI 画像（会社・モデル・試しに1枚） ④発音の声（台湾華語・英語・日本語）。
 * 中身はサーバの `admin-ai.server.ts`。iOS も同じ口を呼ぶ（`docs/admin-ai-api.md`）。
 *
 * 画面（`AdminAiSettingsView`）は道具（`AdminAiActions`）を受け取るだけなので、
 * 見本（`scripts/ui-harness/scenes/admin-ai-settings.tsx`）からも同じ物を描ける。
 */

type ReadyData = Extract<AdminAiSettings, { isAdmin: true }>;

export type ImageTestResult = {
  provider: string;
  model: string;
  credentialName: string | null;
  ok: boolean;
  image: string | null;
  error: string | null;
  ms: number;
};

export type TtsSetInput = {
  language: string;
  provider: TtsLanguageRow["provider"];
  voice: string;
  model?: string;
  gender?: TaiwanGender;
};

export type AdminAiActions = {
  setFeature: (feature: string, value: string) => Promise<void>;
  setImage: (provider: string, model: string) => Promise<void>;
  /** 画面でいま選んでいる会社・モデル（まだ保存していなくてよい）で1枚作る。保存はしない。 */
  testImage: (draft: { provider: string; model: string }) => Promise<ImageTestResult>;
  setTts: (input: TtsSetInput) => Promise<void>;
  previewTts: (
    language: string,
    text: string,
    choice: { provider: string; voice: string; model?: string },
  ) => Promise<{ audio_url: string; ms: number }>;
  diagnoseTts?: () => Promise<GeminiDiagnosis>;
};

const TTS_SAMPLE: Record<string, string> = {
  "zh-TW": "你好，很高興認識你。",
  en: "Nice to meet you.",
  ja: "はじめまして。よろしくお願いします。",
};

const TTS_LANG_LABEL: Record<string, string> = {
  "zh-TW": "aiSet.ttsLangZh",
  en: "aiSet.ttsLangEn",
  ja: "aiSet.ttsLangJa",
};

const selectCls =
  "min-h-11 w-full rounded-md border border-input bg-background px-3 text-field disabled:opacity-60";

function tierName(tier: AiTier) {
  return tier === "flash-lite" ? "Gemini Flash-Lite" : "Gemini Flash";
}

/** 本番の1枚（サーバの口を呼ぶ）。 */
export function AdminAiSettingsCard() {
  const getFn = useServerFn(adminGetAiSettings);
  const featureFn = useServerFn(adminSetAiFeature);
  const imageFn = useServerFn(adminSetImageConfig);
  const testFn = useServerFn(adminTestImage);
  const ttsFn = useServerFn(adminSetTtsVoice);
  const tryFn = useServerFn(previewTtsVoice);
  const diagFn = useServerFn(diagnoseGeminiTts);
  const qc = useQueryClient();
  const { data, error } = useQuery({
    queryKey: ["admin-ai-settings"],
    queryFn: () => getFn(),
    staleTime: 30_000,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-ai-settings"] });
  const actions: AdminAiActions = {
    setFeature: async (feature, value) => {
      await featureFn({ data: { feature, value } });
      await refresh();
    },
    setImage: async (provider, model) => {
      await imageFn({ data: { provider, model } });
      await refresh();
    },
    testImage: (draft) => testFn({ data: draft }) as Promise<ImageTestResult>,
    setTts: async (input) => {
      await ttsFn({ data: input });
      await refresh();
    },
    previewTts: (language, text, choice) => tryFn({ data: { language, text, choice } }),
    diagnoseTts: () => diagFn(),
  };
  if (data && !data.isAdmin) return null;
  return <AdminAiSettingsView data={data} loadError={error} actions={actions} />;
}

export function AdminAiSettingsView({
  data,
  actions,
  loadError,
  defaultOpen = false,
}: {
  data: AdminAiSettings | undefined;
  actions: AdminAiActions;
  loadError?: unknown;
  defaultOpen?: boolean;
}) {
  const t = useT();
  const ready = data && data.isAdmin ? data : null;
  return (
    <details
      open={defaultOpen}
      className="rounded-2xl border border-border bg-card p-4"
      data-admin-ai-settings=""
    >
      <summary className="cursor-pointer list-none text-body font-semibold [&::-webkit-details-marker]:hidden">
        {t("aiSet.title")}
      </summary>
      {!ready ? (
        <p className="mt-3 text-footnote text-muted-foreground">
          {loadError ? t("aiSet.loadFailed") : t("aiSet.loading")}
        </p>
      ) : (
        <div className="mt-3 space-y-5">
          <p
            className={`rounded-xl p-2 text-caption font-semibold leading-relaxed ${
              ready.status.ok ? "bg-ok/10 text-ok-ink" : "bg-destructive/10 text-destructive-ink"
            }`}
            role="status"
          >
            {ready.status.ok
              ? t("aiSet.statusOk", { p: ready.status.provider ?? "" })
              : t("aiSet.statusNg", { e: ready.status.error ?? "" })}
          </p>
          <FeatureSection data={ready} actions={actions} />
          <ImageSection data={ready} actions={actions} />
          <TtsSection data={ready} actions={actions} />
        </div>
      )}
    </details>
  );
}

function SectionHeading({ title, note }: { title: string; note?: string }) {
  return (
    <div className="space-y-0.5">
      <h3 className="text-footnote font-semibold label-caps text-muted-foreground">{title}</h3>
      {note && <p className="text-caption leading-snug text-muted-foreground">{note}</p>}
    </div>
  );
}

// ---- ② 機能ごとの AI ---------------------------------------------------------

function FeatureSection({ data, actions }: { data: ReadyData; actions: AdminAiActions }) {
  const t = useT();
  const readable = useReadableError();
  const [busy, setBusy] = useState<string | null>(null);
  async function pick(feature: string, value: string) {
    setBusy(feature);
    try {
      await actions.setFeature(feature, value);
      toast.success(t("aiSet.saved"));
    } catch (e) {
      toast.error(readable(e, t("settings.saveFailed")));
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="space-y-2" aria-label={t("aiSet.featuresHeading")}>
      <SectionHeading title={t("aiSet.featuresHeading")} note={t("aiSet.featuresNote")} />
      {data.features.map((f) => {
        const auto = f.value === AUTO;
        const current = auto
          ? t("aiSet.autoCurrent", { tier: tierName(f.tier), m: f.resolved ?? "—" })
          : f.resolved && f.resolved !== f.model
            ? `${f.value} → ${f.resolved}`
            : f.value;
        const known = data.providers.some((p) =>
          (f.needsVision ? p.visionModels : p.models).some((m) => `${p.id}:${m}` === f.value),
        );
        return (
          <div key={f.id} className="rounded-xl border border-border p-2.5" data-ai-feature={f.id}>
            <p className="text-footnote font-semibold">{t(f.labelKey)}</p>
            <p className="mt-0.5 text-caption leading-snug text-muted-foreground">
              {t(`aiSet.featureDesc.${f.id}`)}
            </p>
            <p className="mt-1 break-all text-caption">
              <span className="text-muted-foreground">{t("aiSet.current")}: </span>
              <span className="font-semibold">{current}</span>
            </p>
            {f.error && <p className="mt-1 text-caption text-destructive-ink">{f.error}</p>}
            <select
              aria-label={t("aiSet.pickAria", { f: t(f.labelKey) })}
              value={f.value}
              disabled={busy !== null}
              onChange={(e) => void pick(f.id, e.target.value)}
              className={`mt-2 ${selectCls}`}
            >
              <option value={AUTO}>{t("aiSet.auto", { tier: tierName(f.tier) })}</option>
              {!auto && !known && <option value={f.value}>{f.value}</option>}
              {data.providers.map((p) => {
                const models = f.needsVision ? p.visionModels : p.models;
                if (!p.hasKey)
                  return (
                    <option key={p.id} value={`${p.id}:`} disabled>
                      {p.name} — {t("aiSet.noKey")}
                    </option>
                  );
                if (models.length === 0)
                  return (
                    <option key={p.id} value={`${p.id}:`} disabled>
                      {p.name} — {p.error ? t("aiSet.listFailed") : t("aiSet.noModels")}
                    </option>
                  );
                return (
                  <optgroup key={p.id} label={p.name}>
                    {models.map((m) => (
                      <option key={m} value={`${p.id}:${m}`}>
                        {m}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </div>
        );
      })}
    </section>
  );
}

// ---- ③ 文字検索の AI 画像 ------------------------------------------------------

function ImageSection({ data, actions }: { data: ReadyData; actions: AdminAiActions }) {
  const t = useT();
  const readable = useReadableError();
  const [provider, setProvider] = useState(data.image.provider as string);
  const [model, setModel] = useState(data.image.model);
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [result, setResult] = useState<ImageTestResult | null>(null);
  useEffect(() => {
    setProvider(data.image.provider);
    setModel(data.image.model);
  }, [data.image.provider, data.image.model]);
  const info = data.image.providers.find((p) => p.id === provider) ?? data.image.providers[0];
  const name = (id: string) =>
    id === "off"
      ? t("aiSet.imageOff")
      : (data.image.providers.find((p) => p.id === id)?.name ?? id);
  const dirty = provider !== data.image.provider || model.trim() !== data.image.model;

  async function save() {
    setBusy("save");
    try {
      await actions.setImage(provider, model.trim());
      toast.success(t("aiSet.saved"));
    } catch (e) {
      toast.error(readable(e, t("settings.saveFailed")));
    } finally {
      setBusy(null);
    }
  }
  async function test() {
    setBusy("test");
    setResult(null);
    try {
      // 保存前の選び方を試す（保存してある古い設定ではなく、いま画面で選んでいる物）。
      setResult(await actions.testImage({ provider, model: model.trim() }));
    } catch (e) {
      toast.error(readable(e, t("aiSet.imageTestFail")));
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="space-y-2" aria-label={t("aiSet.imageHeading")}>
      <SectionHeading title={t("aiSet.imageHeading")} note={t("aiSet.imageNote")} />
      <div className="space-y-2 rounded-xl border border-border p-2.5" data-ai-image="">
        <p className="break-all text-caption">
          <span className="text-muted-foreground">{t("aiSet.current")}: </span>
          <span className="font-semibold">
            {name(data.image.provider)}
            {data.image.model ? ` / ${data.image.model}` : ""}
          </span>
        </p>
        <select
          aria-label={t("aiSet.imageProvider")}
          value={provider}
          onChange={(e) => {
            const next = e.target.value;
            setProvider(next);
            setModel(data.image.providers.find((p) => p.id === next)?.defaultModel ?? "");
          }}
          className={selectCls}
        >
          {data.image.providers.map((p) => (
            <option key={p.id} value={p.id} disabled={!p.hasKey}>
              {name(p.id)}
              {p.hasKey ? "" : ` — ${t("aiSet.noKey")}`}
            </option>
          ))}
        </select>
        {provider !== "off" && (
          <Input
            aria-label={t("aiSet.imageModel")}
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={info?.defaultModel}
            autoComplete="off"
          />
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            type="button"
            onClick={() => void save()}
            disabled={busy !== null || !dirty || !info?.hasKey}
            className="min-h-11"
          >
            {busy === "save" ? t("settings.saving") : t("aiSet.save")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void test()}
            disabled={busy !== null || data.image.provider === "off"}
            className="min-h-11"
          >
            {busy === "test" ? t("aiSet.imageTesting") : t("aiSet.imageTest")}
          </Button>
        </div>
        {result && (
          <div
            className="space-y-1 text-footnote"
            data-image-test-result={result.ok ? "ok" : "fail"}
            role="status"
          >
            <p
              className={
                result.ok ? "font-semibold text-primary" : "font-semibold text-destructive"
              }
            >
              {result.ok ? t("aiSet.imageTestOk") : t("aiSet.imageTestFail")}
              <span className="ml-2 font-normal tabular-nums text-muted-foreground">
                {(result.ms / 1000).toFixed(1)}s
              </span>
            </p>
            <p className="break-all text-caption text-muted-foreground">
              {name(result.provider)} / {result.model}
              {result.credentialName ? ` · ${result.credentialName}` : ""}
            </p>
            {result.error && <p className="text-caption text-destructive">{result.error}</p>}
            {result.image && (
              <img
                src={result.image}
                alt=""
                className="aspect-square w-40 rounded-xl object-cover"
              />
            )}
          </div>
        )}
      </div>
    </section>
  );
}

// ---- ④ 発音の声 -----------------------------------------------------------------

function TtsSection({ data, actions }: { data: ReadyData; actions: AdminAiActions }) {
  const t = useT();
  return (
    <section className="space-y-2" aria-label={t("aiSet.ttsHeading")}>
      <SectionHeading
        title={t("aiSet.ttsHeading")}
        note={t("aiSet.ttsNote", { p: data.tts.defaultEngine })}
      />
      {Object.entries(data.tts.languages).map(([lang, row]) => (
        <TtsRow key={lang} lang={lang} row={row} data={data} actions={actions} />
      ))}
    </section>
  );
}

function TtsRow({
  lang,
  row,
  data,
  actions,
}: {
  lang: string;
  row: TtsLanguageRow;
  data: ReadyData;
  actions: AdminAiActions;
}) {
  const t = useT();
  const readable = useReadableError();
  const [provider, setProvider] = useState<TtsLanguageRow["provider"]>(row.provider);
  const [voice, setVoice] = useState(row.voice);
  const [model, setModel] = useState(row.model ?? "");
  const [gender, setGender] = useState<TaiwanGender>(row.gender ?? "female");
  const [busy, setBusy] = useState<string | null>(null);
  const [took, setTook] = useState<number | null>(null);
  const [diag, setDiag] = useState<GeminiDiagnosis | null>(null);
  useEffect(() => {
    setProvider(row.provider);
    setVoice(row.voice);
    setModel(row.model ?? "");
    setGender(row.gender ?? "female");
  }, [row]);

  const info = data.tts.providers.find((p) => p.id === provider);
  const taiwan = lang === TAIWAN_LANGUAGE && (provider === "azure" || provider === "gemini");
  const voices =
    taiwan && provider === "azure" ? TAIWAN_AZURE_VOICES[gender] : (info?.voices[lang] ?? []);
  const fixedList = provider === "azure";
  const listId = `ai-tts-voices-${lang}`;
  const geminiVoices = diag?.voices[gender] ?? [];
  const name = (id: string) =>
    id === "default"
      ? t("aiSet.ttsDefaultVoice")
      : (data.tts.providers.find((p) => p.id === id)?.name ?? id);
  const current =
    row.provider === "default"
      ? t("aiSet.ttsDefaultVoice")
      : [
          name(row.provider),
          row.gender ? t(row.gender === "male" ? "aiSet.ttsMale" : "aiSet.ttsFemale") : "",
          row.voice,
          row.model ?? "",
        ]
          .filter(Boolean)
          .join(" / ");

  function changeProvider(next: TtsLanguageRow["provider"]) {
    setProvider(next);
    const p = data.tts.providers.find((x) => x.id === next);
    const list =
      lang === TAIWAN_LANGUAGE && next === "azure"
        ? TAIWAN_AZURE_VOICES[gender]
        : (p?.voices[lang] ?? []);
    setVoice(list[0] ?? "");
    setModel(p?.models[0] ?? "");
  }
  function changeGender(g: TaiwanGender) {
    setGender(g);
    if (provider === "azure") setVoice(TAIWAN_AZURE_VOICES[g][0]);
    else if (provider === "gemini") setVoice("");
  }

  async function save() {
    setBusy("save");
    try {
      await actions.setTts({
        language: lang,
        provider,
        voice: voice.trim(),
        ...(model ? { model } : {}),
        ...(taiwan ? { gender } : {}),
      });
      toast.success(t("aiSet.saved"));
    } catch (e) {
      toast.error(readable(e, t("settings.saveFailed")));
    } finally {
      setBusy(null);
    }
  }
  async function preview() {
    setBusy("try");
    try {
      const r = await actions.previewTts(lang, TTS_SAMPLE[lang] ?? TTS_SAMPLE.en, {
        provider,
        voice: voice.trim(),
        ...(model ? { model } : {}),
      });
      setTook(r.ms);
      void new Audio(r.audio_url).play();
    } catch (e) {
      toast.error(readable(e, t("settings.saveFailed")));
    } finally {
      setBusy(null);
    }
  }
  async function diagnose() {
    if (!actions.diagnoseTts) return;
    setBusy("diag");
    try {
      setDiag(await actions.diagnoseTts());
    } catch (e) {
      toast.error(readable(e, t("settings.saveFailed")));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-border p-2.5" data-ai-tts={lang}>
      <p className="text-footnote font-semibold">{t(TTS_LANG_LABEL[lang] ?? lang)}</p>
      <p className="break-all text-caption">
        <span className="text-muted-foreground">{t("aiSet.current")}: </span>
        <span className="font-semibold">{current}</span>
      </p>
      {row.incomplete && (
        <p className="text-caption text-destructive-ink">{t("aiSet.ttsIncomplete")}</p>
      )}
      {lang === TAIWAN_LANGUAGE && (
        <p className="text-caption leading-snug text-muted-foreground">{t("aiSet.ttsTwNote")}</p>
      )}
      <select
        aria-label={t("aiSet.ttsProvider")}
        value={provider}
        onChange={(e) => changeProvider(e.target.value as TtsLanguageRow["provider"])}
        className={selectCls}
      >
        <option value="default">{t("aiSet.ttsDefaultVoice")}</option>
        {data.tts.providers.map((p) => (
          <option key={p.id} value={p.id} disabled={!p.hasKey}>
            {p.name}
            {p.hasKey ? "" : ` — ${t("aiSet.noKey")}`}
          </option>
        ))}
      </select>
      {provider !== "default" && (
        <>
          {taiwan && (
            <div className="flex gap-2" role="radiogroup" aria-label={t("aiSet.ttsGender")}>
              {(["female", "male"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  role="radio"
                  aria-checked={gender === g}
                  onClick={() => changeGender(g)}
                  className={`min-h-11 flex-1 rounded-md border px-3 text-field font-semibold ${
                    gender === g
                      ? "border-primary bg-primary/10 text-primary-ink"
                      : "border-input bg-background"
                  }`}
                >
                  {t(g === "female" ? "aiSet.ttsFemale" : "aiSet.ttsMale")}
                </button>
              ))}
            </div>
          )}
          {fixedList && voices.length > 0 ? (
            <select
              aria-label={t("aiSet.ttsVoice")}
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              className={selectCls}
            >
              {!voices.includes(voice) && voice && <option value={voice}>{voice}</option>}
              {voices.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          ) : (
            <>
              <Input
                aria-label={t("aiSet.ttsVoice")}
                placeholder={t("aiSet.ttsVoice")}
                list={listId}
                value={voice}
                onChange={(e) => setVoice(e.target.value)}
                autoComplete="off"
              />
              <datalist id={listId}>
                {voices.map((v) => (
                  <option key={v} value={v} />
                ))}
                {provider === "gemini" &&
                  geminiVoices.map((v) => (
                    <option key={v.id} value={v.id}>
                      {[v.name, v.accent].filter(Boolean).join(" / ")}
                    </option>
                  ))}
              </datalist>
            </>
          )}
          {info && info.models.length > 0 && (
            <select
              aria-label={t("aiSet.ttsModel")}
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className={selectCls}
            >
              {info.models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          )}
          {provider === "gemini" && actions.diagnoseTts && (
            <>
              <Button
                type="button"
                variant="secondary"
                className="min-h-11 w-full"
                disabled={busy !== null}
                onClick={() => void diagnose()}
              >
                {t("aiSet.ttsDiagnose")}
              </Button>
              {diag && (
                <p className="text-caption text-muted-foreground" role="status">
                  {diag.keyPresent ? t("aiSet.ttsDiagKeyOk") : t("aiSet.ttsDiagKeyNo")}{" "}
                  {t("aiSet.ttsDiagVoices", {
                    f: String(diag.voices.female.length),
                    m: String(diag.voices.male.length),
                  })}
                  {diag.voicesError ? ` — ${diag.voicesError}` : ""}
                </p>
              )}
            </>
          )}
        </>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          type="button"
          onClick={() => void save()}
          disabled={busy !== null || (provider !== "default" && !voice.trim())}
          className="min-h-11"
        >
          {busy === "save" ? t("settings.saving") : t("aiSet.save")}
        </Button>
        {provider !== "default" && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={busy !== null || !voice.trim()}
              onClick={() => void preview()}
              className="min-h-11 flex-1"
            >
              {t("aiSet.ttsTry")}
            </Button>
            {took !== null && (
              <span className="text-caption tabular-nums text-muted-foreground">
                {t("aiSet.ttsTook", { ms: String(took) })}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
