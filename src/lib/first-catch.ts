import { z } from "zod";
import { CardSchema } from "./card-schema";
import { UI_LANGS } from "./i18n";
import { TARGET_LANGUAGES } from "./target-lang";
import type { StickerWithWord } from "./stickers.functions";

export const FIRST_CATCH_KEY = "catchwords-first-catch-v1";
export const FirstCatchSchema = z.object({
  version: z.literal(1),
  id: z.string().uuid(),
  uiLanguage: z.enum(UI_LANGS),
  targetLanguage: z.enum(TARGET_LANGUAGES),
  dailyMinutes: z.union([z.literal(5), z.literal(10), z.literal(15)]),
  stage: z.enum([
    "questions",
    "home",
    "dex",
    "review",
    "camera",
    "card",
    "added",
    "account",
    "done",
  ]),
  photo: z.string().max(4_000_000).nullable(),
  card: CardSchema.nullable(),
  capturedAt: z.string().datetime().nullable(),
  importedUserId: z.string().uuid().optional(),
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
    ["added", "account"].includes(draft.stage) &&
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
