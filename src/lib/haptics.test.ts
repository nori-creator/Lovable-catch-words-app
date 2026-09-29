import { afterEach, describe, expect, it, vi } from "vitest";

/** 2026-09-28「単語をキャッチしたときにスマホのバイブレーションを振動させる」。 */
describe("iPhone の Safari（振動 API が無い）でも震わせる", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  const fakeDom = () => {
    const clicks = { n: 0 };
    const el = (tag: string) => {
      const attrs: Record<string, string> = {};
      return {
        tag,
        style: {} as Record<string, string>,
        isConnected: true,
        children: [] as unknown[],
        setAttribute: (k: string, v: string) => (attrs[k] = v),
        getAttribute: (k: string) => attrs[k],
        appendChild(c: unknown) {
          this.children.push(c);
        },
        click: () => clicks.n++,
      };
    };
    vi.stubGlobal("document", { createElement: el, body: { appendChild: () => {} } });
    return clicks;
  };

  it("iPhone では見えない切り替え（switch）を label 越しに押す。成功は2回", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
      maxTouchPoints: 5,
    });
    const clicks = fakeDom();
    const { haptic } = await import("./haptics");
    haptic("success");
    expect(clicks.n).toBe(1);
    vi.advanceTimersByTime(100);
    expect(clicks.n).toBe(2);
    vi.useRealTimers();
  });

  it("振動 API がある端末はそちらを使う（切り替えは押さない）", async () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal("navigator", { userAgent: "Android", vibrate });
    const clicks = fakeDom();
    const { haptic } = await import("./haptics");
    haptic("heavy");
    expect(vibrate).toHaveBeenCalledWith(22);
    expect(clicks.n).toBe(0);
  });
});
