/**
 * 棚以外の場面。**どれも本物のコンポーネントを描く。**
 *
 * ここに手書きの HTML を置いてはいけない。棚の検査で一度それをやって、
 * 「コンポーネントを直しても画像が変わらない」検査になった
 * (独立監査の指摘)。だから、実物の markup がコンポーネントの中に
 * 無いもの(ルートに直書きされている画面)は**ここに入れない** —
 * 入れずに「未検査」と記録する。嘘の合格を作らないため。
 */
import { useState } from "react";
import { ChunkLegend, ChunkPills } from "@/components/ChunkPills";
import { ForgettingCurveChart } from "@/components/ForgettingCurveChart";
import { LoadFailed } from "@/components/LoadFailed";
import { PronunciationPanel } from "@/components/PronunciationPanel";
import { ScanDetailSheet } from "@/components/ScanDetailSheet";
import { DexEmptyState, DexNoMatch } from "@/routes/_authenticated/dex";
import { StickerPhotoHistory } from "@/components/StickerPhotoHistory";
import { FULL } from "./word-card";
import type { GeneratedCard } from "@/lib/ai.functions";

/**
 * 色の組み合わせそのものを並べた見本。
 *
 * ## これが証明すること・しないこと
 * **証明する**: `--primary` のような1つのトークンが、塗りとしても文字としても
 * 使われる以上、**両方の役目で下限を満たしていること**。ここを見ていなかった
 * せいで、白文字を読めるようにするために青を暗くして、今度は青い文字を
 * 沈ませた(6.15:1 → 4.16:1)。片方だけ直すと必ずもう片方が壊れる。
 *
 * **証明しない**: 画面がそのトークンを正しく使っていること。それは画面を
 * 描いて見るしかない。ここは土台の検査であって、画面の検査の代わりではない。
 */
export function TokensScene() {
  const pairs = [
    ["bg-primary text-primary-foreground", "塗りの上の文字"],
    ["bg-secondary text-secondary-foreground", "副の面の文字"],
    ["bg-card text-card-foreground", "カードの文字"],
    ["bg-destructive text-destructive-foreground", "取り消しの文字"],
    ["bg-accent text-accent-foreground", "強調の面の文字"],
  ];
  const tints = [
    ["text-primary-ink", "地の上の主色の文字"],
    ["text-muted-foreground", "地の上の副次の文字"],
    ["text-destructive-ink", "地の上の警告の文字"],
  ];
  return (
    <div className="space-y-3">
      {pairs.map(([cls, label]) => (
        <div key={cls} className={`rounded-xl px-3 py-2 text-body ${cls}`}>
          {label}
        </div>
      ))}
      {tints.map(([cls, label]) => (
        <p key={cls} className={`text-body ${cls}`}>
          {label}
        </p>
      ))}
      {/* 主色を薄く敷いた上の主色の文字。印(chip)でよく使う組み合わせ。 */}
      <p className="rounded-xl bg-primary/10 px-3 py-2 text-body text-primary-ink">
        薄い主色の上の主色
      </p>
    </div>
  );
}

/** 取得に失敗したときの面。全ルートが共有する。 */
export function LoadFailedScene({ q }: { q: URLSearchParams }) {
  const variant = q.get("variant");
  return (
    <div className="space-y-4">
      <LoadFailed
        onRetry={() => {}}
        retrying={variant === "retrying"}
        // **何を**読み込めなかったかを名指しできる。渡さない面も撮る
        // (渡していない呼び出し元がまだ残っていないかは一覧で見る)。
        what={variant === "named" ? "今日の復習" : undefined}
      />
    </div>
  );
}

/**
 * 図鑑が空のときの面と、検索が空振りしたときの面。
 *
 * **今まで一度も撮っていなかった。** 「空の図鑑」として撮っていたのは
 * `DexShelf` に0件を渡した絵で、これは実物では起こらない
 * (ルートが `captured.length === 0` で手前に分岐する)。
 * 起こらない面を撮って合格していたので、始めたばかりの人が実際に見る
 * 面は機械の目に映っていなかった。
 */
export function DexEmptyScene() {
  return <DexEmptyState />;
}

export function DexNoMatchScene() {
  return <DexNoMatch search="芒果" onClear={() => {}} />;
}

/**
 * 同じものに何度も出会った記録。**再会があったときだけ**出る区画なので、
 * 3枚(はじめて + 再会2回)の状態を撮る。1枚しか無いときは何も描かない
 * ことも、別の場面で見る。
 */
export function PhotoHistoryScene({ q }: { q: URLSearchParams }) {
  const one = q.get("one") === "1";
  const shot = (c: string) =>
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" fill="${c}"/></svg>`,
    );
  const photos = [
    { url: shot("#d0483c"), taken_at: "2026-05-02T09:00:00Z", place: "台北駅", first: true },
    { url: shot("#4a90d9"), taken_at: "2026-06-14T12:00:00Z", place: null, first: false },
    { url: shot("#f5a623"), taken_at: "2026-08-01T18:00:00Z", place: "士林夜市", first: false },
  ];
  return <StickerPhotoHistory photos={one ? photos.slice(0, 1) : photos} dateLocale="ja-JP" />;
}

/** 語のかたまり(品詞で色分けした帯)と、その凡例。 */
export function ChunksScene() {
  // `chunkStyle` の分類記号をそのまま使う(S/V/O/N/M/C/P)。品詞名で書くと
  // どれかの色に畳まれて、出ない組み合わせが残る。
  // 塗るのは動詞と目的語だけになったので、素の面(S/M/C/P)も必ず1つは出す。
  // **詞類表の10群を全部出す。** 1つでも欠けると、その色は一度も
  // 撮られない(色は測るまで信用しない)。古い役割記号(S/O)も混ぜて、
  // production に既に入っているデータが名詞の色に落ちることも見る。
  const parts = [
    { text: "我", pos: "S" },
    { text: "已經", pos: "Adv" },
    { text: "想", pos: "Vaux" },
    { text: "喝", pos: "V" },
    { text: "這", pos: "Det" },
    { text: "一杯", pos: "M" },
    { text: "很", pos: "Adv" },
    { text: "好喝", pos: "Vs" },
    { text: "的", pos: "Ptc" },
    { text: "珍珠奶茶", pos: "O" },
    { text: "在夜市", pos: "Prep" },
    { text: "而且", pos: "Conj" },
    { text: "價錢", pos: "N" },
  ];
  return (
    <div className="space-y-6">
      {(["lg", "md", "sm"] as const).map((size) => (
        <div key={size}>
          <p className="mb-2 text-footnote text-muted-foreground">size={size}</p>
          <ChunkPills parts={parts} size={size} />
        </div>
      ))}
      <ChunkLegend parts={parts} />
    </div>
  );
}

/** 忘却曲線。復習の「なぜ今日なのか」を説明する唯一の絵。 */
export function CurveScene() {
  const day = 24 * 60 * 60 * 1000;
  const now = Date.now();
  return (
    <ForgettingCurveChart
      // `interval_days_after` / `ease_after` は**曲線の形そのもの**。
      // 型に在るのに渡していなかったので、安定度が NaN になり、線が
      // 1本も描かれない図を検査していた(ハーネスを型検査の外に置いて
      // いたので誰も気づけなかった。tsconfig に入れて初めて出た)。
      history={[
        {
          reviewed_at: new Date(now - 21 * day).toISOString(),
          score: 4,
          interval_days_after: 3,
          ease_after: 2.5,
        },
        {
          reviewed_at: new Date(now - 12 * day).toISOString(),
          score: 3,
          interval_days_after: 6,
          ease_after: 2.3,
        },
        {
          reviewed_at: new Date(now - 4 * day).toISOString(),
          score: 5,
          interval_days_after: 12,
          ease_after: 2.4,
        },
      ]}
      currentEase={2.3}
      currentIntervalDays={6}
      lastReviewedAt={new Date(now - 4 * day).toISOString()}
    />
  );
}

/** 発音を聴く・録る面。 */
export function PronunciationScene() {
  return (
    <PronunciationPanel
      headword="珍珠奶茶"
      pinyin="zhēn zhū nǎi chá"
      zhuyin="ㄓㄣ ㄓㄨ ㄋㄞˇ ㄔㄚˊ"
    />
  );
}

/**
 * スキャンで見つけた語の詳細。出所が「検証済み」か「AI生成」かで
 * 下の但し書きが変わる。1タップ前のシートと食い違っていた場所。
 */
/**
 * 生成が**終わった**カード。`Promise` は毎回作らず一度だけ作る —
 * 描き直すたびに新しい `Promise` を渡すと、中の `useEffect` が回り続けて
 * 撮る面が安定しない。
 */
const READY: Promise<GeneratedCard> = Promise.resolve({
  headword_zh: "珍珠奶茶",
  reading_zhuyin: FULL.reading_zhuyin,
  pinyin: FULL.pinyin,
  meaning_ja: FULL.meaning_ja,
  part_of_speech: FULL.part_of_speech,
  level: FULL.level,
  category_key: "drink",
  example_sentence: FULL.example_sentence,
  example_translation: FULL.example_translation,
  new_shelf: null,
  extras: FULL.extras,
} as GeneratedCard);

/** ずっと生成中のまま。**待っている面も検査の対象。** */
const PENDING: Promise<GeneratedCard> = new Promise(() => {});

/** 生成に失敗した面。**押しても何も起きない**のと区別が付くかを見る。 */
const FAILED: Promise<GeneratedCard> = Promise.reject(new Error("AIの生成に失敗しました"));
// 誰も受け取らないと node/ブラウザが「未処理の拒否」として騒ぐ。
// シートの中で必ず受け取るが、渡る前に一度なだめておく。
FAILED.catch(() => {});

export function ScanDetailScene({ q }: { q: URLSearchParams }) {
  const variant = q.get("variant");
  const verified = variant === "verified";
  return (
    <ScanDetailSheet
      headword="珍珠奶茶"
      item={{
        id: "d1",
        kind: "object",
        headword: "珍珠奶茶",
        zhuyin: "ㄓㄣ ㄓㄨ ㄋㄞˇ ㄔㄚˊ",
        pinyin: "zhēn zhū nǎi chá",
        meaning_ja: "タピオカミルクティー",
        pos: "名詞",
        point: [0.5, 0.5],
        confidence: 0.92,
        alternatives: ["奶茶", "飲料"],
      }}
      dict={
        verified
          ? {
              headword: "珍珠奶茶",
              zhuyin: "ㄓㄣ ㄓㄨ ㄋㄞˇ ㄔㄚˊ",
              pinyin: "zhēn zhū nǎi chá",
              meaning_ja: "タピオカミルクティー",
              pos: "名詞",
              tocfl_level: 2,
              audio_path: null,
              audio_url: null,
              source: "verified",
              entry_type: "word",
            }
          : undefined
      }
      // 生成中・出来上がり・失敗の3面。**今まで生成中しか撮っていなかった**
      // ので、このシートの中身(解説そのもの)は一度も機械の目に映って
      // いなかった。待っている骨組みだけを見て「合格」と言っていた。
      cardPromise={variant === "ready" ? READY : variant === "failed" ? FAILED : PENDING}
      onClose={() => {}}
    />
  );
}
