import { CatchLandingOverlay, runCatchLanding } from "@/components/CatchLanding";
import { usePronounce } from "@/lib/use-pronounce";
import { useTargetLang } from "@/lib/target-lang-pref";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, Loader2, CalendarCheck } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { getUiLang, useT } from "@/lib/i18n";
import { FirstCatchQuestions } from "./FirstCatchQuestions";
import { FirstCatchIntro, FirstCatchNotifications, FirstCatchReady } from "./FirstCatchPages";
import { getTargetLang } from "@/lib/target-lang-pref";
import type { suggestWords } from "@/lib/ai.functions";
import { firstCatchAI } from "@/lib/first-catch-ai.functions";
import { createFirstCatchServices } from "@/lib/first-catch-ai-client";
import { LearningPreferencesSchema } from "@/lib/learning-preferences";
import type { FirstCatchAIRequest } from "@/lib/first-catch-ai-schema";
import {
  ensureFirstCatchSession,
  firstCatchPhoto,
  applyFirstCatchLanguage,
} from "@/lib/first-catch-services";
import {
  readFirstCatch,
  writeFirstCatch,
  canRequestAccount,
  firstCatchSticker,
  type FirstCatch,
} from "@/lib/first-catch";
import { CaptureObjectPanel, PickWordPanel } from "@/routes/_authenticated/capture";
import { DexAlbumGrid } from "@/routes/_authenticated/dex";
import { EmptyState } from "@/components/EmptyState";
import { PeelSticker } from "@/components/PeelSticker";
import { WordCard } from "@/components/WordCard";
import { FirstCatchHome, FirstCatchSampleDex, FirstCatchShell } from "./FirstCatchHome";
import { Spotlight } from "./Spotlight";
import "./first-catch.css";

type Suggestion = Awaited<ReturnType<typeof suggestWords>>["suggestions"][number];
export type FirstCatchServices = {
  prepare: (draft: FirstCatch) => Promise<void>;
  suggest: (photo: string, draft: FirstCatch) => ReturnType<typeof suggestWords>;
  card: (headword: string, draft: FirstCatch) => Promise<NonNullable<FirstCatch["card"]>>;
  lesson?: (data: FirstCatchAIRequest) => Promise<unknown>;
};

export function FirstCatchEntry() {
  const ai = useServerFn(firstCatchAI);
  const navigate = useNavigate();
  return (
    <FirstCatchFlow
      services={createFirstCatchServices((data) => ai({ data }), ensureFirstCatchSession)}
      onAccount={() => {
        void navigate({ to: "/auth", search: { next: "" } });
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
  const [detailSeen, setDetailSeen] = useState(false);
  const [landing, setLanding] = useState(false);
  const hero = useRef<HTMLDivElement>(null);
  const fly = useRef<HTMLImageElement>(null);
  const pronounce = usePronounce(useTargetLang());
  const input = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  useEffect(() => {
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
  async function action(fn: () => Promise<void>, kind: "photo" | "card" | "save" = "save") {
    if (lock.current) return;
    lock.current = true;
    setError(null);
    setBusy(kind);
    retry.current = () => {
      void action(fn, kind);
    };
    try {
      await fn();
    } catch (e) {
      if (mounted.current)
        setError(
          t(
            e instanceof Error && e.message === "FIRST_CATCH_PREVIEW_UNAVAILABLE"
              ? "first.previewUnavailable"
              : e instanceof Error && e.message === "FIRST_CATCH_GUEST_UNAVAILABLE"
                ? "first.guestUnavailable"
                : "first.failed",
          ),
        );
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(null);
    }
  }
  function move(stage: FirstCatch["stage"]) {
    if (!draft) return;
    void action(() => commit({ ...draft, stage }));
  }
  async function analyze(next: FirstCatch) {
    await services.prepare(next);
    const result = await services.suggest(next.photo!, next);
    if (!result.suggestions.length) throw new Error("No candidates");
    if (mounted.current) setSuggestions(result.suggestions);
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

  const errors = error && (
    <div role="alert" className="first-error">
      <p>{error}</p>
      <button className="first-primary" onClick={() => retry.current()} disabled={!!busy}>
        {t("first.retry")}
      </button>
      {draft?.photo && !canRequestAccount(draft) && (
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
  if (draft.stage === "intro")
    return <FirstCatchIntro busy={!!busy} onStart={() => move("questions")} />;
  if (draft.stage === "questions")
    return (
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
      />
    );
  if (draft.stage === "notifications")
    return (
      <FirstCatchNotifications
        draft={draft}
        busy={!!busy}
        error={errors}
        onChange={(reminders) => setDraft({ ...draft, reminders })}
        onBack={() => void action(() => commit({ ...draft, stage: "questions", questionIndex: 4 }))}
        onContinue={() => move("ready")}
      />
    );
  if (draft.stage === "ready")
    return (
      <FirstCatchReady
        busy={!!busy}
        onBack={() => move("notifications")}
        onStart={() => move("home")}
      />
    );
  if (busy && busy !== "save")
    return (
      <FirstCatchShell>
        <div className="first-busy" role="status">
          <Loader2 className="animate-spin mx-auto" />
          {t(busy === "photo" ? "first.analyzing" : "first.preparing")}
        </div>
      </FirstCatchShell>
    );
  const sticker = firstCatchSticker(draft);
  return (
    <div className="first-run" data-first-stage={draft.stage}>
      {draft.stage === "home" && <FirstCatchHome draft={draft} animated />}
      {draft.stage === "dex" && (
        <FirstCatchShell tab={1}>
          <h1 className="text-title font-bold mb-6">{t("nav.dex")}</h1>
          <section data-tour="dex">
            <FirstCatchSampleDex draft={draft} />
          </section>
        </FirstCatchShell>
      )}
      {draft.stage === "review" && (
        <FirstCatchShell tab={3}>
          <h1 className="text-title font-bold mb-6">{t("nav.review")}</h1>
          <section data-tour="review">
            <EmptyState
              icon={CalendarCheck}
              title={t("review.empty")}
              hint={t("review.emptyHint")}
            />
          </section>
        </FirstCatchShell>
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
                onOpenLibrary={() => {}}
                error={null}
              />
            ))}
        </FirstCatchShell>
      )}
      {draft.stage === "card" && sticker && (
        <FirstCatchShell tab={2}>
          <div className="first-detail">
            <section ref={hero} data-tour="peel" className="first-peel">
              <PeelSticker
                photoUrl={draft.photo}
                cutoutUrl={null}
                label={sticker.word.headword}
                actionLabel={t("capture.addToDex")}
                hint={t("capture.peelHint")}
                disabled={!detailSeen || !!busy || landing}
                onPeel={catchWord}
              />
            </section>
            <section data-tour="detail">
              <WordCard word={sticker.word} minimal />
            </section>
            {errors}
          </div>
        </FirstCatchShell>
      )}
      {(draft.stage === "added" || draft.stage === "account") && sticker && (
        <FirstCatchShell tab={1}>
          <h1 className="text-title font-bold mb-6">{t("nav.dex")}</h1>
          <section data-tour="added">
            <DexAlbumGrid
              items={[sticker]}
              justCaught={sticker.id}
              onOpen={() => {
                if (!landing && !busy) move("explore");
              }}
            />
          </section>
          <div className="first-added" role="status">
            <CheckCircle2 className="mx-auto text-primary" size={30} />
            <h2>{t("first.added")}</h2>
            <p className="first-sub">{t("first.local")}</p>
          </div>
          <button
            className="first-primary first-added-cta"
            disabled={landing || !!busy}
            onClick={() => move("explore")}
          >
            {t("first.openWord")}
            <ArrowRight size={18} />
          </button>
          {errors}
        </FirstCatchShell>
      )}
      {draft.stage === "explore" && sticker && (
        <FirstCatchShell tab={1}>
          <div className="first-explore-heading">
            <span className="first-eyebrow">{t("first.added")}</span>
            <h1>{t("first.exploreTitle")}</h1>
            <p className="first-sub">{t("first.exploreHint")}</p>
          </div>
          <img src={draft.photo!} alt="" className="first-word-photo" />
          <WordCard
            word={sticker.word}
            autoplay={false}
            guided
            personalContext={{
              id: draft.id,
              preferences: LearningPreferencesSchema.parse(draft),
              initial: draft.lesson,
              request: services.lesson,
              onReady: (lesson) => {
                const current = draftRef.current;
                if (current && !current.lesson && current.stage === "explore")
                  void commit({ ...current, lesson }).catch(() => setError(t("first.storage")));
              },
            }}
          />
          {errors}
          <div className="first-detail-footer">
            <button className="first-primary" disabled={!!busy} onClick={account}>
              {t("first.keep")}
              <ArrowRight size={18} />
            </button>
          </div>
        </FirstCatchShell>
      )}
      {!error && !landing && ["home", "dex", "review"].includes(draft.stage) && (
        <Spotlight
          target={`[data-tour="${draft.stage}"]`}
          text={t(`first.${draft.stage}`)}
          nextLabel={t(draft.stage === "review" ? "first.shootCta" : "first.next")}
          onNext={() =>
            move(draft.stage === "home" ? "dex" : draft.stage === "dex" ? "review" : "camera")
          }
        />
      )}
      {!error && !landing && draft.stage === "camera" && !draft.photo && (
        <Spotlight target=".camera-shutter" text={t("first.shoot")} interactive />
      )}
      {!error && !landing && draft.stage === "camera" && suggestions.length > 0 && (
        <Spotlight target='[data-tour="pick"]' text={t("first.pick")} interactive />
      )}
      {!error && !landing && draft.stage === "card" && (
        <Spotlight
          target={detailSeen ? '[data-tour="peel"]' : '[data-tour="detail"]'}
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
    </div>
  );
}
