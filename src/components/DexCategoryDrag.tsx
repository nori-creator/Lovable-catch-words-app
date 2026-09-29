import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { haptic } from "@/lib/haptics";
import { motionReducedNow } from "@/hooks/use-reduced-motion";

/**
 * **図鑑の単語を長押しして、別のカテゴリーへ運ぶ**（オーナー指示 2026-09-28 R14
 * 「画像が四角たくさん表示されてるものや縦に単語が並ぶ図鑑の種類の単語を長押ししたら、
 * 別のカテゴリーにドラッグドロップできるようにして。またカテゴリーも直接カテゴリーを
 * 長押ししたら変更できるようにして」）。
 *
 * 中の札は `data-dex-item="<id>"`、カテゴリーの節は `data-dex-cat="<key>"`、見出しは
 * `data-dex-cat-head="<key>"` を持つ。ここは**包むだけ**で、札の描き方には手を入れない
 * （写真の升目・縦の一覧・見た目パックのどれでも同じに効く）。
 *
 *  ・札を 0.45 秒押したまま → 札が指に付いて浮く（元の場所は薄く残る）。指を動かすと
 *    下にあるカテゴリーの節が青く縁取られる。離すとそこへ移る。同じ節なら元へ戻る。
 *  ・押してすぐ動かしたら、ふつうの縦スクロール（長押しにならない）。
 *  ・画面の上下の端に近づくと、ゆっくり送る（下の節まで運べる）。
 *  ・カテゴリーの見出しを長押し → そのカテゴリーの名前・絵文字を変える面が開く。
 *  ・運んだ後の「押した」は詳細を開かない（指を離した時の click を1回だけ止める）。
 */
const HOLD_MS = 450;
const SLOP = 8;

export function DexCategoryDrag({
  children,
  onMove,
  onEditCategory,
}: {
  children: ReactNode;
  /** 札 id を、カテゴリー key へ移す。 */
  onMove: (stickerId: string, key: string) => void;
  onEditCategory?: (key: string) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const press = useRef<{
    x: number;
    y: number;
    timer: number;
    kind: "item" | "head";
    el: HTMLElement;
    id: string;
  } | null>(null);
  const drag = useRef<{
    id: string;
    from: string;
    src: HTMLElement;
    ghost: HTMLElement;
    dx: number;
    dy: number;
    over: HTMLElement | null;
    x: number;
    y: number;
    raf: number;
  } | null>(null);
  const swallowClick = useRef(false);

  const clearPress = () => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  };

  const setOver = (sec: HTMLElement | null) => {
    const d = drag.current;
    if (!d || d.over === sec) return;
    d.over?.removeAttribute("data-drop");
    if (sec && sec.dataset.dexCat !== d.from) {
      sec.setAttribute("data-drop", "");
      haptic("selection");
    }
    d.over = sec;
  };

  const track = useCallback((x: number, y: number) => {
    const d = drag.current;
    if (!d) return;
    d.x = x;
    d.y = y;
    d.ghost.style.translate = `${x - d.dx}px ${y - d.dy}px`;
    const hit = document.elementFromPoint(x, y) as HTMLElement | null;
    setOver((hit?.closest("[data-dex-cat]") as HTMLElement | null) ?? null);
  }, []);

  const end = useCallback(
    (drop: boolean) => {
      const d = drag.current;
      if (!d) return;
      drag.current = null;
      cancelAnimationFrame(d.raf);
      document.documentElement.removeAttribute("data-dex-dragging");
      const target = drop && d.over && d.over.dataset.dexCat !== d.from ? d.over : null;
      d.over?.removeAttribute("data-drop");
      const reduce = motionReducedNow();
      const finish = () => {
        d.ghost.remove();
        d.src.style.opacity = "";
      };
      if (target) {
        // 運んだ先の見出しへ吸い込まれて消える（「そこに入った」が目で追える）。
        const head = target.querySelector("[data-dex-cat-head]") ?? target;
        const r = head.getBoundingClientRect();
        const g = d.ghost.getBoundingClientRect();
        haptic("success");
        onMove(d.id, target.dataset.dexCat!);
        if (reduce) finish();
        else
          d.ghost
            .animate(
              [
                { translate: `${g.left}px ${g.top}px`, scale: "1.06", opacity: 1 },
                { translate: `${r.left}px ${r.top - 6}px`, scale: "0.25", opacity: 0 },
              ],
              { duration: 320, easing: "cubic-bezier(.3,.7,.2,1)", fill: "forwards" },
            )
            .finished.then(finish, finish);
      } else {
        // 元の場所へ戻る。
        const r = d.src.getBoundingClientRect();
        if (reduce) finish();
        else
          d.ghost
            .animate([{ scale: "1.06" }, { translate: `${r.left}px ${r.top}px`, scale: "1" }], {
              duration: 260,
              easing: "cubic-bezier(.3,.7,.2,1)",
              fill: "forwards",
            })
            .finished.then(finish, finish);
      }
    },
    [onMove],
  );

  const start = useCallback(
    (el: HTMLElement, id: string, x: number, y: number) => {
      const sec = el.closest("[data-dex-cat]") as HTMLElement | null;
      if (!sec) return;
      const r = el.getBoundingClientRect();
      const ghost = el.cloneNode(true) as HTMLElement;
      ghost.removeAttribute("id");
      ghost.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
      Object.assign(ghost.style, {
        position: "fixed",
        left: "0px",
        top: "0px",
        width: `${r.width}px`,
        height: `${r.height}px`,
        margin: "0",
        zIndex: "90",
        pointerEvents: "none",
        translate: `${r.left}px ${r.top}px`,
        scale: "1.06",
        rotate: "-2deg",
        filter: "drop-shadow(0 16px 22px rgb(0 0 0 / .28))",
        transition: "scale 160ms ease, rotate 160ms ease",
      } satisfies Partial<CSSStyleDeclaration>);
      ghost.setAttribute("aria-hidden", "true");
      ghost.className += " dex-drag-ghost";
      document.body.appendChild(ghost);
      el.style.opacity = "0.3";
      haptic("medium");
      swallowClick.current = true;
      document.documentElement.setAttribute("data-dex-dragging", "");
      drag.current = {
        id,
        from: sec.dataset.dexCat!,
        src: el,
        ghost,
        dx: x - r.left,
        dy: y - r.top,
        over: null,
        x,
        y,
        raf: 0,
      };
      // 画面の上下の端では、ゆっくり送る。
      const edge = () => {
        const d = drag.current;
        if (!d) return;
        const h = window.innerHeight;
        const v = d.y < 110 ? -(110 - d.y) / 8 : d.y > h - 130 ? (d.y - (h - 130)) / 8 : 0;
        if (v) {
          window.scrollBy(0, v);
          track(d.x, d.y);
        }
        d.raf = requestAnimationFrame(edge);
      };
      drag.current.raf = requestAnimationFrame(edge);
    },
    [track],
  );

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || drag.current) return;
      const t = e.target as HTMLElement;
      const item = t.closest("[data-dex-item]") as HTMLElement | null;
      const head = t.closest("[data-dex-cat-head]") as HTMLElement | null;
      const hit = item ?? head;
      if (!hit) return;
      const kind = item ? "item" : "head";
      const id = item ? item.dataset.dexItem! : head!.dataset.dexCatHead!;
      const { clientX: x, clientY: y } = e;
      clearPress();
      press.current = {
        x,
        y,
        kind,
        el: hit,
        id,
        timer: window.setTimeout(() => {
          const p = press.current;
          press.current = null;
          if (!p) return;
          if (p.kind === "head") {
            if (!onEditCategory) return;
            haptic("medium");
            swallowClick.current = true;
            onEditCategory(p.id);
          } else start(p.el, p.id, x, y);
        }, HOLD_MS),
      };
    };
    const move = (e: PointerEvent) => {
      if (drag.current) {
        track(e.clientX, e.clientY);
        return;
      }
      const p = press.current;
      if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > SLOP) clearPress();
    };
    const up = () => {
      clearPress();
      if (drag.current) end(true);
    };
    const cancel = () => {
      clearPress();
      if (drag.current) end(false);
    };
    // 運んでいる間は画面を縦に送らせない（送られると指が札から外れる）。
    const touchmove = (e: TouchEvent) => {
      if (drag.current) {
        e.preventDefault();
        const t = e.touches[0];
        if (t) track(t.clientX, t.clientY);
      }
    };
    const click = (e: MouseEvent) => {
      if (!swallowClick.current) return;
      swallowClick.current = false;
      e.preventDefault();
      e.stopPropagation();
    };
    // 長押しで端末の「画像を保存」の窓が出ないように。
    const menu = (e: Event) => {
      if ((e.target as HTMLElement).closest("[data-dex-item],[data-dex-cat-head]"))
        e.preventDefault();
    };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    document.addEventListener("touchmove", touchmove, { passive: false });
    el.addEventListener("click", click, true);
    el.addEventListener("contextmenu", menu);
    return () => {
      clearPress();
      if (drag.current) end(false);
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      document.removeEventListener("touchmove", touchmove);
      el.removeEventListener("click", click, true);
      el.removeEventListener("contextmenu", menu);
    };
  }, [start, track, end, onEditCategory]);

  return (
    <div ref={root} className="dex-cat-drag">
      {children}
    </div>
  );
}
