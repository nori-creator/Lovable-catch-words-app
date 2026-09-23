import { CatchLandingOverlay, runCatchLanding } from "@/components/CatchLanding";
import { usePronounce } from "@/lib/use-pronounce";
import { useTargetLang } from "@/lib/target-lang-pref";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, Globe2, Loader2, CalendarCheck } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import {
  getUiLang,
  setUiLang,
  useT,
  UI_LANGS,
  UI_LANG_LABEL_KEYS,
  TARGET_LANG_LABEL_KEYS,
} from "@/lib/i18n";
import { TARGET_LANGUAGES } from "@/lib/target-lang";
import { getTargetLang, setTargetLang } from "@/lib/target-lang-pref";
import { suggestWords, generateCard } from "@/lib/ai.functions";
import { updateMyProfile } from "@/lib/profile.functions";
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
import { DexEmptyState, DexAlbumGrid } from "@/routes/_authenticated/dex";
import { EmptyState } from "@/components/EmptyState";
import { PeelSticker } from "@/components/PeelSticker";
import { WordCard } from "@/components/WordCard";
import { FirstCatchHome, FirstCatchShell } from "./FirstCatchHome";
import { Spotlight } from "./Spotlight";
import "./first-catch.css";

type Suggestion = Awaited<ReturnType<typeof suggestWords>>["suggestions"][number];
export type FirstCatchServices = {
  prepare: (draft: FirstCatch) => Promise<void>;
  suggest: (photo: string, draft: FirstCatch) => ReturnType<typeof suggestWords>;
  card: (headword: string, draft: FirstCatch) => Promise<NonNullable<FirstCatch["card"]>>;
};

export function FirstCatchEntry() {
  const suggest = useServerFn(suggestWords);
  const card = useServerFn(generateCard);
  const profile = useServerFn(updateMyProfile);
  const navigate = useNavigate();
  return (
    <FirstCatchFlow
      services={{
        prepare: async (draft) => {
          await ensureFirstCatchSession();
          const result = await profile({
            data: { ui_language: draft.uiLanguage, target_language: draft.targetLanguage },
          });
          if ("skipped" in result && result.skipped?.length)
            throw new Error("Preferences not saved");
        },
        suggest: (photo, draft) =>
          suggest({ data: { imageBase64: photo, targetLanguage: draft.targetLanguage } }),
        card: (headword, draft) =>
          card({ data: { headword, targetLanguage: draft.targetLanguage } }),
      }}
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
  const [question, setQuestion] = useState(0);
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
                  stage: "questions",
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
            e instanceof Error && e.message === "FIRST_CATCH_GUEST_UNAVAILABLE"
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
          destinationId: `dex-cell-${next.id}`,
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
  // The actual Dex cell must be on screen with its photo loaded BEFORE signup.
  // Reload of an already-added draft resumes this same confirmation, never a second Catch.
  useEffect(() => {
    if (draft?.stage !== "added" || !draft.photo || landing || error) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const image = new Image();
    const schedule = () => {
      if (cancelled || document.visibilityState !== "visible") return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!cancelled && document.visibilityState === "visible") account();
      }, 2000);
    };
    image.onload = schedule;
    image.src = draft.photo;
    document.addEventListener("visibilitychange", schedule);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, [draft?.stage, landing, error]);
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
  if (draft.stage === "questions") {
    const title = ["first.display", "first.target", "first.time"][question];
    const hint = ["first.displayHint", "first.targetHint", "first.timeHint"][question];
    const choices =
      question === 0
        ? UI_LANGS.map((value) => ({
            value,
            label: t(UI_LANG_LABEL_KEYS[value]),
            sub: value === "ja" ? "Japanese" : value === "en" ? "English" : "繁體中文",
          }))
        : question === 1
          ? TARGET_LANGUAGES.map((value) => ({
              value,
              label: t(TARGET_LANG_LABEL_KEYS[value]),
              sub: value === "en" ? "English" : "Taiwan Mandarin",
            }))
          : [5, 10, 15].map((value) => ({
              value,
              label: t("first.minutes", { n: value }),
              sub: "",
            }));
    const selected =
      question === 0
        ? draft.uiLanguage
        : question === 1
          ? draft.targetLanguage
          : draft.dailyMinutes;
    return (
      <div className="first-run">
        <div className="first-questions">
          <div className="first-brand">
            <img src="/icon-192.png" alt="" />
            CatchWords
          </div>
          <div className="first-progress">
            <span style={{ width: `${((question + 1) / 3) * 100}%` }} />
          </div>
          <div className="first-count">{question + 1} / 3</div>
          <h1>{t(title)}</h1>
          <p className="first-sub">{t(hint)}</p>
          <div role="radiogroup" aria-label={t(title)} className="first-choices">
            {choices.map((choice) => (
              <button
                type="button"
                role="radio"
                aria-checked={selected === choice.value}
                className="first-choice"
                key={choice.value}
                onClick={() => {
                  const next = { ...draft };
                  if (question === 0) {
                    next.uiLanguage = choice.value as FirstCatch["uiLanguage"];
                    setUiLang(next.uiLanguage);
                  }
                  if (question === 1) {
                    next.targetLanguage = choice.value as FirstCatch["targetLanguage"];
                    setTargetLang(next.targetLanguage);
                  }
                  if (question === 2)
                    next.dailyMinutes = choice.value as FirstCatch["dailyMinutes"];
                  setDraft(next);
                }}
              >
                <Globe2 size={23} />
                <span>
                  {choice.label}
                  <small>{choice.sub}</small>
                </span>
                {selected === choice.value && <CheckCircle2 size={21} />}
              </button>
            ))}
          </div>
          {errors}
          <div className="first-footer">
            <button
              className="first-primary"
              disabled={!!busy}
              onClick={() =>
                void action(async () => {
                  await commit({ ...draft, stage: question === 2 ? "home" : "questions" });
                  if (question < 2) setQuestion(question + 1);
                })
              }
            >
              {t(question === 2 ? "first.start" : "first.next")}
              <ArrowRight size={19} />
            </button>
            {question > 0 ? (
              <button className="first-secondary" onClick={() => setQuestion(question - 1)}>
                {t("first.back")}
              </button>
            ) : (
              <a className="first-secondary text-center" href="/auth">
                {t("first.signin")}
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }
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
      {draft.stage === "home" && <FirstCatchHome draft={null} />}
      {draft.stage === "dex" && (
        <FirstCatchShell tab={1}>
          <h1 className="text-title font-bold mb-6">{t("nav.dex")}</h1>
          <section data-tour="dex">
            <DexEmptyState />
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
            <DexAlbumGrid items={[sticker]} justCaught={sticker.id} onOpen={() => {}} />
          </section>
          <div className="first-added" role="status">
            <CheckCircle2 className="mx-auto text-primary" size={30} />
            <h2>{t("first.added")}</h2>
            <p className="first-sub">{t("first.local")}</p>
          </div>
          {errors}
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
      {!["camera", "card", "added", "account"].includes(draft.stage) && errors}
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
