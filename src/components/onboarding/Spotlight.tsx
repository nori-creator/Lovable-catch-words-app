import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { scrollByY } from "@/lib/scroll-root";

/**
 * 案内の**コマ割り**（オーナー指示 2026-10-02「時間をコマ割りをしっかりして」）。
 *
 * 1コマずつ、前のコマが終わってから次を始める。重ねない。
 *
 * - **新しい画面**: 画面だけを `screenHold` 見せる（押しても進まない透明の鍵）→
 *   対象が**止まってから**（画面の出る動き・写真の読み込み・巻き取りが済んで
 *   `settleFrames` フレーム動かない）、暗幕と一緒に青い枠が対象の真ん中の 24px から
 *   対象の形まで `ringIn` で広がる → 札（説明）が出る → 押せるようになる。
 * - **同じ画面の次の案内**: 札を下げ、暗幕は保ったまま、枠が前の対象から次の対象へ
 *   `ringMove` で滑る → 札が出る。画面を明るく戻したり、真ん中から広げ直したりしない。
 * - 動きを減らす設定（アプリの設定 = `<html data-motion>`）: 動かさず、画面を
 *   `reducedHold` 見せてから枠と札を同時に出す。
 *
 * 数字は QA.md「Shared tutorial release checks」と同じ。
 */
export const TOUR_TIMING = {
  screenHold: 1000,
  reducedHold: 400,
  settleFrames: 8,
  ringIn: 700,
  ringMove: 480,
  coachDelay: 80,
  /** 対象が見つからないまま待つ上限。過ぎたら枠なしで札だけ出す（閉じ込めない）。 */
  missingTimeout: 5000,
  /**
   * 対象が止まらない（ずっと動く物・重い描画が続く端末）時に待つ上限。過ぎたら、
   * 止まるのを待たずに枠を置く — 待ち続けて押せないままにはしない。
   */
  settleTimeout: 4000,
} as const;

/**
 * 枠と対象の**間**（px）。枠の箱は対象より上下左右に 4px 大きく、角の丸みも 4px
 * 足す（同心の角）。線（2px）はこの箱の内側に描くので、対象の縁から 2px あけて
 * 線が立つ — どの段でも同じ間合い。
 */
export const RING_GAP = 4;

type Box = { top: number; left: number; width: number; height: number };
/** 角の丸み（左上・右上・右下・左下）。上だけ丸い面（答え合わせの面）もそのまま囲う。 */
type Radii = [number, number, number, number];
type Phase = "wait" | "focus" | "coach";

/** Overlay blocks pointer input outside the target; capture listeners also block
 * keyboard/assistive clicks and background scroll. No clone of the real control. */
export function Spotlight({
  target,
  title,
  text,
  step,
  nextLabel,
  onNext,
  interactive = false,
  allowSelector,
  gesture,
  keepVisible,
  primary,
  alignTop = false,
  compact = false,
}: {
  /** 照らす物。**押す所そのもの**を指す（押す所を中に含む広い範囲ではなく）。 */
  target: string;
  /** 短い見出し — その段で**すること**。本文はその理由（何が便利か）を1文で。 */
  title?: string;
  text: string;
  /** 「2 / 5」— 案内のどの章にいるか。全部の段に出す。 */
  step?: string;
  nextLabel?: string;
  onNext?: () => void;
  interactive?: boolean;
  allowSelector?: string;
  /**
   * 対象に対してする操作。押す所が光って脈打つ（オーナー指示 2026-09-30「次に進むために
   * どこタップすればいいか一目瞭然となるように、青い光の枠で必ずその部分を同様の
   * 広がるアニメーションで囲って」）。実物確認（e2e/real-app）の自動操作もこれを読む。
   */
  gesture?: "tap" | "swipe" | "peel";
  /** 札で**隠さない**物（問題文・答えの面など）。札はこれと枠の両方を避けて置く。 */
  keepVisible?: string;
  /**
   * 枠が**読ませたい面ごと**囲う時（答え合わせの面）、その中で次に押す物。脈打つ光で
   * 示し、実物確認の自動操作もこれを押す（`data-tour-primary`）。
   */
  primary?: string;
  /**
   * 対象の頭を画面の上に寄せてから照らす（単語の詳細: 写真の下にある意味・例文・チャンクを
   * 最初から見せる。オーナー指示 2026-10-03「単語の詳細は例文とチャンクをなるべく表示して」）。
   */
  alignTop?: boolean;
  /**
   * 札を**1段の細い札**にして画面の下端に置く（下のタブを覆う全画面の面＝単語の詳細）。
   * 意味・例文・チャンクを札で隠さないため（オーナー指示 2026-10-03「単語の詳細は例文と
   * チャンクをなるべく表示して」）。
   */
  compact?: boolean;
}) {
  const reduced = usePrefersReducedMotion();
  /**
   * いまのコマ。**どの対象のコマか**も持つ — 対象が変わった最初の描画で、前の対象の
   * 「札を出す」コマのまま新しい文が一瞬出ないように（文が、指す物より先に出ない）。
   */
  const [stage, setStage] = useState<{ for: string; phase: Phase }>({
    for: target,
    phase: "wait",
  });
  const phase: Phase = stage.for === target ? stage.phase : "wait";
  const [box, setBox] = useState<{ box: Box; radii: Radii } | null>(null);
  const [primaryBox, setPrimaryBox] = useState<{ box: Box; radii: Radii } | null>(null);
  const [entry, setEntry] = useState<"expand" | "move" | null>(null);
  const [coachH, setCoachH] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const mountedAt = useRef(0);
  const shown = useRef(false);
  const boxRef = useRef(box);
  boxRef.current = box;
  const primaryRef = useRef(primaryBox);
  primaryRef.current = primaryBox;
  const coachReady = phase === "coach";

  // 1コマ目〜3コマ目: 待つ → 枠 → 札。対象が変わるたびに最初から。
  useEffect(() => {
    if (!mountedAt.current) mountedAt.current = performance.now();
    setStage({ for: target, phase: "wait" });
    let raf = 0;
    let timer = 0;
    let last: DOMRect | null = null;
    let lastRadiusFor = "";
    let radii: Radii = [0, 0, 0, 0];
    let stable = 0;
    let prev = 0;
    let scrolled = false;
    let placed = false;
    const moving = shown.current;
    const started = moving ? performance.now() : mountedAt.current;
    const hold = moving ? 0 : reduced ? TOUR_TIMING.reducedHold : TOUR_TIMING.screenHold;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const node = document.querySelector<HTMLElement>(target);
      const r = node?.getBoundingClientRect();
      const ok = !!node && !!r && r.width > 0 && r.height > 0;
      // 主の処理が詰まっている間（重い描画・画像の展開）は「止まった」と数えない。
      // 詰まりの最中に枠を広げると、動きがコマ落ちして跳んで見える。
      const smooth = !prev || now - prev < 50;
      prev = now;
      stable = ok && smooth && last && sameRect(last, r!) ? stable + 1 : 0;
      last = ok ? r! : null;
      if (ok) {
        const key = `${Math.round(r!.width)}x${Math.round(r!.height)}`;
        if (key !== lastRadiusFor) {
          lastRadiusFor = key;
          radii = radiiOf(node!, r!);
        }
      }
      if (!placed) {
        const settled =
          stable >= TOUR_TIMING.settleFrames || now - started >= hold + TOUR_TIMING.settleTimeout;
        if (ok && settled && now - started >= hold) {
          if (!scrolled && (offscreen(r!) || (alignTop && r!.top > 160))) {
            // 画面の外にある物は、見える所まで巻き取ってから止まるのを待ち直す。
            // 下は札の分（90px）空ける。
            scrolled = true;
            node!.scrollIntoView({ block: "start", behavior: "instant" });
            scrollByY(-90);
            stable = 0;
            return;
          }
          placed = true;
          shown.current = true;
          setBox({ box: ringBox(r!), radii });
          const kind = reduced ? null : moving ? "move" : "expand";
          setEntry(kind);
          setStage({ for: target, phase: "focus" });
          timer = window.setTimeout(
            () => setStage({ for: target, phase: "coach" }),
            kind === "move"
              ? TOUR_TIMING.ringMove + TOUR_TIMING.coachDelay
              : kind === "expand"
                ? TOUR_TIMING.ringIn + TOUR_TIMING.coachDelay
                : 0,
          );
        } else if (!ok && now - started > TOUR_TIMING.missingTimeout) {
          placed = true;
          setBox(null);
          setStage({ for: target, phase: "coach" });
        }
        return;
      }
      // 4コマ目以降: 対象が動いたら（巻き取り・大きさの変化・遅れて出た物）同じフレームで追う。
      if (ok) {
        const next = ringBox(r!);
        const cur = boxRef.current;
        if (!cur || !sameBox(cur.box, next) || cur.radii.join() !== radii.join())
          setBox({ box: next, radii });
      }
      const p = primary ? document.querySelector<HTMLElement>(primary) : null;
      const pr = p?.getBoundingClientRect();
      const nextPrimary =
        p && pr && pr.width > 0 ? { box: ringBox(pr), radii: radiiOf(p, pr) } : null;
      const curPrimary = primaryRef.current;
      if (
        !nextPrimary !== !curPrimary ||
        (nextPrimary && curPrimary && !sameBox(nextPrimary.box, curPrimary.box))
      )
        setPrimaryBox(nextPrimary);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [target, reduced, primary, alignTop]);

  useEffect(() => {
    if (coachReady) return;
    const block = (e: KeyboardEvent) => {
      if (["Tab", "Enter", " ", "Escape"].includes(e.key)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    document.addEventListener("keydown", block, true);
    return () => document.removeEventListener("keydown", block, true);
  }, [coachReady]);
  useLayoutEffect(() => {
    if (panel.current) setCoachH(panel.current.offsetHeight);
  }, [title, text, nextLabel, step, coachReady]);

  // 押せる所の制限は、札が出てから（それまでは鍵の板が全部止める）。
  useEffect(() => {
    if (!coachReady) return;
    panel.current?.focus({ preventScroll: true });
    const node = document.querySelector<HTMLElement>(target);
    if (!node) return;
    const allowed = (e: Event) =>
      // チュートリアルのメニュー（言語・最初に戻る）はいつでも押せる。
      (e.target instanceof Element && !!e.target.closest("[data-tour-escape]")) ||
      (e.target instanceof Node &&
        (panel.current?.contains(e.target) ||
          (interactive &&
            e.target instanceof Element &&
            (node.contains(e.target) ||
              (allowSelector ? !!node.closest(allowSelector)?.contains(e.target) : false)) &&
            (!allowSelector || !!e.target.closest(allowSelector)))));
    const block = (e: Event) => {
      if (!allowed(e)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        // 覆いの下にある「いつでも押せる物」（下のタブの設定）へは、押した所から渡す。
        if (e.type === "click" && e instanceof MouseEvent) {
          const escape = document
            .elementsFromPoint(e.clientX, e.clientY)
            .map((el) => el.closest<HTMLElement>("[data-tour-escape]"))
            .find((el): el is HTMLElement => !!el);
          escape?.click();
        }
      }
    };
    const focus = (e: Event) => {
      if (!allowed(e)) panel.current?.focus({ preventScroll: true });
    };
    const keys = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
      if (e.key === "Tab") {
        const selector = 'button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]';
        // 押せる範囲（対象、または対象を含む `allowSelector`）の中の、指で押せる物と同じ物だけ。
        const scope = interactive
          ? (allowSelector && node.closest<HTMLElement>(allowSelector)) || node
          : null;
        const candidates = [
          ...(scope ? [scope, ...scope.querySelectorAll<HTMLElement>(selector)] : []).filter(
            (el) => el.matches(selector) && (!allowSelector || !!el.closest(allowSelector)),
          ),
          ...(panel.current?.querySelectorAll<HTMLElement>(selector) ?? []),
        ].filter((el) => el.getClientRects().length > 0);
        if (!candidates.length) {
          e.preventDefault();
          panel.current?.focus();
          return;
        }
        e.preventDefault();
        const index = candidates.indexOf(document.activeElement as HTMLElement);
        candidates[(index + (e.shiftKey ? -1 : 1) + candidates.length) % candidates.length].focus();
      }
    };
    const types = ["pointerdown", "click", "wheel", "touchmove"];
    types.forEach((type) =>
      document.addEventListener(type, block, { capture: true, passive: false }),
    );
    document.addEventListener("focusin", focus, true);
    document.addEventListener("keydown", keys, true);
    return () => {
      types.forEach((type) => document.removeEventListener(type, block, true));
      document.removeEventListener("focusin", focus, true);
      document.removeEventListener("keydown", keys, true);
    };
  }, [coachReady, target, interactive, allowSelector]);

  // 1コマ目（新しい画面）: 画面だけを見せる。透明の鍵で、この間に押しても飛ばさない。
  if (!box && phase !== "coach") return <div className="tour-preview-lock" aria-hidden="true" />;
  const ring = box?.box;
  const place = compact
    ? {
        side: "dock" as const,
        style: { bottom: "max(12px, calc(env(safe-area-inset-bottom) + 8px))" },
      }
    : coachPlacement(ring ?? null, coachH, keepVisible);
  const ringClass = [
    "tour-ring",
    phase === "focus" && entry === "expand" ? "tour-ring--expand" : "",
    phase === "focus" && entry === "move" ? "tour-ring--move" : "",
    coachReady && interactive && !onNext && !primary ? "tour-ring--tap" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="tour-layer" data-tour-overlay data-tour-phase={phase}>
      {!coachReady && <div className="tour-animation-lock" aria-hidden="true" />}
      {ring && (
        <>
          <div className="tour-block" style={{ inset: `0 0 auto 0`, height: ring.top }} />
          <div
            className="tour-block"
            style={{ top: ring.top, height: ring.height, left: 0, width: ring.left }}
          />
          <div
            className="tour-block"
            style={{ top: ring.top, height: ring.height, left: ring.left + ring.width, right: 0 }}
          />
          <div
            className="tour-block"
            style={{ top: ring.top + ring.height, bottom: 0, left: 0, right: 0 }}
          />
          <div
            className={ringClass}
            data-tour-target={target}
            data-tour-gesture={interactive ? (gesture ?? "tap") : undefined}
            data-tour-primary={primary}
            style={
              {
                // **位置は `translate` で置く**（top / left は 0 のまま）。枠が広がる・滑る・巻き取りに
                // 付いて行くたびに配置が動き、画面のずれ（CLS 0.3〜0.39）と数えられていた
                // （2026-10-03 画面の監査）。大きさは width / height のままなので線は 2px のまま。
                top: 0,
                left: 0,
                translate: `${ring.left}px ${ring.top}px`,
                width: ring.width,
                height: ring.height,
                borderRadius: ringRadius(box.radii),
                pointerEvents: interactive ? "none" : "auto",
                // 広がりの始まり（対象の真ん中の 24px）を、縮める割合で渡す。
                "--ring-sx": 24 / Math.max(ring.width, 24),
                "--ring-sy": 24 / Math.max(ring.height, 24),
              } as React.CSSProperties
            }
          />
        </>
      )}
      {coachReady && primaryBox && (
        <div
          className="tour-primary"
          aria-hidden="true"
          style={{
            top: primaryBox.box.top,
            left: primaryBox.box.left,
            width: primaryBox.box.width,
            height: primaryBox.box.height,
            borderRadius: ringRadius(primaryBox.radii),
          }}
        />
      )}
      {coachReady && (
        <div
          ref={panel}
          key={text}
          role="dialog"
          aria-label={title ?? text}
          aria-describedby={title ? "tour-coach-text" : undefined}
          tabIndex={-1}
          className={compact ? "tour-coach tour-coach--compact" : "tour-coach"}
          data-side={place.side}
          style={{ ...place.style, visibility: coachH ? undefined : "hidden" }}
        >
          {(title || step) && (
            <div className="tour-coach__head">
              {title && <h2>{title}</h2>}
              {step && <span className="tour-coach__step">{step}</span>}
            </div>
          )}
          <p id="tour-coach-text">{text}</p>
          {onNext && (
            <button className="tour-coach__next tour-pulse" onClick={onNext}>
              {nextLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function sameRect(a: DOMRect, b: DOMRect) {
  return (
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  );
}
function sameBox(a: Box, b: Box) {
  return (
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  );
}

/** 対象が画面から（一部でも）はみ出しているか。はみ出していなければ巻き取らない。 */
function offscreen(r: DOMRect) {
  const vh = window.innerHeight;
  return r.top < 0 || (r.bottom > vh && r.height < vh - 120);
}

/** 枠の箱: 対象より `RING_GAP` 外側。画面の端からはみ出す分だけ、端の内側 2px に収める。 */
function ringBox(r: DOMRect): Box {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = Math.max(2, r.left - RING_GAP);
  const top = Math.max(2, r.top - RING_GAP);
  const right = Math.min(vw - 2, r.right + RING_GAP);
  const bottom = Math.min(vh - 2, r.bottom + RING_GAP);
  return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

/** 枠の角: 対象の角の丸みに間合い（`RING_GAP`）を足す（同心の角）。角張った角も少し丸める。 */
function ringRadius(radii: Radii): string {
  return radii.map((r) => `${r + RING_GAP}px`).join(" ");
}

/**
 * 対象の角の丸み（px、左上・右上・右下・左下）。対象そのものが角張った入れ物
 * （`<section>` など）で、中の札が同じ角を共有している時は、その札の丸みを使う —
 * 枠が四角いまま丸い札を囲うと、角だけ間合いがずれて見える。
 */
function radiiOf(node: HTMLElement, r: DOMRect): Radii {
  const read = (el: Element, w: number, h: number): Radii => {
    const cs = getComputedStyle(el);
    const one = (raw: string) => {
      const value = parseFloat(raw) || 0;
      const px = raw.endsWith("%") ? (value / 100) * Math.min(w, h) : value;
      return Math.min(px, w / 2, h / 2);
    };
    return [
      one(cs.borderTopLeftRadius),
      one(cs.borderTopRightRadius),
      one(cs.borderBottomRightRadius),
      one(cs.borderBottomLeftRadius),
    ];
  };
  const own = read(node, r.width, r.height);
  if (own.some((v) => v > 0)) return own;
  const all = node.querySelectorAll("*");
  for (let i = 0; i < all.length && i < 60; i++) {
    const c = all[i].getBoundingClientRect();
    if (Math.abs(c.left - r.left) > 1.5 || Math.abs(c.top - r.top) > 1.5) continue;
    if (c.width < r.width * 0.6) continue;
    const radii = read(all[i], c.width, c.height);
    if (radii.some((v) => v > 0)) return radii;
  }
  return [0, 0, 0, 0];
}

/**
 * 画面の上の安全領域（iPhone の時計・切り欠き）の高さ。札をその下に置く。
 * `env()` は CSS からしか読めないので、見えない箱に当てて測る（画面の大きさごとに1回）。
 */
let safeTopCache: { key: string; value: number } | null = null;
function safeTop(): number {
  if (typeof document === "undefined") return 0;
  const key = `${window.innerWidth}x${window.innerHeight}`;
  if (safeTopCache?.key === key) return safeTopCache.value;
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top)";
  document.body.appendChild(probe);
  const value = parseFloat(getComputedStyle(probe).paddingTop) || 0;
  probe.remove();
  safeTopCache = { key, value };
  return value;
}

const GAP = 10;
/** 下のバーの高さ（案内の札をその上に置く）。 */
const TABBAR_CLEAR = 104;
const TOP_CLEAR = 8;

/**
 * 案内の札を**示している物にも、隠したくない物（`keepVisible`）にも重ねない**所に置く。
 * 下 → 上 → 画面の上端 → （どこにも入らない大きな物は）画面の下端、の順に空きを探す。
 */
function coachPlacement(
  ring: Box | null,
  h: number,
  keepVisible?: string,
): { side: "below" | "above" | "top" | "bottom"; style: React.CSSProperties } {
  const vh = typeof window === "undefined" ? 844 : window.innerHeight;
  const need = h || 140;
  const keep: Box[] =
    keepVisible && typeof document !== "undefined"
      ? [...document.querySelectorAll(keepVisible)].map((el) => {
          const r = el.getBoundingClientRect();
          return { top: r.top, left: r.left, width: r.width, height: r.height };
        })
      : [];
  const avoid = [...(ring ? [ring] : []), ...keep].filter((b) => b.height > 0);
  const topClear = TOP_CLEAR + safeTop();
  const fits = (top: number) =>
    top >= topClear &&
    top + need <= vh - TABBAR_CLEAR &&
    avoid.every((b) => top + need <= b.top - 4 || top >= b.top + b.height + 4);
  if (ring) {
    const below = ring.top + ring.height + GAP;
    if (fits(below)) return { side: "below", style: { top: below } };
    const above = ring.top - GAP - need;
    if (fits(above)) return { side: "above", style: { top: above } };
    const highest = Math.min(...avoid.map((b) => b.top));
    if (keep.length && fits(highest - GAP - need))
      return { side: "above", style: { top: highest - GAP - need } };
    if (fits(topClear + 4)) return { side: "top", style: { top: topClear + 4 } };
  }
  return {
    side: "bottom",
    style: { bottom: `max(${TABBAR_CLEAR}px, env(safe-area-inset-bottom))` },
  };
}
