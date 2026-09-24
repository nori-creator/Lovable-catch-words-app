import { ArrowLeft, ArrowRight, Bell, Moon } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { FirstCatch } from "@/lib/first-catch";
import type { ReactNode } from "react";
import "./first-catch.css";

const photos = [
  { src: "/first-catch-cafe.webp", word: "coffee" },
  { src: "/first-catch-flower.webp", word: "花" },
  { src: "/first-catch-cat.webp", word: "cat" },
];

function PrimaryAction({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button type="button" className="first-primary" onClick={onClick} disabled={disabled}>
      {children}
      <ArrowRight size={20} />
    </button>
  );
}

export function FirstCatchIntro({ busy, onStart }: { busy: boolean; onStart: () => void }) {
  const t = useT();
  return (
    <div className="first-run">
      <div className="first-standalone first-intro">
        <header className="first-intro-heading">
          <img src="/icon-192.png" alt="" className="first-intro-logo" />
          <h1>Catchwords</h1>
          <p>{t("first.introTagline")}</p>
        </header>
        {/* 写真の束は、残りの高さに収まる大きさで描く（`container-type: size`）。
            前は高さを固定していたので、背の低い画面では「はじめる」の上に
            猫の写真が重なり、667px では「はじめる」が画面の外へ落ちていた。
            手書きの一言と4つの点は外した — 一言は見出しの言い直しで、
            点は横に送れない画面を送れるように見せていた。 */}
        <div className="first-polaroids" aria-hidden="true">
          {photos.map(({ src, word }, i) => (
            <div key={src} className={`first-polaroid first-polaroid-${i}`}>
              <img src={src} alt="" />
              <span>{word}</span>
            </div>
          ))}
        </div>
        <footer className="first-standalone-footer">
          <PrimaryAction onClick={onStart} disabled={busy}>
            {t("first.introStart")}
          </PrimaryAction>
        </footer>
      </div>
    </div>
  );
}

export function FirstCatchNotifications({
  draft,
  busy,
  error,
  onChange,
  onBack,
  onContinue,
}: {
  draft: FirstCatch;
  busy: boolean;
  error: ReactNode;
  onChange: (reminders: { morning: boolean; evening: boolean }) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const t = useT();
  const reminders = draft.reminders ?? { morning: false, evening: false };
  const items = [
    { key: "morning" as const, Icon: Bell, time: "9:00" },
    { key: "evening" as const, Icon: Moon, time: "21:00" },
  ];
  return (
    <div className="first-run">
      <div className="first-questions first-notifications">
        <header className="first-question-nav">
          <button
            type="button"
            className="first-back"
            aria-label={t("first.back")}
            disabled={busy}
            onClick={onBack}
          >
            <ArrowLeft size={22} />
          </button>
          <div
            className="first-progress"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={7}
            aria-valuenow={6}
            aria-label={t("first.setup")}
          >
            <span style={{ width: "86%" }} />
          </div>
          <span className="first-count">6 / 7</span>
        </header>
        <div className="first-question-heading">
          <h1>{t("first.notificationsTitle")}</h1>
          <p className="first-sub">{t("first.notificationsHint")}</p>
        </div>
        <div className="first-reminders">
          {items.map(({ key, Icon, time }) => (
            <button
              key={key}
              type="button"
              role="switch"
              aria-checked={reminders[key]}
              disabled={busy}
              className="first-reminder"
              onClick={() => onChange({ ...reminders, [key]: !reminders[key] })}
            >
              <span className="first-reminder-icon">
                <Icon size={22} fill={key === "morning" ? "currentColor" : "none"} />
              </span>
              <span className="first-reminder-text">
                <strong>{t(`first.reminder.${key}`)}</strong>
                <small>{time}</small>
              </span>
              <span className="first-toggle" aria-hidden="true">
                <i />
              </span>
            </button>
          ))}
        </div>
        <p className="first-notification-note">{t("first.notificationsNote")}</p>
        {error}
        <footer className="first-footer">
          <PrimaryAction onClick={onContinue} disabled={busy}>
            {t("first.next")}
          </PrimaryAction>
        </footer>
      </div>
    </div>
  );
}

export function FirstCatchReady({
  busy,
  onBack,
  onStart,
}: {
  busy: boolean;
  onBack: () => void;
  onStart: () => void;
}) {
  const t = useT();
  return (
    <div className="first-run">
      <div className="first-standalone first-ready">
        <button
          type="button"
          className="first-back first-ready-back"
          aria-label={t("first.back")}
          disabled={busy}
          onClick={onBack}
        >
          <ArrowLeft size={22} />
        </button>
        <div className="first-ready-heading">
          <h1>{t("first.readyTitle")}</h1>
          <p>{t("first.readyHint")}</p>
        </div>
        {/* 台湾の街の1枚（台北101の見える窓辺）。前はサントリーニの海で、
            台湾華語を学ぶアプリの入口として場所が合っていなかった。 */}
        <div className="first-ready-art" aria-hidden="true">
          <div className="first-confetti">
            {Array.from({ length: 12 }, (_, i) => (
              <i key={i} />
            ))}
          </div>
          <div className="first-ready-photo">
            <img src="/first-catch-cat.webp" alt="" />
            <span>{t("first.readyPhoto")}</span>
          </div>
        </div>
        <footer className="first-standalone-footer">
          <PrimaryAction onClick={onStart} disabled={busy}>
            {t("first.readyStart")}
          </PrimaryAction>
          <p className="first-ready-footnote">{t("first.readyFootnote")}</p>
        </footer>
      </div>
    </div>
  );
}
