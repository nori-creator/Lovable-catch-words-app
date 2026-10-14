/**
 * **保存済みの語のチャンクを点検し直す**（オーナー報告 2026-10-14「この他にもたくさんのミス、間違いが
 * あるから一つ一つ点検して」）。開発者の「AI の設定」のボタンから、1回 20 語ずつ。
 *
 * - 点検は新しく作る時と同じ `checkUsageChunks`（`chunk-check.server.ts`）。
 * - どこまで進んだかは `app_config.chunk_recheck`（{ after: 最後に見た語の id, checked, changed }）に残す。
 *   最後まで行ったら `done: true`。`restart: true` で最初から。
 * - 点検が全部外した語は書き換えない（空にすると画面からチャンクの欄が消えるため。次に作り直した時に直る）。
 * - 管理者だけ（呼ぶ側の `admin-ai.functions.ts` で確かめる）。語は共有の表なのでサーバの鍵で書く。
 */
import { checkUsageChunks } from "./chunk-check.server";
import type { UsageChunk } from "./extras";
import { explanationLanguageName } from "./ai-provider.server";
import { normalizeUiLang } from "./i18n";
import { targetProfile } from "./target-profile";

export const CHUNK_RECHECK_KEY = "chunk_recheck";
const BATCH = 20;
const PARALLEL = 4;

export type ChunkRecheckState = {
  after: string | null;
  checked: number;
  changed: number;
  done: boolean;
};

export type ChunkRecheckResult = ChunkRecheckState & {
  /** この回に見た語と、変わったか。 */
  words: Array<{ headword: string; before: number; after: number; changed: boolean }>;
};

type WordRow = {
  id: string;
  headword: string;
  language: string | null;
  extras: Record<string, unknown> | null;
};

function readState(raw: unknown): ChunkRecheckState {
  const v = (raw ?? {}) as Partial<ChunkRecheckState>;
  return {
    after: typeof v.after === "string" ? v.after : null,
    checked: typeof v.checked === "number" ? v.checked : 0,
    changed: typeof v.changed === "number" ? v.changed : 0,
    done: v.done === true,
  };
}

export async function recheckStoredChunks(input: {
  restart?: boolean;
}): Promise<ChunkRecheckResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (
          k: string,
          v: string,
        ) => { maybeSingle: () => Promise<{ data: { value?: unknown } | null }> };
        not: (
          k: string,
          op: string,
          v: null,
        ) => {
          gt: (k: string, v: string) => unknown;
          order: (k: string) => {
            limit: (
              n: number,
            ) => Promise<{ data: WordRow[] | null; error: { message: string } | null }>;
          };
        };
      };
      upsert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
      update: (row: Record<string, unknown>) => {
        eq: (k: string, v: string) => Promise<{ error: { message: string } | null }>;
      };
    };
  };
  const saved = await db
    .from("app_config")
    .select("value")
    .eq("key", CHUNK_RECHECK_KEY)
    .maybeSingle();
  let state = input.restart ? readState(null) : readState(saved.data?.value);
  if (state.done) return { ...state, words: [] };

  // id 順に、チャンクのある語を 20 個。
  let q = supabaseAdmin
    .from("words")
    .select("id, headword, language, extras")
    .not("extras->usage_chunks", "is", null)
    .order("id", { ascending: true })
    .limit(BATCH);
  if (state.after) q = q.gt("id", state.after);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as WordRow[];

  const words: ChunkRecheckResult["words"] = [];
  for (let i = 0; i < rows.length; i += PARALLEL) {
    await Promise.all(
      rows.slice(i, i + PARALLEL).map(async (w) => {
        const chunks = (w.extras?.usage_chunks ?? []) as UsageChunk[];
        if (!Array.isArray(chunks) || chunks.length === 0) return;
        const profile = targetProfile(w.language);
        const reader = explanationLanguageName(
          normalizeUiLang(w.extras?.explain_lang as string | undefined),
        );
        const checked = await checkUsageChunks({
          headword: w.headword,
          languageName: profile.promptName,
          readerName: reader,
          levelGoal: profile.levels.toStored(2),
          posRule: profile.chunkPrompt.posRule,
          grammarRule: profile.chunkPrompt.formulaGrammar,
          chunks,
        });
        const changed = checked.length > 0 && JSON.stringify(checked) !== JSON.stringify(chunks);
        if (changed) {
          const res = await db
            .from("words")
            .update({ extras: { ...(w.extras ?? {}), usage_chunks: checked } })
            .eq("id", w.id);
          if (res.error)
            console.warn("[chunk-recheck] write failed", w.headword, res.error.message);
        }
        words.push({
          headword: w.headword,
          before: chunks.length,
          after: checked.length || chunks.length,
          changed,
        });
      }),
    );
  }

  state = {
    after: rows.length ? rows[rows.length - 1].id : state.after,
    checked: state.checked + words.length,
    changed: state.changed + words.filter((w) => w.changed).length,
    done: rows.length < BATCH,
  };
  await db
    .from("app_config")
    .upsert({ key: CHUNK_RECHECK_KEY, value: state, updated_at: new Date().toISOString() });
  return { ...state, words };
}
