import { categoryOptions, dayOptions, NO_FILTER } from "@/lib/dex-filter";
import { preloadFirstCatchImages } from "@/lib/first-catch-images";
import { usePronounce } from "@/lib/use-pronounce";
import { useTargetLang } from "@/lib/target-lang-pref";
import { Suspense, useEffect, useRef, useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { Reading } from "@/lib/phonetic";
import { Term } from "@/components/Term";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { initialUiLang, tStatic, useT } from "@/lib/i18n";
import { FirstCatchQuestions } from "./FirstCatchQuestions";
import { FirstCatchIntro, FirstCatchNotifications, FirstCatchReady } from "./FirstCatchPages";
import { getTargetLang } from "@/lib/target-lang-pref";
import type { suggestWords } from "@/lib/ai.functions";
import { firstCatchAI, firstCatchMemberAI } from "@/lib/first-catch-ai.functions";
import { createFirstCatchServices } from "@/lib/first-catch-ai-client";
import { reportBackgroundFailure } from "@/lib/background-failure";
import type { TutorialStep } from "@/lib/funnel-events";
import { trackTutorialStep } from "@/lib/tutorial-funnel-client";
import { LearningPreferencesSchema } from "@/lib/learning-preferences";
import type { FirstCatchAIRequest } from "@/lib/first-catch-ai-schema";
import {
  firstCatchPhoto,
  applyFirstCatchLanguage,
  seedFirstCatchReading,
  ensureFirstCatchSession,
  isGuestRefusal,
  isNetworkFailure,
  FIRST_CATCH_NETWORK,
} from "@/lib/first-catch-services";
import { offersSample, sampleFirstCatch } from "@/lib/first-catch-sample";
import { downscaleDataUrl } from "@/lib/image-resize";
import { withDeadline } from "@/lib/deadline";
import {
  readFirstCatch,
  writeFirstCatch,
  decodeFirstCatchHandoff,
  encodeFirstCatchHandoff,
  FIRST_CATCH_HANDOFF_PARAM,
  canRequestAccount,
  firstCatchSticker,
  type FirstCatch,
} from "@/lib/first-catch";
import { JUST_CAUGHT_VIEW } from "@/lib/dex-view";
import {
  CaptureAnalyzingPanel,
  CaptureCardPanel,
  CaptureObjectPanel,
  CatchLandingOverlay,
  DexSurface,
  FirstCatchDex,
  FirstCatchHome,
  FirstCatchReview,
  FirstCatchShell,
  PickWordPanel,
  prefetchFirstCatchStages,
  runCatchLanding,
  StickerSheet,
  TutorialSettings,
} from "./first-catch-lazy";
import { Spotlight } from "./Spotlight";
import { TutorialSettingsContext } from "./tutorial-settings-context";
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
          const started = Date.now();
          try {
            // 端末に残るログインを読むだけ（`getUser` は毎回 Auth に問い合わせ、AI の前に
            // 1往復を足していた。本人かどうかはサーバが確かめる）。
            const { data: auth } = await supabase.auth.getSession();
            // 登録済みの人も、すでに匿名アカウントを持つ端末も、本人の枠で動かす。
            if (auth.session?.user) return await memberAI({ data });
            try {
              return await guestAI({ data });
            } catch (refused) {
              // 未登録用の窓口が断った(上限・環境・一時的な不具合)。以前の経路 —
              // この端末だけの匿名アカウントで、本人の枠(24回/日)を使う — に切り替える。
              // 匿名ログインが使えない環境では FIRST_CATCH_GUEST_UNAVAILABLE になり、
              // 写真は残ったまま画面に理由が出る。
              if (!isGuestRefusal(refused)) throw refused;
              await ensureFirstCatchSession();
              return await memberAI({ data });
            }
          } catch (failed) {
            // 画面は「もう一度試す」を出す。失敗と待った時間は開発者の記録にも残す。
            reportBackgroundFailure("first_catch_ai", failed, {
              action: data.action,
              ms: Date.now() - started,
            });
            // 通信が届かなかった失敗は、そうと分かる文で（生の "Failed to fetch" を出さない）。
            if (isNetworkFailure(failed)) throw new Error(FIRST_CATCH_NETWORK);
            throw failed;
          }
        },
        async () => {},
        // AI に送る写真は本物の撮影と同じ大きさ（長い辺 768px）。端末に残す写真はそのまま。
        // 1024px の約半分の大きさで、送る時間と AI が読む量（タイル数）が減る。
        (photo) => downscaleDataUrl(photo, 768, 0.8),
      )}
      onFunnel={trackTutorialStep}
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

/**
 * チュートリアルの画面の段のうち、数える物（`funnel-events.ts` の `TUTORIAL_STEPS`）。
 * 写真を撮った・候補が並んだは段ではなく出来事なので、それぞれの所で数える。
 * 登録の画面（signup_view）と登録できた（signup_done）は `/auth` と取り込みの画面で数える。
 */
/**
 * はがした後の待ちの上限（ms、`catchWord`）。発音はこれ以上待たない（読み終わりの知らせが
 * 来ない iPhone でも先へ）。着地の演出がこれを過ぎても終わらなければ、待たずに図鑑の段へ。
 * 保存（端末の IndexedDB）がこれを過ぎても決まらなければ、理由と「もう一度」を出す。
 */
export const SPEAK_DEADLINE_MS = 3_000;
export const LANDING_DEADLINE_MS = 12_000;
export const SAVE_DEADLINE_MS = 20_000;

const FUNNEL_STEP_OF_STAGE: Partial<Record<FirstCatch["stage"], TutorialStep>> = {
  intro: "welcome_view",
  notifications: "questions_done",
  ready: "questions_done",
  home: "tutorial_start",
  added: "catch_done",
  complete: "practice_done",
};

function freshFirstCatch(): FirstCatch {
  return {
    version: 1,
    id: crypto.randomUUID(),
    // 表示言語を選ぶ前（ウェルカム）はブラウザの言語に合わせる。選んだことがあればそれ
    // （`initialUiLang`）。`applyFirstCatchLanguage` が書くので、次の質問でも選ばれた状態になる。
    uiLanguage: initialUiLang(),
    targetLanguage: getTargetLang(),
    dailyMinutes: 10,
    stage: "intro",
    photo: null,
    card: null,
    capturedAt: null,
  };
}

/**
 * チュートリアル全体。2画面目から先の部品は後から読む（`first-catch-lazy.tsx`）ので、
 * ここで受け止める。最初の画面が出たら、残りを裏で読み始める。
 */
export function FirstCatchFlow(props: Parameters<typeof FirstCatchFlowInner>[0]) {
  useEffect(() => {
    // 最初の画面の写真と字を先に通す（遅い回線で取り合わないように 2.5 秒待つ）。それから
    // 手の空いた時に裏で読む。質問に答えている間（7画面）に読み終わる。
    let idleId: number | undefined;
    const timer = window.setTimeout(() => {
      idleId = window.requestIdleCallback
        ? window.requestIdleCallback(() => prefetchFirstCatchStages(), { timeout: 2000 })
        : window.setTimeout(() => prefetchFirstCatchStages(), 0);
    }, 2500);
    return () => {
      window.clearTimeout(timer);
      if (idleId !== undefined) {
        if (window.cancelIdleCallback) window.cancelIdleCallback(idleId);
        else window.clearTimeout(idleId);
      }
    };
  }, []);
  return (
    <Suspense fallback={null}>
      <FirstCatchFlowInner {...props} />
    </Suspense>
  );
}

function FirstCatchFlowInner({
  services,
  onAccount,
  initialDraft,
  persist = writeFirstCatch,
  initialSettingsOpen = false,
  initialSuggestions = [],
  onFunnel,
}: {
  /**
   * チュートリアルの段を数える口（ベータの計測、`tutorial-funnel-client.ts`）。人を特定しない
   * 日ごとの数だけ。確認用ページ（UI ハーネス）では渡さない = 数えない。
   */
  onFunnel?: (step: TutorialStep) => void;
  /** 見本（UI ハーネス）で設定画面を開いた状態から見せるため。 */
  initialSettingsOpen?: boolean;
  /**
   * 見本（UI ハーネス）で、見本の写真の候補が並んだ所から見せるため。
   * 撮った写真の解析結果の代わりには使わない（見本の写真にだけ付ける）。
   */
  initialSuggestions?: Suggestion[];
  services: FirstCatchServices;
  onAccount: () => void;
  initialDraft?: FirstCatch;
  persist?: (draft: FirstCatch) => Promise<void>;
}) {
  const t = useT();
  const [draft, setDraft] = useState<FirstCatch | null>(() => {
    // 台湾華語なら最初の描画から拼音（選んだことのある端末はそのまま）。子の読みは
    // この後に描かれるので、ここで書けば1コマ目から拼音になる。
    if (initialDraft) seedFirstCatchReading(initialDraft);
    return initialDraft ?? null;
  });
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [busy, setBusy] = useState<"photo" | "card" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** いまの失敗のコード（見本で続けるボタンを出すかの判断）。 */
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const retry = useRef<() => void>(() => {});
  const lock = useRef(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>(initialSuggestions);
  const [manual, setManual] = useState("");
  const [flipped, setFlipped] = useState(false);
  const [detailSeen, setDetailSeen] = useState(false);
  const [homeGuide, setHomeGuide] = useState<"album" | "camera">("album");
  const [landing, setLanding] = useState(false);
  /**
   * 撮る画面のシャッターが「次に押す物」か（映像が届いていて、撮る前の一枚も直し方も
   * 出ていない）。そうでない間はシャッターを照らす案内を出さない — 案内の覆いが
   * 撮る前の一枚・直し方の「カメラを使う」「写真を選ぶ」を押せなくし、
   * ブラウザの確認の後ろに札が重なるため（2026-10-02 オーナーの画面写真）。
   */
  const [shutterReady, setShutterReady] = useState(false);
  /** チュートリアル用の設定（言語・最初に戻る）。下のタブの「設定」から開く。 */
  const [menuOpen, setMenuOpen] = useState(initialSettingsOpen);
  const openMenu = useRef(() => setMenuOpen(true)).current;
  const hero = useRef<HTMLDivElement>(null);
  const fly = useRef<HTMLImageElement>(null);
  const pronounce = usePronounce(useTargetLang());
  const mounted = useRef(true);
  const funnelRef = useRef(onFunnel);
  funnelRef.current = onFunnel;
  useEffect(() => {
    preloadFirstCatchImages();
    mounted.current = true;
    if (initialDraft) applyFirstCatchLanguage(initialDraft);
    if (!initialDraft)
      void readFirstCatch()
        .then((saved) => {
          if (!mounted.current) return;
          // LINE などから開き直してきた時は、URL に載せた答えから続ける（`fc`）。
          // この端末に進んだ下書きが既にあれば、そちらを優先する。
          const handoff = decodeFirstCatchHandoff(
            new URLSearchParams(location.search).get(FIRST_CATCH_HANDOFF_PARAM),
          );
          const fresh = !saved || saved.stage === "done" || saved.stage === "intro";
          const next: FirstCatch =
            handoff && fresh
              ? handoff
              : saved?.stage !== "done" && saved
                ? saved
                : freshFirstCatch();
          applyFirstCatchLanguage(next);
          setDraft(next);
          if (handoff && fresh) void writeFirstCatch(next).catch(() => {});
        })
        .catch(() => {
          // 読めない下書き（古い形・壊れた保存・端末の保存が使えない）でも、最初の画面は出す。
          // 前は「保存できません」と「もう一度試す」だけの画面で止まり、しかもその
          // ボタンは何もしなかった（再試行の中身が空のまま）。初めての人が最初に見る
          // 画面が行き止まりにならないよう、新しい下書きで始める。保存が本当に
          // 使えない端末では、「はじめる」を押した時に理由と再試行が最初の画面に出る。
          if (!mounted.current) return;
          const next = freshFirstCatch();
          applyFirstCatchLanguage(next);
          setDraft(next);
        });
    return () => {
      mounted.current = false;
    };
  }, []);
  /**
   * タブの題も表示言語に合わせる（2026-10-03 監査: 英語・中文のブラウザでも「ようこそ —
   * CatchWords」だった）。サーバは表示言語を知らないので、最初の題は日本語で届く。
   */
  const uiLanguage = draft?.uiLanguage;
  useEffect(() => {
    if (uiLanguage && typeof document !== "undefined") document.title = tStatic("page.onboarding");
  }, [uiLanguage]);
  /**
   * 撮る画面にいる間だけ、答えを URL に載せておく（開き直した先で続きから始めるため）。
   * 他の画面では外す — 写真を撮った後の下書きは載せない。
   */
  useEffect(() => {
    if (!draft || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (draft.stage === "camera" && !draft.photo)
      url.searchParams.set(FIRST_CATCH_HANDOFF_PARAM, encodeFirstCatchHandoff(draft));
    else if (url.searchParams.has(FIRST_CATCH_HANDOFF_PARAM))
      url.searchParams.delete(FIRST_CATCH_HANDOFF_PARAM);
    else return;
    window.history.replaceState(window.history.state, "", url);
  }, [draft]);
  /**
   * 下書きを端末に保存してから画面を進める。保存の失敗は**保存の失敗として**伝える
   * （`first.storage`）。前は汎用の文（「写真を残したまま、もう一度試せます」）になり、
   * 写真をまだ撮っていない最初の画面・質問でも「写真」と出ていた。
   */
  async function commit(next: FirstCatch) {
    try {
      await persist(next);
    } catch {
      throw new Error("FIRST_CATCH_STORAGE");
    }
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
    setErrorCode(null);
    setBusy(kind);
    retry.current = () => {
      void action(fn, kind);
    };
    try {
      await fn();
    } catch (e) {
      if (mounted.current && mine === run.current) {
        setError(failureText(e));
        setErrorCode(e instanceof Error ? e.message : "");
      }
    } finally {
      if (mine === run.current) {
        lock.current = false;
        if (mounted.current) setBusy(null);
      }
    }
  }
  /** 見本の写真と単語で、この先の流れを続ける（AI は呼ばない）。 */
  function continueWithSample() {
    const current = draftRef.current;
    if (!current) return;
    run.current++;
    lock.current = false;
    setSuggestions([]);
    void action(async () => {
      await commit(sampleFirstCatch(current));
      setDetailSeen(false);
    });
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
    if (mounted.current && mine === run.current) {
      setSuggestions(result.suggestions);
      funnelRef.current?.("candidates_shown");
    }
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
      funnelRef.current?.("photo_taken");
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
      /**
       * **図鑑へ入るのは保存の成否だけで決める。音・振動・動きは待ちの理由にしない**
       * （iPhone の Safari で「図鑑に追加できない」報告 2026-10-03）。発音が鳴らない・
       * 終わりの知らせが来ない（`play()` が NotAllowedError・いつまでも決まらない）、
       * 演出の途中で止まる・落ちる — どれでも、保存できていれば図鑑の段へ進む。
       */
      let opened = false;
      const openDex = () => {
        if (opened || !mounted.current) return;
        opened = true;
        setDraft(next);
      };
      try {
        await withDeadline(
          runCatchLanding({
            startEl: hero.current,
            fly,
            gate,
            // The shared runner adds the DOM prefix itself.
            destinationId: next.id,
            speakLine: () =>
              withDeadline(
                Promise.resolve().then(() => pronounce(next.card!.headword_zh)),
                SPEAK_DEADLINE_MS,
                undefined,
              ),
            openDex,
          }),
          LANDING_DEADLINE_MS,
          undefined,
        );
        // Animation helpers may absorb failure; never treat that as a saved Catch.
        const saved = await withDeadline(
          gate.then(
            () => "saved" as const,
            () => "failed" as const,
          ),
          SAVE_DEADLINE_MS,
          "timeout" as const,
        );
        if (saved === "timeout") throw new Error("FIRST_CATCH_STORAGE_TIMEOUT");
        if (saved === "failed") throw new Error("FIRST_CATCH_STORAGE");
        openDex();
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
  /** 画面の段 → 数える段（同じ段はタブごとに1回だけ数える）。 */
  useEffect(() => {
    const step = draft ? FUNNEL_STEP_OF_STAGE[draft.stage] : undefined;
    if (step) funnelRef.current?.(step);
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
      FIRST_CATCH_TRIAL_FULL: "first.trialFull",
      FIRST_CATCH_NO_WORDS: "first.noWords",
      FIRST_CATCH_AI_FORMAT: "first.aiFormat",
      FIRST_CATCH_STORAGE: "first.storage",
      FIRST_CATCH_STORAGE_TIMEOUT: "first.storage",
      FIRST_CATCH_NETWORK: "first.network",
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
      {/*
        写真の分析・カードが使えない時の出口（2026-10-03 監査: 札は「見本の写真で体験できます」と
        言うのに、そのボタンが無い行き止まりだった）。見本の写真と単語で続ける — AI は呼ばず、
        登録後にも引き継がない（`first-catch-sample.ts`）。端末に保存できない失敗には出さない。
      */}
      {draft?.stage === "camera" && offersSample(errorCode) && (
        <button className="first-secondary" onClick={continueWithSample} disabled={!!busy}>
          {t("first.useSample")}
        </button>
      )}
    </div>
  );
  /**
   * 最初の画面・準備の画面の失敗は、理由の1行だけ。ここの「次へ」（はじめる）が
   * そのまま再試行なので、同じ形の青いボタンを2つ並べない（並べると「はじめる」が
   * 背の低い画面の外へ押し出された）。
   */
  const inlineError = error && (
    <p role="alert" className="first-error first-error--inline">
      {error}
    </p>
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
  /** チュートリアル中の設定で変えた値を下書きへ（言語は画面にもすぐ効かせる）。 */
  function changeSettings(next: FirstCatch) {
    const current = draftRef.current;
    if (!current) return;
    let updated: FirstCatch = { ...current, ...next, stage: current.stage };
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
  const settingsOpen = menuOpen && draft.stage !== "intro" && draft.stage !== "account";
  /**
   * 下のタブの「設定」を押すと、その段の画面の代わりに**設定画面**を出す
   * （オーナー指示 2026-09-30「チュートリアルでも設定が触れて変更できるように」）。
   * 「チュートリアルに戻る」で元の段へ戻る（段は下書きに残っているので続きから）。
   */
  const withMenu = (node: React.ReactNode) => (
    <TutorialSettingsContext.Provider value={openMenu}>
      {settingsOpen ? (
        <FirstCatchShell tab={4} onTab={(index) => index !== 4 && setMenuOpen(false)}>
          <TutorialSettings
            draft={draft}
            onChange={changeSettings}
            onClose={() => setMenuOpen(false)}
            onRedoQuestions={() => {
              abandonRun();
              setMenuOpen(false);
              void action(() => commit({ ...draft, stage: "questions", questionIndex: 0 }));
            }}
            onRestart={restart}
            onSignIn={() => {
              window.location.assign("/auth");
            }}
          />
        </FirstCatchShell>
      ) : (
        node
      )}
    </TutorialSettingsContext.Provider>
  );
  if (draft.stage === "intro")
    return (
      <FirstCatchIntro
        draft={draft}
        busy={!!busy}
        error={inlineError}
        onStart={() => move("questions")}
      />
    );
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
        error={inlineError}
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
        /* **祝う画面**（オーナー指示 2026-10-03「チュートリアルの終わりの画面はアニメーションを
           入れて、祝福する、画面に動きを入れて」）。見出しが弾んで出る → 撮った写真が回りながら
           飛び出す → 紙吹雪が開いて上から降る → 完了の印と、その語（読み付き）が乗る → 登録の釦。
           動きは transform と opacity だけ。動きを減らす設定では、最後の絵のまま出す。 */
        <div className="first-standalone first-ready first-complete">
          <div className="first-confetti-rain" aria-hidden="true">
            {CONFETTI_RAIN.map(([x, delay, dx, turn], i) => (
              <i
                key={i}
                style={
                  {
                    "--x": `${x}%`,
                    "--d": `${delay}ms`,
                    "--dx": `${dx}px`,
                    "--r": `${turn}deg`,
                  } as React.CSSProperties
                }
              />
            ))}
          </div>
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
            <div className="first-complete-print">
              <img src={draft.photo!} alt="" className="first-complete-photo" />
              <span className="first-complete-badge" aria-hidden="true">
                <Check size={30} strokeWidth={3} />
              </span>
              {sticker && (
                <span className="first-complete-word">
                  <Term lang={sticker.word.language} className="first-complete-word__head">
                    {sticker.word.headword}
                  </Term>
                  <Reading
                    lang={sticker.word.language ?? undefined}
                    zhuyin={sticker.word.reading_zhuyin}
                    pinyin={sticker.word.pinyin}
                    className="first-complete-word__reading"
                  />
                </span>
              )}
            </div>
          </div>
          <footer className="first-standalone-footer">
            <button className="first-primary tour-pulse" disabled={!!busy} onClick={account}>
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
                onObjectFile={photo}
                typedWord=""
                setTypedWord={() => {}}
                onSearch={() => {}}
                onOpenScan={() => {}}
                error={null}
                onShutterReady={setShutterReady}
                primer
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
            selfieImg={null}
            flipped={flipped}
            setFlipped={setFlipped}
            caption=""
            setCaption={() => {}}
            placeName={null}
            onRedo={() =>
              draft.sample
                ? // 見本から撮り直す時は、見本を外して自分の写真へ戻る。
                  void action(() =>
                    commit({
                      ...draft,
                      sample: false,
                      photo: null,
                      capturedAt: null,
                      card: null,
                      lesson: undefined,
                      stage: "camera",
                    }),
                  )
                : move("camera")
            }
            onSave={catchWord}
            heroBoxRef={hero}
            saving={!detailSeen || !!busy}
            landing={landing}
          />
          {draft.sample && (
            <p className="first-sample-note" role="note">
              {t("first.sampleNote")}
            </p>
          )}
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
              text={t("first.addedHint")}
              step="3 / 5"
              nextLabel={t("first.next")}
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
            alignTop
            compact
            title={t("first.exploreCoachTitle")}
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
          // ホーム → カメラのタブまでが第1章（`docs/first-catch-onboarding.md` の章立て）。
          step="1 / 5"
          nextLabel={t("first.next")}
          onNext={homeGuide === "album" ? () => setHomeGuide("camera") : undefined}
          interactive={homeGuide === "camera"}
          allowSelector={homeGuide === "camera" ? '[data-tour="tab-camera"]' : undefined}
          gesture="tap"
        />
      )}
      {!error && !landing && shutterReady && draft.stage === "camera" && !draft.photo && (
        <Spotlight
          target=".camera-shutter"
          title={t("first.shutterTitle")}
          text={t("first.shoot")}
          step="2 / 5"
          interactive
          gesture="tap"
        />
      )}
      {!error && !landing && draft.stage === "camera" && suggestions.length > 0 && (
        <Spotlight
          // 枠は候補の一覧そのもの。下の「違う単語を入力」と、2段目の「戻る」も押せる
          // （候補に無い時の道を、チュートリアルでも塞がない）。
          target='[data-tour="pick"] .candidate-picker > ul'
          allowSelector='[data-tour="pick"]'
          title={t("first.pickTitle")}
          text={t("first.pick")}
          step="2 / 5"
          // 札は下端の1段（2026-10-03 全画面の点検: 枠の下に置くと「違う単語を入力」を、
          // 上に置くと撮った写真を覆っていた）。下のタブはこの段では押せないので、その上に
          // 札を重ねても失う物が無い。背の低い画面は候補の面も詰める（`PickWordPanel`）。
          compact
          interactive
          gesture="tap"
        />
      )}
      {!error && !landing && draft.stage === "card" && (
        <Spotlight
          target={detailSeen ? '[data-tour="peel"]' : '[data-tour="detail"]'}
          title={t(detailSeen ? "first.peelTitle" : "first.detailTitle")}
          text={t(detailSeen ? "first.peel" : "first.detail")}
          step="2 / 5"
          interactive
          gesture={detailSeen ? "peel" : undefined}
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

/** 終わりの画面に降る紙吹雪: 横の位置(%)・遅れ(ms)・横の流れ(px)・回転(度)。決め打ちで毎回同じ絵。 */
const CONFETTI_RAIN: ReadonlyArray<readonly [number, number, number, number]> = [
  [6, 120, 18, 260],
  [14, 420, -12, -320],
  [22, 60, 26, 300],
  [31, 300, -20, -240],
  [39, 520, 14, 360],
  [47, 180, -16, -280],
  [55, 380, 22, 250],
  [63, 90, -24, -340],
  [71, 460, 12, 290],
  [79, 240, -18, -260],
  [87, 140, 20, 330],
  [94, 560, -14, -300],
  [10, 760, 16, -220],
  [35, 880, -22, 280],
  [59, 700, 18, -310],
  [83, 820, -12, 240],
];
