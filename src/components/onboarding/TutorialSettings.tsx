import { ArrowLeft, RotateCcw, ListRestart, LogIn } from "lucide-react";
import { TARGET_LANG_LABEL_KEYS, UI_LANGS, UI_LANG_LABEL_KEYS, useT } from "@/lib/i18n";
import { webTargetChoices } from "@/lib/target-lang";
import { normalizeReminderPrefs } from "@/lib/review-reminder";
import type { FirstCatch } from "@/lib/first-catch";
import {
  ChoiceRow,
  PhoneticRow,
  SettingsCard,
  SoundAndHapticsPanel,
} from "@/components/screens/SettingsScreen";
import { PickerRow } from "@/components/PickerRow";

export { TutorialSettingsContext, useOpenTutorialSettings } from "./tutorial-settings-context";

/**
 * **チュートリアル中の設定画面**（オーナー指示 2026-09-30「言語を選び直せるボタンを
 * 設置するのではなく、チュートリアルでも設定が触れて変更できるようにして」）。
 *
 * 本物の設定画面（`/settings`）は登録した人だけが開けるので、**同じ部品**
 * （`SettingsCard` / `PickerRow` / `ChoiceRow` / `PhoneticRow` / `SoundAndHapticsPanel`）で
 * 登録前に決められる物だけを並べる。変えた値はチュートリアルの下書きに入り、
 * 登録した時にそのままアカウントへ引き継がれる（`FirstCatchTransfer`）。
 */
export function TutorialSettings({
  draft,
  onChange,
  onClose,
  onRedoQuestions,
  onRestart,
  onSignIn,
}: {
  draft: FirstCatch;
  onChange: (next: FirstCatch) => void;
  onClose: () => void;
  onRedoQuestions: () => void;
  onRestart: () => void;
  onSignIn: () => void;
}) {
  const t = useT();
  const reminders = normalizeReminderPrefs(draft.reminders ?? { mode: "ai", times: ["09:00"] });
  return (
    <div className="settings-page space-y-7 pb-28" data-tour="tutorial-settings">
      <header className="flex items-center gap-2">
        <button
          type="button"
          onClick={onClose}
          className="press-in inline-flex min-h-11 items-center gap-1 rounded-full border border-border bg-card px-4 text-body font-semibold"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {t("first.backToTutorial")}
        </button>
      </header>
      <div>
        <h1 className="text-title font-semibold">{t("nav.settings")}</h1>
        <p className="mt-1 text-footnote text-muted-foreground">{t("first.settingsNote")}</p>
      </div>

      <SettingsCard title={t("settings.language")}>
        <div className="space-y-3">
          <PickerRow
            id="first-lang-ui"
            label={t("settings.uiLang")}
            value={draft.uiLanguage}
            onChange={(v) => onChange({ ...draft, uiLanguage: v as FirstCatch["uiLanguage"] })}
            options={UI_LANGS.map((code) => ({ value: code, label: t(UI_LANG_LABEL_KEYS[code]) }))}
          />
          <PickerRow
            id="first-lang-target"
            label={t("settings.targetLang")}
            value={draft.targetLanguage}
            onChange={(v) =>
              onChange({ ...draft, targetLanguage: v as FirstCatch["targetLanguage"] })
            }
            // 日本語は iOS が先(Web の選択肢には出さない。`WEB_TARGET_CHOICES` の注)。
            options={webTargetChoices(draft.targetLanguage).map((code) => ({
              value: code,
              label: t(TARGET_LANG_LABEL_KEYS[code as FirstCatch["targetLanguage"]]),
            }))}
          />
          <PhoneticRow lang={draft.targetLanguage} />
        </div>
      </SettingsCard>

      <SettingsCard title={t("settings.study")}>
        <div className="space-y-3">
          <ChoiceRow
            cols={5}
            label={t("first.dailyTime")}
            value={draft.dailyMinutes}
            onChange={(v) => onChange({ ...draft, dailyMinutes: v })}
            options={([5, 10, 15, 30, 60] as const).map((n) => ({
              value: n,
              label: t("first.minutes", { n }),
            }))}
          />
          <ChoiceRow
            cols={3}
            label={t("remind.label")}
            value={reminders.mode}
            onChange={(mode) => onChange({ ...draft, reminders: { ...reminders, mode } })}
            options={[
              { value: "ai", label: t("remind.ai") },
              { value: "custom", label: t("remind.custom") },
              { value: "off", label: t("remind.off") },
            ]}
          />
        </div>
      </SettingsCard>

      <SoundAndHapticsPanel />

      <div className="grid gap-2">
        <TutorialAction icon={ListRestart} onClick={onRedoQuestions}>
          {t("first.redoQuestions")}
        </TutorialAction>
        <TutorialAction icon={RotateCcw} onClick={onRestart}>
          {t("first.backToWelcome")}
        </TutorialAction>
        <TutorialAction icon={LogIn} onClick={onSignIn}>
          {t("first.signin")}
        </TutorialAction>
      </div>
    </div>
  );
}

function TutorialAction({
  icon: Icon,
  onClick,
  children,
}: {
  icon: typeof RotateCcw;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="press-in flex min-h-12 items-center gap-3 rounded-2xl border border-border bg-card px-4 text-left text-body font-semibold"
    >
      <Icon className="h-5 w-5 text-primary-ink" aria-hidden />
      {children}
    </button>
  );
}
