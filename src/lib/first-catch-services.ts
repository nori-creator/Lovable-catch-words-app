import { supabase } from "@/integrations/supabase/client";
import { setUiLang } from "./i18n";
import { setTargetLang } from "./target-lang-pref";
import type { FirstCatch } from "./first-catch";

let opening: Promise<void> | null = null;
/** Anonymous auth keeps existing AI auth/cost controls intact. No public AI endpoint. */
export function ensureFirstCatchSession(): Promise<void> {
  if (!opening)
    opening = (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      if (!data.session) {
        const result = await supabase.auth.signInAnonymously();
        if (result.error) throw new Error("FIRST_CATCH_GUEST_UNAVAILABLE");
      }
    })().finally(() => {
      opening = null;
    });
  return opening;
}
/** 未登録用の窓口が「入口で」断ったときのコード(AIの中身の失敗はここに含めない)。 */
const GUEST_REFUSALS = new Set([
  "FIRST_CATCH_LIMIT",
  "FIRST_CATCH_ORIGIN",
  "FIRST_CATCH_AI_UNAVAILABLE",
]);
export function isGuestRefusal(error: unknown): boolean {
  return error instanceof Error && GUEST_REFUSALS.has(error.message);
}
export function applyFirstCatchLanguage(draft: FirstCatch) {
  setUiLang(draft.uiLanguage);
  setTargetLang(draft.targetLanguage);
}

/** Decode and re-encode even small photos, stripping EXIF/GPS before storage or AI. */
export async function firstCatchPhoto(file: File): Promise<string> {
  if (!file.type.startsWith("image/") || file.size > 30_000_000) throw new Error("Invalid photo");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    // iOS Safari can reject decode() for a camera file that still fires load.
    // onload works on older Safari too; bound the wait so a bad HEIC never traps the tour.
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(
        () => finish(new Error("FIRST_CATCH_PHOTO_UNSUPPORTED")),
        20_000,
      );
      const finish = (error?: Error) => {
        window.clearTimeout(timeout);
        image.onload = null;
        image.onerror = null;
        if (error) reject(error);
        else resolve();
      };
      image.onload = () => finish();
      image.onerror = () => finish(new Error("FIRST_CATCH_PHOTO_UNSUPPORTED"));
      image.src = url;
      if (image.complete) {
        if (image.naturalWidth) finish();
      }
    });
    if (!image.naturalWidth || !image.naturalHeight)
      throw new Error("FIRST_CATCH_PHOTO_UNSUPPORTED");
    const scale = Math.min(1, 1280 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image unavailable");
    try {
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      let photo = canvas.toDataURL("image/jpeg", 0.82);
      if (photo.length > 4_000_000) photo = canvas.toDataURL("image/jpeg", 0.65);
      if (!photo.startsWith("data:image/jpeg;base64,") || photo.length > 4_000_000)
        throw new Error("FIRST_CATCH_PHOTO_UNSUPPORTED");
      return photo;
    } catch {
      throw new Error("FIRST_CATCH_PHOTO_UNSUPPORTED");
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}
