import { z } from "zod";
import { CardSchema } from "./card-schema";
import { UI_LANGS } from "./i18n";
import { TARGET_LANGUAGES } from "./target-lang";
import type { StickerWithWord } from "./stickers.functions";
import {
  DailyMinutesSchema,
  FIRST_CATCH_GOALS,
  FIRST_CATCH_INTERESTS,
} from "./learning-preferences";
import { PersonalLessonSchema } from "./first-catch-ai-schema";
export { FIRST_CATCH_GOALS, FIRST_CATCH_INTERESTS } from "./learning-preferences";

export const FIRST_CATCH_KEY = "catchwords-first-catch-v1";
export const FirstCatchSchema = z.object({
  version: z.literal(1),
  id: z.string().uuid(),
  uiLanguage: z.enum(UI_LANGS),
  targetLanguage: z.enum(TARGET_LANGUAGES),
  dailyMinutes: DailyMinutesSchema,
  goals: z.array(z.enum(FIRST_CATCH_GOALS)).max(6).optional(),
  interests: z.array(z.enum(FIRST_CATCH_INTERESTS)).max(9).optional(),
  questionIndex: z.number().int().min(0).max(4).optional(),
  stage: z.enum([
    "intro",
    "questions",
    "notifications",
    "ready",
    "home",
    "dex",
    "review",
    "camera",
    "card",
    "added",
    "explore",
    "account",
    "done",
  ]),
  photo: z.string().max(4_000_000).nullable(),
  card: CardSchema.nullable(),
  lesson: PersonalLessonSchema.optional(),
  reminders: z.object({ morning: z.boolean(), evening: z.boolean() }).optional(),
  capturedAt: z.string().datetime().nullable(),
  importedUserId: z.string().uuid().optional(),
  /** 登録前にAIを使えず、見本の写真と単語で体験した下書き。登録後に写真と単語は引き継がない。 */
  sample: z.boolean().optional(),
});
export type FirstCatch = z.infer<typeof FirstCatchSchema>;

// Resolve only after transaction commit: a request success is not durable storage.
function transaction<T>(
  mode: IDBTransactionMode,
  op: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(FIRST_CATCH_KEY, 1);
    open.onupgradeneeded = () => open.result.createObjectStore("draft");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction("draft", mode);
      const request = op(tx.objectStore("draft"));
      tx.oncomplete = () => {
        db.close();
        resolve(request.result);
      };
      tx.onabort = tx.onerror = () => {
        db.close();
        reject(tx.error ?? new Error("Storage failed"));
      };
    };
  });
}
export async function readFirstCatch(): Promise<FirstCatch | null> {
  const value = await transaction("readonly", (s) => s.get("current"));
  if (value == null) return null;
  return FirstCatchSchema.parse(value);
}
export async function writeFirstCatch(draft: FirstCatch): Promise<void> {
  await transaction("readwrite", (s) => s.put(FirstCatchSchema.parse(draft), "current"));
}
export function canRequestAccount(draft: FirstCatch): boolean {
  return (
    ["explore", "account"].includes(draft.stage) &&
    !!draft.photo &&
    !!draft.card &&
    !!draft.capturedAt
  );
}
export function firstCatchSticker(draft: FirstCatch): StickerWithWord | null {
  if (!draft.card || !draft.photo || !draft.capturedAt) return null;
  return {
    id: draft.id,
    word_id: draft.id,
    caption: null,
    location_name: null,
    lat: null,
    lng: null,
    taken_at: draft.capturedAt,
    created_at: draft.capturedAt,
    encounter_count: 1,
    object_url: draft.photo,
    cutout_url: null,
    selfie_url: null,
    object_thumb_url: null,
    cutout_thumb_url: null,
    capture_type: "photo",
    placeholder_url: null,
    placeholder_credit: null,
    word: {
      ...draft.card,
      headword: draft.card.headword_zh,
      language: draft.targetLanguage,
      silhouette_emoji: null,
      extras: draft.card.extras ?? null,
    },
  };
}
