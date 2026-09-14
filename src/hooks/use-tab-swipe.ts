import { useEffect, useRef, useState } from "react";
// 端の抵抗・離した速度・弾いた先。**3つとも `lib/spring.ts` に在った** —
// `rubberband` は呼び出し 0 の死んだコードで、他の2つも1箇所でしか
// 使われていなかった。指の物理はここでも同じ物を使う。
import { projectMomentum, rubberband, velocityFrom } from "@/lib/spring";

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
  const stateRef = useRef({
    id: -1,
    sx: 0,
    sy: 0,
    axis: "" as "" | "x" | "y",
    /** 直近の指の位置。離した瞬間の速度を出すのに要る(1点だけ見ると
        指が止まった瞬間に 0 になる)。 */
    history: [] as { t: number; x: number }[],
  });

  useEffect(() => {
    if (!enabled || index < 0) return;
    const st = stateRef.current;

    const reset = () => {
      st.id = -1;
      st.axis = "";
      st.history = [];
      setDragging(false);
      setProgress(0);
    };

    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" || st.id !== -1) return;
      if (document.documentElement.dataset.swipeSubview) return;
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
      //
      // **`× 0.22` の一律の減衰をやめた。** 一定の割合で薄めるだけだと、
      // 引いても引いても同じ重さで付いてくるので「ゴムで繋がっている」
      // 感じが出ない。`rubberband` は引くほど付いてこなくなる漸近曲線で、
      // 「反応はしている、でもこの先には何も無い」が指に伝わる(§19)。
      // `lib/spring.ts` に在ったが**呼び出し 0 の死んだコード**だった。
      if (next < 0 || next >= count) p = rubberband(p * w, w) / w;
      st.history.push({ t: performance.now(), x: dx });
      if (st.history.length > 6) st.history.shift();
      setProgress(Math.max(-1, Math.min(1, p)));
    };

    const up = (e: PointerEvent) => {
      if (e.pointerId !== st.id) return;
      const dx = e.clientX - st.sx;
      const w = window.innerWidth || 1;
      /**
       * **弾いた先を見る**(§18)。距離だけで決めていたので、**速く短く払う
       * 操作が通らなかった** — iOS で人がいちばんよくやる送り方がこれ。
       * いま居る所に、この速度で滑ったら進む分を足して判断する。
       */
      const v = velocityFrom(st.history);
      const projected = dx + projectMomentum(v);
      const far = Math.abs(projected) > Math.max(60, w * 0.16);
      // 向きは**弾いた先**で決める。指が戻りかけていても、勢いが残って
      // いる向きへ送る(離した瞬間の位置で決めると、戻し始めた指で逆へ飛ぶ)。
      const next = index + (projected < 0 ? 1 : -1);
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
    let history: { t: number; x: number }[] = [];
    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" || id !== -1) return;
      const el = e.target as Element | null;
      if (el?.closest?.(IGNORE_SELECTOR)) return;
      id = e.pointerId;
      sx = e.clientX;
      sy = e.clientY;
      axis = "";
      history = [];
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      // 向きが決まった後も位置を控え続ける。離した瞬間の速度に要る。
      if (axis === "x") {
        history.push({ t: performance.now(), x: dx });
        if (history.length > 6) history.shift();
        return;
      }
      if (axis !== "") return;
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? "x" : "y";
      if (axis === "x") history.push({ t: performance.now(), x: dx });
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      const dx = e.clientX - sx;
      /**
       * **弾いた先で決める**(§18)。ここは距離だけを見ていたので、
       * 速く短く払う操作が通らなかった — 戻るのは一番よく使う操作なのに、
       * ゆっくり大きく引かないと戻れない状態だった。
       */
      const projected = dx + projectMomentum(velocityFrom(history));
      if (axis === "x" && projected > Math.max(70, (window.innerWidth || 1) * 0.18)) {
        backRef.current();
      }
      id = -1;
      axis = "";
      history = [];
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
