import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { askJev, jevAvailable } from "./jev.server";
import { candidateQuestion, rankByWanted } from "./jev-tasks";

/**
 * スキャンで見つかった候補を「いちばん調べたい見込み」の高い順に並べる。
 *
 * （オーナー指示 2026-09-22「typesafe の JEV はユーザーが撮影した時に単語の
 *  候補の中でユーザーが調べたい単語は確率…に活用して」）
 *
 * 画面は結果を先に出し、**これは後から**頼む（スキャンの待ち時間を延ばさない）。
 * 鍵が無い・時間切れ・自信が低いときは `order: null`（並べ替えない）。
 * 並べ替えはその人の画面の中だけで、何も保存しない。
 */
export const rankScanCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        items: z
          .array(
            z.object({
              headword: z.string().min(1).max(40),
              meaning: z.string().max(80).nullish(),
              kind: z.string().max(12).nullish(),
              confidence: z.number().min(0).max(1).optional(),
              owned: z.boolean().optional(),
            }),
          )
          .min(2)
          .max(24),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    if (!jevAvailable()) return { order: null, probs: null };
    const q = candidateQuestion(data.items.map((it) => ({ ...it, kind: it.kind ?? undefined })));
    const res = await askJev(q.state, q.questions, { timeoutMs: 2500 });
    const ranked = rankByWanted(data.items, res?.answers.wanted);
    return ranked ? { order: ranked.order, probs: ranked.probs } : { order: null, probs: null };
  });
