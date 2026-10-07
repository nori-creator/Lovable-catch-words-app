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
    "complete",
    "account",
    "done",
  ]),
  photo: z.string().max(4_000_000).nullable(),
  card: CardSchema.nullable(),
  lesson: PersonalLessonSchema.optional(),
  /**
   * 復習の通知。**設定と同じ3つ**（オフ / 自動 / 時刻を指定。オーナー指示 2026-09-28
   * 「設定の通知とチュートリアルの通知の整合性とって」）。古い下書きの `{ morning, evening }`
   * も読める（`normalizeReminderPrefs` が今の形に揃える）。
   */
  reminders: z
    .union([
      z.object({
        mode: z.enum(["off", "ai", "custom"]),
        times: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).max(3),
      }),
      z.object({ morning: z.boolean(), evening: z.boolean() }),
    ])
    .optional(),
  capturedAt: z.string().datetime().nullable(),
  reviewCompleted: z.boolean().optional(),
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
/**
 * 書き込みは**頼まれた順に1本ずつ**（2026-10-05 オーナー報告「チュートリアルを終えた後、
 * 途中の単語の詳細の画面に戻る」）。
 *
 * 書くたびに別の接続を開くので、前は先に頼んだ書き込み（単語の詳細で届いた解説を足した
 * 下書き = 段は explore）の接続が遅れて開くと、後から頼んだ「復習へ」「完了」の書き込みより
 * **後に**届いて、端末の下書きも画面も単語の詳細へ戻ることがあった（iPhone の Safari は
 * IndexedDB を開くのが遅い・止まることがある）。つなげて書けば、最後に頼んだ物が必ず残る。
 */
let writeChain: Promise<unknown> = Promise.resolve();
export function writeFirstCatch(draft: FirstCatch): Promise<void> {
  const parsed = FirstCatchSchema.parse(draft);
  const job = writeChain.then(() => transaction("readwrite", (s) => s.put(parsed, "current")));
  writeChain = job.catch(() => undefined);
  return job.then(() => undefined);
}

/** 写真を撮ってから復習を終えるまでの段（終えた後に戻ってはいけない所）。 */
const MID_TUTORIAL_STAGES: ReadonlySet<FirstCatch["stage"]> = new Set([
  "home",
  "dex",
  "review",
  "camera",
  "card",
  "added",
  "explore",
]);

/**
 * **チュートリアルを終えた後に、途中の段へ戻す書き込みか。** 復習を終えて完了・登録の案内
 * まで来た下書きに、それより前の段（単語の詳細など）を被せる物は、遅れて届いた古い控え
 * なので捨てる。最初からやり直す（`restart`）・質問をやり直す・学ぶ言語を変える時は、
 * 段が途中の段ではないか `reviewCompleted` を外すので、ここには掛からない。
 */
export function isStaleTutorialWrite(current: FirstCatch, next: FirstCatch): boolean {
  const finished =
    (current.stage === "complete" || current.stage === "account") &&
    current.reviewCompleted === true;
  return finished && next.reviewCompleted !== false && MID_TUTORIAL_STAGES.has(next.stage);
}

/**
 * 開き直した時の下書き。**復習を終えた下書きは、途中の段から始めない**（古い書き込みが
 * 最後に残っていた端末でも、完了の画面から続ける）。
 */
export function resumeFirstCatch(saved: FirstCatch): FirstCatch {
  if (
    saved.reviewCompleted === true &&
    MID_TUTORIAL_STAGES.has(saved.stage) &&
    saved.photo &&
    saved.card &&
    saved.capturedAt
  )
    return { ...saved, stage: "complete" };
  return saved;
}
export function canRequestAccount(draft: FirstCatch): boolean {
  return (
    ["complete", "account"].includes(draft.stage) &&
    draft.reviewCompleted === true &&
    !!draft.photo &&
    !!draft.card &&
    !!draft.capturedAt
  );
}
/**
 * **剥がして図鑑へ入れた後の下書き**（まだ登録前の端末にだけある1枚）。
 *
 * 登録の案内まで進んでいなくても、ログインした時点で**必ず引き継ぐ**。
 * （オーナー報告 2026-09-30「手掌の画像を撮ってステッカーを剥がすアニメーションまで
 * やったのに、画像が保存されなかった。開発者の記録にも残っていない」）
 * 以前は `canRequestAccount`（案内を最後まで見た）だけを引き継いでいたので、
 * 途中で別の入口からログインすると、剥がした写真は端末に置き去りになっていた。
 */
export function hasAddedCatch(draft: FirstCatch): boolean {
  return (
    ["added", "explore", "complete", "account"].includes(draft.stage) &&
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

/**
 * **ブラウザを開き直しても、チュートリアルの続きから始める**（オーナー指示 2026-09-30
 * 「ブラウザで開き直すボタンは実際にブラウザで自動的に開くように」）。
 *
 * 下書きは端末のそのブラウザの中にしか無いので、LINE などから Safari / Chrome へ
 * 移ると最初の画面に戻ってしまう。撮る画面にいる間だけ、答え（言語・目的・興味など）を
 * URL の `fc` に載せておき、開き直した先で読み戻す。写真・単語・個人の解説は載せない。
 */
export const FIRST_CATCH_HANDOFF_PARAM = "fc";

export function encodeFirstCatchHandoff(draft: FirstCatch): string {
  const light: FirstCatch = {
    ...draft,
    stage: "camera",
    photo: null,
    card: null,
    lesson: undefined,
    capturedAt: null,
    importedUserId: undefined,
  };
  const bytes = new TextEncoder().encode(JSON.stringify(light));
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeFirstCatchHandoff(raw: string | null | undefined): FirstCatch | null {
  if (!raw || raw.length > 8000) return null;
  try {
    const bin = atob(raw.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const parsed = FirstCatchSchema.safeParse(JSON.parse(new TextDecoder().decode(bytes)));
    if (!parsed.success || parsed.data.stage !== "camera" || parsed.data.photo) return null;
    return parsed.data;
  } catch {
    return null;
  }
}
