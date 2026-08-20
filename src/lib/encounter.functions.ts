import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { normalizeExtras } from "./extras";
import { normalizeRoomWeights, roomMixFromCategories } from "./category";
import { estimateEncounter, TOCFL_BAND_SIZES, type RarityConfidence } from "./rarity";

/**
 * 「その言葉に、今週どのくらい出会いそうか」を実データで出す所。
 *
 * 数式そのものは `lib/rarity.ts`(時計もDBも持たない純粋な関数)。
 * ここがやるのは**材料を集めること**だけ:
 *
 *   1. 級ごとの語彙数 — 辞書から実際に数える
 *   2. その語の観測頻度 — 自前の `corpus_stats`(ニュース見出し由来のみ)
 *   3. 何人が撮ったか / 何人が活動しているか — 全利用者
 *   4. その人がどの部屋によく居るか — その人自身の `stickers`
 *
 * ## 全利用者を数えるのに管理用の接続が要る
 * `stickers` の RLS は**自分の行しか見せない**(`stickers_select_own`)。
 * 「何人がこの語を撮ったか」は自分の行だけでは絶対に出ないので、
 * `supabaseAdmin` で数える。返すのは**数だけ**で、誰が撮ったかは返さない。
 *
 * ## 人数を裸で返さない
 * 本番の利用者はまだ4人。「4人中3人が撮った」はほとんど個人を指す。
 * だから `observed_users` は、名乗りが「実測」になる規模(= 事前の重みが
 * 2割を切る人数)に育つまで **null で返す**。式の側も、その手前では
 * 「推定」としか名乗らない。
 */

const Input = z.object({ word_id: z.string().uuid() });

export type EncounterEstimate = {
  /** 今週1回以上出会う見込み(0〜1)。 */
  probability: number;
  stars: 1 | 2 | 3 | 4 | 5;
  /** **画面に必ず出す。** 推定か、混ぜたか、実測か。 */
  confidence: RarityConfidence;
  /** 実測と名乗れる規模になるまで null。 */
  observed_users: number | null;
  /** よく出会う部屋(多い順、最大3つ)。 */
  top_rooms: string[];
  /** 「台南」など。無ければ null。 */
  region_scope: string | null;
  /** 旬の月。通年なら空。 */
  season_months: number[];
};

/** 直近どれだけのコーパスを見るか。古すぎる観測は今の街を語らない。 */
const CORPUS_WINDOW_DAYS = 90;

/** 1日1回まで数え直す。カードを開くたびに全利用者を数えない。 */
const CACHE_HOURS = 24;

function todayIso(): string {
  return new Date().toISOString();
}

export const getEncounterEstimate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ context, data }): Promise<EncounterEstimate | null> => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: word } = await supabase
      .from("words")
      .select("id, headword, level, extras")
      .eq("id", data.word_id)
      .maybeSingle();
    if (!word) return null;

    const ex = normalizeExtras(word.extras);
    const cached = readCache(ex?.encounter);
    if (cached) return cached;

    // ── 1. 級ごとの語彙数を辞書から数える ──────────────────────────
    // `TOCFL_BAND_SIZES` は公開されている目安で、このアプリの辞書とは
    // 分布が違う(7,158語 / L1-3=729)。**自分が持っている物を数える。**
    const bands = await countBands(supabaseAdmin);

    // ── 2. 自前コーパスの観測 ─────────────────────────────────────
    // **`source='news'` だけ。** `ai_synth` は AI が作った文の頻度なので
    // 観測ではない。混ぜると「自分で書いた物を証拠にする」ことになる。
    const since = new Date(Date.now() - CORPUS_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
    const [wordRows, allRows] = await Promise.all([
      supabaseAdmin
        .from("corpus_stats")
        .select("count")
        .eq("source", "news")
        .eq("word", word.headword)
        .gte("day", since),
      supabaseAdmin.from("corpus_stats").select("count").eq("source", "news").gte("day", since),
    ]);
    const sum = (rows: { count: number | null }[] | null) =>
      (rows ?? []).reduce((a, r) => a + (r.count ?? 0), 0);
    const corpusWordCount = sum(wordRows.data);
    const corpusTotalCount = sum(allRows.data);

    // ── 3. 何人が撮ったか / 何人が活動しているか ─────────────────
    const [caught, active] = await Promise.all([
      supabaseAdmin.from("stickers").select("user_id").eq("word_id", word.id),
      supabaseAdmin.from("stickers").select("user_id"),
    ]);
    const caughtUsers = new Set((caught.data ?? []).map((r) => r.user_id)).size;
    const activeUsers = new Set((active.data ?? []).map((r) => r.user_id)).size;

    // ── 4. その人がどの部屋によく居るか ───────────────────────────
    // 自分の行だけでよいので、ここは普通の接続で足りる。
    const { data: mine } = await supabase
      .from("stickers")
      .select("words(category_key)")
      .eq("user_id", userId)
      .limit(500);
    const userScenes = roomMixFromCategories(
      ((mine ?? []) as unknown as Array<{ words: { category_key: string | null } | null }>).map(
        (r) => r.words?.category_key ?? null,
      ),
    );

    const wordScenes = normalizeRoomWeights(ex?.scene_weights ?? null);
    const seasonMonths = ex?.season_months ?? [];
    const regionScope = (ex?.region_scope ?? "").trim();

    const out = estimateEncounter({
      level: levelNumber(word.level),
      bands,
      corpusWordCount,
      corpusTotalCount,
      wordScenes,
      userScenes,
      seasonMonths: seasonMonths.length > 0 ? seasonMonths : null,
      month: new Date().getMonth() + 1,
      regionScope: regionScope || null,
      // 利用者の居場所はまだ持っていない。**知らないので下げない**
      // (`regionFactor` は空を渡すと補正を掛けない)。
      userRegion: null,
      caughtUsers,
      activeUsers,
    });

    const result: EncounterEstimate = {
      probability: out.probability,
      stars: out.stars,
      confidence: out.confidence,
      // **人数は「実測」と名乗れる規模になってから。**
      observed_users: out.confidence === "measured" ? out.observedUsers : null,
      top_rooms: topRooms(wordScenes),
      region_scope: regionScope || null,
      season_months: seasonMonths,
    };

    // 数え直しは1日1回まで。失敗しても答えは返す(保存はおまけ)。
    void supabaseAdmin
      .from("words")
      .update({ extras: { ...(ex ?? {}), encounter: { ...result, at: todayIso() } } as never })
      .eq("id", word.id)
      .then(({ error }) => {
        if (error) console.warn("encounter cache write failed", error.message);
      });

    return result;
  });

/** `"TOCFL-3"` → 3。読めなければ 2(いちばん多い帯)。 */
function levelNumber(level: string | null | undefined): number {
  const m = /(\d)/.exec(level ?? "");
  const n = m ? Number(m[1]) : Number.NaN;
  return Number.isFinite(n) && n >= 1 && n <= 6 ? n : 2;
}

/** 多い順に最大3つ。 */
function topRooms(scenes: Record<string, number> | null): string[] {
  if (!scenes) return [];
  return Object.entries(scenes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k);
}

/** 保存してある答えがまだ新しければ、それを使う。 */
function readCache(raw: unknown): EncounterEstimate | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Partial<EncounterEstimate> & { at?: string };
  if (typeof c.at !== "string" || typeof c.probability !== "number") return null;
  const age = Date.now() - new Date(c.at).getTime();
  if (!Number.isFinite(age) || age > CACHE_HOURS * 3_600_000) return null;
  return {
    probability: c.probability,
    stars: (c.stars ?? 3) as EncounterEstimate["stars"],
    confidence: (c.confidence ?? "estimate") as RarityConfidence,
    observed_users: c.observed_users ?? null,
    top_rooms: c.top_rooms ?? [],
    region_scope: c.region_scope ?? null,
    season_months: c.season_months ?? [],
  };
}

/**
 * 級ごとの語彙数を辞書から数える。
 * 数えられなければ公開されている目安に落ちる — **落ちても止まらない**。
 */
async function countBands(
  admin: { from: (t: string) => any }, // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<readonly number[]> {
  try {
    const { data } = await admin
      .from("dictionary_entries")
      .select("tocfl_level")
      .not("tocfl_level", "is", null)
      .limit(20_000);
    const rows = (data ?? []) as Array<{ tocfl_level: number | null }>;
    if (rows.length === 0) return TOCFL_BAND_SIZES;
    const counts = [0, 0, 0, 0, 0, 0];
    for (const r of rows) {
      const lv = r.tocfl_level ?? 0;
      if (lv >= 1 && lv <= 6) counts[lv - 1] += 1;
    }
    // 級が1つでも空だと順位が潰れる。そのときは目安に落ちる。
    return counts.every((c) => c > 0) ? counts : TOCFL_BAND_SIZES;
  } catch {
    return TOCFL_BAND_SIZES;
  }
}
