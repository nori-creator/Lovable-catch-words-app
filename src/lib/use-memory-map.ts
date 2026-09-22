import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMemoryOverview } from "./reviews.functions";
import { memoryBadgeMap } from "./memory-badge";
import { useMemo } from "react";

/**
 * 札の id → 記憶の印（`memory-badge.ts`）。
 *
 * **復習の画面と同じ問い合わせ鍵**（`["memory-overview"]`）を使う。
 * どちらかを開いていればもう一方は取り直さず、復習で採点したときの
 * 読み直し（`review.tsx` が同じ鍵を invalidate する）も図鑑に届く。
 * 読めなくても図鑑は出す — 印が出ないだけ。
 */
export function useMemoryBadges() {
  const fetchOverview = useServerFn(getMemoryOverview);
  const { data } = useQuery({
    queryKey: ["memory-overview"],
    queryFn: () => fetchOverview(),
    staleTime: 60_000,
    retry: false,
  });
  return useMemo(() => memoryBadgeMap(data?.words), [data]);
}
