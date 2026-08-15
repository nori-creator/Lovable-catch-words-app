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
import { DexShelfOptions } from "@/components/DexShelfOptions";
import { ForgettingCurveChart } from "@/components/ForgettingCurveChart";
import { LoadFailed } from "@/components/LoadFailed";
import { PronunciationPanel } from "@/components/PronunciationPanel";
import { ScanDetailSheet } from "@/components/ScanDetailSheet";
import type { ShelfDensity, ShelfMaterial } from "@/lib/shelf-prefs";

/** 取得に失敗したときの面。全ルートが共有する。 */
export function LoadFailedScene({ q }: { q: URLSearchParams }) {
  return (
    <div className="space-y-4">
      <LoadFailed onRetry={() => {}} retrying={q.get("variant") === "retrying"} />
    </div>
  );
}

/** 棚の見え方を選ぶシート(素材6種 × 並べ方4種)。 */
export function ShelfOptionsScene({ q }: { q: URLSearchParams }) {
  const [material, setMaterial] = useState<ShelfMaterial>(
    (q.get("material") ?? "oak") as ShelfMaterial,
  );
  const [density, setDensity] = useState<ShelfDensity>(
    (q.get("density") ?? "three") as ShelfDensity,
  );
  return (
    <DexShelfOptions
      material={material}
      density={density}
      onMaterial={setMaterial}
      onDensity={setDensity}
      onClose={() => {}}
    />
  );
}

/** 語のかたまり(品詞で色分けした帯)と、その凡例。 */
export function ChunksScene() {
  const parts = [
    { text: "我", pos: "pron" },
    { text: "想", pos: "verb" },
    { text: "喝", pos: "verb" },
    { text: "一杯", pos: "num" },
    { text: "珍珠奶茶", pos: "noun" },
  ];
  return (
    <div className="space-y-6">
      {(["lg", "md", "sm"] as const).map((size) => (
        <div key={size}>
          <p className="mb-2 text-xs text-muted-foreground">size={size}</p>
          <ChunkPills parts={parts} size={size} />
        </div>
      ))}
      <ChunkLegend />
    </div>
  );
}

/** 忘却曲線。復習の「なぜ今日なのか」を説明する唯一の絵。 */
export function CurveScene() {
  const day = 24 * 60 * 60 * 1000;
  const now = Date.now();
  return (
    <ForgettingCurveChart
      history={[
        { reviewed_at: new Date(now - 21 * day).toISOString(), score: 4 },
        { reviewed_at: new Date(now - 12 * day).toISOString(), score: 3 },
        { reviewed_at: new Date(now - 4 * day).toISOString(), score: 5 },
      ]}
      currentEase={2.3}
      currentIntervalDays={6}
      lastReviewedAt={new Date(now - 4 * day).toISOString()}
    />
  );
}

/** 発音を聴く・録る面。 */
export function PronunciationScene() {
  return <PronunciationPanel headword="珍珠奶茶" pinyin="zhēn zhū nǎi chá" zhuyin="ㄓㄣ ㄓㄨ ㄋㄞˇ ㄔㄚˊ" />;
}

/**
 * スキャンで見つけた語の詳細。出所が「検証済み」か「AI生成」かで
 * 下の但し書きが変わる。1タップ前のシートと食い違っていた場所。
 */
export function ScanDetailScene({ q }: { q: URLSearchParams }) {
  const verified = q.get("variant") === "verified";
  return (
    <ScanDetailSheet
      headword="珍珠奶茶"
      item={{
        headword: "珍珠奶茶",
        zhuyin: "ㄓㄣ ㄓㄨ ㄋㄞˇ ㄔㄚˊ",
        pinyin: "zhēn zhū nǎi chá",
        meaning_ja: "タピオカミルクティー",
        confidence: 0.92,
      }}
      dict={
        verified
          ? {
              headword: "珍珠奶茶",
              zhuyin: "ㄓㄣ ㄓㄨ ㄋㄞˇ ㄔㄚˊ",
              pinyin: "zhēn zhū nǎi chá",
              meaning_ja: "タピオカミルクティー",
              pos: "名詞",
              source: "verified",
            }
          : undefined
      }
      cardPromise={
        new Promise(() => {
          /* 生成中のまま。**待っている面も検査の対象**。 */
        })
      }
      onClose={() => {}}
    />
  );
}
