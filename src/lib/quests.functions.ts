import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { generateText, Output } from "ai";
import { z } from "zod";

type DbClient = SupabaseClient<Database>;

const MODEL = "google/gemini-3-flash-preview";

export type QuestRow = {
  id: string;
  quest_date: string;
  type: "color" | "category" | "count" | "review";
  title: string;
  description: string | null;
  criteria: { category_key?: string; color?: string; [k: string]: unknown };
  target_count: number;
  progress: number;
  completed: boolean;
  reward: string | null;
};

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
function rangeForDate(date: string): { start: string; end: string } {
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 86400 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

// 今日のスタンプ・復習から進捗を算出し、quest 行を更新して返す
async function computeProgress(
  supabase: DbClient,
  userId: string,
  q: QuestRow,
): Promise<QuestRow> {
  const { start, end } = rangeForDate(q.quest_date);
  let progress = 0;

  if (q.type === "review") {
    const { count } = await supabase
      .from("reviews")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("last_reviewed_at", start)
      .lt("last_reviewed_at", end);
    progress = count ?? 0;
  } else {
    // count / category / color はその日のスタンプ数（category はカテゴリ一致のみ）で近似
    const { data, count } = await supabase
      .from("stickers")
      .select("id, words(category_key)", { count: "exact" })
      .eq("user_id", userId)
      .gte("created_at", start)
      .lt("created_at", end);
    if (q.type === "category" && q.criteria?.category_key) {
      const rows = (data ?? []) as Array<{ words: { category_key: string | null } | null }>;
      progress = rows.filter((r) => r.words?.category_key === q.criteria.category_key).length;
    } else {
      progress = count ?? 0;
    }
  }

  const completed = progress >= q.target_count;
  const justCompleted = completed && !q.completed;
  if (progress !== q.progress || completed !== q.completed) {
    await supabase
      .from("quests")
      .update({
        progress,
        completed,
        completed_at: justCompleted ? new Date().toISOString() : (completed ? undefined : null),
      })
      .eq("id", q.id);
  }
  return { ...q, progress, completed };
}

const GenSchema = z.object({
  type: z.enum(["count", "category", "review"]),
  title: z.string().min(1),
  description: z.string().min(1),
  category_key: z.string().optional().default(""),
  target_count: z.number().int().min(1).max(5),
});

export const getTodayQuest = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<QuestRow> => {
    const { supabase, userId } = context;
    const date = todayStr();

    // 既存があれば進捗を更新して返す
    const { data: existing } = await supabase
      .from("quests")
      .select("id, quest_date, type, title, description, criteria, target_count, progress, completed, reward")
      .eq("user_id", userId)
      .eq("quest_date", date)
      .maybeSingle();
    if (existing) {
      return computeProgress(supabase, userId, existing as unknown as QuestRow);
    }

    // 生成: プロフィール + 直近カテゴリ偏り + SRS弱点
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_premium, level_goal")
      .eq("id", userId)
      .maybeSingle();
    const isPremium = profile?.is_premium ?? false;
    const levelGoal = profile?.level_goal ?? "TOCFL-2";

    const { data: recent } = await supabase
      .from("stickers")
      .select("words(category_key)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);
    const catCounts = new Map<string, number>();
    for (const r of (recent ?? []) as Array<{ words: { category_key: string | null } | null }>) {
      const c = r.words?.category_key;
      if (c) catCounts.set(c, (catCounts.get(c) ?? 0) + 1);
    }
    const topCats = [...catCounts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);

    const { count: dueCount } = await supabase
      .from("reviews")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .lte("due_at", new Date().toISOString());

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(key);

    const prompt = `言語学習アプリのデイリークエストを1件、日本語で作ってください。
ユーザー状況:
- 学習目標レベル: ${levelGoal}（TOCFL）
- 最近よく撮るカテゴリ: ${topCats.slice(0, 3).join(", ") || "なし"}
- 復習待ちの単語数: ${dueCount ?? 0}
ルール:
- type は count / category / review のいずれか（進捗が自動判定できるもの）
- count: 今日 N 個キャッチしよう（例「赤いものを3つ撮ろう」も count として target_count=3）
- category: 特定カテゴリを N 個（category_key を fruit/vegetable/animal/food/vehicle 等から指定）
- review: 今日 N 個復習しよう（復習待ちが多い時に有効）
- target_count は 1〜5、レベルに合った無理のない数
- title は短く楽しく、description は一言の理由付け`;

    let gen: z.infer<typeof GenSchema>;
    let iterations = 1;
    const r = await generateText({
      model: gateway(MODEL),
      prompt,
      experimental_output: Output.object({ schema: GenSchema }) as never,
    });
    gen =
      (r as unknown as { experimental_output?: z.infer<typeof GenSchema> }).experimental_output ??
      GenSchema.parse(JSON.parse(r.text));

    // Checker（プレミアムのみ）: レベル適合・実行可能性を一度だけ検証
    let accepted = 1;
    if (isPremium) {
      const CheckerSchema = z.object({ ok: z.boolean(), suggested_target: z.number().int().min(1).max(5).optional() });
      const chk = await generateText({
        model: gateway(MODEL),
        prompt: `次のデイリークエストは学習目標 ${levelGoal} のユーザーにとって、今日中に実行可能で無理のない難易度ですか？\nタイトル: ${gen.title}\n目標数: ${gen.target_count}\n難しすぎる/簡単すぎる場合は suggested_target を返してください。`,
        experimental_output: Output.object({ schema: CheckerSchema }) as never,
      });
      const verdict = (chk as unknown as { experimental_output?: z.infer<typeof CheckerSchema> }).experimental_output;
      iterations = 2;
      if (verdict && !verdict.ok && verdict.suggested_target) {
        gen = { ...gen, target_count: verdict.suggested_target };
        accepted = 1;
      }
    }

    const criteria: QuestRow["criteria"] =
      gen.type === "category" && gen.category_key ? { category_key: gen.category_key } : {};

    const { data: up, error: upErr } = await supabase
      .from("quests")
      .upsert(
        {
          user_id: userId,
          quest_date: date,
          type: gen.type,
          title: gen.title,
          description: gen.description,
          criteria,
          target_count: gen.target_count,
          reward: "✨",
        },
        { onConflict: "user_id,quest_date" },
      )
      .select("id, quest_date, type, title, description, criteria, target_count, progress, completed, reward")
      .single();
    if (upErr) throw new Error(upErr.message);

    await supabase.from("ai_runs").insert({
      user_id: userId,
      loop: "quest",
      iterations,
      accepted,
      meta: { date, type: gen.type, premium: isPremium },
    });

    return computeProgress(supabase, userId, up as unknown as QuestRow);
  });

// クライアントから明示的に進捗を再計算したい時（撮影/復習直後など）
export const refreshQuestProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<QuestRow | null> => {
    const { supabase, userId } = context;
    const date = todayStr();
    const { data: existing } = await supabase
      .from("quests")
      .select("id, quest_date, type, title, description, criteria, target_count, progress, completed, reward")
      .eq("user_id", userId)
      .eq("quest_date", date)
      .maybeSingle();
    if (!existing) return null;
    return computeProgress(supabase, userId, existing as unknown as QuestRow);
  });
