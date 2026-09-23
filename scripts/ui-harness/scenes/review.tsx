/**
 * 復習画面の場面。**ルートに書かれている本物のコンポーネントを描く。**
 *
 * 復習はこのアプリの中心(写真を見て、自分の言葉で言う)なのに、
 * 中身がルートのファイルに直書きされていたので**一度も機械で見ていなかった**。
 * ルート側でいくつか `export` を足して、ここからそのまま描く。
 * 似たHTMLをこちらに書き写すことはしない — それをやると
 * 「直しても画像が変わらない検査」に戻る。
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { DEFAULT_TARGET_LANGUAGE } from "@/lib/target-lang";
import { stabilityOf } from "@/lib/srs";
import {
  AnswerExplain,
  DoneState,
  EmptyState,
  ForgettingCurveModal,
  LightModeCard,
  MemoryLevelSummary,
  MemoryOverviewPanel,
  MiniRetentionGraph,
  ReviewHeader,
  ReviewPreparing,
  SayResult,
  SpeakingCard,
} from "@/routes/_authenticated/review";
import type { DueReviewCard } from "@/lib/reviews.functions";
import { RetakeSuggestion } from "@/components/RetakeSuggestion";

/** 4択の上に出る写真。縦長（実物のキャッチ写真はだいたい縦）。 */
const PHOTO =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#9fb8c8"/></svg>',
  );

const CARD: DueReviewCard = {
  review_id: "r1",
  sticker_id: "s1",
  word_id: "w1",
  language: DEFAULT_TARGET_LANGUAGE,
  headword: "珍珠奶茶",
  reading_zhuyin: "ㄓㄣ ㄓㄨ ㄋㄞˇ ㄔㄚˊ",
  pinyin: "zhēn zhū nǎi chá",
  meaning_ja: "タピオカミルクティー",
  example_sentence: "我想喝一杯珍珠奶茶。",
  example_translation: "タピオカミルクティーを一杯飲みたい。",
  top_chunk: { zh: "喝一杯", ja: "一杯飲む" },
  explain: null,
  category_key: "drink",
  entry_type: "word",
  cutout_url: null,
  object_url: null,
  placeholder_url: null,
  audio_url: null,
  caption: "夜市で",
  location_name: "士林夜市",
  taken_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  review_count: 3,
  lapses: 0,
  photo_count: 1,
  prompt_pattern: { type: "V+O", zh: "喝珍珠奶茶", ja: "〜を飲む" },
  blur_seen: false,
  ease: 2.4,
  interval_days: 6,
  repetitions: 3,
  retention: 72,
  mode: "recognition",
  choices: ["タピオカミルクティー", "夜市の屋台", "地下鉄の駅", "傘立て"],
  headword_choices: ["珍珠奶茶", "夜市", "捷運", "雨傘"],
  headword_choice_infos: [
    { headword: "珍珠奶茶", zhuyin: "ㄓㄣ ㄓㄨ ㄋㄞˇ ㄔㄚˊ", pinyin: "zhēn zhū nǎi chá" },
    { headword: "夜市", zhuyin: "ㄧㄝˋ ㄕˋ", pinyin: "yè shì" },
    { headword: "捷運", zhuyin: "ㄐㄧㄝˊ ㄩㄣˋ", pinyin: "jié yùn" },
    { headword: "雨傘", zhuyin: "ㄩˇ ㄙㄢˇ", pinyin: "yǔ sǎn" },
  ],
};

/**
 * 出題を組み立てている間。**この画面でいちばん先に見る面**。
 * 見出しは先に出ているので、その下に1枚だけ置かれた絵になる。
 */
export function ReviewLoadingScene() {
  return (
    <>
      <section className="mb-4">
        <ReviewHeader answered={null} total={null} progress={0} mode="choice" onMode={() => {}} />
      </section>
      <ReviewPreparing />
    </>
  );
}

/**
 * 復習を開いた瞬間の上半分。見出しと、記憶レベルの帯。
 *
 * 帯は実物では**押せる**(押すと語ごとの一覧が開く)。素の `div` として
 * 撮っていた間は、押せる大きさも焦点の輪も一度も測っていなかった。
 * 実物と同じく `<section className="mb-4">` の中に、見出しと一緒に置く。
 */
export function ReviewMemoryScene({ q }: { q: URLSearchParams }) {
  const open = q.get("variant") === "open";
  const words = [72, 44, 91, 12, 60, 33].map((retention, i) => ({
    sticker_id: `s${i}`,
    headword: ["珍珠奶茶", "夜市", "捷運", "雨傘", "蘋果", "咖啡"][i],
    retention,
    interval_days: [6, 2, 30, 1, 14, 45][i],
    repetitions: [3, 1, 8, 1, 5, 9][i],
    due_at: null,
    days_until_forgot: null,
    fresh: i === 3,
    long_term: i === 5,
    anchor_at: null,
    stability_days: 4,
    ease: 2.4,
  }));
  return (
    <section className="mb-4">
      {/* 続いている日数はここに出る。**0 のときは出ない**のが正しい姿なので、
          読み込み中の面(下)で「出ないこと」も一緒に見る。 */}
      <ReviewHeader
        answered={3}
        total={12}
        progress={25}
        mode="choice"
        onMode={() => {}}
        reviewStreak={7}
      />
      {/* 実物と同じく `<button>` で包む。開いた側も撮る — 印の向きが
          変わるだけの差だが、変わらなければ押しても何も起きないのと同じ。 */}
      <button
        className="relative w-full text-left before:absolute before:inset-x-0 before:-inset-y-2 before:content-['']"
        aria-expanded={open}
      >
        <MemoryLevelSummary words={words} expanded={open} />
      </button>
    </section>
  );
}

/**
 * 記憶の一覧。**オーナー報告 2026-09-16 の画面**
 * 「SRSは長期記憶なのに、%が覚えたの状態より低いのが変。一番下に行けば
 *  行くほど、記憶の状態がより高く % も高くして」。
 *
 * ここまで雛形にあったのは上の帯だけで、**一覧は一度も撮っていなかった** —
 * 逆転はこの一覧で起きていたので、見ていない所で起きていたことになる。
 *
 * 語は**わざとばらばらの順**で渡す。並べ替えは画面の側の仕事なので、
 * 揃えて渡すと「並べ替えが効いている」ことを確かめられない。
 */
export function ReviewMemoryListScene() {
  const raw: Array<[string, number, number, number]> = [
    // 見出し語, 定着度, 間隔(日), 復習回数
    ["珍珠奶茶", 100, 90, 12], // 育った語（前は「長期記憶 100%」）
    ["雨傘", 100, 0, 0], // 今日キャッチ（前は 100% で最下段＝最強に見えた）
    ["夜市", 82, 45, 9], // 出題日が近い長期の語（前は「長期記憶 82%」）
    ["捷運", 96, 5, 3], // 間隔は短いが直後（前は「覚えた 96%」で上の語より下）
    ["咖啡", 44, 2, 1],
    ["蘋果", 68, 14, 5],
  ];
  const words = raw.map(([headword, retention, interval_days, repetitions], i) => ({
    sticker_id: `s${i}`,
    headword,
    retention,
    interval_days,
    repetitions,
    due_at: null,
    days_until_forgot: null,
    fresh: repetitions <= 2,
    long_term: interval_days >= 30,
    anchor_at: null,
    stability_days: stabilityOf(interval_days, 2.5),
    ease: 2.5,
  }));
  return (
    <section className="mb-4">
      <MemoryLevelSummary words={words} expanded />
      <MemoryOverviewPanel
        overview={{ danger: 1, fuzzy: 2, solid: 3, words }}
        onOpenWord={() => {}}
      />
    </section>
  );
}

/** 4択のカード。**アプリでいちばん多く押される画面。** */
export function ReviewChoiceScene({ q }: { q: URLSearchParams }) {
  /**
   * **写真のある回も撮る。**（オーナー報告 2026-09-16
   * 「復習の4択スクロールしないと4択が全て見れないようになってる」）
   *
   * ここまでこの場面は写真が `null` の札しか描いていなかった。写真が
   * 入ると上の枠がその高さを取るので、**4つ目が画面の外へ出るのは
   * 写真がある回だけ**。無い回だけを測っていたので、溢れが一度も
   * 絵に映らなかった。
   *
   * **既定は写真なしのまま**にして、`?photo=1` で足す。既定を変えると
   * この場面から派生している他の検査（答え合わせの `review-right` /
   * `review-wrong`）の絵まで一斉に変わり、**この作業と関係のない指摘が
   * 4件増えた**。場面を足すときは、既にある絵を動かさない。
   */
  const withPhoto = q.get("photo") === "1";
  const card: DueReviewCard = withPhoto ? { ...CARD, object_url: PHOTO } : CARD;
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const root = document.getElementById("root");
      const main = root?.querySelector("main") ?? root;
      root?.classList.add("h-dvh", "overflow-hidden");
      // **`h-dvh` ではない。** 実物(`AppShell` の `fixedViewport`)の `main` は
      //   100dvh − ヘッダ − safe-top − 6rem(下タブの逃げ場) − safe-bottom
      // で、`h-dvh` はそこから**ヘッダと 6rem を引き忘れた高さ**。
      // しかも `main` はヘッダの下から始まるので、箱はヘッダ+96px ぶん
      // 画面の下にはみ出す。
      //
      // その状態だと、答え合わせのパネル(画面下端から 4.5rem に貼り付く)が
      // はみ出した中身を覆うのは**当たり前**で、検査は8場面で
      // 「送り切っても下敷きのまま」と言い続けていた。**実物ではなく
      // 雛形の欠陥**だったので、直す側を間違えると永久に直らない。
      //
      // 文字列は `AppShell.tsx` と1字も違えない。Tailwind は `@source "../src"`
      // しか走査しないので、ここにしか無い綴りの任意値は**CSSが生えない**。
      main?.classList.add(
        "flex",
        "h-[calc(100dvh-var(--app-header-h)-env(safe-area-inset-top)-6rem-env(safe-area-inset-bottom))]",
        "min-h-0",
        "flex-col",
        "overflow-hidden",
        "py-2",
      );
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  // **見出しも一緒に描く。** 札だけを描いていたせいで、独立監査が
  // 「クイズに進捗(3/12)が無い」と指摘した — 実物には最初からある。
  // 部品だけを切り出した絵は、その画面の絵ではない。
  return (
    <>
      <section className="mb-2 shrink-0">
        <ReviewHeader answered={3} total={12} progress={25} mode="choice" onMode={() => {}} />
      </section>
      <LightModeCard card={card} onNext={() => {}} onOpenMemory={() => {}} />
    </>
  );
}

/** 答え合わせの解説。 */
export function ReviewExplainScene() {
  return <AnswerExplain card={CARD} />;
}

/** 今日ぶんが無いとき・終わったとき。**普通の日にいちばんよく見る面**。 */
export function ReviewEndScene({ q }: { q: URLSearchParams }) {
  // 完了の面は**成績つき**で撮る。数えていない回(0問)は成績を出さない
  // 分岐なので、そちらも別の場面で見る。
  if (q.get("variant") === "done") {
    return (
      <DoneState
        onAgain={() => {}}
        answered={12}
        correct={10}
        batch={{ limit: 0, doneToday: 12, dueRemaining: 0 }}
      />
    );
  }
  if (q.get("variant") === "done-nocount") {
    return <DoneState onAgain={() => {}} batch={{ limit: 0, doneToday: 0, dueRemaining: 0 }} />;
  }
  // **束を出し切っただけ**の面。ここが一番よく出る(10枚ごと)のに、
  // 前は絵が1枚も無かった — `DoneState` が自分で数を聞いていたので
  // 雛形が描けず、検査は合格したまま新しい面が写っていなかった。
  if (q.get("variant") === "more") {
    return (
      <DoneState
        onAgain={() => {}}
        answered={10}
        correct={8}
        batch={{ limit: 0, doneToday: 10, dueRemaining: 187 }}
      />
    );
  }
  // 自分で決めた上限で止まった面。上限を上げる導線が要る。
  if (q.get("variant") === "capped") {
    return (
      <DoneState
        onAgain={() => {}}
        answered={20}
        correct={17}
        batch={{ limit: 20, doneToday: 20, dueRemaining: 43 }}
      />
    );
  }
  return <EmptyState />;
}

/**
 * 「言うだけ」の段の出題(要望 #32 の L2)。
 *
 * **型も足場も出ていない面**なので、何を求められているかが1行で
 * 伝わっているかを見る。ここに何も無いと、写真と録音ボタンだけが
 * 置かれた画面になり、人は「文を作るのか、単語だけか」を推測することになる。
 *
 * 本物の `SpeakingCard` をそのまま描く。足場の取得は
 * `format="say"` のとき止まっているので、通信は起きない。
 */
export function ReviewSayScene() {
  return (
    <>
      <section className="mb-4">
        <ReviewHeader answered={2} total={9} progress={22} mode="hybrid" onMode={() => {}} />
      </section>
      <SpeakingCard card={CARD} format="say" onNext={() => {}} onOpenMemory={() => {}} />
    </>
  );
}

/**
 * 「言うだけ」の答え合わせ。通じた面と通じなかった面の両方。
 *
 * カードごと描くと、この節に辿り着くまでに写真と録音欄で数千pxになる
 * (「出会う」の節で一度やった失敗)。判定の面だけを直に描く。
 */
export function ReviewSayResultScene({ q }: { q: URLSearchParams }) {
  const v = q.get("variant");
  const ok = v !== "ng";
  return (
    <SayResult
      card={CARD}
      ok={ok}
      // **言い直して当てた回も撮る**(オーナー指示 2026-08-27 ⑦)。
      // 画面は「正解！」と出すが記録は失念なので、その断りが本当に
      // 出ているか・「正解！」に埋もれていないかは絵でしか分からない。
      retried={v === "retried"}
      heard={ok ? "珍珠奶茶" : "真豬奶茶"}
      onRetry={() => {}}
      onNext={() => {}}
    />
  );
}

/**
 * 見出しの3択そのもの。**滑る丸がどの札を覆っているか**を3通りとも見る。
 *
 * 2択のときの `w-1/2` を残したまま3つ目を足すと、丸が最後の札の
 * 半分しか覆わない — 押しているのに選ばれていないように見える。
 * 位置で意味を伝える部品は、位置が合っている絵で確かめる。
 */
export function ReviewModeTabsScene({ q }: { q: URLSearchParams }) {
  const raw = q.get("variant") ?? "hybrid";
  const mode = raw === "speaking" || raw === "choice" ? raw : "hybrid";
  return (
    <section className="mb-4">
      <ReviewHeader answered={3} total={12} progress={25} mode={mode} onMode={() => {}} />
    </section>
  );
}

/**
 * 「もう一度撮ってみる?」の提案。
 *
 * 出る条件は `src/lib/retake.ts` が持つので、ここでは**出る値**と
 * **出ない値**を並べて、条件を満たさない札に空の枠が残らないことも見る
 * (下の1件は何も描かれないのが正しい)。
 */
export function RetakeSuggestionScene() {
  return (
    <div>
      <RetakeSuggestion
        headword="雨傘"
        reviewCount={7}
        lapses={5}
        intervalDays={1}
        retention={22}
        photoCount={1}
        onRetake={() => {}}
      />
      <RetakeSuggestion
        headword="珍珠奶茶"
        reviewCount={6}
        lapses={1}
        intervalDays={2}
        retention={38}
        photoCount={2}
        onRetake={() => {}}
      />
      {/* ここは何も出ないのが正解 — よく覚えている語。 */}
      <RetakeSuggestion
        headword="捷運"
        reviewCount={9}
        lapses={0}
        intervalDays={40}
        retention={92}
        photoCount={1}
        onRetake={() => {}}
      />
    </div>
  );
}

/**
 * 1語の記憶のグラフ（復習の一覧で語を押すと開く）。
 * （オーナー指摘 2026-09-22「記憶のグラフが見づらい…復習5回となってるのに
 *  5回復習したあとないとか」）
 *
 * わざと**実物で崩れていた形**の履歴を渡す:
 *  ・一番古い復習は 70 日前（以前は 45 日で切れて落ちていた）
 *  ・同じ日に2回（以前は日単位に丸めて1点に潰れていた）
 *  ・途中で1回間違えている（`repetitions` は 0 に戻るので「復習 N 回」が
 *    実際の回数と合わなかった）
 *
 * `?variant=due` で「もう復習どきが来ている」形（押せば復習へ進める）。
 *
 * 通信は返ってこない（stubs/react-start.ts）ので、履歴は問い合わせの
 * 置き場へ先に入れておく — 画面の部品は1字も変えずに描ける。
 */
export function MemoryCurveScene({ q }: { q: URLSearchParams }) {
  const due = q.get("variant") === "due";
  const qc = useQueryClient();
  const [word] = useState(() => {
    const day = 86_400_000;
    const now = Date.now();
    const at = (d: number, h = 0) => new Date(now - d * day + h * 3600_000).toISOString();
    // 既定は「最後の復習が昨日」＝復習どきはこれから。`due` は同じ履歴を
    // 5日ぶん過去へずらし、復習どきを過ぎた形にする。
    const shift = due ? 5 : 0;
    const history = [
      { reviewed_at: at(65 + shift), score: 4, interval_days_after: 1, ease_after: 2.5 },
      { reviewed_at: at(50 + shift), score: 4, interval_days_after: 3, ease_after: 2.5 },
      { reviewed_at: at(25 + shift), score: 1, interval_days_after: 1, ease_after: 2.3 },
      { reviewed_at: at(25 + shift, 3), score: 4, interval_days_after: 1, ease_after: 2.3 },
      { reviewed_at: at(1 + shift), score: 5, interval_days_after: 3, ease_after: 2.4 },
    ];
    qc.setQueryData(["sticker-memory", "curve-s1"], {
      history,
      current: {
        ease: 2.4,
        interval_days: 3,
        last_reviewed_at: history[history.length - 1].reviewed_at,
        due_at: null,
      },
      taken_at: at(69 + shift),
    });
    const stability = stabilityOf(3, 2.4);
    const since = 1 + shift;
    return {
      sticker_id: "curve-s1",
      headword: "珍珠奶茶",
      retention: Math.round(100 * Math.exp(-since / stability)),
      interval_days: 3,
      // SM-2 の「続けて正解した回数」。途中で間違えたので 2（実際の復習は5回）。
      repetitions: 2,
      due_at: null,
      days_until_forgot: null,
      fresh: false,
      long_term: false,
      anchor_at: history[history.length - 1].reviewed_at,
      stability_days: stability,
      ease: 2.4,
    };
  });
  return <ForgettingCurveModal word={word} onClose={() => {}} />;
}

/**
 * 全体の記憶率（前後2週間）。1語のグラフと同じ見た目にそろえた。
 * 過去は記録（途中で語が無かった日は null = 線が切れる）、未来は予測。
 */
export function MemoryOverallScene() {
  const series = Array.from({ length: 29 }, (_, i) => {
    const d = i - 14;
    if (d < -11) return { day_offset: d, avg_retention: null };
    // 復習した日（-8, -3）に持ち直し、未来は下がっていく。
    const base = d <= -8 ? 92 - (d + 11) * 6 : d <= -3 ? 94 - (d + 8) * 4 : 90 - (d + 3) * 2.2;
    return { day_offset: d, avg_retention: Math.round(Math.max(20, Math.min(100, base))) };
  });
  return (
    <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">
      <MiniRetentionGraph series={series} />
    </div>
  );
}
