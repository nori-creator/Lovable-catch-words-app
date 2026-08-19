/**
 * 「まだ描かれていない要素」を、描かれてから掴む。
 *
 * ## なぜ要るか(2026-08-19 に見つけた不具合)
 * キャッチの着弾演出は、呼ぶ側がどちらも
 * `setLanding(true)` の**直後**に走らせる。飛ぶ絵を載せる層はその状態を
 * 見て初めて描かれるので、**呼ばれた瞬間にはまだ DOM に無い**。
 * それを `ref.current` で先に読んで渡していたため、振り付けは毎回
 * 「飛ぶ絵が無い」枝に落ち、音だけ鳴らして終わっていた。
 * **演出は消えたのではなく、一度も始まっていなかった**
 * (オーナー指摘 2026-07-16「画像がふっと浮か上がる演出が消えてる」)。
 *
 * エフェクト・ラボだけ動いて見えたのは、あちらが飛ぶ絵を**常に**
 * 描いているから。実物と雛形で前提が違うと、欠陥は雛形に映らない。
 *
 * 中身ではなく**入れ物(ref)**を受け取るのが肝。中身を渡した時点で、
 * それは「その瞬間の写し」であって、待っても新しくならない。
 */
export type RefLike<T> = { readonly current: T | null };

/** 1フレーム待つ。背面のタブでは rAF が止まるので、時間切れも一緒に持つ。 */
function nextFrame(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const id = setTimeout(done, timeoutMs);
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => {
        clearTimeout(id);
        done();
      });
    }
  });
}

/**
 * `ref.current` が埋まるまで数フレーム待って返す。
 * 待ちきっても空なら null を返す — 呼ぶ側は「演出を省く」道を持っている。
 */
export async function waitForRef<T>(
  ref: RefLike<T>,
  opts: { frames?: number; timeoutMs?: number } = {},
): Promise<T | null> {
  const frames = opts.frames ?? 8;
  const timeoutMs = opts.timeoutMs ?? 32;
  for (let i = 0; i < frames; i++) {
    if (ref.current) return ref.current;
    await nextFrame(timeoutMs);
  }
  return ref.current;
}
