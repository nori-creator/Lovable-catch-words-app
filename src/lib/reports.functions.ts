import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * 辞書エラー報告 (A8)。「発音・意味・品詞が違う」をユーザーがその場で
 * 報告 → entry_reports に積み、管理画面のレビューキュー(自己改善パネル)で
 * 人間が確認する。ランダム監査では拾えない実利用者の指摘の受け皿。
 */

export type EntryReportKind = "pronunciation" | "meaning" | "pos" | "other";

const ReportInput = z.object({
  headword: z.string().min(1).max(80),
  kind: z.enum(["pronunciation", "meaning", "pos", "other"]),
  note: z.string().max(500).default(""),
});

export const reportEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ReportInput.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("entry_reports").insert({
      user_id: userId,
      headword: data.headword,
      kind: data.kind,
      note: data.note,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type EntryReport = {
  id: string;
  headword: string;
  kind: EntryReportKind;
  note: string;
  status: "open" | "resolved" | "dismissed";
  created_at: string;
};

async function assertAdmin(supabase: unknown, userId: string): Promise<void> {
  const { data: isAdmin, error } = await (
    supabase as {
      rpc: (fn: string, args: object) => Promise<{ data: boolean | null; error: { message: string } | null }>;
    }
  ).rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!isAdmin) throw new Error("Forbidden: admin role required");
}

/** 管理画面用: 未対応の報告一覧(service role・admin限定)。 */
export const listEntryReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EntryReport[]> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("entry_reports")
      .select("id, headword, kind, note, status, created_at")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as EntryReport[];
  });

const ResolveInput = z.object({
  id: z.string().uuid(),
  status: z.enum(["resolved", "dismissed"]),
});

/** 管理画面用: 報告を処理済み/却下にする(admin限定)。 */
export const resolveEntryReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ResolveInput.parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("entry_reports")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
