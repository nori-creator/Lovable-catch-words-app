import { useEffect, useRef, useState } from "react";

/**
 * 画面の横スワイプ（オーナー指示 2026-09-13
 * 「ホームや図鑑、カメラ、設定の画面で左右にスワイプしたら画面が変わる」）。
 *
 * ## なぜ window で拾うか
 * 中身は画面ごとに違うので、殻(`AppShell`)が一括で拾うほうが「どの画面でも
 * 同じように効く」を保証できる。個々の画面に付けると、付け忘れた画面だけ
 * 効かない、という一番わかりにくい形になる。
 *
 * ## 触らないもの
 * カメラのプレビュー・地図・横に動かす部品・入力・開いている面は
 * `data-noswipe` を持たせて除ける。指の主目的がそこに在るとき、
 * 画面ごと移動させるのは事故でしかない。
 *
 * ## 縦か横かは指が決める
 * 最初の 10px で向きを決め、縦だと分かった時点で以降は一切関与しない
 * （スクロールを奪うと「ページが動かない」に直結する）。
 */
const IGNORE_SELECTOR = [
  "[data-noswipe]",
  "input",
  "textarea",
  "select",
  "button",
  "[contenteditable='true']",
  "[role='dialog']",
  "[role='slider']",
  ".overflow-x-auto",
].join(",");

export type TabSwipe = {
  /** −1〜1。指の進み具合。移る向き（index が増える側）を正とする。 */
  progress: number;
  /** 指が触っている間だけ true。アニメーションの有無を分ける。 */
  dragging: boolean;
};

export function useTabSwipe({
  enabled = true,
  index,
  count,
  onCommit,
}: {
  enabled?: boolean;
  /** いまの画面の位置。−1 = タブではない画面。 */
  index: number;
  count: number;
  onCommit: (nextIndex: number) => void;
}): TabSwipe {
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;
  const stateRef = useRef({ id: -1, sx: 0, sy: 0, axis: "" as "" | "x" | "y" });

  useEffect(() => {
    if (!enabled || index < 0) return;
    const st = stateRef.current;

    const reset = () => {
      st.id = -1;
      st.axis = "";
      setDragging(false);
      setProgress(0);
    };

    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" || st.id !== -1) return;
      const el = e.target as Element | null;
      if (el?.closest?.(IGNORE_SELECTOR)) return;
      st.id = e.pointerId;
      st.sx = e.clientX;
      st.sy = e.clientY;
      st.axis = "";
    };

    const move = (e: PointerEvent) => {
      if (e.pointerId !== st.id) return;
      const dx = e.clientX - st.sx;
      const dy = e.clientY - st.sy;
      if (st.axis === "") {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        st.axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? "x" : "y";
        if (st.axis === "y") return;
        setDragging(true);
      }
      if (st.axis !== "x") return;
      const w = window.innerWidth || 1;
      // 指を右へ = ひとつ前の画面へ = index が減る向き。
      let p = -dx / w;
      const next = index + (p > 0 ? 1 : -1);
      // 端では引っぱるだけ（行き先が無いのに滑ると壊れて見える）。
      if (next < 0 || next >= count) p *= 0.22;
      setProgress(Math.max(-1, Math.min(1, p)));
    };

    const up = (e: PointerEvent) => {
      if (e.pointerId !== st.id) return;
      const dx = e.clientX - st.sx;
      const w = window.innerWidth || 1;
      const far = Math.abs(dx) > Math.max(60, w * 0.16);
      const next = index + (dx < 0 ? 1 : -1);
      if (st.axis === "x" && far && next >= 0 && next < count) commitRef.current(next);
      reset();
    };

    window.addEventListener("pointerdown", down, { passive: true });
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", up, { passive: true });
    window.addEventListener("pointercancel", up, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [enabled, index, count]);

  return { progress, dragging };
}

/**
 * 一段進んだ画面（単語の詳細など）で右へスワイプすると前の画面へ戻る。
 * 移る先が「隣」ではなく「来た所」なので、タブのスワイプとは別の関数。
 */
export function useSwipeBack({
  enabled = true,
  onBack,
}: {
  enabled?: boolean;
  onBack: () => void;
}) {
  const backRef = useRef(onBack);
  backRef.current = onBack;
  useEffect(() => {
    if (!enabled) return;
    let id = -1;
    let sx = 0;
    let sy = 0;
    let axis: "" | "x" | "y" = "";
    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" || id !== -1) return;
      const el = e.target as Element | null;
      if (el?.closest?.(IGNORE_SELECTOR)) return;
      id = e.pointerId;
      sx = e.clientX;
      sy = e.clientY;
      axis = "";
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== id || axis !== "") return;
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? "x" : "y";
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      const dx = e.clientX - sx;
      if (axis === "x" && dx > Math.max(70, (window.innerWidth || 1) * 0.18)) backRef.current();
      id = -1;
      axis = "";
    };
    window.addEventListener("pointerdown", down, { passive: true });
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", up, { passive: true });
    window.addEventListener("pointercancel", up, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [enabled]);
}
