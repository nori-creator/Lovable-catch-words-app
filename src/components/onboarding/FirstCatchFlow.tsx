import { categoryOptions, dayOptions, NO_FILTER } from "@/lib/dex-filter";
import { FirstCatchDex, FirstCatchReview } from "./FirstCatchPractice";
import { preloadFirstCatchImages } from "@/lib/first-catch-images";
import { CatchLandingOverlay, runCatchLanding } from "@/components/CatchLanding";
import { usePronounce } from "@/lib/use-pronounce";
import { useTargetLang } from "@/lib/target-lang-pref";
import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getUiLang, useT } from "@/lib/i18n";
import { FirstCatchQuestions } from "./FirstCatchQuestions";
import { FirstCatchIntro, FirstCatchNotifications, FirstCatchReady } from "./FirstCatchPages";
import { getTargetLang } from "@/lib/target-lang-pref";
import type { suggestWords } from "@/lib/ai.functions";
import { firstCatchAI, firstCatchMemberAI } from "@/lib/first-catch-ai.functions";
import { createFirstCatchServices } from "@/lib/first-catch-ai-client";
import { LearningPreferencesSchema } from "@/lib/learning-preferences";
import type { FirstCatchAIRequest } from "@/lib/first-catch-ai-schema";
import {
  firstCatchPhoto,
  applyFirstCatchLanguage,
  ensureFirstCatchSession,
  isGuestRefusal,
} from "@/lib/first-catch-services";
import {
  readFirstCatch,
  writeFirstCatch,
  canRequestAccount,
  firstCatchSticker,
  type FirstCatch,
} from "@/lib/first-catch";
import {
  CaptureAnalyzingPanel,
  CaptureObjectPanel,
  CaptureCardPanel,
  PickWordPanel,
} from "@/routes/_authenticated/capture";
import { DexSurface, JUST_CAUGHT_VIEW } from "@/routes/_authenticated/dex";

import { StickerSheet } from "@/components/StickerSheet";
import { FirstCatchHome, FirstCatchShell } from "./FirstCatchHome";
import { Spotlight } from "./Spotlight";
import { TutorialMenu, TutorialMenuContext } from "./TutorialMenu";
import "./first-catch.css";

type Suggestion = Awaited<ReturnType<typeof suggestWords>>["suggestions"][number];
export type FirstCatchServices = {
  prepare: (draft: FirstCatch) => Promise<void>;
  suggest: (photo: string, draft: FirstCatch) => ReturnType<typeof suggestWords>;
  card: (headword: string, draft: FirstCatch) => Promise<NonNullable<FirstCatch["card"]>>;
  lesson?: (data: FirstCatchAIRequest) => Promise<unknown>;
};

export function FirstCatchEntry() {
  const guestAI = useServerFn(firstCatchAI);
  const memberAI = useServerFn(firstCatchMemberAI);
  const navigate = useNavigate();
  return (
    <FirstCatchFlow
      services={createFirstCatchServices(
        async (data) => {
          const { data: auth } = await supabase.auth.getUser();
          // 登録済みの人も、すでに匿名アカウントを持つ端末も、本人の枠で動かす。
          if (auth.user) return memberAI({ data });
          try {
            return await guestAI({ data });
          } catch (refused) {
            // 未登録用の窓口が断った(上限・環境・一時的な不具合)。以前の経路 —
            // この端末だけの匿名アカウントで、本人の枠(24回/日)を使う — に切り替える。
            // 匿名ログインが使えない環境では FIRST_CATCH_GUEST_UNAVAILABLE になり、
            // 写真は残ったまま画面に理由が出る。
            if (!isGuestRefusal(refused)) throw refused;
            await ensureFirstCatchSession();
            return memberAI({ data });
          }
        },
        async () => {},
      )}
      onAccount={() => {
        void supabase.auth.getUser().then(({ data }) => {
          void navigate(
            data.user && !data.user.is_anonymous
              ? { to: "/home" }
              : { to: "/auth", search: { next: "" } },
          );
        });
      }}
    />
  );
}

export function FirstCatchFlow({
  services,
  onAccount,
  initialDraft,
  persist = writeFirstCatch,
}: {
  services: FirstCatchServices;
  onAccount: () => void;
  initialDraft?: FirstCatch;
  persist?: (draft: FirstCatch) => Promise<void>;
}) {
  const t = useT();
  const [draft, setDraft] = useState<FirstCatch | null>(initialDraft ?? null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [busy, setBusy] = useState<"photo" | "card" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const retry = useRef<() => void>(() => {});
  const lock = useRef(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [manual, setManual] = useState("");
  const [flipped, setFlipped] = useState(false);
  const [detailSeen, setDetailSeen] = useState(false);
  const [homeGuide, setHomeGuide] = useState<"album" | "camera">("album");
  const [landing, setLanding] = useState(false);
  /**
   * 撮る画面で映像が取れない（アプリ内ブラウザ・許可なし）。そのときは
   * シャッターだけを照らす案内を外す — 案内の覆いが、枠の中に出る
   * 「スマホのカメラで撮る」「写真を選ぶ」を押せなくしてしまうため。
   */
  const [cameraUnavailable, setCameraUnavailable] = useState(false);
  /** チュートリアル用の設定（言語・最初に戻る）。下のタブの「設定」から開く。 */
  const [menuOpen, setMenuOpen] = useState(false);
  const openMenu = useRef(() => setMenuOpen(true)).current;
  const hero = useRef<HTMLDivElement>(null);
  const fly = useRef<HTMLImageElement>(null);
  const pronounce = usePronounce(useTargetLang());
  const input = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  useEffect(() => {
    preloadFirstCatchImages();
    mounted.current = true;
    if (initialDraft) applyFirstCatchLanguage(initialDraft);
    if (!initialDraft)
      void readFirstCatch()
        .then((saved) => {
          if (!mounted.current) return;
          const next: FirstCatch =
            saved?.stage !== "done" && saved
              ? saved
              : {
                  version: 1,
                  id: crypto.randomUUID(),
                  uiLanguage: getUiLang(),
                  targetLanguage: getTargetLang(),
                  dailyMinutes: 10,
                  stage: "intro",
                  photo: null,
                  card: null,
                  capturedAt: null,
                };
          applyFirstCatchLanguage(next);
          setDraft(next);
        })
        .catch(() => {
          if (mounted.current) setError(t("first.storage"));
        });
    return () => {
      mounted.current = false;
    };
  }, []);
  async function commit(next: FirstCatch) {
    await persist(next);
    if (mounted.current) setDraft(next);
  }
  /**
   * いま走っている処理の番号。分析中の面の「キャンセル」で番号を進めると、遅れて
   * 返ってきた古い結果・失敗・後片付けは、もう画面に触らない。
   */
  const run = useRef(0);
  async function action(fn: () => Promise<void>, kind: "photo" | "card" | "save" = "save") {
    if (lock.current) return;
    const mine = ++run.current;
    lock.current = true;
    setError(null);
    setBusy(kind);
    retry.current = () => {
      void action(fn, kind);
    };
    try {
      await fn();
    } catch (e) {
      if (mounted.current && mine === run.current) setError(failureText(e));
    } finally {
      if (mine === run.current) {
        lock.current = false;
        if (mounted.current) setBusy(null);
      }
    }
  }
  /** 分析中の面の「キャンセル」（本物の撮影画面と同じ出口）。撮る所へ戻る。 */
  function cancelAnalysis() {
    const current = draftRef.current;
    run.current++;
    lock.current = false;
    setBusy(null);
    setSuggestions([]);
    if (current)
      void action(() =>
        commit({ ...current, stage: "camera", photo: null, capturedAt: null, card: null }),
      );
  }
  function move(stage: FirstCatch["stage"]) {
    if (!draft) return;
    void action(() => commit({ ...draft, stage }));
  }
  async function analyze(next: FirstCatch, mine = run.current) {
    await services.prepare(next);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const result = await Promise.race([
      services.suggest(next.photo!, next),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("FIRST_CATCH_ANALYSIS_TIMEOUT")), 55_000);
      }),
    ]).finally(() => clearTimeout(timer));
    if (!result.suggestions.length) throw new Error("FIRST_CATCH_NO_WORDS");
    if (mounted.current && mine === run.current) setSuggestions(result.suggestions);
  }
  function photo(file: File) {
    if (!draft) return;
    void action(async () => {
      const image = await firstCatchPhoto(file);
      const next = {
        ...draft,
        photo: image,
        capturedAt: new Date().toISOString(),
        card: null,
        lesson: undefined,
        stage: "camera" as const,
      };
      await commit(next); // Durable BEFORE any network request.
      await analyze(next);
    }, "photo");
  }
  function pick(headword: string) {
    if (!draft || !headword.trim()) return;
    void action(async () => {
      await services.prepare(draft);
      const card = await services.card(headword, draft);
      await commit({
        ...draft,
        card: { ...card, headword_zh: card.headword_zh || headword },
        lesson: undefined,
        stage: "card",
      });
      setDetailSeen(false);
    }, "card");
  }
  function catchWord() {
    if (!draft?.card || !draft.photo || lock.current) return;
    pronounce.prepare();
    void action(async () => {
      const next = { ...draft, stage: "added" as const };
      setLanding(true);
      // Persist first. The existing reward waits at its gate and lands in the real Dex cell.
      const gate = persist(next);
      try {
        await runCatchLanding({
          startEl: hero.current,
          fly,
          gate,
          // The shared runner adds the DOM prefix itself.
          destinationId: next.id,
          speakLine: () => pronounce(next.card!.headword_zh),
          openDex: () => {
            if (mounted.current) setDraft(next);
          },
        });
        await gate; // Animation helpers may absorb failure; never treat that as a saved Catch.
      } finally {
        if (mounted.current) setLanding(false);
      }
    });
  }
  function account() {
    const current = draftRef.current;
    if (!current || !canRequestAccount(current)) return;
    void action(async () => {
      await commit({ ...current, stage: "account" });
      onAccount();
    });
  }
  useEffect(() => {
    if (draft?.stage === "account") onAccount();
  }, [draft?.stage]);

  /**
   * 失敗の文言。原因が分かる失敗は専用の文、それ以外は汎用の文に**コードを添える**
   * (「処理できませんでした」だけでは、どこで落ちたか報告も調査もできない)。
   */
  function failureText(e: unknown): string {
    const code = e instanceof Error ? e.message : "";
    const known: Record<string, Parameters<typeof t>[0]> = {
      FIRST_CATCH_PREVIEW_UNAVAILABLE: "first.previewUnavailable",
      FIRST_CATCH_PHOTO_UNSUPPORTED: "first.photoUnsupported",
      FIRST_CATCH_ANALYSIS_TIMEOUT: "first.analysisTimeout",
      FIRST_CATCH_GUEST_UNAVAILABLE: "first.guestUnavailable",
      FIRST_CATCH_LIMIT: "first.busy",
      FIRST_CATCH_NO_WORDS: "first.noWords",
      FIRST_CATCH_AI_FORMAT: "first.aiFormat",
    };
    const key = known[code];
    if (key) return t(key);
    return /^FIRST_CATCH_[A-Z_]+$/.test(code)
      ? `${t("first.failed")} (${code})`
      : t("first.failed");
  }

  const errors = error && (
    <div role="alert" className="first-error">
      <p>{error}</p>
      <button className="first-primary" onClick={() => retry.current()} disabled={!!busy}>
        {t("first.retry")}
      </button>
      {draft?.stage === "camera" && !canRequestAccount(draft) && (
        <button
          className="first-secondary"
          onClick={() => {
            setError(null);
            setSuggestions([]);
            void action(() =>
              commit({ ...draft, stage: "camera", photo: null, capturedAt: null, card: null }),
            );
          }}
        >
          {t("first.retake")}
        </button>
      )}
    </div>
  );
  if (!draft) return <div className="first-questions">{errors ?? <p role="status">…</p>}</div>;
  /** いま走っている処理を捨てる（分析中でもメニューから抜けられるように）。 */
  function abandonRun() {
    run.current++;
    lock.current = false;
    setBusy(null);
    setError(null);
    setSuggestions([]);
  }
  function changeLanguage(next: Pick<FirstCatch, "uiLanguage" | "targetLanguage">) {
    const current = draftRef.current;
    if (!current) return;
    let updated: FirstCatch = { ...current, ...next };
    // 学ぶ言語を変えたら、前の言語で作った写真の語は使えない。ホームからやり直す。
    if (next.targetLanguage !== current.targetLanguage && (current.photo || current.card)) {
      abandonRun();
      updated = {
        ...updated,
        photo: null,
        card: null,
        lesson: undefined,
        capturedAt: null,
        reviewCompleted: false,
        stage: ["intro", "questions", "notifications", "ready"].includes(current.stage)
          ? current.stage
          : "home",
      };
    }
    applyFirstCatchLanguage(updated);
    setDraft(updated);
    void persist(updated).catch(() => setError(t("first.storage")));
  }
  function restart() {
    const current = draftRef.current;
    if (!current) return;
    abandonRun();
    setMenuOpen(false);
    setHomeGuide("album");
    setDetailSeen(false);
    const next: FirstCatch = {
      ...current,
      stage: "intro",
      questionIndex: 0,
      photo: null,
      card: null,
      lesson: undefined,
      capturedAt: null,
      reviewCompleted: false,
    };
    setDraft(next);
    void persist(next).catch(() => setError(t("first.storage")));
  }
  const menu =
    draft.stage !== "intro" && draft.stage !== "account" && !landing ? (
      <TutorialMenu
        draft={draft}
        open={menuOpen}
        onOpenChange={setMenuOpen}
        showButton={
          ["questions", "notifications", "ready"].includes(draft.stage)
            ? "right"
            : // 単語の詳細はシートが下のタブを覆うので、左上（右上は閉じる）に出す。
              draft.stage === "explore"
              ? "left"
              : false
        }
        onChangeLanguage={changeLanguage}
        onRestart={restart}
      />
    ) : null;
  const withMenu = (node: React.ReactNode) => (
    <TutorialMenuContext.Provider value={openMenu}>
      {node}
      {menu}
    </TutorialMenuContext.Provider>
  );
  if (draft.stage === "intro")
    return <FirstCatchIntro draft={draft} busy={!!busy} onStart={() => move("questions")} />;
  if (draft.stage === "questions")
    return withMenu(
      <FirstCatchQuestions
        draft={draft}
        busy={!!busy}
        error={errors}
        onChange={(next) => {
          applyFirstCatchLanguage(next);
          setDraft(next);
        }}
        onContinue={(next) => {
          void action(() => commit(next));
        }}
      />,
    );
  if (draft.stage === "notifications")
    return withMenu(
      <FirstCatchNotifications
        draft={draft}
        busy={!!busy}
        error={errors}
        onChange={(reminders) => setDraft({ ...draft, reminders })}
        onBack={() => void action(() => commit({ ...draft, stage: "questions", questionIndex: 4 }))}
        onContinue={() => move("ready")}
      />,
    );
  if (draft.stage === "ready")
    return withMenu(
      <FirstCatchReady
        draft={draft}
        busy={!!busy}
        onBack={() => move("notifications")}
        onStart={() => move("home")}
      />,
    );
  if (busy && busy !== "save")
    return withMenu(
      <FirstCatchShell tab={2} camera>
        {/* **本物の撮影画面の分析中の面**（`CaptureAnalyzingPanel`）。候補を選んだ後の
            準備も、本物と同じく切り抜きの演出で待つ。 */}
        <CaptureAnalyzingPanel
          image={draft.photo}
          cutout={busy === "card"}
          onCancel={cancelAnalysis}
        />
      </FirstCatchShell>,
    );
  const sticker = firstCatchSticker(draft);
  return withMenu(
    <div className="first-run" data-first-stage={draft.stage}>
      {draft.stage === "home" && (
        <FirstCatchHome
          draft={draft}
          animated
          onCamera={homeGuide === "camera" ? () => move("camera") : undefined}
        />
      )}
      {draft.stage === "dex" && (
        <FirstCatchShell tab={1}>
          <FirstCatchDex draft={draft} onOpen={() => move("explore")} />
        </FirstCatchShell>
      )}
      {draft.stage === "review" && (
        <FirstCatchReview
          draft={draft}
          onComplete={() =>
            void action(() => commit({ ...draft, stage: "complete", reviewCompleted: true }))
          }
        />
      )}
      {draft.stage === "complete" && (
        <div className="first-standalone first-ready">
          <div className="first-ready-heading">
            <h1>{t("first.completeTitle")}</h1>
            <p>{t("first.completeHint")}</p>
          </div>
          <div className="first-ready-art">
            <div className="first-confetti">
              {Array.from({ length: 12 }, (_, i) => (
                <i key={i} />
              ))}
            </div>
            <img src={draft.photo!} alt="" className="first-complete-photo" />
          </div>
          <footer className="first-standalone-footer">
            <button className="first-primary" disabled={!!busy} onClick={account}>
              {t("first.keep")}
              <ArrowRight size={18} />
            </button>
            {errors}
          </footer>
        </div>
      )}
      {draft.stage === "camera" && (
        <FirstCatchShell tab={2} camera={!suggestions.length && !error}>
          {errors ||
            (suggestions.length ? (
              <section data-tour="pick">
                <PickWordPanel
                  objectImg={draft.photo}
                  suggestions={suggestions}
                  manualWord={manual}
                  setManualWord={setManual}
                  onPick={(s) => pick(s.headword)}
                  onManual={() => pick(manual)}
                  targetLanguage={draft.targetLanguage}
                />
              </section>
            ) : draft.photo ? (
              <div className="first-content">
                <img src={draft.photo} alt="" className="rounded-3xl" />
                <button
                  className="first-primary mt-6"
                  onClick={() => void action(() => analyze(draft), "photo")}
                >
                  {t("first.retry")}
                </button>
                <button
                  className="first-secondary w-full"
                  onClick={() =>
                    void action(() => commit({ ...draft, photo: null, capturedAt: null }))
                  }
                >
                  {t("first.retake")}
                </button>
              </div>
            ) : (
              <CaptureObjectPanel
                retakeWord={null}
                cameraInputRef={input}
                onObjectFile={photo}
                typedWord=""
                setTypedWord={() => {}}
                onSearch={() => {}}
                onOpenScan={() => {}}
                error={null}
                onCameraUnavailable={setCameraUnavailable}
              />
            ))}
        </FirstCatchShell>
      )}
      {draft.stage === "card" && sticker && (
        <FirstCatchShell tab={2}>
          <CaptureCardPanel
            card={draft.card!}
            selectedHead={sticker.word.headword}
            objectImg={draft.photo}
            cutoutImg={null}
            selfieImg={null}
            flipped={flipped}
            setFlipped={setFlipped}
            caption=""
            setCaption={() => {}}
            voiceNote={null}
            setVoiceNote={() => {}}
            placeName={null}
            onRedo={() => move("camera")}
            onSave={catchWord}
            heroBoxRef={hero}
            saving={!detailSeen || !!busy}
            landing={landing}
          />
          {errors}
        </FirstCatchShell>
      )}
      {(draft.stage === "added" || draft.stage === "account") && sticker && (
        <FirstCatchShell tab={1}>
          <DexSurface
            captured={[sticker]}
            filtered={[sticker]}
            view={JUST_CAUGHT_VIEW}
            onView={() => move("dex")}
            search=""
            onSearch={() => move("dex")}
            filter={NO_FILTER}
            onFilter={() => move("dex")}
            categories={categoryOptions([sticker])}
            days={dayOptions([sticker])}
            justCaught={sticker.id}
            memory={new Map()}
            onOpen={() => move("dex")}
          />
          {!landing && !busy && (
            <Spotlight
              target={`#dex-cell-${sticker.id}`}
              title={t("first.added")}
              text={t("first.dexOpen")}
              nextLabel={t("first.dexTitle")}
              onNext={() => move("dex")}
            />
          )}
          {errors}
        </FirstCatchShell>
      )}
      {draft.stage === "explore" && sticker && (
        <FirstCatchShell tab={1}>
          <StickerSheet
            stickerId={sticker.id}
            onClose={() => move("review")}
            local={{
              sticker,
              personalContext: {
                id: draft.id,
                preferences: LearningPreferencesSchema.parse(draft),
                initial: draft.lesson,
                request: services.lesson,
                onReady: (lesson) => {
                  const current = draftRef.current;
                  if (current && !current.lesson && current.stage === "explore")
                    void commit({ ...current, lesson }).catch(() => setError(t("first.storage")));
                },
              },
            }}
          />
          <Spotlight
            target='[data-tour="word-detail"]'
            title={t("first.detailTitle")}
            text={t("first.exploreHint")}
            interactive
            step="4 / 5"
            nextLabel={t("first.tryReview")}
            onNext={() => move("review")}
          />
          {errors}
        </FirstCatchShell>
      )}
      {!error && !landing && draft.stage === "home" && (
        <Spotlight
          target={
            homeGuide === "album"
              ? '[data-tour="home"] .collage-board'
              : '[data-tour="tab-camera"] .tabbar__lens'
          }
          title={t(homeGuide === "album" ? "first.homeTitle" : "first.shootTitle")}
          text={t(homeGuide === "album" ? "first.home" : "first.tapCamera")}
          step={homeGuide === "album" ? "1 / 5" : "2 / 5"}
          nextLabel={t("first.next")}
          onNext={homeGuide === "album" ? () => setHomeGuide("camera") : undefined}
          interactive={homeGuide === "camera"}
          allowSelector={homeGuide === "camera" ? '[data-tour="tab-camera"]' : undefined}
        />
      )}
      {!error && !landing && !cameraUnavailable && draft.stage === "camera" && !draft.photo && (
        <Spotlight
          target=".camera-shutter"
          title={t("first.shootTitle")}
          text={t("first.shoot")}
          interactive
        />
      )}
      {!error && !landing && draft.stage === "camera" && suggestions.length > 0 && (
        <Spotlight
          target='[data-tour="pick"]'
          title={t("first.pickTitle")}
          text={t("first.pick")}
          interactive
        />
      )}
      {!error && !landing && draft.stage === "card" && (
        <Spotlight
          target={detailSeen ? '[data-tour="peel"]' : '[data-tour="detail"]'}
          title={t(detailSeen ? "first.peelTitle" : "first.detailTitle")}
          text={t(detailSeen ? "first.peel" : "first.detail")}
          interactive
          allowSelector={detailSeen ? undefined : "button[aria-label]"}
          nextLabel={t("first.next")}
          onNext={detailSeen ? undefined : () => setDetailSeen(true)}
        />
      )}
      {!["camera", "card", "added", "explore", "account"].includes(draft.stage) && errors}
      {landing && sticker && (
        <CatchLandingOverlay
          ref={fly}
          image={draft.photo}
          headword={sticker.word.headword}
          lang={draft.targetLanguage}
        />
      )}
    </div>,
  );
}
