import { useCallback, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { logCandidatePick } from "@/lib/candidate-pick.functions";
import { MAX_CANDIDATE_RANK, type CandidatePickVia } from "@/lib/funnel-events";

/**
 * **候補を選んだ1回を送る**（`candidate_picked` + 何番目か、2026-10-03）。
 * 送るのは順位・候補の数・道だけ（語は送らない）。失敗しても画面は止めない。
 * 確認用ページ（UI ハーネス）では `useServerFn` が偽物になるので、通信しない。
 */
export function useCandidatePick(): (pick: {
  via: CandidatePickVia;
  rank: number;
  n: number;
}) => void {
  const log = useServerFn(logCandidatePick);
  const ref = useRef(log);
  ref.current = log;
  return useCallback((pick) => {
    if (!Number.isFinite(pick.n) || !Number.isFinite(pick.rank)) return;
    const n = Math.min(MAX_CANDIDATE_RANK, Math.max(1, Math.round(pick.n)));
    const rank = Math.min(n, Math.max(1, Math.round(pick.rank)));
    try {
      void Promise.resolve(ref.current({ data: { via: pick.via, rank, n } })).catch(
        () => undefined,
      );
    } catch {
      /* 数えられなくても画面は止めない */
    }
  }, []);
}
