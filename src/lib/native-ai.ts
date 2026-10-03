import { z } from "zod";

/**
 * **iOS 版（ネイティブアプリ）から AI を呼ぶ窓口の約束事**（`/api/native-ai`）。
 *
 * iOS 版はこれまで Rork の AI 中継（Rork Toolkit）を、アプリに埋め込んだ秘密の鍵で
 * 直接呼んでいた。これだと (1) アプリを分解すれば誰でも鍵を抜ける、(2) Rork の契約が
 * 切れた日に iOS 版の AI が全部止まる。そこで iOS 版も Web 版と同じサーバを通す:
 * - 鍵はサーバだけが持つ（アプリには入れない）。
 * - ログイン（ゲストも匿名ログイン）した利用者の Supabase の通行証で本人確認する。
 * - どの AI を使うかは Web 版と同じ切替点（getAiFor）で決まる。
 * - 1日の上限（assertWithinDailyCap）も Web 版と同じ仕組みで数える。
 */

/** 用途。サーバ側でモデルと 1 日の上限の数え方を決める。 */
export const NATIVE_AI_FEATURES = ["scan", "card", "wordbook", "text"] as const;
export type NativeAiFeature = (typeof NATIVE_AI_FEATURES)[number];

/** 画像は iOS 側で 2000px / JPEG に縮めてから送る。8MB を超える物は断る。 */
export const NATIVE_AI_MAX_IMAGE_CHARS = Math.ceil((8 * 1024 * 1024 * 4) / 3) + 64;
/** 指示文の上限。今の最長（単語帳の読み取り）でも 2 千字程度。 */
export const NATIVE_AI_MAX_PROMPT_CHARS = 12_000;

export const NativeAiRequest = z.object({
  feature: z.enum(NATIVE_AI_FEATURES),
  prompt: z.string().min(1).max(NATIVE_AI_MAX_PROMPT_CHARS),
  imageBase64: z
    .string()
    .max(NATIVE_AI_MAX_IMAGE_CHARS)
    .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/)
    .optional(),
});
export type NativeAiRequest = z.infer<typeof NativeAiRequest>;

/** 用途 → usage_events の kind（1日の上限の数え方）。Web 版と同じ数え方に寄せる。 */
export const NATIVE_AI_USAGE_KIND: Record<NativeAiFeature, string> = {
  scan: "scan_detect",
  card: "card",
  wordbook: "wordbook",
  text: "native_text",
};

/** 用途 → Web 版の AI 切替点での機能名と、使うモデルの格。 */
export const NATIVE_AI_ROUTING: Record<
  NativeAiFeature,
  { feature: "scan" | "card" | "journal"; tier: "fast" | "rich" }
> = {
  scan: { feature: "scan", tier: "fast" },
  wordbook: { feature: "scan", tier: "fast" },
  card: { feature: "card", tier: "rich" },
  text: { feature: "journal", tier: "rich" },
};

/** 待ち時間の上限（秒）。iOS 側の待ち時間より少しだけ短くして、先にサーバが答える。 */
export const NATIVE_AI_TIMEOUT_MS: Record<NativeAiFeature, number> = {
  scan: 35_000,
  card: 35_000,
  wordbook: 55_000,
  text: 35_000,
};

/** `Authorization: Bearer <token>` から通行証だけを取り出す。無ければ null。 */
export function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(\S+)$/.exec(header.trim());
  return m ? m[1] : null;
}

/** 1日の上限（その人の上限・全体の上限）に達したときの失敗か（429 で返すため）。 */
export function isDailyCapError(e: unknown): boolean {
  return (
    e instanceof Error &&
    (e.message.includes("1日の利用上限") ||
      e.message.includes("AI_DAILY_CAP") ||
      e.message.includes("AI_GLOBAL_CAP"))
  );
}

/**
 * この窓口を開けてよいか。**既定は閉じる**（監査 2026-10-03。`routes/api.native-ai.ts` の注）。
 * サーバの環境変数 `NATIVE_AI_ENABLED` が `1` / `true` のときだけ開く。
 */
export function nativeAiEnabled(flag: string | undefined | null): boolean {
  const v = (flag ?? "").trim().toLowerCase();
  return v === "1" || v === "true";
}
