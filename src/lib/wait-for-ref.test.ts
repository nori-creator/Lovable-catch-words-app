import { describe, it, expect } from "vitest";
import { waitForRef } from "./wait-for-ref";

/**
 * ここで守っているのは1つだけ:
 * **入れ物を渡せば、あとから入った物が掴める。**
 *
 * 中身を先に読んで渡していたせいで、キャッチの演出が一度も始まって
 * いなかった(2026-08-19)。同じ間違いは「写しを渡す」と必ず再発するので、
 * 「あとから入る」場合を試験に置く。
 */
describe("waitForRef", () => {
  it("最初から入っていればそのまま返す", async () => {
    const el = { id: "fly" };
    expect(await waitForRef({ current: el })).toBe(el);
  });

  it("**あとから入った物**を掴む(これが本題)", async () => {
    const el = { id: "fly" };
    const ref: { current: typeof el | null } = { current: null };
    // 描かれるのは呼んだ後 — 実物の順序と同じ。
    setTimeout(() => {
      ref.current = el;
    }, 20);
    expect(await waitForRef(ref, { frames: 20, timeoutMs: 5 })).toBe(el);
  });

  it("いつまでも入らなければ null を返す(呼ぶ側が演出を省ける)", async () => {
    expect(await waitForRef({ current: null }, { frames: 3, timeoutMs: 1 })).toBeNull();
  });

  it("待つのは有限回。入らないまま止まらない", async () => {
    const started = Date.now();
    await waitForRef({ current: null }, { frames: 4, timeoutMs: 2 });
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
