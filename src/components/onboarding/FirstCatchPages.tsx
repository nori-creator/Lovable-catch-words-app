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
 * **ログイン画面の写真の束。**（オーナー指示 2026-09-29「画像の縮尺が変、
 * 縦に圧縮されすぎてる…写真自体のデザインもホーム画面のアルバムの写真と全く同じ
 * ものにして」）
 *
 * 前は4枚とも同じ正方形に近い枠に `object-fit: cover` で押し込んでいたので、縦長の
 * 珈琲の写真（2:3）は上下が大きく切られ、枠も横に広く見えた。今は1枚ずつ
 * **写真の比のままの枠**（`AlbumPrint`）で、ホームのアルバムと同じ紙・語。
 * 留め具（テープ・四隅）は付けない（2026-09-30）。横に少しずつ重ねた扇形。
 * （最初の画面は 2026-10-03 から `FirstCatchIntro` の空と手の1枚に変わった。）
 */
export function FirstCatchPhotoStack({
  labels,
  lang,
  className,
}: {
  labels: string[];
  lang?: string | null;
  className?: string;
}) {
  return (
    <div className={`first-print-stack ${className ?? ""}`} aria-hidden="true">
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

/**
 * 最初の画面の周りの4枚（ぼかした奥の写真）。語はどれも学ぶ言語の見本の語。
 * `photo` は花・猫・珈琲・湖の写真を**先にぼかして小さくした**1枚（`ratio` は高さ÷幅）。
 * 画面で `filter: blur()` を掛けると、Chrome で写真が白く抜けて描かれる時があった
 * （実測）うえ、動く4枚を毎回ぼかすのは重い。
 */
const WELCOME_AROUND = [
  { key: "flower", photo: "/first-catch-welcome-blur-flower.webp", ratio: 1 },
  { key: "cat", photo: "/first-catch-welcome-blur-cat.webp", ratio: 1 },
  { key: "coffee", photo: "/first-catch-welcome-blur-coffee.webp", ratio: 1.5 },
  { key: "lake", photo: "/first-catch-welcome-blur-lake.webp", ratio: 1 },
] as const;

/** 写真の下に手で書く1語。手前の1枚はオーナー指定の「海邊」（2026-10-03）。 */
function welcomeWord(key: (typeof WELCOME_AROUND)[number]["key"] | "seaside", en: boolean) {
  const words = {
    seaside: ["seaside", "海邊"],
    flower: ["flower", "花"],
    cat: ["cat", "貓"],
    coffee: ["coffee", "咖啡"],
    lake: ["lake", "湖"],
  } as const;
  return words[key][en ? 0 : 1];
}

/**
 * **最初の画面**（オーナー指示 2026-10-03「ウェルカム画面はAのデザインを再現して。
 * キャッチフレーズは日常のすべてが学びになる。海の写真の下には海邊という台湾華語を
 * 書き入れて」「アニメーションを入れて、祝福する、画面に動きを入れて」）。
 *
 * 明るい空の上に、手が持ち上げた海の1枚（下の余白に手書きの「海邊」）と、その周りに
 * ぼかした4枚の写真。写真の並びはオーナーの見本（A. シンプルモダン）の寸法をそのまま
 * 写した1枚の「舞台」（横 612・縦 770 の見本の単位）で、箱の高さ・幅に収まる倍率で描く。
 * 見本にある3つの点は付けない — 横に送れない画面を送れるように見せるため（2026-09-30
 * に外した理由と同じ）。
 *
 * 動き: 雲が流れ、周りの写真が舞い込んで止まり、手の1枚が下から上がって小さく揺れ、
 * 写真に光が走って星がまたたく。動きを減らす設定（`html[data-motion="reduce"]`）では
 * 止まった最後の絵だけを出す。
 */
export function FirstCatchIntro({
  draft,
  busy,
  error,
  onStart,
}: {
  draft: FirstCatch;
  busy: boolean;
  /** 「はじめる」で保存できなかった時の理由。前は出す所が無く、押しても無反応に見えた。 */
  error?: ReactNode;
  onStart: () => void;
}) {
  const t = useT();
  const en = draft.targetLanguage === "en";
  // 学ぶ言語の字で、細いペンで書いたように（台湾華語は Zen Kurenaido、英語は Caveat）。
  const hand = en ? "handwritten" : "first-welcome-pen";
  return (
    <div className="first-run first-welcome">
      <div className="first-sky" aria-hidden="true">
        <span className="first-sky-cloud first-sky-cloud--1" />
        <span className="first-sky-cloud first-sky-cloud--2" />
        <span className="first-sky-cloud first-sky-cloud--3" />
        <span className="first-sky-cloud first-sky-cloud--4" />
        <span className="first-sky-sea" />
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} className={`first-sky-glint first-sky-glint--${i + 1}`} />
        ))}
      </div>
      <div className="first-standalone first-intro">
        <header className="first-intro-heading">
          <img src="/icon-192.png" alt="" className="first-intro-logo" />
          <h1>CatchWords</h1>
          <p className="first-intro-tagline">{t("first.introTagline")}</p>
        </header>
        <div className="first-welcome-stage" aria-hidden="true">
          {WELCOME_AROUND.map(({ key, photo, ratio }, i) => (
            <span
              key={key}
              className={`first-welcome-around first-welcome-around--${i + 1}`}
              style={{ ["--ratio" as string]: String(ratio) }}
            >
              <span className="first-welcome-paper">
                <img src={photo} alt="" className="first-welcome-photo" decoding="async" />
                <span className="first-welcome-caption" lang={draft.targetLanguage}>
                  <span className={hand}>{welcomeWord(key, en)}</span>
                </span>
              </span>
            </span>
          ))}
          <span className="first-welcome-held">
            <span className="first-welcome-sway">
              <span className="first-welcome-paper first-welcome-paper--main">
                <span className="first-welcome-shot">
                  <img
                    src="/first-catch-ready.webp"
                    alt=""
                    className="first-welcome-photo"
                    decoding="async"
                  />
                  <span className="first-welcome-shine" />
                </span>
                <span className="first-welcome-caption" lang={draft.targetLanguage}>
                  <span className={hand}>{welcomeWord("seaside", en)}</span>
                </span>
              </span>
              <img src="/first-catch-hand.webp" alt="" className="first-welcome-hand" />
            </span>
            {Array.from({ length: 5 }, (_, i) => (
              <span key={i} className={`first-welcome-spark first-welcome-spark--${i + 1}`} />
            ))}
          </span>
        </div>
        {error}
        <footer className="first-standalone-footer">
          <PrimaryAction onClick={onStart} disabled={busy}>
            {t("first.introStart")}
          </PrimaryAction>
          {/* 再訪した人（期限切れ・別端末）は最初の画面からログインへ行ける。
              見本どおり「ログイン」だけを青い文字にし、押せる高さ（44px）は保つ。 */}
          <p className="first-welcome-signin">
            {t("first.signinPrompt")}
            <a className="first-secondary" href="/auth">
              {t("first.signinLink")}
            </a>
          </p>
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
  error,
  onBack,
  onStart,
}: {
  draft: FirstCatch;
  busy: boolean;
  /** 次へ進む・戻るで保存できなかった時の理由と再試行（最初の画面と同じ）。 */
  error?: ReactNode;
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
        {error}
        <footer className="first-standalone-footer">
          <PrimaryAction onClick={onStart} disabled={busy}>
            {t("first.readyStart")}
          </PrimaryAction>
        </footer>
      </div>
    </div>
  );
}
