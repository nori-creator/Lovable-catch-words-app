import { FUNNEL_SESSION_ID, isTutorialStep, type TutorialStep } from "./funnel-events";

/**
 * **チュートリアルの段を、タブごとに1回だけ送る**（ベータの計測、2026-10-03）。
 *
 * セッションの印はこのタブの `sessionStorage` に置く乱数（タブを閉じれば消える。名前・
 * メール・端末の情報とは結びつけない）。送った段もここに覚え、同じ段は2回送らない。
 * サーバでも同じ印・同じ段は1行にしかならない（`tutorial-funnel.server.ts`）。
 * `sessionStorage` が使えない時は、このページを開いている間だけ覚える。
 */
export const FUNNEL_SID_KEY = "cw-funnel-sid";
export const FUNNEL_SENT_KEY = "cw-funnel-sent";

export type TutorialTrackerDeps = {
  storage: () => Pick<Storage, "getItem" | "setItem"> | null;
  send: (step: TutorialStep, sid: string) => PromiseLike<unknown>;
  newId: () => string;
};

export function createTutorialTracker(deps: TutorialTrackerDeps) {
  let memorySid: string | null = null;
  const memorySent = new Set<string>();
  const store = () => {
    try {
      return deps.storage();
    } catch {
      return null;
    }
  };
  function sessionId(): string {
    const s = store();
    try {
      if (s) {
        const saved = s.getItem(FUNNEL_SID_KEY);
        if (saved && FUNNEL_SESSION_ID.test(saved)) return saved;
        const fresh = deps.newId();
        s.setItem(FUNNEL_SID_KEY, fresh);
        return fresh;
      }
    } catch {
      /* 使えない端末はページの間だけ覚える */
    }
    memorySid ??= deps.newId();
    return memorySid;
  }
  function sent(): Set<string> {
    const s = store();
    try {
      const raw = s?.getItem(FUNNEL_SENT_KEY);
      const list: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(list)) for (const v of list) if (typeof v === "string") memorySent.add(v);
    } catch {
      /* 壊れた値は読み飛ばす */
    }
    return memorySent;
  }
  /** 送ったら true（もう送ってあれば false）。通信の失敗はやり直さない（送りすぎない側に倒す）。 */
  return function track(step: TutorialStep): boolean {
    if (!isTutorialStep(step)) return false;
    const done = sent();
    if (done.has(step)) return false;
    done.add(step);
    try {
      store()?.setItem(FUNNEL_SENT_KEY, JSON.stringify([...done]));
    } catch {
      /* ページの間だけ覚える */
    }
    try {
      void Promise.resolve(deps.send(step, sessionId())).catch(() => undefined);
    } catch {
      /* 数えられなくても画面は止めない */
    }
    return true;
  };
}

/** 本物の送り先（ログイン不要の受け口）。読み込みは送る時まで遅らせる。 */
export const trackTutorialStep = createTutorialTracker({
  storage: () => (typeof sessionStorage === "undefined" ? null : sessionStorage),
  send: async (step, sid) => {
    const { recordTutorialStep } = await import("./tutorial-funnel.functions");
    return recordTutorialStep({ data: { step, sid } });
  },
  newId: () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`,
});
