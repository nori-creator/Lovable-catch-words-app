/**
 * **スキャンの候補の選び方と「図鑑に追加」ボタンの案**（試作・本番は未変更）。
 *
 * > オーナー指示 2026-09-27「スキャンの候補をスクロールして選びたい。この候補を
 * > スクロールする、単語を図鑑に追加するボタン、UIUXがダサいから、案を複数案出して。」
 *
 * 今の形（1行の箱 ＋「1/5」の数 ＋ 丸い「＋追加」）を置き換える4案:
 *   A 横に流す … カメラのモード帯のように左右に払う。真ん中に来た語が選ばれ、
 *               下の幅いっぱいのボタンに**その語の名前が入る**（何を足すか迷わない）。
 *   B 縦のドラム … iPhone のタイマーのように回す。真ん中の帯が選択で、
 *               **帯の右端がそのまま追加ボタン**。
 *   C カード … 1語1枚を横に送る（次のカードが少し覗く）。カードの中に意味と追加ボタン。
 *   D まとめて選ぶ … 行に丸いチェック。何語でも選んで「3語を図鑑に追加」で一度に。
 *
 * どの案も、選んだ語の**写真の上の光の点が大きく揺れる**（今と同じ `ScanDots`）。
 * 点を押すと、候補の側もその語へ送られる。
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { BookOpen, Camera, Check, Home, Plus, RotateCcw, Settings, Sparkles } from "lucide-react";
import { TabBar } from "@/components/TabBar";
import { ScanDots } from "@/routes/_authenticated/scan";
import { clampToVisible, coverPoint } from "@/lib/scan-layout";

const TABS = [
  { label: "ホーム", icon: Home },
  { label: "図鑑", icon: BookOpen },
  { label: "カメラ", icon: Camera, lens: true },
  { label: "復習", icon: Sparkles },
  { label: "設定", icon: Settings },
];

const PHOTO =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280">
      <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#5b4632"/><stop offset="1" stop-color="#2b2118"/></linearGradient></defs>
      <rect width="720" height="1280" fill="url(#g)"/>
      <rect x="120" y="300" width="200" height="330" rx="30" fill="#d9b58c"/>
      <rect x="140" y="250" width="160" height="60" rx="14" fill="#f3e3cc"/>
      <rect x="205" y="120" width="14" height="190" fill="#e0564c"/>
      <circle cx="170" cy="560" r="16" fill="#3a2716"/><circle cx="215" cy="585" r="16" fill="#3a2716"/>
      <rect x="420" y="520" width="200" height="260" rx="20" fill="#9fb8c8"/>
      <rect x="80" y="880" width="560" height="170" rx="18" fill="#f5efe4"/>
      <text x="360" y="990" font-size="84" text-anchor="middle" fill="#8a2a1f" font-family="sans-serif">半糖 少冰</text>
    </svg>`,
  );

type Item = {
  id: string;
  kind: "object" | "text";
  headword: string;
  zhuyin: string;
  pinyin: string;
  meaning_ja: string;
  pos: string;
  point: [number, number];
  confidence: number;
  alternatives: string[];
};
const mk = (
  id: string,
  headword: string,
  zhuyin: string,
  meaning: string,
  point: [number, number],
  kind: "object" | "text" = "object",
): Item => ({
  id,
  kind,
  headword,
  zhuyin,
  pinyin: "",
  meaning_ja: meaning,
  pos: "N",
  point,
  confidence: 0.9,
  alternatives: [],
});
const FOUND: Item[] = [
  mk("d1", "珍珠奶茶", "ㄓㄣ ㄓㄨ ㄋㄞˇ ㄔㄚˊ", "タピオカミルクティー", [305, 350]),
  mk("d2", "吸管", "ㄒㄧ ㄍㄨㄢˇ", "ストロー", [295, 140]),
  mk("d3", "杯子", "ㄅㄟ ㄗ˙", "コップ", [720, 505]),
  mk("d4", "半糖", "ㄅㄢˋ ㄊㄤˊ", "甘さ半分", [380, 770], "text"),
  mk("d5", "少冰", "ㄕㄠˇ ㄅㄧㄥ", "氷少なめ", [620, 770], "text"),
  mk("d6", "珍珠", "ㄓㄣ ㄓㄨ", "タピオカ", [270, 450]),
];

type Status = "new" | "owned" | "reunion";
type Design = "a" | "b" | "c" | "d";
const DESIGNS: Array<{ key: Design; label: string }> = [
  { key: "a", label: "A 横に流す" },
  { key: "b", label: "B 縦のドラム" },
  { key: "c", label: "C カード" },
  { key: "d", label: "D まとめて選ぶ" },
];

const reduce = () => document.documentElement.dataset.motion === "reduce";

/** 出会い方の小さな印（色だけに頼らず、字でも言う）。 */
function StatusTag({ st, dark = false }: { st: Status; dark?: boolean }) {
  if (st === "owned")
    return (
      <span
        className={`inline-flex shrink-0 items-center gap-0.5 text-caption font-semibold ${dark ? "text-white/70" : "text-muted-foreground"}`}
      >
        <Check className="h-3.5 w-3.5" aria-hidden />
        図鑑にある
      </span>
    );
  if (st === "reunion")
    return (
      <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-caption font-semibold text-amber-900">
        再会
      </span>
    );
  return (
    <span className="shrink-0 rounded-full bg-sky-100 px-1.5 py-0.5 text-caption font-semibold text-sky-900">
      はじめて
    </span>
  );
}

// ---- A: 横に流す ---------------------------------------------------------------
function DesignA({ items, status, activeId, onFocus, onAdd, onAgain }: PickProps) {
  const sc = useRef<HTMLDivElement>(null);
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const raf = useRef(0);
  const quietUntil = useRef(0);
  const active = items.find((i) => i.id === activeId) ?? items[0];

  // 真ん中からの距離で、字の大きさと濃さを変える（カメラのモード帯と同じ見え方）。
  const paint = useCallback(() => {
    const el = sc.current;
    if (!el) return;
    const mid = el.scrollLeft + el.clientWidth / 2;
    let best: { id: string; d: number } | null = null;
    for (const it of items) {
      const b = refs.current.get(it.id);
      if (!b) continue;
      const c = b.offsetLeft + b.offsetWidth / 2;
      const d = Math.abs(c - mid);
      const k = Math.min(1, d / 140);
      b.style.transform = `scale(${1.18 - 0.3 * k})`;
      b.style.opacity = String(1 - 0.55 * k);
      if (!best || d < best.d) best = { id: it.id, d };
    }
    if (best && best.id !== activeId && performance.now() > quietUntil.current) onFocus(best.id);
  }, [items, activeId, onFocus]);

  useLayoutEffect(() => {
    paint();
  }, [paint]);

  // 点を押して選ばれたら、帯もその語を真ん中へ。
  useEffect(() => {
    const el = sc.current;
    const b = activeId ? refs.current.get(activeId) : null;
    if (!el || !b) return;
    const target = b.offsetLeft + b.offsetWidth / 2 - el.clientWidth / 2;
    if (Math.abs(el.scrollLeft - target) < 2) return;
    quietUntil.current = performance.now() + 500;
    el.scrollTo({ left: target, behavior: reduce() ? "auto" : "smooth" });
  }, [activeId]);

  return (
    <div className="rounded-[28px] p-2 shadow-lg material-thick">
      <div className="relative">
        {/* 真ん中の印（選ばれている所）。 */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1 h-1 w-1 -translate-x-1/2 rounded-full bg-primary"
        />
        <div
          ref={sc}
          role="listbox"
          aria-label="見つかった語"
          onScroll={() => {
            cancelAnimationFrame(raf.current);
            raf.current = requestAnimationFrame(paint);
          }}
          className="flex snap-x snap-mandatory items-center gap-1 overflow-x-auto py-2"
          style={{ scrollbarWidth: "none", paddingInline: "50%" }}
        >
          {items.map((it) => (
            <button
              key={it.id}
              ref={(el) => {
                if (el) refs.current.set(it.id, el);
                else refs.current.delete(it.id);
              }}
              role="option"
              aria-selected={it.id === activeId}
              onClick={() => onFocus(it.id)}
              lang="zh-Hant"
              className={`min-h-11 shrink-0 snap-center whitespace-nowrap rounded-full px-3 text-body font-bold transition-colors ${
                it.id === activeId ? "text-foreground" : "text-muted-foreground"
              }`}
              style={{ transition: "transform .12s, opacity .12s" }}
            >
              {it.headword}
            </button>
          ))}
        </div>
      </div>
      {active && (
        <div className="flex items-center justify-center gap-2 px-2 pb-2 text-footnote">
          <span className="shrink-0 whitespace-nowrap text-muted-foreground">{active.zhuyin}</span>
          <span className="min-w-0 truncate">{active.meaning_ja}</span>
          <StatusTag st={status(active.id)} />
        </div>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => active && onAdd([active.id])}
          disabled={!active || status(active.id) === "owned"}
          className="press-in flex h-12 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full bg-primary px-4 text-callout font-bold text-primary-foreground shadow-md shadow-primary/30 disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
        >
          {active && status(active.id) === "owned" ? (
            <>
              <Check className="h-5 w-5" aria-hidden />
              図鑑にあります
            </>
          ) : (
            <>
              <Plus className="h-5 w-5" aria-hidden />
              <span lang="zh-Hant" className="truncate">
                {active?.headword}
              </span>
              <span className="shrink-0">を図鑑に追加</span>
            </>
          )}
        </button>
        <AgainButton onAgain={onAgain} />
      </div>
    </div>
  );
}

// ---- B: 縦のドラム -------------------------------------------------------------
const ROW = 46;
function DesignB({ items, status, activeId, onFocus, onAdd, onAgain }: PickProps) {
  const sc = useRef<HTMLDivElement>(null);
  const refs = useRef(new Map<string, HTMLDivElement>());
  const raf = useRef(0);
  const quietUntil = useRef(0);
  const idx = Math.max(
    0,
    items.findIndex((i) => i.id === activeId),
  );
  const active = items[idx];

  // 筒の面に貼ったように、真ん中から離れた行ほど奥へ倒す。
  const paint = useCallback(() => {
    const el = sc.current;
    if (!el) return;
    const pos = el.scrollTop / ROW;
    items.forEach((it, i) => {
      const r = refs.current.get(it.id);
      if (!r) return;
      const off = i - pos;
      const a = Math.max(-70, Math.min(70, off * 24));
      r.style.transform = `rotateX(${-a}deg)`;
      r.style.opacity = String(Math.max(0.15, 1 - Math.abs(off) * 0.42));
    });
    const i = Math.round(pos);
    if (items[i] && items[i].id !== activeId && performance.now() > quietUntil.current)
      onFocus(items[i].id);
  }, [items, activeId, onFocus]);
  useLayoutEffect(() => paint(), [paint]);
  useEffect(() => {
    const el = sc.current;
    if (!el) return;
    const target = idx * ROW;
    if (Math.abs(el.scrollTop - target) < 2) return;
    quietUntil.current = performance.now() + 500;
    el.scrollTo({ top: target, behavior: reduce() ? "auto" : "smooth" });
  }, [idx]);

  return (
    <div className="flex items-end gap-2">
      <div className="relative min-w-0 flex-1 overflow-hidden rounded-[26px] shadow-lg material-thick">
        {/* 真ん中の帯（語の後ろに敷く）。 */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-1.5 rounded-2xl bg-card/80 ring-1 ring-primary/40"
          style={{ top: ROW, height: ROW }}
        />
        {/* 帯の右端がそのまま追加ボタン（語より上に置く）。 */}
        <div
          className="pointer-events-none absolute right-1.5 z-20 flex items-center"
          style={{ top: ROW, height: ROW }}
        >
          <button
            type="button"
            onClick={() => active && onAdd([active.id])}
            disabled={!active || status(active.id) === "owned"}
            aria-label={active ? `${active.headword}を図鑑に追加` : "図鑑に追加"}
            className="press-in pointer-events-auto mr-1 flex h-9 items-center gap-1 rounded-full bg-primary px-3 text-footnote font-bold text-primary-foreground disabled:bg-transparent disabled:text-muted-foreground"
          >
            {active && status(active.id) === "owned" ? (
              <>
                <Check className="h-4 w-4" aria-hidden />
                図鑑にある
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" aria-hidden />
                追加
              </>
            )}
          </button>
        </div>
        <div
          ref={sc}
          role="listbox"
          aria-label="見つかった語"
          onScroll={() => {
            cancelAnimationFrame(raf.current);
            raf.current = requestAnimationFrame(paint);
          }}
          className="relative snap-y snap-mandatory overflow-y-auto overscroll-contain"
          style={{
            height: ROW * 3,
            paddingBlock: ROW,
            scrollbarWidth: "none",
            perspective: 420,
          }}
        >
          {items.map((it, i) => (
            <div
              key={it.id}
              ref={(el) => {
                if (el) refs.current.set(it.id, el);
                else refs.current.delete(it.id);
              }}
              role="option"
              aria-selected={it.id === activeId}
              onClick={() => onFocus(it.id)}
              className="flex snap-center items-center gap-2 pl-4 pr-24"
              style={{ height: ROW, transformOrigin: "50% 50% -60px" }}
            >
              <span lang="zh-Hant" className="shrink-0 text-body font-bold">
                {it.headword}
              </span>
              <span className="min-w-0 truncate text-footnote text-muted-foreground">
                {i === idx ? it.meaning_ja : it.zhuyin}
              </span>
            </div>
          ))}
        </div>
      </div>
      <AgainButton onAgain={onAgain} />
    </div>
  );
}

// ---- C: カード -----------------------------------------------------------------
function DesignC({ items, status, activeId, onFocus, onAdd, onAgain }: PickProps) {
  const sc = useRef<HTMLDivElement>(null);
  const raf = useRef(0);
  const quietUntil = useRef(0);
  const idx = Math.max(
    0,
    items.findIndex((i) => i.id === activeId),
  );
  const cardW = () => (sc.current?.firstElementChild as HTMLElement | null)?.offsetWidth ?? 280;
  useEffect(() => {
    const el = sc.current;
    if (!el) return;
    const target = idx * (cardW() + 10);
    if (Math.abs(el.scrollLeft - target) < 2) return;
    quietUntil.current = performance.now() + 500;
    el.scrollTo({ left: target, behavior: reduce() ? "auto" : "smooth" });
  }, [idx]);
  return (
    <div className="space-y-2">
      <div
        ref={sc}
        role="listbox"
        aria-label="見つかった語"
        onScroll={() => {
          cancelAnimationFrame(raf.current);
          raf.current = requestAnimationFrame(() => {
            const el = sc.current;
            if (!el || performance.now() < quietUntil.current) return;
            const i = Math.round(el.scrollLeft / (cardW() + 10));
            if (items[i] && items[i].id !== activeId) onFocus(items[i].id);
          });
        }}
        className="-mx-4 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-4"
        style={{ scrollbarWidth: "none", scrollPaddingInline: 16 }}
      >
        {items.map((it) => {
          const st = status(it.id);
          return (
            <div
              key={it.id}
              role="option"
              aria-selected={it.id === activeId}
              className={`w-[78%] shrink-0 snap-start rounded-[24px] p-3.5 shadow-lg material-thick transition-[box-shadow] ${
                it.id === activeId ? "ring-2 ring-primary" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p lang="zh-Hant" className="text-title font-bold leading-tight">
                    {it.headword}
                  </p>
                  <p className="mt-0.5 text-caption text-muted-foreground">{it.zhuyin}</p>
                </div>
                <StatusTag st={st} />
              </div>
              <p className="mt-1.5 truncate text-footnote">{it.meaning_ja}</p>
              <button
                type="button"
                onClick={() => onAdd([it.id])}
                disabled={st === "owned"}
                className="press-in mt-2.5 flex h-11 w-full items-center justify-center gap-1.5 rounded-full bg-primary text-callout font-bold text-primary-foreground disabled:bg-muted disabled:text-muted-foreground"
              >
                {st === "owned" ? (
                  <>
                    <Check className="h-5 w-5" aria-hidden />
                    図鑑にあります
                  </>
                ) : (
                  <>
                    <Plus className="h-5 w-5" aria-hidden />
                    図鑑に追加
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between">
        {/* 何枚目か（数字ではなく点で）。 */}
        <div className="flex gap-1.5 pl-1" aria-hidden>
          {items.map((it) => (
            <span
              key={it.id}
              className={`h-1.5 rounded-full transition-all ${it.id === activeId ? "w-4 bg-white" : "w-1.5 bg-white/45"}`}
            />
          ))}
        </div>
        <AgainButton onAgain={onAgain} />
      </div>
    </div>
  );
}

// ---- D: まとめて選ぶ ------------------------------------------------------------
function DesignD({ items, status, activeId, onFocus, onAdd, onAgain }: PickProps) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set([items[0]?.id].filter(Boolean)));
  const refs = useRef(new Map<string, HTMLButtonElement>());
  useEffect(() => {
    const b = activeId ? refs.current.get(activeId) : null;
    b?.scrollIntoView({ block: "nearest", behavior: reduce() ? "auto" : "smooth" });
  }, [activeId]);
  const addable = [...picked].filter((id) => status(id) !== "owned");
  return (
    <div className="rounded-[26px] p-1.5 shadow-lg material-thick">
      <div
        role="listbox"
        aria-multiselectable="true"
        aria-label="見つかった語"
        className="overflow-y-auto overscroll-contain"
        style={{ maxHeight: 48 * 3 + 4, scrollbarWidth: "none" }}
      >
        {items.map((it) => {
          const st = status(it.id);
          const on = picked.has(it.id);
          return (
            <button
              key={it.id}
              ref={(el) => {
                if (el) refs.current.set(it.id, el);
                else refs.current.delete(it.id);
              }}
              role="option"
              aria-selected={on}
              disabled={st === "owned"}
              onClick={() => {
                onFocus(it.id);
                setPicked((p) => {
                  const n = new Set(p);
                  if (n.has(it.id)) n.delete(it.id);
                  else n.add(it.id);
                  return n;
                });
              }}
              className={`press-in flex min-h-12 w-full items-center gap-2.5 rounded-2xl px-2.5 text-left ${
                it.id === activeId ? "bg-card/70" : ""
              }`}
            >
              <span
                aria-hidden
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 ${
                  st === "owned"
                    ? "border-transparent bg-muted text-muted-foreground"
                    : on
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground/40"
                }`}
              >
                {(on || st === "owned") && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
              </span>
              <span lang="zh-Hant" className="shrink-0 text-body font-bold">
                {it.headword}
              </span>
              <span className="min-w-0 flex-1 truncate text-footnote text-muted-foreground">
                {it.meaning_ja}
              </span>
              {st !== "new" && <StatusTag st={st} />}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2 p-1 pt-1.5">
        <button
          type="button"
          disabled={addable.length === 0}
          onClick={() => {
            onAdd(addable);
            setPicked(new Set());
          }}
          className="press-in flex h-12 flex-1 items-center justify-center gap-1.5 rounded-full bg-primary text-callout font-bold text-primary-foreground shadow-md shadow-primary/30 disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
        >
          <Plus className="h-5 w-5" aria-hidden />
          {addable.length > 0 ? `${addable.length}語を図鑑に追加` : "追加する語を選ぶ"}
        </button>
        <AgainButton onAgain={onAgain} />
      </div>
    </div>
  );
}

function AgainButton({ onAgain }: { onAgain: () => void }) {
  return (
    <button
      type="button"
      onClick={onAgain}
      aria-label="撮り直す"
      className="press-in grid h-12 w-12 shrink-0 place-items-center rounded-full shadow-lg material-thick"
    >
      <RotateCcw className="h-5 w-5" />
    </button>
  );
}

type PickProps = {
  items: Item[];
  status: (id: string) => Status;
  activeId: string | null;
  onFocus: (id: string) => void;
  onAdd: (ids: string[]) => void;
  onAgain: () => void;
};

// ---- 場面 -------------------------------------------------------------------
export function ScanPickDesignsScene({ q }: { q: URLSearchParams }) {
  const [design, setDesign] = useState<Design>(
    DESIGNS.find((d) => d.key === q.get("pick"))?.key ?? "a",
  );
  const [activeId, setActiveId] = useState<string | null>(FOUND[0].id);
  const [added, setAdded] = useState<Set<string>>(() => new Set(["d3"]));
  const [toast, setToast] = useState<string | null>(null);
  const [box, setBox] = useState({ w: 390, h: 844 });
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const [sheetTop, setSheetTop] = useState(844);
  useLayoutEffect(() => {
    const measure = () => {
      setBox({ w: window.innerWidth, h: window.innerHeight });
      setSheetTop(sheetRef.current?.getBoundingClientRect().top ?? window.innerHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (sheetRef.current) ro.observe(sheetRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [design]);

  const status = useCallback(
    (id: string): Status => (added.has(id) ? "owned" : id === "d4" ? "reunion" : "new"),
    [added],
  );
  const ctx = {
    owned: Object.fromEntries(
      FOUND.filter((f) => added.has(f.id)).map((f) => [f.headword, { has_photo: true }]),
    ),
    tappedSet: new Set<string>(),
  } as never;
  const dotStyle = useCallback(
    (it: { point: [number, number] }) =>
      clampToVisible(coverPoint(it.point, { w: 720, h: 1280 }, box), {
        w: box.w,
        bottom: sheetTop,
      }),
    [box, sheetTop],
  );
  const onAdd = (ids: string[]) => {
    if (!ids.length) return;
    setAdded((a) => new Set([...a, ...ids]));
    const words = FOUND.filter((f) => ids.includes(f.id)).map((f) => f.headword);
    setToast(`${words.join("・")} を図鑑に追加しました`);
    window.setTimeout(() => setToast(null), 1800);
  };
  const props: PickProps = {
    items: FOUND,
    status,
    activeId,
    onFocus: setActiveId,
    onAdd,
    onAgain: () => setAdded(new Set(["d3"])),
  };

  return (
    <div className="fixed inset-0 z-20 overflow-hidden bg-black">
      <img src={PHOTO} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <ScanDots
        items={FOUND as never}
        scanCtx={ctx}
        dotStyle={dotStyle as never}
        onOpen={(it) => setActiveId((it as { id: string }).id)}
        activeId={activeId}
        boxWidth={box.w}
      />
      {/* 案の切り替え（確認用。本番には出ない）。 */}
      <div
        role="radiogroup"
        aria-label="候補の選び方の案"
        className="fixed inset-x-0 top-2 z-40 flex justify-center gap-1 px-2"
      >
        {DESIGNS.map((d) => (
          <button
            key={d.key}
            type="button"
            role="radio"
            aria-checked={design === d.key}
            onClick={() => setDesign(d.key)}
            className={`min-h-11 rounded-full px-3 text-footnote font-semibold ${
              design === d.key ? "bg-white text-black" : "bg-black/45 text-white backdrop-blur"
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>
      {toast && (
        <div
          role="status"
          className="fixed inset-x-0 top-16 z-40 mx-auto w-fit rounded-full bg-black/70 px-4 py-2 text-footnote font-semibold text-white backdrop-blur"
        >
          {toast}
        </div>
      )}
      <div
        ref={sheetRef}
        className="fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 px-4"
      >
        {design === "a" && <DesignA key="a" {...props} />}
        {design === "b" && <DesignB key="b" {...props} />}
        {design === "c" && <DesignC key="c" {...props} />}
        {design === "d" && <DesignD key="d" {...props} />}
      </div>
      <TabBar cursor={2} indicatorOpacity={0} onCamera>
        {TABS.map(({ label, icon: Icon, lens }, i) => (
          <li key={label} className="flex-1">
            <button
              className="tabbar__cell group w-full rounded-full text-caption text-muted-foreground"
              data-tab={i}
            >
              <Icon className={`h-5 w-5 ${lens ? "text-primary" : ""}`} />
              <span>{label}</span>
            </button>
          </li>
        ))}
      </TabBar>
    </div>
  );
}
