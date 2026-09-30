import { useEffect } from "react";

/**
 * **カメラの画面にいる間だけ、ページ全体の拡大を禁止する。**（オーナー報告 2026-09-30
 * 「カメラモードが画面でまだ謎にズームできる。カメラモードの画面は固定して。ズームできるのは
 * カメラの撮影画面だけにして」）
 *
 * 前の対策（`.capture-viewfinder` の `touch-action: none` と `gesturestart` の抑止）は、
 * **つまむ動きの始点がカメラの枠の中**のときしか効かなかった。下のバーや上の余白から
 * 始めた2本指は、ブラウザの標準の拡大がそのまま効いて、画面ごと大きくなっていた
 * （撮影画面の左が切れ、下のバーごと拡大された録画のとおり）。
 *
 * そこで4つを重ねる:
 *  1. `<meta name="viewport">` に `maximum-scale=1, user-scalable=no`（Chrome/Android/WebView）
 *  2. `<html>` に `page-zoom-locked` を付け、`html`・`body` の `touch-action: none`（`styles.css`）
 *  3. Safari だけが出す `gesturestart` / `gesturechange` を止める（iOS は 1 を無視する）
 *  4. 2本指の `touchmove` を止める（古い WebView の保険）
 *
 * **離れたら必ず元に戻す。** 拡大は読みにくい人の助けなので、ほかの画面では奪わない
 * （`styles.css` の viewport の注意書きのとおり）。カメラの倍率は別物で、枠の中の
 * つまみで `applyConstraints` の zoom を動かす（`capture.tsx`）。
 */
export const ZOOM_LOCK_CLASS = "page-zoom-locked";
export const ZOOM_LOCK_VIEWPORT = "maximum-scale=1, user-scalable=no";

/** 既存の viewport の値に、拡大を止める指定を足した値（重複は足さない）。 */
export function lockedViewportContent(content: string): string {
  const kept = content
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && !/^(maximum-scale|minimum-scale|user-scalable)\s*=/.test(s));
  return [...kept, ZOOM_LOCK_VIEWPORT].join(", ");
}

export function useLockPageZoom(enabled = true): void {
  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;
    const root = document.documentElement;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    const original = meta?.getAttribute("content") ?? null;
    if (meta) meta.setAttribute("content", lockedViewportContent(original ?? ""));
    root.classList.add(ZOOM_LOCK_CLASS);
    const stop = (e: Event) => e.preventDefault();
    const stopPinch = (e: TouchEvent) => {
      if (e.touches.length > 1 && e.cancelable) e.preventDefault();
    };
    document.addEventListener("gesturestart", stop, { passive: false });
    document.addEventListener("gesturechange", stop, { passive: false });
    document.addEventListener("touchmove", stopPinch, { passive: false });
    return () => {
      document.removeEventListener("gesturestart", stop);
      document.removeEventListener("gesturechange", stop);
      document.removeEventListener("touchmove", stopPinch);
      root.classList.remove(ZOOM_LOCK_CLASS);
      if (meta) {
        if (original === null) meta.removeAttribute("content");
        else meta.setAttribute("content", original);
      }
    };
  }, [enabled]);
}
