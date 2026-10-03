import { useCallback, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { logAppEvent } from "@/lib/metrics.functions";
import { LATENCY_EVENTS, MAX_FUNNEL_LATENCY_MS, type MemberFunnelEvent } from "@/lib/funnel-events";

/**
 * **登録した人の段を1行送る**（ベータの計測、2026-10-03）。送るのは種類と時刻
 * （`candidates_shown` だけは待ち時間の ms も）。失敗しても画面は止めない。
 * 確認用ページ（UI ハーネス）では `useServerFn` が返ってこない偽物になるので、通信しない。
 */
export function useFunnelEvent(): (kind: MemberFunnelEvent, ms?: number) => void {
  const log = useServerFn(logAppEvent);
  const ref = useRef(log);
  ref.current = log;
  return useCallback((kind: MemberFunnelEvent, ms?: number) => {
    const withMs =
      ms !== undefined &&
      Number.isFinite(ms) &&
      (LATENCY_EVENTS as readonly string[]).includes(kind);
    try {
      void Promise.resolve(
        ref.current({
          data: {
            kind,
            ...(withMs ? { ms: Math.min(MAX_FUNNEL_LATENCY_MS, Math.max(0, Math.round(ms))) } : {}),
          },
        }),
      ).catch(() => undefined);
    } catch {
      /* 数えられなくても画面は止めない */
    }
  }, []);
}
