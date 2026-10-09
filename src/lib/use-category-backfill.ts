import { useEffect } from "react";
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
 * - 1つのタブで1度だけ聞く（聞いた語の id をこの頁の中と `sessionStorage` に覚える）。
 *   AI が「その他」と答えた語（亮點など）を開くたびに聞き直さない。
 * - 待たせない: 画面を出してから少し後に、50語ずつ順に（最大 4 回）。
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
  useEffect(() => {
    if (!items || items.length === 0) return;
    restoreTried();
    const ids = reclassifyCandidates(items, lang).filter((id) => !tried.has(id));
    if (ids.length === 0) return;
    const batches = chunked(ids, RECLASSIFY_BATCH).slice(0, RECLASSIFY_MAX_CALLS);
    const timer = setTimeout(() => {
      // 送ると決めた時に覚える（待つ間に一覧が変わって取り消された分は、次の回に送る）。
      for (const b of batches) for (const id of b) tried.add(id);
      saveTried();
      void (async () => {
        let changed = 0;
        for (const wordIds of batches) {
          try {
            const r = await run({ data: { wordIds } });
            changed += r.updated.length;
            if (r.skipped === "consent" || r.skipped === "cap") break;
          } catch {
            break;
          }
        }
        if (changed > 0) void qc.invalidateQueries({ queryKey: ["stickers"] });
      })();
    }, 1500);
    // 送り始めた後は画面を離れても最後まで続ける（裏の仕事。結果は一覧の読み直しで届く）。
    return () => clearTimeout(timer);
    // items の参照が変わるたびに見直すが、聞いた語は `tried` で外れるので2度は聞かない。
  }, [items, lang, run, qc]);
}
