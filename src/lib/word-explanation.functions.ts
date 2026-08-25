import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { normalizeExtras } from "./extras";
import { explanationKey, pickExplanation, type ExplanationRow } from "./word-explanation";

/**
 * 語の解説を**共有キャッシュ**から引く / 置く。
 *
 * オーナー指示 2026-08-24:
 * > 「カードの解説や復習の解説や日記の解説が**ユーザーにストレスを感じさせない
 * >  速度**で実行したい」
 *
 * ## なぜ別の server fn にしたか
 * `getSticker` に混ぜなかったのは、解説だけを別に取り直したいから。
 * 裏で項目を1つずつ埋めていく間(`auto-fill.ts`)、札の写真や場所まで
 * 取り直す必要は無い。問い合わせの鍵を分けておけば、解説が届いたときに
 * 解説だけが描き直る。
 *
 * ## 移行が当たっていなくても壊さない
 * `word_explanations` はまだ流していない移行で作られる。表が無い環境では
 * **静かに「解説なし」を返す** — 呼ぶ側は古い `words.extras` に落ちるので、
 * いままでどおり動く(遅いままなだけ)。
 */

/**
 * 生成済みの型定義に無い表を触るための緩い形。
 * **`any` を撒かない** — 使う所だけを書いて、それ以外は型で止める。
 */
type LooseDb = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (
        k: string,
        v: string,
      ) => Promise<{
        data: Record<string, unknown>[] | null;
        error: { message: string } | null;
      }>;
    };
  };
};

const GetInput = z.object({
  word_id: z.string().uuid(),
  /** 解説を書く言語(= 表示言語)。 */
  explain_lang: z.string().min(1).max(16),
  /** 誰の母語向けか。 */
  l1: z.string().min(1).max(16),
});

export type WordExplanationResult = {
  /** その人に出す解説。無ければ null(呼ぶ側が作る)。 */
  picked: ExplanationRow | null;
  /**
   * 表がまだ無い(移行待ち)。
   * **黙って「解説なし」と区別する** — 移行待ちなら作りに行っても
   * 保存できないので、呼ぶ側が無駄なAIを呼ばずに済む。
   */
  unavailable: boolean;
};

export const getWordExplanation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => GetInput.parse(input))
  .handler(async ({ context, data }): Promise<WordExplanationResult> => {
    // `word_explanations` は生成済みの型定義より新しい表(移行
    // 20260824120000)。型を再生成するまでは緩いクライアントとして扱う
    // — `app_config` で既に使っている作法(`ai-provider.server.ts`)。
    const db = context.supabase as unknown as LooseDb;
    const { data: rows, error } = await db
      .from("word_explanations")
      .select("explain_lang, l1, meaning, example_translation, extras, source")
      .eq("word_id", data.word_id);
    if (error) {
      // 表がまだ無い = 移行待ち。**記録には残す**(黙って飲まない)。
      if (/word_explanations/.test(error.message)) {
        console.warn("getWordExplanation: 表がまだ無い", error.message);
        return { picked: null, unavailable: true };
      }
      throw new Error(error.message);
    }
    const parsed: ExplanationRow[] = (rows ?? []).map((r) => ({
      explain_lang: String(r.explain_lang ?? ""),
      l1: String(r.l1 ?? ""),
      meaning: String(r.meaning ?? ""),
      example_translation: (r.example_translation as string | null) ?? null,
      extras: normalizeExtras(r.extras),
      source: (r.source as string | null) ?? "ai",
    }));
    return {
      picked: pickExplanation(parsed, explanationKey(data.explain_lang, data.l1)),
      unavailable: false,
    };
  });

/**
 * 解説を共有キャッシュへ置く。
 *
 * **`updateWordExtras` から呼ぶ。** 呼ぶ側は今までどおり extras を送るだけで、
 * その中の `explain_lang` / `explain_l1` から置き場所が決まる。
 *
 * 上書きしてよい理由: 鍵が「語 × 解説の言語 × 母語」なので、**同じ鍵の行は
 * 同じ人向けの同じ解説**。他人の別の言語の解説を潰すことはない
 * (これが分ける前と決定的に違う所)。
 *
 * ただし**人が確かめた解説は上書きしない**。正確性の担保はそこに載る。
 */
export async function saveWordExplanation(
  admin: {
    from: (t: string) => {
      select: (c: string) => {
        eq: (
          k: string,
          v: string,
        ) => {
          eq: (
            k: string,
            v: string,
          ) => {
            eq: (k: string, v: string) => { maybeSingle: () => Promise<{ data: unknown }> };
          };
        };
      };
      upsert: (rows: unknown, opts: unknown) => Promise<{ error: { message: string } | null }>;
    };
  },
  input: {
    word_id: string;
    explain_lang: string;
    l1: string;
    meaning: string;
    example_translation?: string | null;
    extras: Record<string, unknown>;
  },
): Promise<{ saved: boolean; reason?: string }> {
  const key = explanationKey(input.explain_lang, input.l1);
  try {
    // 人が確かめた解説は触らない。
    const { data: existing } = await admin
      .from("word_explanations")
      .select("source")
      .eq("word_id", input.word_id)
      .eq("explain_lang", key.explainLang)
      .eq("l1", key.l1)
      .maybeSingle();
    if ((existing as { source?: string } | null)?.source === "verified") {
      return { saved: false, reason: "verified" };
    }
    const { error } = await admin.from("word_explanations").upsert(
      [
        {
          word_id: input.word_id,
          explain_lang: key.explainLang,
          l1: key.l1,
          meaning: input.meaning,
          example_translation: input.example_translation ?? null,
          extras: input.extras,
          source: "ai",
          updated_at: new Date().toISOString(),
        },
      ],
      { onConflict: "word_id,explain_lang,l1" },
    );
    if (error) {
      if (/word_explanations/.test(error.message)) {
        // 移行待ち。**黙って飲まない** — 記録には残す。
        console.warn("saveWordExplanation: 表がまだ無い", error.message);
        return { saved: false, reason: "migration" };
      }
      console.warn("saveWordExplanation failed", error.message);
      return { saved: false, reason: "error" };
    }
    return { saved: true };
  } catch (e) {
    // 解説の控えは**付け足し**。落ちてもカードの保存まで巻き込まない。
    console.warn("saveWordExplanation threw", e);
    return { saved: false, reason: "error" };
  }
}
