import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { reclassifyOtherWords } from "./category-backfill.functions";
import {
  RECLASSIFY_BATCH,
  RECLASSIFY_MAX_CALLS,
  chunked,
  reclassifyCandidates,
} from "./category-backfill";

/**
 * **図鑑を開いた時に、「その他」のまま保存された語を裏で1度だけ分け直す**
 * （決まりは `category-backfill.ts`、サーバは `category-backfill.functions.ts`）。
 *
 * - 1つのタブで1度だけ聞く（**実際に聞けた**語の id をこの頁の中と `sessionStorage` に覚える。
 *   同意が無い・枠に届いた・届かなかった束は覚えず、次の訪問で送る）。
 *   AI が「その他」と答えた語（亮點など）を開くたびに聞き直さない。
 * - 待たせない: 画面を出してから少し後に、50語ずつ順に（1回の訪問で最大 4 回。一覧が頁ごとに
 *   届いて走り直しても、回数は訪問ぜんぶで数える）。
 * - 同意が無い・枠に届いた・失敗した時は黙ってやめる（図鑑は「その他」のまま出る）。
 * - 1語でも分かれたら図鑑の一覧（`["stickers"]`）を読み直す。
 */
const TRIED_KEY = "cw:categoryBackfill:tried";
const tried = new Set<string>();
let restored = false;

function restoreTried() {
  if (restored) return;
  restored = true;
  try {
    const raw = sessionStorage.getItem(TRIED_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : null;
    if (Array.isArray(list)) for (const id of list) if (typeof id === "string") tried.add(id);
  } catch {
    // 覚えられない端末では、この頁の中だけ覚える。
  }
}

function saveTried() {
  try {
    sessionStorage.setItem(TRIED_KEY, JSON.stringify([...tried].slice(-1000)));
  } catch {
    // 同上
  }
}

type Item = Parameters<typeof reclassifyCandidates>[0][number];

export function useCategoryBackfill(items: readonly Item[] | undefined, lang: string | null) {
  const run = useServerFn(reclassifyOtherWords);
  const qc = useQueryClient();
  /**
   * 図鑑を開いている間に使ってよい残りの回数。一覧が頁ごとに届く・読み直すたびに効果は
   * 走り直すので、回数は1回の走りではなく**この訪問ぜんぶ**で数える。
   */
  const callsLeft = useRef(RECLASSIFY_MAX_CALLS);
  /** 送っている間は次を始めない（同じ語を重ねて送らない）。 */
  const running = useRef(false);
  useEffect(() => {
    if (!items || items.length === 0) return;
    if (running.current || callsLeft.current <= 0) return;
    restoreTried();
    const ids = reclassifyCandidates(items, lang).filter((id) => !tried.has(id));
    if (ids.length === 0) return;
    const batches = chunked(ids, RECLASSIFY_BATCH).slice(0, callsLeft.current);
    const timer = setTimeout(() => {
      running.current = true;
      void (async () => {
        let changed = 0;
        try {
          for (const wordIds of batches) {
            callsLeft.current -= 1;
            let r: Awaited<ReturnType<typeof run>>;
            try {
              r = await run({ data: { wordIds } });
            } catch {
              // 届かなかった束は覚えない（つながったら次の回に送る）。
              break;
            }
            // 同意が無い・枠に届いた時は、聞けていないので覚えない（同意の後・翌日に送る）。
            // AI が答えられなかった時も同じ（次の訪問で聞き直す）。
            if (r.skipped === "consent" || r.skipped === "cap" || r.skipped === "ai") break;
            // 実際に聞けた束だけを「聞いた」と覚える。
            for (const id of wordIds) tried.add(id);
            saveTried();
            changed += r.updated.length;
          }
        } finally {
          running.current = false;
        }
        if (changed > 0) void qc.invalidateQueries({ queryKey: ["stickers"] });
      })();
    }, 1500);
    // 送り始めた後は画面を離れても最後まで続ける（裏の仕事。結果は一覧の読み直しで届く）。
    return () => clearTimeout(timer);
    // items の参照が変わるたびに見直すが、聞いた語は `tried` で外れるので2度は聞かない。
  }, [items, lang, run, qc]);
}
