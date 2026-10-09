/**
 * **画面が最初に出た後に走らせる**（押した瞬間の重い 1 コマに足さない）。次のコマの前（rAF）に
 * 予約し、そのコマを出した後（setTimeout）に走る。`idle` なら、さらに手の空いた時まで待つ
 * （遅くとも 1.5 秒）。取り消す関数を返す。
 */
export function afterFirstPaint(run: () => void, opts: { idle?: boolean } = {}): () => void {
  let raf = 0;
  let timer = 0;
  let idleId = 0;
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  raf = requestAnimationFrame(() => {
    timer = window.setTimeout(() => {
      if (opts.idle && w.requestIdleCallback)
        idleId = w.requestIdleCallback(run, { timeout: 1500 });
      else run();
    }, 0);
  });
  return () => {
    cancelAnimationFrame(raf);
    window.clearTimeout(timer);
    if (idleId) w.cancelIdleCallback?.(idleId);
  };
}
