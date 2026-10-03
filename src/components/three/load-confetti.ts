/**
 * 3D の紙吹雪（three.js を含む重い塊）を**1回だけ**読む。
 *
 * はがす札（`PeelSticker`）が出た時に暇を見て読み始め、キャッチの演出では読み終えた物を
 * 使う（UI 監査 2026-10-03: 弾ける瞬間の固まり）。読めなかったら次に呼ばれた時に読み直す。
 */
let loading: Promise<typeof import("./confetti3d")> | null = null;

export function loadConfetti3d(): Promise<typeof import("./confetti3d")> {
  if (!loading)
    loading = import("./confetti3d").catch((error: unknown) => {
      loading = null;
      throw error;
    });
  return loading;
}

/** 手が空いた時に読み始める（読めなくても何もしない）。止める関数を返す。 */
export function preloadConfetti3d(): () => void {
  if (typeof window === "undefined") return () => {};
  const start = () => void loadConfetti3d().catch(() => {});
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(start, { timeout: 2000 });
    return () => window.cancelIdleCallback(id);
  }
  const timer = window.setTimeout(start, 600);
  return () => window.clearTimeout(timer);
}
