import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { upsertWord } from "./stickers.functions";
import { ExtrasSchema } from "./extras";
import { buildBranchPlan } from "./wordtree";

/**
 * Catches without a photo of your own — typed, or repeated back from
 * something heard.
 *
 * 2026-07-28: 「ゴースト」表示(段ボール絵・👻仮バッジ・グレースケール)は
 * **完全に廃止**した。写真が無いカードにはネット検索の画像が自動で入り、
 * 図鑑では普通のカードとして並ぶ(気に入らなければ詳細画面で選び直せる)。
 * 実物に出会って撮ると、その写真が正としてネット画像を置き換える
 * (金色の再会キャッチ)。
 */

// extras の形は src/lib/extras.ts の共有スキーマを使う。

const GhostInput = z.object({
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
    entry_type: z.enum(["word", "phrase"]).default("word"),
  }),
  language: z.string().default("zh-TW"),
  capture_type: z.enum(["text", "voice"]),
  caption: z.string().nullable().optional(),
  // B2: ユーザーが自分の画像を添付した場合の実写パス。設定されると
  // object_image_url が入り、そのカードはゴーストでなくなる(実物あり)。
  object_path: z.string().nullable().optional(),
  placeholder_path: z.string().nullable().optional(),
  placeholder_credit: z
    .object({
      name: z.string().optional(),
      link: z.string().optional(),
      source: z.string(),
    })
    .nullable()
    .optional(),
});

export const saveGhostSticker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => GhostInput.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    // Same storage path-spoofing guard as saveSticker: only paths under the
    // caller's own uid folder are accepted.
    const ownPath = (p: string | null | undefined): string | null => {
      if (!p) return null;
      return p.startsWith(`${userId}/`) ? p : null;
    };

    const wordId = await upsertWord(supabase, userId, data.word, data.language);
    const branchPlan = buildBranchPlan(data.word.extras);

    const baseRow = {
      user_id: userId,
      word_id: wordId,
      language: data.language,
      object_image_url: ownPath(data.object_path),
      cutout_image_url: null,
      selfie_image_url: null,
      caption: data.caption ?? null,
      location_name: null,
      lat: null,
      lng: null,
    };
    let res = await supabase
      .from("stickers")
      .insert({
        ...baseRow,
        capture_type: data.capture_type,
        placeholder_image_url: ownPath(data.placeholder_path),
        placeholder_credit: (data.placeholder_credit ?? null) as never,
        branch_plan: branchPlan as never,
      })
      .select("id")
      .single();
    if (res.error && /capture_type|placeholder|branch_plan/.test(res.error.message)) {
      // Migration not applied yet — save the bare ghost (no placeholder columns).
      res = await supabase.from("stickers").insert(baseRow).select("id").single();
    }
    if (res.error) throw new Error(res.error.message);

    // KPI: first catch (ghosts count as "found").
    const { count } = await supabase
      .from("stickers")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    const firstCatch = (count ?? 0) === 1;
    if (firstCatch) {
      await supabase.from("usage_events").insert({ user_id: userId, kind: "first_catch" });
    }
    return { id: res.data.id as string, word_id: wordId, first_catch: firstCatch };
  });

const AttachInput = z.object({
  sticker_id: z.string().uuid(),
  object_path: z.string().nullable().optional(),
  cutout_path: z.string().nullable().optional(),
  selfie_path: z.string().nullable().optional(),
  caption: z.string().nullable().optional(),
  location_name: z.string().nullable().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
});

/**
 * Reunion catch (§5.3): the golden-dot moment. Swap the ghost's placeholder
 * for the real photo. The caller then records the SRS reward via
 * recordEncounter({ recalled: true }) — reunion = best possible recall.
 */
export const attachPhotoToSticker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AttachInput.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    const { data: owned, error: ownErr } = await supabase
      .from("stickers")
      .select("id")
      .eq("id", data.sticker_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (ownErr) throw new Error(ownErr.message);
    if (!owned) throw new Error("このカードは編集できません");

    // Same storage path-spoofing guard as saveSticker.
    const ownPath = (p: string | null | undefined): string | null => {
      if (!p) return null;
      return p.startsWith(`${userId}/`) ? p : null;
    };

    const basePatch = {
      object_image_url: ownPath(data.object_path),
      cutout_image_url: ownPath(data.cutout_path),
      selfie_image_url: ownPath(data.selfie_path),
      ...(data.caption != null ? { caption: data.caption } : {}),
      ...(data.location_name != null ? { location_name: data.location_name } : {}),
      ...(data.lat != null ? { lat: data.lat } : {}),
      ...(data.lng != null ? { lng: data.lng } : {}),
      taken_at: new Date().toISOString(),
    };
    let res = await supabase
      .from("stickers")
      .update({
        ...basePatch,
        capture_type: "photo",
        placeholder_image_url: null,
        placeholder_credit: null,
      })
      .eq("id", data.sticker_id)
      .eq("user_id", userId);
    if (res.error && /capture_type|placeholder/.test(res.error.message)) {
      res = await supabase
        .from("stickers")
        .update(basePatch)
        .eq("id", data.sticker_id)
        .eq("user_id", userId);
    }
    if (res.error) throw new Error(res.error.message);
    return { id: data.sticker_id };
  });
