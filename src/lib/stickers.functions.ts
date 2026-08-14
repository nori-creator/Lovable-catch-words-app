import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { pregenerateDistractors } from "./reviews.functions";
import { buildBranchPlan } from "./wordtree";
import { normalizeCategory } from "./category";
import { isTruncated } from "./pagination";
import {
  ExtrasSchema,
  normalizeExtras,
  hasExtrasContent,
  mergeExtras,
  type WordExtrasDTO,
} from "./extras";

// WordExtrasDTO / extras の正規化は src/lib/extras.ts に一本化(re-export)。
export type { WordExtrasDTO } from "./extras";

export type PlaceholderCredit = { name?: string; link?: string; source?: string };

export type StickerWithWord = {
  id: string;
  word_id: string;
  caption: string | null;
  location_name: string | null;
  lat: number | null;
  lng: number | null;
  taken_at: string;
  created_at: string;
  encounter_count: number;
  object_url: string | null;
  cutout_url: string | null;
  selfie_url: string | null;
  /** Small grid thumbnails (`${path}.thumb.webp`) — null for older stickers. */
  object_thumb_url: string | null;
  cutout_thumb_url: string | null;
  /** 'photo' | 'text' | 'voice' — non-photo catches are ghosts (§5.3). */
  capture_type: string;
  /** Signed URL of the temporary stand-in image for ghosts. */
  placeholder_url: string | null;
  placeholder_credit: PlaceholderCredit | null;
  /** §6 word tree: branch plan frozen at save time (getSticker only). */
  branch_plan?: Array<{ type: string; zh: string; ja?: string }> | null;
  /** §6 word tree: completed reviews = unlocked branch count (getSticker only). */
  review_count?: number;
  word: {
    headword: string;
    reading_zhuyin: string | null;
    pinyin: string | null;
    meaning_ja: string;
    part_of_speech: string | null;
    example_sentence: string | null;
    example_translation: string | null;
    level: string | null;
    category_key: string | null;
    silhouette_emoji: string | null;
    extras: WordExtrasDTO | null;
  };
};

type SignedUrlsClient = {
  storage: {
    from: (b: string) => {
      createSignedUrls: (
        p: string[],
        e: number,
      ) => Promise<{
        data: Array<{ path: string | null; signedUrl: string | null; error: string | null }> | null;
      }>;
    };
  };
};

/**
 * Sign many storage paths in a single API call (avoids the N+1 of one
 * createSignedUrl round-trip per image) and return a path→URL lookup.
 */
const SIGN_BATCH = 500;

async function signUrlMap(
  supabase: SignedUrlsClient,
  paths: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => !!p))];
  const map = new Map<string, string>();
  if (unique.length === 0) return map;
  // **まとめて投げすぎない。** 1件につき最大6本(写真・切り抜き・自撮り・
  // 代替画像・サムネ2枚)署名するので、3000件まで読むようにした結果
  // 最大18000本を1回の呼び出しに詰め込むことになった。要求も応答も
  // 数MBになり、ここで詰まると図鑑が丸ごと出てこない。
  for (let i = 0; i < unique.length; i += SIGN_BATCH) {
    const chunk = unique.slice(i, i + SIGN_BATCH);
    const { data } = await supabase.storage.from("stickers").createSignedUrls(chunk, 60 * 60 * 6);
    for (const row of data ?? []) {
      if (row.path && row.signedUrl && !row.error) map.set(row.path, row.signedUrl);
    }
  }
  return map;
}

/**
 * Per-sticker encounter counts, tolerant of the pre-migration schema
 * (encounter_count column may not exist yet — then everything is 0).
 */
async function encounterCounts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  ids: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (ids.length === 0) return map;
  // **欲しい id だけを聞く。** 以前はユーザーの全行を引いていたので、
  // PostgREST の 1000 行で切られていた。図鑑を3000件まで読むように
  // した以上、切られた先の語は再会の回数が 0 に見える — しかも
  // どれが 0 になるかは並び順しだいで**読むたびに変わる**。
  for (let i = 0; i < ids.length; i += SIGN_BATCH) {
    const chunk = ids.slice(i, i + SIGN_BATCH);
    const { data, error } = await supabase
      .from("stickers")
      .select("id, encounter_count")
      .in("id", chunk)
      .gt("encounter_count", 0);
    if (error) return map; // 再会の印は飾り。取れなければ黙って諦める。
    for (const row of data ?? []) map.set(row.id, row.encounter_count ?? 0);
  }
  return map;
}

/**
 * 1回の問い合わせで受け取る件数。
 *
 * PostgREST は `db-max-rows`(既定1000)で切るので、これより大きくしても
 * 意味がない。**1000は「1ページの大きさ」であって「合計の上限」ではない。**
 */
const STICKER_PAGE_SIZE = 1000;

/**
 * 全部で受け取る件数の天井。
 *
 * ## なぜ天井が要るか
 * 図鑑は「集めたものが全部ある」ことが値打ちの画面なので、本来は
 * 上限で終わりにできない。だからページを繰って全部取る。
 * ただし1件ごとに署名URLを6本(写真・切り抜き・自撮り・サムネ2枚…)
 * 作るので、**際限なく取ると1回の起動が際限なく重くなる**。
 * どこかで止める必要がある。
 *
 * 3000件は「毎日1語キャッチして8年ぶん」。ここに届く人が出たら、
 * そのときは本当のページ送り(古い方を後から読む)を作る。
 * それまでは、天井に当たったことを画面に出して**黙って消えない**ようにする。
 */
const STICKER_TOTAL_CAP = 3000;

export const listMyStickers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const wordCols =
      "words(headword, reading_zhuyin, pinyin, meaning_ja, part_of_speech, example_sentence, example_translation, level, category_key, silhouette_emoji, extras)";
    const fullCols = `id, word_id, caption, location_name, lat, lng, taken_at, created_at, object_image_url, cutout_image_url, selfie_image_url, capture_type, placeholder_image_url, placeholder_credit, ${wordCols}`;
    // Migration not applied yet — fall back to the photo-only shape.
    const legacyCols = `id, word_id, caption, location_name, lat, lng, taken_at, created_at, object_image_url, cutout_image_url, selfie_image_url, ${wordCols}`;

    /**
     * 1ページ取る。
     *
     * **並びに `id` を足すこと。** `created_at` だけでは同点になりうるし、
     * ページを繰っている最中に1件増えると DESC の位置がずれて、
     * 999番目の行が次のページの先頭にもう一度出てくる(= 同じ id が2つ
     * 並び、代わりに古い1件が黙って落ちる)。別のタブでキャッチしたり、
     * オフラインキューが流れたりすると現実に起きる。
     *
     * `count` は最初のページでだけ数える。毎ページ数えると、3000件の人が
     * COUNT(*) を3回走らせることになる(2回目以降は誰も見ない)。
     */
    const page = async (cols: string, from: number, withCount: boolean) =>
      await supabase
        .from("stickers")
        .select(cols, withCount ? { count: "exact" } : undefined)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, from + STICKER_PAGE_SIZE - 1);

    let cols = fullCols;
    let first = await page(cols, 0, true);
    if (first.error && /capture_type|placeholder/.test(first.error.message)) {
      cols = legacyCols;
      first = await page(cols, 0, true);
    }
    // **最初のページの失敗だけが致命的。** ここで読めなければ何も出せない。
    if (first.error) throw new Error(first.error.message);

    const count = first.count;
    const acc = (first.data ?? []) as unknown[];
    const seen = new Set<string>();
    for (const r of acc) seen.add((r as { id: string }).id);

    /**
     * 2ページ目から先。**途中で失敗しても、そこまでを返す。**
     *
     * 以前はここで throw していた。1000件読めているのに、1001件目の
     * 問い合わせがこけただけで**図鑑が丸ごとエラー画面になる**。
     * 手元にあるものを見せないほうがよほど悪い。
     *
     * 範囲外を頼むと PostgREST は空配列ではなく 416 を返す。つまり
     * 「空が来たら終わり」では終われない場合がある(数えたあとに
     * 誰かが消したときなど)。失敗はすべて「そこで打ち切り」に倒す。
     */
    let stoppedEarly = false;
    if (typeof count === "number") {
      const want = Math.min(count, STICKER_TOTAL_CAP);
      while (acc.length < want) {
        const next = await page(cols, acc.length, false);
        if (next.error) {
          stoppedEarly = true;
          break;
        }
        const rows = (next.data ?? []) as unknown[];
        if (rows.length === 0) {
          stoppedEarly = acc.length < want;
          break;
        }
        // 並びがずれて同じ行が再度来ても二重に積まない。
        for (const r of rows) {
          const id = (r as { id: string }).id;
          if (seen.has(id)) continue;
          seen.add(id);
          acc.push(r);
        }
      }
    }
    const data = acc as typeof first.data;

    type RowShape = {
      id: string;
      word_id: string;
      caption: string | null;
      location_name: string | null;
      lat: number | null;
      lng: number | null;
      taken_at: string;
      created_at: string;
      object_image_url: string | null;
      cutout_image_url: string | null;
      selfie_image_url: string | null;
      capture_type?: string | null;
      placeholder_image_url?: string | null;
      placeholder_credit?: PlaceholderCredit | null;
      words: (Omit<StickerWithWord["word"], "extras"> & { extras?: unknown }) | null;
    };
    const rows = (data ?? []) as unknown as RowShape[];
    // 総数は最初のページが返した `count`。
    //
    // **`count` が取れなかったときの上限は「1ページ分」。** ここを天井
    // (3000)にしていたせいで、1000件だけ受け取って `truncated: false` に
    // なる道が残っていた — この周で潰したはずの「黙って途中で止まる」が、
    // 細い経路で生き残っていた。
    const total = typeof count === "number" ? count : null;
    const truncated =
      stoppedEarly ||
      isTruncated(total, rows.length, total == null ? STICKER_PAGE_SIZE : STICKER_TOTAL_CAP);
    // Also sign the `${path}.thumb.webp` companions (uploaded since 2026-07).
    // Missing thumbs (old stickers) simply return error rows and drop out of
    // the map — the client falls back to the full image.
    const thumbOf = (p: string | null | undefined) => (p ? `${p}.thumb.webp` : null);
    const [urlMap, counts] = await Promise.all([
      signUrlMap(
        supabase,
        rows.flatMap((r) => [
          r.object_image_url,
          r.cutout_image_url,
          r.selfie_image_url,
          r.placeholder_image_url,
          thumbOf(r.object_image_url),
          thumbOf(r.cutout_image_url),
        ]),
      ),
      encounterCounts(
        supabase,
        rows.map((r) => r.id),
      ),
    ]);

    const result: StickerWithWord[] = [];
    for (const row of rows) {
      const wRaw = row.words;
      if (!wRaw) continue;
      result.push({
        id: row.id,
        word_id: row.word_id,
        caption: row.caption,
        location_name: row.location_name,
        lat: row.lat,
        lng: row.lng,
        taken_at: row.taken_at,
        created_at: row.created_at,
        encounter_count: counts.get(row.id) ?? 0,
        object_url: row.object_image_url ? (urlMap.get(row.object_image_url) ?? null) : null,
        cutout_url: row.cutout_image_url ? (urlMap.get(row.cutout_image_url) ?? null) : null,
        selfie_url: row.selfie_image_url ? (urlMap.get(row.selfie_image_url) ?? null) : null,
        object_thumb_url: row.object_image_url
          ? (urlMap.get(`${row.object_image_url}.thumb.webp`) ?? null)
          : null,
        cutout_thumb_url: row.cutout_image_url
          ? (urlMap.get(`${row.cutout_image_url}.thumb.webp`) ?? null)
          : null,
        capture_type: row.capture_type ?? "photo",
        placeholder_url: row.placeholder_image_url
          ? (urlMap.get(row.placeholder_image_url) ?? null)
          : null,
        placeholder_credit: row.placeholder_credit ?? null,
        word: { ...wRaw, extras: normalizeExtras(wRaw.extras) },
      });
    }
    return { items: result, truncated, total };
  });

export const getSticker = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const cols = (withGhost: boolean) =>
      `id, user_id, word_id, caption, location_name, lat, lng, taken_at, created_at, object_image_url, cutout_image_url, selfie_image_url${withGhost ? ", capture_type, placeholder_image_url, placeholder_credit, branch_plan" : ""}, words(headword, reading_zhuyin, pinyin, meaning_ja, part_of_speech, example_sentence, example_translation, level, category_key, silhouette_emoji, extras)`;

    // Try to read as owner first (RLS-scoped); retry without ghost columns
    // when the migration hasn't been applied.
    let { data: row, error } = await supabase
      .from("stickers")
      .select(cols(true))
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    let ghostCols = true;
    if (error && /capture_type|placeholder|branch_plan/.test(error.message)) {
      ghostCols = false;
      ({ data: row, error } = await supabase
        .from("stickers")
        .select(cols(false))
        .eq("id", data.id)
        .eq("user_id", userId)
        .maybeSingle());
    }
    if (error) throw new Error(error.message);

    // If not the owner, fall back to admin read ONLY when the sticker is
    // attached to a post the viewer may see (public / friends-mutual / own).
    // Without this check any authenticated user with a sticker UUID could
    // read private lat/lng/caption for un-posted stickers.
    const isOwner = !!row;
    if (!row) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      // Find any post referencing this sticker that the viewer can see.
      const { data: postRow, error: postErr } = await supabaseAdmin
        .from("posts")
        .select("id, user_id, visibility")
        .eq("sticker_id", data.id)
        .maybeSingle();
      if (postErr) throw new Error(postErr.message);
      if (!postRow) return null;
      let canSee = postRow.user_id === userId || postRow.visibility === "public";
      if (!canSee && postRow.visibility === "friends") {
        const { data: mutual } = await supabaseAdmin.rpc("are_mutual_followers", {
          _a: userId,
          _b: postRow.user_id,
        });
        canSee = !!mutual;
      }
      if (!canSee) return null;
      const res = await supabaseAdmin
        .from("stickers")
        .select(cols(ghostCols))
        .eq("id", data.id)
        .maybeSingle();
      if (res.error) throw new Error(res.error.message);
      row = res.data as typeof row;
    }
    if (!row) return null;
    type StickerRow = {
      id: string;
      user_id: string;
      word_id: string;
      caption: string | null;
      location_name: string | null;
      lat: number | null;
      lng: number | null;
      taken_at: string;
      created_at: string;
      object_image_url: string | null;
      cutout_image_url: string | null;
      selfie_image_url: string | null;
      capture_type?: string | null;
      placeholder_image_url?: string | null;
      placeholder_credit?: PlaceholderCredit | null;
      branch_plan?: unknown;
      words: (Omit<StickerWithWord["word"], "extras"> & { extras?: unknown }) | null;
    };
    const r = row as unknown as StickerRow;

    // §6 word tree: unlock count = completed reviews (monotonic).
    let reviewCount = 0;
    if (isOwner) {
      const { count } = await supabase
        .from("review_history")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("sticker_id", r.id);
      reviewCount = count ?? 0;
    }
    // Non-owners sign URLs via the admin client (their RLS can't see the
    // owner's storage objects); the selfie stays private to the owner.
    let signer: SignedUrlsClient = supabase;
    if (!isOwner) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      signer = supabaseAdmin as unknown as SignedUrlsClient;
    }
    const [urlMap, counts] = await Promise.all([
      signUrlMap(signer, [
        r.object_image_url,
        r.cutout_image_url,
        isOwner ? r.selfie_image_url : null,
        r.placeholder_image_url ?? null,
      ]),
      encounterCounts(supabase, [r.id]),
    ]);

    const wRaw = r.words;
    if (!wRaw) return null;
    const res: StickerWithWord = {
      id: r.id,
      word_id: r.word_id,
      // Non-owners see the sticker via a post — the post carries its own
      // caption. Private sticker-level fields (caption, precise coordinates,
      // location name, selfie) stay owner-only.
      caption: isOwner ? r.caption : null,
      location_name: isOwner ? r.location_name : null,
      lat: isOwner ? r.lat : null,
      lng: isOwner ? r.lng : null,
      taken_at: r.taken_at,
      created_at: r.created_at,
      encounter_count: counts.get(r.id) ?? 0,
      object_url: r.object_image_url ? (urlMap.get(r.object_image_url) ?? null) : null,
      cutout_url: r.cutout_image_url ? (urlMap.get(r.cutout_image_url) ?? null) : null,
      selfie_url: isOwner && r.selfie_image_url ? (urlMap.get(r.selfie_image_url) ?? null) : null,

      // Detail view always shows the full-resolution image.
      object_thumb_url: null,
      cutout_thumb_url: null,
      capture_type: r.capture_type ?? "photo",
      placeholder_url: r.placeholder_image_url
        ? (urlMap.get(r.placeholder_image_url) ?? null)
        : null,
      placeholder_credit: r.placeholder_credit ?? null,
      branch_plan: (r.branch_plan as StickerWithWord["branch_plan"]) ?? null,
      review_count: reviewCount,
      word: { ...wRaw, extras: normalizeExtras(wRaw.extras) },
    };
    return res;
  });

const SaveStickerInput = z.object({
  word: z.object({
    headword: z.string().min(1),
    reading_zhuyin: z.string().optional().default(""),
    pinyin: z.string().optional().default(""),
    meaning_ja: z.string().min(1),
    part_of_speech: z.string().optional().default("名詞"),
    level: z.string().optional().default("TOCFL-2"),
    category_key: z.string().min(1),
    example_sentence: z.string().optional().default(""),
    example_translation: z.string().optional().default(""),
    extras: ExtrasSchema.optional(),
  }),
  language: z.string().default("zh-TW"),
  object_path: z.string().nullable().optional(),
  cutout_path: z.string().nullable().optional(),
  selfie_path: z.string().nullable().optional(),
  caption: z.string().nullable().optional(),
  location_name: z.string().nullable().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
});

export type WordUpsertInput = z.infer<typeof SaveStickerInput>["word"] & {
  entry_type?: "word" | "phrase";
};

/**
 * Shared word upsert: find by (language, headword) or insert as source='ai'.
 * Used by both photo catches (saveSticker) and ghost catches (§5.2/5.3).
 */
export async function upsertWord(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  word: WordUpsertInput,
  language: string,
): Promise<string> {
  const { data: existing } = await supabase
    .from("words")
    .select("id")
    .eq("language", language)
    .eq("headword", word.headword)
    .maybeSingle();

  let wordId: string | undefined = existing?.id;
  if (!wordId) {
    // カテゴリー正規化(2026-07-23の不具合修正):
    // 以前はここで「categories 表に無いキー→ other」に落とすだけだった。
    // 表には20キーしか無くコードは54キーを使っていたため、body/kitchenware/
    // medicine 等に分類された語がすべて「その他」に潰れていた。
    // いまは (1) 見出し語から確実に補正 → (2) それでも表に無ければ other、の順。
    // 表の不足キーは 20260723090000_seed_missing_categories.sql で投入済み。
    let categoryKey: string = normalizeCategory(word.headword, word.category_key);
    const { data: catRow } = await supabase
      .from("categories")
      .select("key")
      .eq("key", categoryKey)
      .maybeSingle();
    if (!catRow) categoryKey = "other";

    const row = {
      language,
      headword: word.headword,
      reading_zhuyin: word.reading_zhuyin || null,
      pinyin: word.pinyin || null,
      meaning_ja: word.meaning_ja,
      part_of_speech: word.part_of_speech,
      level: word.level,
      category_key: categoryKey,
      example_sentence: word.example_sentence || null,
      example_translation: word.example_translation || null,
      extras: (word.extras ?? {}) as never,
      source: "ai",
      entry_type: word.entry_type ?? "word",
    };
    let ins = await supabase.from("words").insert(row).select("id").single();
    if (ins.error && /entry_type/.test(ins.error.message)) {
      const { entry_type: _entryType, ...withoutEntryType } = row;
      ins = await supabase.from("words").insert(withoutEntryType).select("id").single();
    }
    if (ins.error) throw new Error(ins.error.message);
    wordId = ins.data.id as string;

    // Pre-generate quiz distractors off the review path. Fire-and-forget:
    // reviews fall back to the user's own deck when this hasn't landed.
    void pregenerateDistractors(
      supabase,
      userId,
      wordId,
      word.headword,
      word.meaning_ja,
      categoryKey,
    ).catch(() => {});
  } else if (word.extras && hasExtrasContent(word.extras)) {
    // Update extras for an existing word when the AI generated rich ones.
    //
    // The words UPDATE RLS policy only covers source='ai', so writing through
    // the user client silently updated 0 rows for verified dictionary words —
    // that is why a caught TOCFL word showed only 意味 + 例文 and none of the
    // rich sections (コロケーション/類義語/語源/覚え方…): its extras never
    // persisted. Write via the service role instead, and — like reportWordIssue,
    // keeping constitution §2-1 intact — only ever touch the `extras` supplement
    // (the UI already labels it AI-generated), never verified base fields.
    // Merge over any existing extras so a sparser later catch can't wipe a
    // richer earlier one.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: cur } = await supabaseAdmin
      .from("words")
      .select("extras")
      .eq("id", wordId)
      .maybeSingle();
    const merged = mergeExtras(cur?.extras as WordExtrasDTO | null, word.extras);
    await supabaseAdmin
      .from("words")
      .update({ extras: merged as never })
      .eq("id", wordId);
  }
  return wordId;
}

export const saveSticker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SaveStickerInput.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    const wordId = await upsertWord(supabase, userId, data.word, data.language);

    // Guard against cross-account storage path spoofing: only accept paths
    // rooted under the caller's own uid folder (the client upload convention).
    const ownPath = (p: string | null | undefined): string | null => {
      if (!p) return null;
      return p.startsWith(`${userId}/`) ? p : null;
    };

    // §6 word tree: freeze the branch plan at save time so later extras
    // regenerations don't reshuffle already-unlocked branches.
    const branchPlan = buildBranchPlan(data.word.extras);
    const baseRow = {
      user_id: userId,
      word_id: wordId,
      language: data.language,
      object_image_url: ownPath(data.object_path),
      cutout_image_url: ownPath(data.cutout_path),
      selfie_image_url: ownPath(data.selfie_path),
      caption: data.caption ?? null,
      location_name: data.location_name ?? null,
      lat: data.lat ?? null,
      lng: data.lng ?? null,
    };
    let res = await supabase
      .from("stickers")
      .insert({ ...baseRow, branch_plan: branchPlan as never })
      .select("id")
      .single();
    if (res.error && /branch_plan/.test(res.error.message)) {
      res = await supabase.from("stickers").insert(baseRow).select("id").single();
    }
    if (res.error) throw new Error(res.error.message);

    // KPI: was this the user's very first catch? (onboarding §2 — the client
    // shows the SRS teaser「明日この単語を覚えてるか聞くね」.)
    const { count } = await supabase
      .from("stickers")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    const firstCatch = (count ?? 0) === 1;
    if (firstCatch) {
      await supabase.from("usage_events").insert({ user_id: userId, kind: "first_catch" });
    }
    return { id: res.data.id, word_id: wordId, first_catch: firstCatch };
  });

const UpdateExtrasInput = z.object({
  word_id: z.string().uuid(),
  extras: ExtrasSchema,
  patch: z
    .object({
      reading_zhuyin: z.string().optional(),
      pinyin: z.string().optional(),
      part_of_speech: z.string().optional(),
      level: z.string().optional(),
      example_sentence: z.string().optional(),
      example_translation: z.string().optional(),
      // 表示言語を切り替えたとき、意味と例文訳もその言語に入れ替える。
      // (verified 語は下の source チェックで従来どおり保護される)
      meaning_ja: z.string().optional(),
    })
    .optional(),
});

export const updateWordExtras = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateExtrasInput.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    // Ownership check (docs/design/03 §1): words is a shared table — only a
    // user who owns a sticker referencing this word may edit it.
    const { data: owned } = await supabase
      .from("stickers")
      .select("id")
      .eq("user_id", userId)
      .eq("word_id", data.word_id)
      .limit(1)
      .maybeSingle();
    if (!owned) throw new Error("この単語を編集する権限がありません");

    // The words UPDATE policy only covers source='ai', so writing through the
    // user client silently updates 0 rows for dictionary (verified) words —
    // their extras never persisted and the enrichment AI call was re-paid on
    // every open. Write via the service role instead, with a hard rule that
    // keeps constitution §2-1 intact: verified base fields (reading, meaning,
    // examples…) are never touched — verified words only ever gain `extras`,
    // which the UI already labels as AI-generated supplements.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: word, error: readErr } = await supabaseAdmin
      .from("words")
      .select("id, source, extras")
      .eq("id", data.word_id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!word) throw new Error("単語が見つかりません");

    // ExtrasSchema に無いキー(復習の足場キャッシュ speaking_scaffold_* など)は
    // parse で落ちてしまう。既存の生 extras に重ねて書き、作り直しのたびに
    // AI呼び出しを再課金しないようにする。
    const prevRaw = (word as { extras?: unknown }).extras;
    const merged =
      prevRaw && typeof prevRaw === "object" && !Array.isArray(prevRaw)
        ? { ...(prevRaw as Record<string, unknown>), ...data.extras }
        : data.extras;
    const update: Record<string, unknown> = { extras: merged as never };
    if (data.patch && word.source !== "verified") {
      for (const [k, v] of Object.entries(data.patch)) {
        if (v !== undefined && v !== "") update[k] = v;
      }
    }
    const { error } = await supabaseAdmin
      .from("words")
      .update(update as never)
      .eq("id", data.word_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- User feedback: report a wrong word (§ self-improvement) -----------------
//
// Captures user-reported issues into ai_runs (loop="word_report") so the
// human/AI improvement loop has real signal. The AI auto-fix (regenerating the
// card) is driven client-side via generateCard + updateWordExtras; this just
// records that a report happened, for review and metrics.
const ReportInput = z.object({
  word_id: z.string().uuid(),
  headword: z.string().min(1).max(64),
  note: z.string().max(300).optional().default(""),
});

export const reportWordIssue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ReportInput.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await supabase
      .from("ai_runs")
      .insert({
        user_id: userId,
        loop: "word_report",
        iterations: 1,
        accepted: 0,
        meta: { word_id: data.word_id, headword: data.headword, note: data.note },
      })
      .then(
        () => {},
        () => {},
      );
    return { ok: true };
  });

// --- B3 カード削除 -----------------------------------------------------------
const DeleteStickerInput = z.object({ sticker_id: z.string().uuid() });

/**
 * 図鑑カードの削除。所有者のみ。stickers を消すと reviews/encounters/
 * review_history は FK で連鎖削除される(deleteMyAccount で検証済みの順序)。
 * 画像は自分のフォルダ配下だけ storage から掃除する。共有 words は残す
 * (他ユーザーのカードが参照している可能性があるため)。
 */
export const deleteSticker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DeleteStickerInput.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: st, error: readErr } = await supabase
      .from("stickers")
      .select("id, object_image_url, cutout_image_url, selfie_image_url")
      .eq("id", data.sticker_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!st) throw new Error("このカードは削除できません");

    // Storage cleanup: only paths under the caller's own folder.
    const row = st as {
      object_image_url: string | null;
      cutout_image_url: string | null;
      selfie_image_url: string | null;
    };
    const paths = [row.object_image_url, row.cutout_image_url, row.selfie_image_url].filter(
      (p): p is string => !!p && p.startsWith(`${userId}/`),
    );
    // thumbnails share the origin path with a suffix (cutout.ts:thumbPath).
    const withThumbs = paths.flatMap((p) => [p, `${p}.thumb.webp`]);
    if (withThumbs.length > 0) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.storage
        .from("stickers")
        .remove(withThumbs)
        .catch(() => {});
    }

    const { error } = await supabase
      .from("stickers")
      .delete()
      .eq("id", data.sticker_id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- B3 写真の差し替え -------------------------------------------------------
const ReplacePhotoInput = z.object({
  sticker_id: z.string().uuid(),
  object_path: z.string().min(1),
});

/**
 * 図鑑カードの実写を差し替える。object_image_url を更新し、古い切り抜きは
 * 消す(新しい写真から作り直せる)。自撮り・キャプション・場所は保持。
 * attachPhotoToSticker と違い selfie を消さないので通常カードの写真変更向け。
 */
export const replaceStickerPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ReplacePhotoInput.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    if (!data.object_path.startsWith(`${userId}/`)) {
      throw new Error("不正な画像パスです");
    }
    // **`taken_at` は書き換えない。**
    //
    // ここは「カードの写真を差し替える」操作であって、「その言葉に
    // 出会った日」を変える操作ではない。以前は今の時刻で上書きして
    // いたので、写真を1枚替えただけで**士林で撮った日が今日になった**。
    // 図鑑のカレンダーも地図も日付順の並びも、全部そこを見ている。
    const patch = {
      object_image_url: data.object_path,
      cutout_image_url: null,
    };
    let res = await supabase
      .from("stickers")
      .update({
        ...patch,
        capture_type: "photo",
        placeholder_image_url: null,
        placeholder_credit: null,
      })
      .eq("id", data.sticker_id)
      .eq("user_id", userId);
    if (res.error && /capture_type|placeholder/.test(res.error.message)) {
      res = await supabase
        .from("stickers")
        .update(patch)
        .eq("id", data.sticker_id)
        .eq("user_id", userId);
    }
    if (res.error) throw new Error(res.error.message);
    return { ok: true };
  });

// --- 画像なしカードへの仮画像の自動添付 (2026-07-27) -------------------------
// 段ボール絵(絵文字)のカードを無くす: 詳細を開いた時に画像が1枚も無ければ、
// クライアントがWeb検索画像をアップロードしてここに登録する。
const SetPlaceholderInput = z.object({
  sticker_id: z.string().uuid(),
  placeholder_path: z.string(),
  placeholder_credit: z
    .object({ name: z.string().optional(), link: z.string().optional(), source: z.string() })
    .nullable()
    .optional(),
});

export const setStickerPlaceholder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SetPlaceholderInput.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    // Path-spoofing guard: only paths under the caller's own uid folder.
    if (!data.placeholder_path.startsWith(`${userId}/`)) {
      throw new Error("不正な画像パスです");
    }
    const { error } = await supabase
      .from("stickers")
      .update({
        placeholder_image_url: data.placeholder_path,
        placeholder_credit: (data.placeholder_credit ?? null) as never,
      })
      .eq("id", data.sticker_id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
