import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n";
import type { TtsProviderInfo, TtsVoiceConfig } from "@/lib/tts-providers";

/** `getTtsVoiceAdmin` の返事の形（雛形からも同じ形で渡せるように）。 */
export type TtsVoiceAdminData = {
  config: TtsVoiceConfig;
  providers: Array<TtsProviderInfo & { voices: Record<string, string[]>; keys_present: boolean }>;
  languages: string[];
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
}: {
  data: TtsVoiceAdminData | undefined;
  onTry: (
    language: string,
    text: string,
    choice: { provider: string; voice: string; model?: string },
  ) => Promise<{ audio_url: string; ms: number }>;
  onSave: (
    languages: Record<string, { provider: string; voice: string; model?: string }>,
  ) => Promise<void>;
}) {
  const t = useT();
  type Draft = { provider: string; voice: string; model: string };
  const [draft, setDraft] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [took, setTook] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!data) return;
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
      toast.error(e instanceof Error ? e.message : t("settings.saveFailed"));
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
      await onSave(languages);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("settings.saveFailed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <details className="rounded-2xl border border-border bg-card p-4">
      <summary className="cursor-pointer list-none text-body font-semibold [&::-webkit-details-marker]:hidden">
        {t("settings.ttsSwitch")}
      </summary>
      {data && (
        <p className="mt-2 text-caption text-muted-foreground">
          {t("settings.ttsLegacy", { p: data.legacy })}
        </p>
      )}
      <div className="mt-3 space-y-4">
        {(data?.languages ?? []).map((lang) => {
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
