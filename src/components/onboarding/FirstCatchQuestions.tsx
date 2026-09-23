import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock3,
  MessageCircle,
  Plane,
  BriefcaseBusiness,
  GraduationCap,
  BookOpen,
  Ellipsis,
} from "lucide-react";
import { UI_LANGS, UI_LANG_LABEL_KEYS, TARGET_LANG_LABEL_KEYS, useT } from "@/lib/i18n";
import { TARGET_LANGUAGES } from "@/lib/target-lang";
import { FIRST_CATCH_GOALS, FIRST_CATCH_INTERESTS, type FirstCatch } from "@/lib/first-catch";
import type { ReactNode } from "react";

/**
 * 言語の印は**国旗ではなく、その言語の字**。国旗は国を指し、言語を指さない
 * （英語は米国だけの言語ではない。Apple の HIG も言語の選択に国旗を使わない）。
 */
const GLYPHS = {
  ja: "あ",
  en: "A",
  "zh-TW": "繁",
};
const NATIVE = {
  ja: "日本語",
  en: "English",
  "zh-TW": "繁體中文",
};
const GOAL_ICONS = [MessageCircle, Plane, BriefcaseBusiness, GraduationCap, BookOpen, Ellipsis];

export function FirstCatchQuestions({
  draft,
  onChange,
  onContinue,
  busy,
  error,
}: {
  draft: FirstCatch;
  onChange: (next: FirstCatch) => void;
  onContinue: (next: FirstCatch) => void;
  busy: boolean;
  error: ReactNode;
}) {
  const t = useT();
  const step = draft.questionIndex ?? 0;
  const title = ["display", "target", "time", "goals", "interests"][step];
  const toggle = (field: "goals" | "interests", value: string) => {
    const selected = draft[field] ?? [];
    onChange({
      ...draft,
      [field]: selected.includes(value as never)
        ? selected.filter((x) => x !== value)
        : [...selected, value],
    });
  };
  return (
    <div className="first-run">
      <div className="first-questions" key={step}>
        <header className="first-question-nav">
          <button
            type="button"
            className="first-back"
            aria-label={t("first.back")}
            disabled={step === 0 || busy}
            onClick={() => onContinue({ ...draft, questionIndex: step - 1 })}
          >
            <ArrowLeft size={22} />
          </button>
          <div
            className="first-progress"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={7}
            aria-valuenow={step + 1}
            aria-label={t("first.setup")}
          >
            <span style={{ width: `${((step + 1) / 7) * 100}%` }} />
          </div>
          <span className="first-count">{step + 1} / 7</span>
        </header>
        <div className="first-question-heading">
          <h1>{t(`first.${title}`)}</h1>
          <p className="first-sub">{t(`first.${title}Hint`)}</p>
        </div>
        {step < 2 && (
          <div className="first-choices" role="radiogroup" aria-label={t(`first.${title}`)}>
            {(step === 0 ? UI_LANGS : TARGET_LANGUAGES).map((value) => {
              const checked = (step === 0 ? draft.uiLanguage : draft.targetLanguage) === value;
              const label = t(
                step === 0
                  ? UI_LANG_LABEL_KEYS[value]
                  : TARGET_LANG_LABEL_KEYS[value as FirstCatch["targetLanguage"]],
              );
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  disabled={busy}
                  className="first-choice"
                  onClick={() =>
                    onChange(
                      step === 0
                        ? { ...draft, uiLanguage: value }
                        : { ...draft, targetLanguage: value as FirstCatch["targetLanguage"] },
                    )
                  }
                >
                  <span className="first-glyph" aria-hidden="true" lang={value}>
                    {GLYPHS[value]}
                  </span>
                  <span className="first-choice-copy">
                    {label}
                    {/* その言語自身の名前。表示と同じなら重ねて書かない
                        （「日本語／日本語」と2回並んでいた）。 */}
                    {NATIVE[value] !== label && <small lang={value}>{NATIVE[value]}</small>}
                  </span>
                  <span className="first-check" aria-hidden="true">
                    {checked && <Check size={15} strokeWidth={3} />}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {step === 2 && (
          <>
            <div className="first-clock" aria-hidden="true">
              <Clock3 size={64} strokeWidth={1.4} />
              <span>✧</span>
            </div>
            <div className="first-time-grid" role="radiogroup" aria-label={t("first.time")}>
              {([5, 10, 15, 30, 60] as const).map((value) => (
                <button
                  key={value}
                  role="radio"
                  aria-checked={draft.dailyMinutes === value}
                  className="first-time-choice"
                  disabled={busy}
                  onClick={() => onChange({ ...draft, dailyMinutes: value })}
                >
                  {t("first.minutes", { n: value })}
                </button>
              ))}
            </div>
            <p className="first-soft-note">{t("first.timeNote")}</p>
          </>
        )}
        {step === 3 && (
          <div className="first-choices first-goals" role="group" aria-label={t("first.goals")}>
            {FIRST_CATCH_GOALS.map((value, i) => {
              const Icon = GOAL_ICONS[i];
              const checked = !!draft.goals?.includes(value);
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={checked}
                  className="first-choice"
                  disabled={busy}
                  onClick={() => toggle("goals", value)}
                >
                  <span className="first-choice-icon">
                    <Icon size={22} />
                  </span>
                  <span className="first-choice-copy">
                    {t(`first.goal.${value}`)}
                    {value === "exams" && (
                      <small>{draft.targetLanguage === "en" ? "TOEFL · IELTS" : "TOCFL"}</small>
                    )}
                  </span>
                  <span className="first-check" aria-hidden="true">
                    {checked && <Check size={15} strokeWidth={3} />}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {step === 4 && (
          <div className="first-interest-grid" role="group" aria-label={t("first.interests")}>
            {FIRST_CATCH_INTERESTS.map((value, i) => (
              <button
                key={value}
                type="button"
                className="first-interest"
                aria-pressed={!!draft.interests?.includes(value)}
                disabled={busy}
                onClick={() => toggle("interests", value)}
              >
                <span
                  className="first-interest-photo"
                  aria-hidden="true"
                  style={{ backgroundPosition: `${(i % 3) * 50}% ${Math.floor(i / 3) * 50}%` }}
                />
                <span className="first-interest-label">{t(`first.interest.${value}`)}</span>
                <span className="first-check" aria-hidden="true">
                  {draft.interests?.includes(value) && <Check size={13} strokeWidth={3} />}
                </span>
              </button>
            ))}
          </div>
        )}
        {error}
        <footer className="first-footer">
          <button
            className="first-primary"
            disabled={busy}
            onClick={() =>
              onContinue({
                ...draft,
                questionIndex: Math.min(4, step + 1),
                stage: step === 4 ? "notifications" : "questions",
              })
            }
          >
            {t("first.next")}
            <ArrowRight size={18} />
          </button>
          {step === 0 && (
            <a className="first-secondary text-center" href="/auth">
              {t("first.signin")}
            </a>
          )}
        </footer>
      </div>
    </div>
  );
}
