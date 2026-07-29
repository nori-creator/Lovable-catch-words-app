/**
 * 見た目ラボ(2026-07-29) — 設定のボタン1つで、全く違うアプリの見た目を比べる。
 * 開発者(admin)だけが開ける。
 *
 * ## 比較が成立する条件
 * **同じ中身を、同じマークアップで、CSSだけ変えて見せる**こと。
 * 中身が違うと「どちらの写真が良いか」を見てしまい、デザインの比較にならない。
 * だから下のサンプル語は全パック共通で固定する。
 *
 * ## 2つの見方
 * - 1枚ずつ送る: 左右の矢印/スワイプでパックを移動。全画面に近い大きさで見る。
 * - 現行と並べる: 左に現行、右に候補。つまみをドラッグして境目を動かす。
 *   「今より良くなったか」は並べないと判断できない。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeft, ChevronRight, Check, RotateCcw, Shuffle, X, Columns2, Square,
  Home, BookOpen, ScanLine, Sparkles, Settings,
} from "lucide-react";
import { UI_PACKS, getUiPack, setUiPack, packMeta, type PackId, type UiPackMeta } from "@/lib/ui-pack";

/**
 * 全パック共通のサンプル。中身を固定しないと見た目の比較にならない。
 * 説明は**短く**する — 3列グリッドで長い文字列は必ず「…」で切れ、
 * デザインの良し悪しではなく切れ方が目についてしまうため。
 */
const SAMPLE = [
  { word: "芒果", sub: "マンゴー", emoji: "🥭" },
  { word: "捷運", sub: "地下鉄", emoji: "🚇" },
  { word: "珍珠奶茶", sub: "タピオカ", emoji: "🧋" },
  { word: "夜市", sub: "夜市", emoji: "🏮" },
  { word: "腳踏車", sub: "自転車", emoji: "🚲" },
  { word: "鳳梨酥", sub: "パイナップルケーキ", emoji: "🍍" },
  { word: "便當", sub: "弁当", emoji: "🍱" },
  { word: "雨傘", sub: "傘", emoji: "☂️" },
  { word: "紅綠燈", sub: "信号", emoji: "🚦" },
];

/**
 * 下タブのアイコン。以前は四角い点を置いていたが、それが一番チープに
 * 見える箇所だった。線のアイコンにするだけで「作り込まれた製品」に寄る。
 * サイズと線幅は pack-styles.css 側で統一する。
 */
const NAV = [
  { label: "ホーム", Icon: Home },
  { label: "図鑑", Icon: BookOpen },
  { label: "スキャン", Icon: ScanLine },
  { label: "復習", Icon: Sparkles },
  { label: "設定", Icon: Settings },
];

/** 1つのパックで描いたミニアプリ。マークアップは全パックで完全に同じ。 */
function PackPreview({ meta }: { meta: UiPackMeta }) {
  const isOrigin = meta.id === "origin";
  return (
    <div
      className="pk-app h-full w-full"
      // origin は属性を付けない = パックのCSSが1つも当たらない。
      {...(isOrigin ? {} : { "data-ui-pack": meta.id })}
    >
      <div className="pk-header">
        <div className="min-w-0">
          <p className="pk-title">図鑑</p>
          <p className="pk-sub">128個の言葉</p>
        </div>
        <span className="pk-chip">台北</span>
      </div>

      {/* Photo Feed だけが使うストーリー風のリング列(他パックではCSSで非表示)。 */}
      <div className="pk-rings">
        {SAMPLE.slice(0, 4).map((s) => (
          <span key={s.word} className="pk-ring">
            <span>{s.emoji}</span>
          </span>
        ))}
      </div>

      {/* Streaming だけが使う巨大ヒーロー(他パックではCSSで非表示)。 */}
      <div className="pk-hero">
        <span className="pk-hero-word">夜市</span>
      </div>

      <div className="pk-body">
        <div className="pk-collection" data-layout={meta.layout}>
          {SAMPLE.map((s) => (
            <div key={s.word} className="pk-tile">
              <div className="pk-tile-media">
                <span className="pk-tile-emoji">{s.emoji}</span>
              </div>
              <div className="pk-tile-body">
                <div className="pk-tile-word">{s.word}</div>
                <div className="pk-tile-sub">{s.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-center px-4 py-3">
        <button className="pk-btn" type="button" tabIndex={-1}>
          スキャンする
        </button>
      </div>

      <div className="pk-nav">
        {NAV.map(({ label, Icon }, i) => (
          <span key={label} className="pk-nav-item" data-active={i === 1}>
            <Icon />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ThemeLab({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [applied, setApplied] = useState<PackId>("origin");
  const [split, setSplit] = useState(false);
  /** 分割表示の境目(%)。 */
  const [divider, setDivider] = useState(50);
  const splitRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const cur = getUiPack();
    setApplied(cur);
    const i = UI_PACKS.findIndex((p) => p.id === cur);
    if (i > 0) setIndex(i);
  }, []);

  const meta = UI_PACKS[index];

  const go = useCallback((delta: number) => {
    setIndex((i) => (i + delta + UI_PACKS.length) % UI_PACKS.length);
  }, []);

  // 左右キーでも送れるようにする(PCで見比べるとき速い)。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  // スワイプで送る。
  const touchX = useRef<number | null>(null);
  function onTouchStart(e: React.TouchEvent) {
    touchX.current = e.touches[0]?.clientX ?? null;
  }
  function onTouchEnd(e: React.TouchEvent) {
    const start = touchX.current;
    touchX.current = null;
    if (start == null) return;
    const dx = (e.changedTouches[0]?.clientX ?? start) - start;
    if (Math.abs(dx) > 48) go(dx < 0 ? 1 : -1);
  }

  // 分割の境目をドラッグ。
  function dragDivider(clientX: number) {
    const box = splitRef.current?.getBoundingClientRect();
    if (!box) return;
    const pct = ((clientX - box.left) / box.width) * 100;
    setDivider(Math.min(94, Math.max(6, pct)));
  }

  function apply(id: PackId) {
    setUiPack(id);
    setApplied(id);
  }

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-background">
      {/* 上部: 閉じる・パック名・表示切替 */}
      <div className="flex items-center gap-2 border-b border-border px-3 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))]">
        <button
          onClick={onClose}
          aria-label="閉じる"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full active:scale-95"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-sm font-semibold">{meta.name}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {index + 1} / {UI_PACKS.length}・{meta.reference}
          </p>
        </div>
        <button
          onClick={() => setSplit((v) => !v)}
          aria-pressed={split}
          aria-label={split ? "1枚で見る" : "現行と並べて見る"}
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-full active:scale-95 ${
            split ? "bg-primary text-primary-foreground" : ""
          }`}
        >
          {split ? <Square className="h-5 w-5" /> : <Columns2 className="h-5 w-5" />}
        </button>
      </div>

      {/* 本体: ミニアプリ */}
      <div className="min-h-0 flex-1 p-3" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="relative mx-auto h-full w-full max-w-sm overflow-hidden rounded-[2rem] border border-border shadow-xl">
          {split ? (
            <div ref={splitRef} className="relative h-full w-full">
              {/* 左: 現行 */}
              <div className="absolute inset-0">
                <PackPreview meta={UI_PACKS[0]} />
              </div>
              {/* 右: 候補。境目までを切り取って重ねる。 */}
              <div
                className="absolute inset-0"
                style={{ clipPath: `inset(0 0 0 ${divider}%)` }}
              >
                <PackPreview meta={meta} />
              </div>
              {/* つまみ */}
              <div
                role="slider"
                aria-label="比較の境目"
                aria-valuenow={Math.round(divider)}
                aria-valuemin={6}
                aria-valuemax={94}
                tabIndex={0}
                className="absolute inset-y-0 z-10 -ml-5 w-10 cursor-ew-resize touch-none"
                style={{ left: `${divider}%` }}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  if (e.currentTarget.hasPointerCapture(e.pointerId)) dragDivider(e.clientX);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowLeft") setDivider((d) => Math.max(6, d - 4));
                  if (e.key === "ArrowRight") setDivider((d) => Math.min(94, d + 4));
                }}
              >
                <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-white/90 shadow" />
                <span className="absolute left-1/2 top-1/2 grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-[10px] font-bold text-black shadow-lg">
                  ⇄
                </span>
              </div>
              <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white">
                現行
              </span>
              <span className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white">
                {meta.name}
              </span>
            </div>
          ) : (
            <PackPreview meta={meta} />
          )}
        </div>
      </div>

      {/* コンセプトの説明 */}
      <p className="px-5 pb-2 text-center text-[11px] leading-snug text-muted-foreground">
        {meta.concept}
      </p>

      {/* 下部: 送る・適用・現行に戻す */}
      <div className="flex items-center gap-2 border-t border-border px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">
        <button
          onClick={() => go(-1)}
          aria-label="前の見た目"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border active:scale-95"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          onClick={() => setIndex(Math.floor(Math.random() * UI_PACKS.length))}
          aria-label="ランダムに選ぶ"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border active:scale-95"
        >
          <Shuffle className="h-4 w-4" />
        </button>

        <button
          onClick={() => apply(meta.id)}
          disabled={applied === meta.id}
          className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-primary text-sm font-semibold text-primary-foreground active:scale-95 disabled:opacity-45"
        >
          <Check className="h-4 w-4" />
          {applied === meta.id ? "適用中" : "これにする"}
        </button>

        {/* 現行に戻す導線は常に出す。迷子にならないための保険。 */}
        <button
          onClick={() => apply("origin")}
          disabled={applied === "origin"}
          aria-label="現行に戻す"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border active:scale-95 disabled:opacity-40"
        >
          <RotateCcw className="h-4 w-4" />
        </button>

        <button
          onClick={() => go(1)}
          aria-label="次の見た目"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border active:scale-95"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

/** 設定に置く導線。ボタン1つで全画面の比較を開く。 */
export function ThemeLabButton() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<PackId>("origin");

  useEffect(() => {
    if (!open) setCurrent(getUiPack());
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left active:scale-[0.99]"
      >
        <span className="flex shrink-0 overflow-hidden rounded-lg ring-1 ring-black/10">
          {packMeta(current).swatch.map((c) => (
            <span key={c} className="block h-9 w-4" style={{ background: c }} />
          ))}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">見た目を比べる</span>
          <span className="block text-[11px] leading-snug text-muted-foreground">
            全く違うコンセプトの{UI_PACKS.length}種を1タップで切り替え。いまは「{packMeta(current).name}」
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
      {open && <ThemeLab onClose={() => setOpen(false)} />}
    </>
  );
}
