/**
 * 仕様の穴を埋めた4つのうち、画面に出る3つ（2026-10-03）。
 *
 * 1. キャッチの演出（しっかり・短く・オフ）— `?scene=catch-animation&plan=short|full|off`
 * 2. 設定の「保存しました」— `?scene=settings-saved`
 * 3. ホームの「〇か月前のこの言葉、まだ言える？」— `?scene=home-resurface`
 *
 * どれも本物の部品を描く（`CatchLanding` / `SettingsScreen` / `ResurfaceCard`）。
 */
import { useEffect, useRef, useState } from "react";
import { CatchLandingOverlay, runCatchLanding } from "@/components/CatchLanding";
import { MotionProvider } from "@/components/motion-provider";
import { ResurfaceCardView } from "@/components/ResurfaceCard";
import { SaveStatusPill } from "@/components/SaveStatus";
import {
  CatchAnimationRow,
  MotionToggleRow,
  SettingsCard,
  ChoiceRow,
} from "@/components/screens/SettingsScreen";
import { DayCollage, DiaryDate } from "@/components/screens/HomeScreen";
import { parseCatchAnimation, type CatchAnimationPlan } from "@/lib/catch-animation-pref";
import { resurfaceAgeLabel } from "@/lib/resurface";
import { settingsSaveStatus } from "@/lib/save-status";
import { tStatic as t } from "@/lib/i18n";
import { wallClass } from "@/lib/wallpaper";
import { FIXTURES, makeSticker } from "./home";
import { photo as samplePhoto } from "./peel-sticker";
import { readySpeech } from "../speech";

const PREVIEW_IMAGE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="#f4c542"/><circle cx="256" cy="232" r="116" fill="#e85d3f"/><path d="M250 108c28-58 89-70 129-45-23 50-70 73-129 45Z" fill="#31956b"/><circle cx="219" cy="213" r="14" fill="#fff"/><circle cx="298" cy="213" r="14" fill="#fff"/></svg>',
  );

const PLANS: Array<{ plan: CatchAnimationPlan; label: string }> = [
  { plan: "full", label: "A しっかり（節目）" },
  { plan: "short", label: "B 短く（普段・既定）" },
  { plan: "off", label: "C オフ（発音だけ）" },
];

/** 見本の発音（ブラウザの声。足場にはサーバの声が無い）。 */
function speakSample(word: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const synth = window.speechSynthesis;
      if (!synth) return resolve();
      const u = new SpeechSynthesisUtterance(word);
      u.lang = "zh-TW";
      u.onend = () => resolve();
      u.onerror = () => resolve();
      synth.speak(u);
      setTimeout(resolve, 1600);
    } catch {
      resolve();
    }
  });
}

/**
 * キャッチの演出を3通りで見比べる。下の帯で A/B/C を選ぶと、その演出で最初から流れる。
 * `&hold=1` は止めた絵（演出の山場）を撮るため、図鑑へ渡らずに止まる。
 */
export function CatchAnimationScene({ q }: { q: URLSearchParams }) {
  const plan = parseCatchAnimation(q.get("plan"));
  const hold = q.get("hold") === "1";
  const sourceRef = useRef<HTMLDivElement | null>(null);
  const flyRef = useRef<HTMLImageElement | null>(null);
  const [dex, setDex] = useState(false);
  const [run, setRun] = useState(0);

  useEffect(() => {
    setDex(false);
    const timer = setTimeout(() => {
      void runCatchLanding({
        startEl: sourceRef.current,
        fly: flyRef,
        plan,
        speakLine: () => speakSample("捕捉"),
        destinationId: "demo",
        // 止めた絵を撮る時は保存が終わらない（見せ場で浮いたまま待つ）。
        gate: hold ? new Promise(() => {}) : Promise.resolve(),
        openDex: () => setDex(true),
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [plan, hold, run]);

  const bar = (
    <div
      style={{
        position: "fixed",
        left: 8,
        right: 8,
        // 上に置く（下は語と読みが出る所）。
        top: 12,
        zIndex: 10002,
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        justifyContent: "center",
      }}
    >
      {PLANS.map((p) => (
        <a
          key={p.plan}
          href={`?scene=catch-animation&plan=${p.plan}&review=1`}
          style={{
            padding: "8px 10px",
            borderRadius: 999,
            fontSize: 12,
            textDecoration: "none",
            background: p.plan === plan ? "#2563eb" : "rgba(15,23,42,.72)",
            color: "#fff",
            fontWeight: p.plan === plan ? 700 : 400,
          }}
        >
          {p.label}
        </a>
      ))}
      <button
        type="button"
        onClick={() => setRun((n) => n + 1)}
        style={{
          padding: "8px 12px",
          borderRadius: 999,
          fontSize: 12,
          border: 0,
          background: "rgba(15,23,42,.72)",
          color: "#fff",
        }}
      >
        ↻ もう一度
      </button>
    </div>
  );

  if (dex) {
    return (
      <div style={{ padding: 16, background: "var(--background)", minHeight: "100dvh" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {Array.from({ length: 9 }, (_, i) => (
            <div
              key={i}
              id={i === 4 ? "dex-cell-demo" : undefined}
              style={{
                aspectRatio: "1",
                borderRadius: 16,
                background: "#fff",
                boxShadow: "0 2px 8px rgb(0 0 0 / .08)",
                display: "grid",
                placeItems: "center",
                overflow: "hidden",
              }}
            >
              {i === 4 ? (
                <img src={PREVIEW_IMAGE} alt="" style={{ width: "86%", height: "86%" }} />
              ) : (
                <span style={{ fontSize: 28, opacity: 0.35 }}>
                  {["🍎", "🚲", "☕", "🌸", "", "🏮", "📚", "🥟", "🧋"][i]}
                </span>
              )}
            </div>
          ))}
        </div>
        {bar}
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "var(--background)",
        display: "grid",
        placeItems: "center",
      }}
    >
      <div ref={sourceRef} style={{ width: 190, height: 190 }}>
        <img
          src={PREVIEW_IMAGE}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: 24 }}
        />
      </div>
      {plan !== "off" && (
        <CatchLandingOverlay
          ref={flyRef}
          image={PREVIEW_IMAGE}
          headword="捕捉"
          reading="ㄅㄨˇ ㄓㄨㄛ"
          lang="zh-TW"
        />
      )}
      {bar}
    </div>
  );
}

/**
 * 設定の「保存しました」。`&state=live` で実際に触って確かめる（触るたびに札が出る）。
 * 既定は札が出ている瞬間で止めて撮る。
 */
export function SettingsSavedScene({ q }: { q: URLSearchParams }) {
  const live = q.get("state") === "live";
  const [theme, setTheme] = useState("system");
  return (
    <div className="space-y-7">
      <SaveStatusPill state={live ? undefined : "saved"} />
      <SettingsCard title={t("settings.appearance")}>
        <div className="space-y-3">
          <ChoiceRow
            cols={3}
            label={t("settings.theme")}
            value={theme}
            onChange={(v) => {
              setTheme(v);
              settingsSaveStatus.saved();
            }}
            options={[
              { value: "light", label: t("settings.light") },
              { value: "dark", label: t("settings.dark") },
              { value: "system", label: t("settings.system") },
            ]}
          />
          <MotionProvider>
            <MotionToggleRow />
          </MotionProvider>
          <CatchAnimationRow initial={live ? undefined : "short"} />
        </div>
      </SettingsCard>
    </div>
  );
}

/** ホームの今日の誌面の上に出る「〇か月前のこの言葉、まだ言える？」。`&days=400` で「1年前」。 */
export function HomeResurfaceScene({ q }: { q: URLSearchParams }) {
  const days = Number(q.get("days") ?? 91) || 91;
  const [hidden, setHidden] = useState(false);
  const [opened, setOpened] = useState(false);
  const old = { ...makeSticker(FIXTURES[0], 0, days), object_url: samplePhoto, selfie_url: null };
  const todays = FIXTURES.slice(1, 5).map((f, i) => makeSticker(f, i + 1, 0));
  readySpeech([old.word.headword]);
  return (
    <>
      {!hidden && (
        <ResurfaceCardView
          sticker={old}
          pick={{ id: old.id, ageDays: days, ...resurfaceAgeLabel(days) }}
          onOpen={() => setOpened(true)}
          onDismiss={() => setHidden(true)}
        />
      )}
      {opened && (
        <p className="mb-3 text-center text-caption text-muted-foreground">
          （本番では「{old.word.headword}」の詳細が開き、発音が鳴ります）
        </p>
      )}
      <DayCollage
        stickers={todays}
        onOpen={() => {}}
        surface={wallClass("paper")}
        heading={<DiaryDate date={new Date()} />}
      />
    </>
  );
}
