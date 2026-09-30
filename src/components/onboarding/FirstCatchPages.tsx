import { ArrowLeft, ArrowRight, Bell, BellOff, Sparkles } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { FirstCatch } from "@/lib/first-catch";
import { normalizeReminderPrefs, type ReminderMode } from "@/lib/review-reminder";
import type { ReactNode } from "react";
import { sampleStickers } from "./FirstCatchHome";
import { AlbumPrint } from "@/components/AlbumPrint";
import "./first-catch.css";

/** `ratio` は写真そのものの高さ÷幅（`public/` の実寸）。枠をこの形にするので切れない。 */
export const FIRST_CATCH_PHOTOS = [
  { src: "/first-catch-cafe.webp", word: "coffee", ratio: 1.5 },
  { src: "/first-catch-flower.webp", word: "花", ratio: 1 },
  { src: "/first-catch-cat.webp", word: "cat", ratio: 1 },
  { src: "/first-catch-ready.webp", word: "sea", ratio: 1 },
];

/**
 * **最初の画面の4枚の並べ方**（オーナー指示 2026-09-30「ウェルカム画面の4枚の画像の配置が
 * 美しくないから、4枚を一つの作品のように並べて。デザイン案を複数出して」）。
 *
 * - `mosaic`（A）: 傾けず重ねず、同じ隙間で組んだ**1つの長方形**。左の列は縦長の珈琲と猫、
 *   右の列は花と海。右の列を 1.25 倍の幅にすると、両方の列の高さがちょうど揃う
 *   （左 = 1.5w + 1w、右 = 1.25w × 2）。
 * - `frame`（B）: A と同じ組み方を、**1枚の額**（台紙＋細い縁）に収める。
 * - `bouquet`（C）: 猫を手前の主役に、花と海を左右対称に傾け、珈琲を奥の中央に立てる。
 *
 * 写真は3案とも**写真の比のまま**（切らない・潰さない）。**本番は C**（オーナー決定
 * 2026-09-30「Cにして」）。A・B は確認用ページ（`?layout=`）で見比べられるよう残す。
 */
export const WELCOME_LAYOUTS = ["mosaic", "frame", "bouquet"] as const;
export type WelcomeLayout = (typeof WELCOME_LAYOUTS)[number];
export const DEFAULT_WELCOME_LAYOUT: WelcomeLayout = "bouquet";
let welcomeLayoutPreview: WelcomeLayout | null = null;
/** 確認用ページだけが使う（本番のコードからは呼ばない）。 */
export function setWelcomeLayoutPreview(layout: WelcomeLayout | null) {
  welcomeLayoutPreview = layout;
}

/**
 * **最初の画面とログイン画面の写真の束。**（オーナー指示 2026-09-29「画像の縮尺が変、
 * 縦に圧縮されすぎてる…写真自体のデザインもホーム画面のアルバムの写真と全く同じ
 * ものにして」）
 *
 * 前は4枚とも同じ正方形に近い枠に `object-fit: cover` で押し込んでいたので、縦長の
 * 珈琲の写真（2:3）は上下が大きく切られ、枠も横に広く見えた。今は1枚ずつ
 * **写真の比のままの枠**（`AlbumPrint`）で、ホームのアルバムと同じ紙・語。
 * 留め具（テープ・四隅）は付けない（2026-09-30）。
 * 大きさは束の箱の高さ（`cqh`）から決めるので、背の低い画面でもはみ出さない。
 * `layout` を渡さない束（ログイン画面）は、今までどおりの扇形。
 */
export function FirstCatchPhotoStack({
  labels,
  lang,
  className,
  layout,
}: {
  labels: string[];
  lang?: string | null;
  className?: string;
  layout?: WelcomeLayout;
}) {
  const chosen = layout ? (welcomeLayoutPreview ?? layout) : null;
  return (
    <div
      className={`first-print-stack ${chosen ? `first-print-stack--${chosen}` : ""} ${className ?? ""}`}
      data-layout={chosen ?? undefined}
      aria-hidden="true"
    >
      {chosen === "frame" && <span className="first-print-frame" />}
      {FIRST_CATCH_PHOTOS.map(({ src, ratio }, i) => (
        <AlbumPrint
          key={src}
          id={`first-catch-${i}`}
          src={src}
          ratio={ratio}
          word={labels[i] ?? ""}
          lang={lang}
          fasteners={false}
          className={`first-print first-print-${i}`}
        />
      ))}
    </div>
  );
}

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
    <button
      type="button"
      className="first-primary tour-pulse"
      onClick={onClick}
      disabled={disabled}
    >
      {children}
      <ArrowRight size={20} />
    </button>
  );
}

export function FirstCatchIntro({
  draft,
  busy,
  onStart,
}: {
  draft: FirstCatch;
  busy: boolean;
  onStart: () => void;
}) {
  const t = useT();
  const labels = sampleStickers(draft, t, draft.targetLanguage).map(
    (sample) => sample.word.headword,
  );
  return (
    <div className="first-run">
      <div className="first-standalone first-intro">
        <header className="first-intro-heading">
          <img src="/icon-192.png" alt="" className="first-intro-logo" />
          <h1>CatchWords</h1>
        </header>
        {/* 写真の束は、残りの高さに収まる大きさで描く（`container-type: size`）。
            前は高さを固定していたので、背の低い画面では「はじめる」の上に
            猫の写真が重なり、667px では「はじめる」が画面の外へ落ちていた。
            手書きの一言と4つの点は外した — 一言は見出しの言い直しで、
            点は横に送れない画面を送れるように見せていた。 */}
        <FirstCatchPhotoStack
          labels={labels}
          lang={draft.targetLanguage}
          className="first-polaroids"
          layout={DEFAULT_WELCOME_LAYOUT}
        />
        <footer className="first-standalone-footer">
          <PrimaryAction onClick={onStart} disabled={busy}>
            {t("first.introStart")}
          </PrimaryAction>
          {/* 再訪した人（期限切れ・別端末）は最初の画面からログインへ行ける。
              前は質問の1枚目まで進まないと入口が無かった。 */}
          <a className="first-secondary text-center" href="/auth">
            {t("first.signin")}
          </a>
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
  onChange: (reminders: { mode: ReminderMode; times: string[] }) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const t = useT();
  // 設定と同じ3つ（オフ / 自動 / 時刻を指定）。古い下書きもここで今の形に揃える。
  const prefs = normalizeReminderPrefs(draft.reminders ?? null);
  const mode = draft.reminders ? prefs.mode : "ai";
  const time = prefs.times[0] ?? "09:00";
  const items = [
    { key: "ai" as const, Icon: Sparkles },
    { key: "custom" as const, Icon: Bell },
    { key: "off" as const, Icon: BellOff },
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
        </div>
        <div className="first-reminders" role="radiogroup" aria-label={t("remind.label")}>
          {items.map(({ key, Icon }) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={mode === key}
              disabled={busy}
              className="first-reminder"
              onClick={() => onChange({ mode: key, times: [time] })}
            >
              <span className="first-reminder-icon">
                <Icon size={22} />
              </span>
              <span className="first-reminder-text">
                <strong>{t(`remind.${key}`)}</strong>
              </span>
              <span className="first-radio" aria-hidden="true" />
            </button>
          ))}
          {mode === "custom" && (
            <input
              type="time"
              value={time}
              aria-label={t("remind.custom")}
              disabled={busy}
              className="first-reminder-time"
              onChange={(e) => {
                const v = e.target.value;
                if (/^\d{2}:\d{2}$/.test(v)) onChange({ mode: "custom", times: [v] });
              }}
            />
          )}
        </div>
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
  draft,
  busy,
  onBack,
  onStart,
}: {
  draft: FirstCatch;
  busy: boolean;
  onBack: () => void;
  onStart: () => void;
}) {
  const t = useT();
  // 猫の1枚（`sampleStickers` の3枚目）の語。ホームのアルバムと同じく写真の下の余白に書く。
  const catWord = sampleStickers(draft, t, draft.targetLanguage)[2]?.word.headword ?? "";
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
          {/* ホームのアルバムと同じ1枚（紙・留め具・下の余白の語）。一言はホームの
              「撮ったときに書いた一言」と同じく、紙の下に手書きで添える。 */}
          <AlbumPrint
            id="first-catch-ready"
            src="/first-catch-cat.webp"
            ratio={1}
            word={catWord}
            lang={draft.targetLanguage}
            note={t("first.readyPhoto")}
            fasteners={false}
            className="first-ready-photo"
          />
        </div>
        <footer className="first-standalone-footer">
          <PrimaryAction onClick={onStart} disabled={busy}>
            {t("first.readyStart")}
          </PrimaryAction>
        </footer>
      </div>
    </div>
  );
}
