/**
 * 図鑑のカード表示（カバーフロー）。（オーナー指示 2026-09-22）
 *
 * 絵のある札・字だけの札・場所のある札・記憶の印のある札を混ぜる。
 * `?at=N` で N 枚目を真ん中に送った形（送った途中の傾きも見るため）。
 * `?n=N` で札を N 枚に増やす（何百枚でも送りが引っかからないかを見るため）。
 */
import { useEffect } from "react";
import { DexCoverFlow } from "@/components/DexCoverFlow";
import { memoryBadgeMap } from "@/lib/memory-badge";
import { FIXTURES, makeSticker } from "./home";

export function DexCardsScene({ q }: { q: URLSearchParams }) {
  const n = Math.max(FIXTURES.length, Number(q.get("n") ?? 0));
  const items = Array.from({ length: n }, (_, i) =>
    makeSticker(FIXTURES[i % FIXTURES.length], i, i),
  );
  const memory = memoryBadgeMap(
    items.slice(0, 4).map((s, i) => ({
      sticker_id: s.id,
      retention: [96, 70, 40, 100][i],
      interval_days: [3, 1, 1, 30][i],
      ease: 2.5,
    })),
  );
  const at = Number(q.get("at") ?? 0);
  useEffect(() => {
    if (!at) return;
    const id = window.setTimeout(() => {
      const sc = document.querySelector(".dex-cf__scroller");
      const slot = document.querySelectorAll<HTMLElement>(".dex-cf__slot")[at];
      if (sc && slot) sc.scrollLeft = slot.offsetLeft + slot.offsetWidth / 2 - sc.clientWidth / 2;
    }, 50);
    return () => window.clearTimeout(id);
  }, [at]);
  return (
    <div className="px-4">
      <DexCoverFlow stickers={items} onOpen={() => {}} memory={memory} />
    </div>
  );
}
