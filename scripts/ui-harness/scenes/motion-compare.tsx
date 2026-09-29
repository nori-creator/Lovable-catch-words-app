import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { BookOpen, Camera, Check, Home, Plus, Settings, Sparkles } from "lucide-react";
import { createSpring, type Spring } from "@/lib/spring";

/**
 * **モーションデザインの比較: 今の形 / 案① 1つの形が変形する白黒 / 案② Liquid Glass**
 * （オーナー指示 2026-09-28 R13「モーションデザインについていいプロンプトを2つ見つけたから、
 * 今のものと3つを比較したい…決して今の機能やユーザーにストレスや違和感を与えることはしないで
 * デザインを変えて」）。
 *
 * **機能・並び・押す場所は3つとも同じ**。変えたのは見た目と動きの「質」だけ:
 *
 *  A 今の形 — アプリの青・白いカード・Apple のばね（いまの本番）。
 *  B 案①（Dribbble 級の UI モーション）— 暖かい灰色の地・白と黒だけ・**1つの形が切れずに
 *    大きさと角の丸みと色を変えて次の状態になる**。中身は短いぼかしで入れ替わる。
 *    行き過ぎはごく僅か。光・グラデーション・粒は使わない。
 *  C 案②（Apple Liquid Glass, iOS 26）— 色の広い壁紙の上に**レンズのようなガラス**。
 *    縁ほど強く曲がる写り込み・左上から光る 1px の縁・柔らかい接地の影。押すと
 *    ガラスが**持ち上がって膨らむ（縮まない）**。色は青を「オン・選択中」だけに。
 *
 * 触れる所: 「図鑑に追加」→ 読み込み → チェック（1つの形のまま変形）／下のタブ（印が
 * 伸びて追いつく）／スイッチ（つまみが伸びる）／通知の帯。
 *
 * ばねは3案とも Apple の値（形の変形 response 0.45 / damping 0.86、押し 0.25 / 0.72）。
 * 動きを減らす設定では、変形は短いフェードになる（B と C の約束どおり）。
 */
type Look = "a" | "b" | "c";

const LOOKS: Array<{ key: Look; label: string; note: string }> = [
  { key: "a", label: "A 今の形", note: "いまの本番。青・白・Apple のばね" },
  { key: "b", label: "B 案① 白黒の変形", note: "1つの形が切れずに変わる。暖かい灰色の地" },
  { key: "c", label: "C 案② Liquid Glass", note: "色の壁紙の上のレンズのようなガラス" },
];

const MORPH = { response: 0.45, damping: 0.86 };
const PRESS = { response: 0.25, damping: 0.72 };

/** 1つの値をばねで動かし、描画のたびに読む。 */
function useSpringValue(target: number, opts = MORPH) {
  const [v, setV] = useState(target);
  const sp = useRef<Spring | null>(null);
  useEffect(() => {
    sp.current = createSpring(target, setV, opts);
    return () => sp.current?.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    sp.current?.to(target, opts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  return v;
}

export function MotionCompareScene({ q }: { q: URLSearchParams }) {
  const [look, setLook] = useState<Look>(
    (["a", "b", "c"] as Look[]).find((k) => k === q.get("look")) ?? "a",
  );
  return (
    <div className="fixed inset-0 flex flex-col" style={canvasStyle(look)}>
      <div className="flex gap-1.5 px-3 pb-2 pt-[72px]" role="radiogroup" aria-label="案">
        {LOOKS.map((l) => (
          <button
            key={l.key}
            type="button"
            role="radio"
            aria-checked={look === l.key}
            onClick={() => setLook(l.key)}
            className="min-h-11 flex-1 rounded-full px-2 text-caption font-semibold"
            style={{
              background: look === l.key ? "#1d1d1f" : "rgba(255,255,255,0.75)",
              color: look === l.key ? "#fff" : "#1d1d1f",
            }}
          >
            {l.label}
          </button>
        ))}
      </div>
      <p
        className="px-4 text-center text-caption"
        style={{ color: look === "c" ? "#fff" : "#6e6e73" }}
      >
        {LOOKS.find((l) => l.key === look)!.note}
      </p>
      <div key={look} className="flex flex-1 flex-col items-center justify-center gap-8 px-5">
        <MorphButton look={look} />
        <FocusToggle look={look} />
        <ToastDemo look={look} />
      </div>
      <TabDemo look={look} />
    </div>
  );
}

function canvasStyle(look: Look): CSSProperties {
  if (look === "b")
    return { background: "#ebe8e3", fontFamily: "Geist, Inter, system-ui, sans-serif" };
  if (look === "c")
    return {
      background:
        "radial-gradient(60% 50% at 20% 20%, #7b5cff 0%, transparent 70%), radial-gradient(55% 45% at 85% 30%, #2bb3b1 0%, transparent 70%), radial-gradient(60% 50% at 70% 85%, #ffb38a 0%, transparent 70%), #1b3a8c",
    };
  return { background: "var(--background)" };
}

/** 面の見た目（案ごと）。 */
function surface(look: Look, opts: { on?: boolean; radius: number }): CSSProperties {
  if (look === "b")
    return {
      background: opts.on ? "#111" : "#fff",
      color: opts.on ? "#fff" : "#111",
      borderRadius: opts.radius,
      boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
    };
  if (look === "c")
    return {
      background: opts.on ? "rgba(10,132,255,0.55)" : "rgba(255,255,255,0.14)",
      color: "#fff",
      borderRadius: opts.radius,
      backdropFilter: "blur(14px) saturate(180%)",
      WebkitBackdropFilter: "blur(14px) saturate(180%)",
      boxShadow:
        "inset 1px 1px 0 rgba(255,255,255,0.55), inset -1px -1px 0 rgba(255,255,255,0.18), 0 10px 30px rgba(0,0,0,0.12)",
    };
  return {
    background: opts.on ? "var(--primary)" : "var(--card)",
    color: opts.on ? "var(--primary-foreground)" : "var(--foreground)",
    borderRadius: opts.radius,
    boxShadow: "0 6px 16px -8px rgba(0,0,0,0.3)",
  };
}

// ---- 「図鑑に追加」→ 読み込み → チェック（1つの形のまま） -----------------------------

function MorphButton({ look }: { look: Look }) {
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [pressed, setPressed] = useState(false);
  useEffect(() => {
    if (state === "loading") {
      const id = window.setTimeout(() => setState("done"), 1400);
      return () => window.clearTimeout(id);
    }
    if (state === "done") {
      const id = window.setTimeout(() => setState("idle"), 1600);
      return () => window.clearTimeout(id);
    }
  }, [state]);
  const w = useSpringValue(state === "idle" ? 220 : 56);
  const r = useSpringValue(state === "idle" ? (look === "b" ? 14 : 28) : 28);
  // A は押すと縮む（いまの本番）。C は押すと膨らむ（Liquid Glass の約束）。B は変えない。
  const s = useSpringValue(pressed ? (look === "c" ? 1.08 : look === "a" ? 0.96 : 1) : 1, PRESS);
  // 中身の入れ替え: 出ていく物は 120ms でぼけて消え、入る物は 60ms 遅れて入る。
  const content =
    state === "idle" ? (
      <span className="flex items-center gap-2 font-semibold">
        <Plus className="h-5 w-5" /> 図鑑に追加
      </span>
    ) : state === "loading" ? (
      <span
        className="block h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent"
        aria-label="追加中"
      />
    ) : (
      <Check className="h-6 w-6" aria-label="追加しました" />
    );
  return (
    <button
      type="button"
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onClick={() => state === "idle" && setState("loading")}
      className="grid h-14 place-items-center overflow-hidden"
      style={{
        width: w,
        transform: `scale(${s})`,
        ...surface(look, { on: look === "a" || state === "done", radius: r }),
        ...(look === "b" && state !== "idle" ? { background: "#111", color: "#fff" } : null),
      }}
    >
      <SwapBlur k={state}>{content}</SwapBlur>
    </button>
  );
}

/** 中身をぼかして入れ替える（出る 120ms・入る 60ms 遅れ。重ならない）。 */
function SwapBlur({ k, children }: { k: string; children: ReactNode }) {
  // 最新の中身は ref に持つ（描画のたびに入れ替えの時計をやり直さない）。
  const latest = useRef(children);
  latest.current = children;
  const [shownKey, setShownKey] = useState(k);
  const [phase, setPhase] = useState<"in" | "out">("in");
  useEffect(() => {
    if (k === shownKey) return;
    setPhase("out");
    const id = window.setTimeout(() => {
      setShownKey(k);
      setPhase("in");
    }, 130);
    return () => window.clearTimeout(id);
  }, [k, shownKey]);
  const node = shownKey === k ? children : null;
  const [prevNode, setPrevNode] = useState<ReactNode>(children);
  useEffect(() => {
    if (shownKey === k) setPrevNode(latest.current);
  }, [shownKey, k]);
  return (
    <span
      className="grid place-items-center"
      style={{
        transition:
          phase === "out"
            ? "opacity 120ms ease, filter 120ms ease, transform 120ms ease"
            : "opacity 220ms ease 60ms, filter 220ms ease 60ms, transform 260ms cubic-bezier(.2,.8,.2,1) 60ms",
        opacity: phase === "out" ? 0 : 1,
        filter: phase === "out" ? "blur(6px)" : "blur(0)",
        transform: phase === "out" ? "scale(.96)" : "scale(1)",
      }}
    >
      {node ?? prevNode}
    </span>
  );
}

// ---- スイッチ（つまみが伸びる） -----------------------------------------------------

function FocusToggle({ look }: { look: Look }) {
  const [on, setOn] = useState(false);
  const [held, setHeld] = useState(false);
  // つまみの両端を別々のばねで: 進む側は速く、後ろは遅れて追う（伸びて見える）。
  const lead = useSpringValue(on ? 1 : 0, { response: 0.28, damping: 0.86 });
  const trail = useSpringValue(on ? 1 : 0, { response: 0.42, damping: 0.86 });
  const W = 62;
  const K = 26;
  const left = 3 + Math.min(lead, trail) * (W - K - 6);
  const right = 3 + Math.max(lead, trail) * (W - K - 6) + K;
  const grow = held && look === "c" ? 6 : 0;
  return (
    <div
      className="flex w-full max-w-xs items-center justify-between rounded-2xl px-4 py-3"
      style={surface(look, { radius: 18 })}
    >
      <span className="font-semibold">集中モード</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onPointerDown={() => setHeld(true)}
        onPointerUp={() => setHeld(false)}
        onPointerLeave={() => setHeld(false)}
        onClick={() => setOn((v) => !v)}
        className="relative h-8"
        style={{
          width: W,
          borderRadius: 999,
          background: on
            ? look === "b"
              ? "#111"
              : "#0a84ff"
            : look === "c"
              ? "rgba(255,255,255,0.25)"
              : "rgba(120,120,128,0.24)",
          transition: "background-color 200ms ease",
        }}
      >
        <span
          className="absolute top-[3px] h-[26px]"
          style={{
            left: left - grow / 2,
            width: right - left + grow,
            borderRadius: 999,
            background: look === "c" && held ? "rgba(255,255,255,0.35)" : "#fff",
            boxShadow:
              look === "c" && held
                ? "inset 1px 1px 0 rgba(255,255,255,0.8), 0 2px 8px rgba(0,0,0,0.2)"
                : "0 2px 4px rgba(0,0,0,0.2)",
            backdropFilter: look === "c" && held ? "blur(2px)" : undefined,
            transform: `scaleY(${held && look === "c" ? 1.15 : 1})`,
          }}
        />
      </button>
    </div>
  );
}

// ---- 通知の帯 -----------------------------------------------------------------------

function ToastDemo({ look }: { look: Look }) {
  const [open, setOpen] = useState(false);
  const y = useSpringValue(open ? 0 : -18);
  const o = useSpringValue(open ? 1 : 0);
  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          window.setTimeout(() => setOpen(false), 1800);
        }}
        className="min-h-11 rounded-full px-4 text-footnote font-semibold"
        style={surface(look, { radius: 999 })}
      >
        通知を出す
      </button>
      <div
        aria-live="polite"
        className="flex w-full items-center gap-3 px-4 py-3"
        style={{
          ...surface(look, { radius: 20 }),
          transform: `translateY(${y}px)`,
          opacity: o,
          ...(look === "b" ? { background: "#111", color: "#fff" } : null),
        }}
      >
        <BookOpen className="h-5 w-5 shrink-0" />
        <span className="text-footnote font-semibold">珍珠奶茶 を図鑑に入れました</span>
        <span className="ml-auto text-caption opacity-60">いま</span>
      </div>
    </div>
  );
}

// ---- 下のタブ（印が伸びて追いつく） ---------------------------------------------------

const TABS = [
  { label: "ホーム", icon: Home },
  { label: "図鑑", icon: BookOpen },
  { label: "カメラ", icon: Camera },
  { label: "復習", icon: Sparkles },
  { label: "設定", icon: Settings },
];

function TabDemo({ look }: { look: Look }) {
  const [i, setI] = useState(0);
  const lead = useSpringValue(i, { response: 0.28, damping: 0.86 });
  const trail = useSpringValue(i, { response: 0.42, damping: 0.86 });
  const cell = 100 / TABS.length;
  const from = Math.min(lead, trail);
  const to = Math.max(lead, trail);
  return (
    <nav
      className="relative mx-4 mb-[calc(16px+env(safe-area-inset-bottom))] flex h-16 items-stretch overflow-hidden"
      style={surface(look, { radius: 999 })}
    >
      <span
        aria-hidden
        className="absolute top-1.5 bottom-1.5"
        style={{
          left: `calc(${from * cell}% + 4px)`,
          width: `calc(${(to - from + 1) * cell}% - 8px)`,
          borderRadius: 999,
          background:
            look === "b"
              ? "#111"
              : look === "c"
                ? "rgba(255,255,255,0.28)"
                : "color-mix(in oklab, var(--primary) 14%, transparent)",
          boxShadow: look === "c" ? "inset 1px 1px 0 rgba(255,255,255,0.7)" : undefined,
        }}
      />
      {TABS.map((t, k) => {
        const Icon = t.icon;
        const on = k === i;
        const color =
          look === "b"
            ? on
              ? "#fff"
              : "#111"
            : look === "c"
              ? on
                ? "#fff"
                : "rgba(255,255,255,0.8)"
              : on
                ? "var(--primary)"
                : "var(--muted-foreground)";
        return (
          <button
            key={t.label}
            type="button"
            onClick={() => setI(k)}
            aria-current={on ? "page" : undefined}
            className="relative z-10 flex flex-1 flex-col items-center justify-center gap-0.5 text-caption"
            style={{ color }}
          >
            <Icon className="h-5 w-5" />
            <span>{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
