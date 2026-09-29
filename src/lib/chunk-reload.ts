import { lazy, type ComponentType } from "react";

/**
 * **画面の部品を取りに行けなかった時の立ち直り。**（オーナー報告 2026-09-29「読み込みに
 * 失敗しました、がアプリ内に頻繁に出て、アプリがすぐ止まる」）
 *
 * 画面の部品（名前に中身の印が付いた JS）は、開いた時ではなく**使う時**に取りに行く。
 * 電波が弱い時や、Lovable で公開し直した直後（古い名前の部品が消えている）はそこで失敗し、
 * 一番外の「読み込みに失敗しました」まで落ちていた。
 *
 * - 取りに行けなかったら少し待って**もう一度だけ**取りに行く
 * - それでも駄目なら**ページを1回だけ読み直す**（新しい部品の名前を受け取る）
 * - 読み直しは 30 秒に1回まで（読み直し続ける輪にしない）
 */
const RELOAD_KEY = "cw-chunk-reload-at";
const RELOAD_GAP_MS = 30_000;

/** 部品（動的 import）を取りに行けなかった時の、各ブラウザの言い方。 */
export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|Loading (CSS )?chunk \S+ failed|ChunkLoadError/i.test(
    message,
  );
}

/** いまページを読み直してよいか（前の読み直しから間が空いているか）。 */
export function canReloadNow(lastAt: number | null, now: number): boolean {
  return lastAt === null || !Number.isFinite(lastAt) || now - lastAt > RELOAD_GAP_MS;
}

/** 1回だけ読み直す。読み直したら true（呼んだ側は何も描かなくてよい）。 */
export function reloadOnceForChunkError(): boolean {
  if (typeof window === "undefined") return false;
  let last: number | null = null;
  try {
    const raw = sessionStorage.getItem(RELOAD_KEY);
    last = raw ? Number(raw) : null;
  } catch {
    /* 覚えられない端末: 読み直しはしない（輪を作らない側に倒す） */
    return false;
  }
  const now = Date.now();
  if (!canReloadNow(last, now)) return false;
  try {
    sessionStorage.setItem(RELOAD_KEY, String(now));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

/** `React.lazy` の代わり。取りに行けなかったら1回だけ取り直し、駄目なら読み直す。 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- React.lazy と同じ型の受け方
export function lazyWithRetry<T extends ComponentType<any>>(
  importer: () => Promise<{ default: T }>,
) {
  return lazy<T>(async () => {
    try {
      return await importer();
    } catch (first) {
      if (!isChunkLoadError(first)) throw first;
      await new Promise((ok) => setTimeout(ok, 600));
      try {
        return await importer();
      } catch (second) {
        if (reloadOnceForChunkError()) return new Promise<{ default: T }>(() => {});
        throw second;
      }
    }
  });
}

let started = false;

/**
 * Vite が先読みに失敗した時の合図（`vite:preloadError`、Vite 公式の手順）を受けて読み直す。
 * https://vite.dev/guide/build#load-error-handling
 */
export function initChunkRecovery(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("vite:preloadError", (event) => {
    if (reloadOnceForChunkError()) event.preventDefault();
  });
}
