import { useReadableError } from "@/lib/errors";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n";
import {
  TAIWAN_LANGUAGE,
  taiwanChoice,
  type TaiwanGender,
  type GeminiDiagnosis,
  type TaiwanVoice,
  type TtsProviderInfo,
  type TtsVoiceConfig,
} from "@/lib/tts-providers";

/** `getTtsVoiceAdmin` の返事の形（雛形からも同じ形で渡せるように）。 */
export type TtsVoiceAdminData = {
  config: TtsVoiceConfig;
  providers: Array<TtsProviderInfo & { voices: Record<string, string[]>; keys_present: boolean }>;
  languages: string[];
  taiwanAzureVoices?: Record<TaiwanGender, string[]>;
  legacy: string;
};

/**
 * **発音の声を出す会社を選ぶ**（開発者だけ。オーナー指示 2026-09-23「台湾華語の
 * 発音が機械音で気に入らないから…開発者の私だけ、apiを設定できるようにして」）。
 *
 * 学習言語ごとに「会社・声・モデル」を選び、**その場で鳴らして届くまでの時間を
 * 見てから**切り替える（「速さと正確性が命」）。鍵はここでは入れない — 環境変数
 * （Lovable の Secrets）に置き、ここには揃っているかだけを出す。
 */
export function TtsVoiceForm({
  data,
  onTry,
  onSave,
  onDiagnose,
  defaultOpen = false,
}: {
  data: TtsVoiceAdminData | undefined;
  onTry: (
    language: string,
    text: string,
    choice: { provider: string; voice: string; model?: string },
  ) => Promise<{ audio_url: string; ms: number }>;
  onSave: (
    languages: Record<string, { provider: string; voice: string; model?: string }>,
    taiwan: TaiwanVoice | null,
  ) => Promise<void>;
  onDiagnose?: () => Promise<GeminiDiagnosis>;
  /** 最初から開いておく（確認用ページ）。 */
  defaultOpen?: boolean;
}) {
  const t = useT();
  const readable = useReadableError();
  type Draft = { provider: string; voice: string; model: string };
  const [draft, setDraft] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [took, setTook] = useState<Record<string, number>>({});
  // 台湾の声（アプリ全体で1つ）。provider が空なら「決めない」。
  const [tw, setTw] = useState<TaiwanVoice | null>(null);
  const [diag, setDiag] = useState<GeminiDiagnosis | null>(null);

  useEffect(() => {
    if (!data) return;
    setTw(data.config.taiwan ?? null);
    const next: Record<string, Draft> = {};
    for (const lang of data.languages) {
      const c = data.config.languages?.[lang];
      next[lang] = { provider: c?.provider ?? "", voice: c?.voice ?? "", model: c?.model ?? "" };
    }
    setDraft(next);
  }, [data]);

  const update = (lang: string, patch: Partial<Draft>) =>
    setDraft((d) => ({
      ...d,
      [lang]: { ...(d[lang] ?? { provider: "", voice: "", model: "" }), ...patch },
    }));

  async function tryVoice(lang: string) {
    const d = draft[lang];
    if (!d?.provider) return;
    setBusy(`try-${lang}`);
    try {
      const r = await onTry(lang, lang === "en" ? "Nice to meet you." : "你好，很高興認識你。", {
        provider: d.provider,
        voice: d.voice,
        model: d.model || undefined,
      });
      setTook((m) => ({ ...m, [lang]: r.ms }));
      void new Audio(r.audio_url).play();
    } catch (e) {
      toast.error(readable(e, t("settings.saveFailed")));
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setBusy("save");
    try {
      const languages: Record<string, { provider: string; voice: string; model?: string }> = {};
      for (const [lang, d] of Object.entries(draft)) {
        if (d.provider)
          languages[lang] = { provider: d.provider, voice: d.voice, model: d.model || undefined };
      }
      await onSave(languages, tw);
    } catch (e) {
      toast.error(readable(e, t("settings.saveFailed")));
    } finally {
      setBusy(null);
    }
  }

  const twChoice = taiwanChoice(tw);
  const twGender: TaiwanGender = tw?.gender ?? "female";
  const patchTw = (patch: Partial<TaiwanVoice>) =>
    setTw((cur) => ({ provider: "azure", gender: "female", ...(cur ?? {}), ...patch }));

  async function tryTaiwan() {
    if (!twChoice) return;
    setBusy("try-tw");
    try {
      const r = await onTry(TAIWAN_LANGUAGE, "你好，很高興認識你。", twChoice);
      setTook((m) => ({ ...m, [TAIWAN_LANGUAGE]: r.ms }));
      void new Audio(r.audio_url).play();
    } catch (e) {
      toast.error(readable(e, t("settings.saveFailed")));
    } finally {
      setBusy(null);
    }
  }

  async function runDiagnose() {
    if (!onDiagnose) return;
    setBusy("diag");
    try {
      setDiag(await onDiagnose());
    } catch (e) {
      toast.error(readable(e, t("settings.saveFailed")));
    } finally {
      setBusy(null);
    }
  }

  return (
    <details open={defaultOpen} className="rounded-2xl border border-border bg-card p-4">
      <summary className="cursor-pointer list-none text-body font-semibold [&::-webkit-details-marker]:hidden">
        {t("settings.ttsSwitch")}
      </summary>
      {data && (
        <p className="mt-2 text-caption text-muted-foreground">
          {t("settings.ttsLegacy", { p: data.legacy })}
        </p>
      )}
      <div className="mt-3 space-y-4">
        <div className="space-y-2 rounded-xl border-2 border-primary/40 p-3" data-tts-taiwan>
          <p className="text-footnote font-semibold">{t("settings.ttsTwTitle")}</p>
          <p className="text-caption text-muted-foreground">{t("settings.ttsTwNote")}</p>
          <select
            aria-label={t("settings.ttsProvider")}
            value={tw?.provider ?? ""}
            onChange={(e) => {
              if (!e.target.value) return setTw(null);
              patchTw({
                provider: e.target.value as "azure" | "gemini",
                model: undefined,
              });
            }}
            className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-field"
          >
            <option value="">{t("settings.ttsTwOff")}</option>
            <option value="azure">Azure (zh-TW)</option>
            <option value="gemini">Gemini TTS</option>
          </select>
          {tw && (
            <>
              <div className="flex gap-2" role="radiogroup" aria-label={t("settings.ttsTwGender")}>
                {(["female", "male"] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    role="radio"
                    aria-checked={twGender === g}
                    onClick={() => patchTw({ gender: g })}
                    className={`min-h-11 flex-1 rounded-md border px-3 text-field font-semibold ${
                      twGender === g
                        ? "border-primary bg-primary/10 text-primary-ink"
                        : "border-input bg-background"
                    }`}
                  >
                    {g === "female" ? t("settings.ttsTwFemale") : t("settings.ttsTwMale")}
                  </button>
                ))}
              </div>
              {tw.provider === "azure" && (
                <select
                  aria-label={t("settings.ttsVoice")}
                  value={twChoice?.voice ?? ""}
                  onChange={(e) =>
                    patchTw({ voices: { ...(tw.voices ?? {}), [twGender]: e.target.value } })
                  }
                  className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-field"
                >
                  {(data?.taiwanAzureVoices?.[twGender] ?? []).map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              )}
              {tw.provider === "gemini" && (
                <>
                  <select
                    aria-label={t("settings.ttsModel")}
                    value={tw.model ?? twChoice?.model ?? ""}
                    onChange={(e) => patchTw({ model: e.target.value })}
                    className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-field"
                  >
                    {(data?.providers.find((p) => p.id === "gemini")?.models ?? []).map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <Input
                    aria-label={t("settings.ttsVoice")}
                    placeholder={t("settings.ttsVoice")}
                    list="tts-tw-gemini-voices"
                    value={tw.voices?.[twGender] ?? ""}
                    onChange={(e) =>
                      patchTw({ voices: { ...(tw.voices ?? {}), [twGender]: e.target.value } })
                    }
                  />
                  <datalist id="tts-tw-gemini-voices">
                    {(diag?.voices[twGender] ?? []).map((v) => (
                      <option key={v.id} value={v.id}>
                        {[v.name, v.accent].filter(Boolean).join(" / ")}
                      </option>
                    ))}
                  </datalist>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy !== null || !onDiagnose}
                    onClick={() => void runDiagnose()}
                  >
                    {t("settings.ttsDiagnose")}
                  </Button>
                  {diag && (
                    <ul className="space-y-0.5 text-caption text-muted-foreground" role="status">
                      <li>
                        {diag.keyPresent
                          ? t("settings.ttsDiagKeyOk", { k: diag.keyEnv ?? "" })
                          : t("settings.ttsDiagKeyNo")}
                      </li>
                      {diag.models.map((m) => (
                        <li key={m.id}>
                          {m.id}: {m.ok ? "OK" : `NG (${m.status})`}
                        </li>
                      ))}
                      <li>
                        {t("settings.ttsDiagVoices", {
                          f: String(diag.voices.female.length),
                          m: String(diag.voices.male.length),
                        })}
                        {diag.voicesError ? ` — ${diag.voicesError}` : ""}
                      </li>
                    </ul>
                  )}
                </>
              )}
              {!twChoice && (
                <p className="rounded-lg bg-destructive/10 p-1.5 text-caption text-destructive-ink">
                  {t("settings.ttsTwIncomplete")}
                </p>
              )}
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!twChoice || busy !== null}
                  onClick={() => void tryTaiwan()}
                >
                  {t("settings.ttsTry")}
                </Button>
                {took[TAIWAN_LANGUAGE] !== undefined && (
                  <span className="text-caption tabular-nums text-muted-foreground">
                    {t("settings.ttsTook", { ms: String(took[TAIWAN_LANGUAGE]) })}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
        {(data?.languages ?? [])
          .filter((lang) => !(lang === TAIWAN_LANGUAGE && twChoice))
          .map((lang) => {
            const d = draft[lang] ?? { provider: "", voice: "", model: "" };
            const info = data?.providers.find((p) => p.id === d.provider);
            const voices = info?.voices[lang] ?? [];
            const listId = `tts-voices-${lang}`;
            return (
              <div key={lang} className="space-y-2 rounded-xl border border-border p-3">
                <p className="text-footnote font-semibold">
                  {lang === "en" ? t("settings.ttsLangEn") : t("settings.ttsLangZh")}
                </p>
                <select
                  aria-label={t("settings.ttsProvider")}
                  value={d.provider}
                  onChange={(e) => {
                    const next = data?.providers.find((p) => p.id === e.target.value);
                    update(lang, {
                      provider: e.target.value,
                      voice: next?.voices[lang]?.[0] ?? "",
                      model: next?.models[0] ?? "",
                    });
                  }}
                  className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-field"
                >
                  <option value="">{t("settings.ttsDefault")}</option>
                  {(data?.providers ?? []).map((p) => (
                    <option key={p.id} value={p.id} disabled={!p.implemented}>
                      {p.label}
                      {!p.implemented ? ` — ${t("settings.ttsNotConnected")}` : ""}
                    </option>
                  ))}
                </select>
                {info && (
                  <>
                    <p className="text-caption text-muted-foreground">{info.note}</p>
                    {!info.keys_present && (
                      <p className="rounded-lg bg-destructive/10 p-1.5 text-caption text-destructive-ink">
                        {t("settings.ttsKeyMissing", { k: info.keyEnvs.join(", ") })}
                      </p>
                    )}
                    <Input
                      aria-label={t("settings.ttsVoice")}
                      placeholder={t("settings.ttsVoice")}
                      list={listId}
                      value={d.voice}
                      onChange={(e) => update(lang, { voice: e.target.value })}
                    />
                    <datalist id={listId}>
                      {voices.map((v) => (
                        <option key={v} value={v} />
                      ))}
                    </datalist>
                    {info.models.length > 0 && (
                      <select
                        aria-label={t("settings.ttsModel")}
                        value={d.model}
                        onChange={(e) => update(lang, { model: e.target.value })}
                        className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-field"
                      >
                        {info.models.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    )}
                    <div className="flex items-center gap-3">
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={!d.voice || busy !== null}
                        onClick={() => void tryVoice(lang)}
                      >
                        {t("settings.ttsTry")}
                      </Button>
                      {took[lang] !== undefined && (
                        <span className="text-caption tabular-nums text-muted-foreground">
                          {t("settings.ttsTook", { ms: String(took[lang]) })}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        <Button type="button" onClick={() => void save()} disabled={busy !== null || !data}>
          {t("settings.ttsSave")}
        </Button>
      </div>
    </details>
  );
}
