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
    image.src = url;
    await image.decode();
    const scale = Math.min(1, 1280 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image unavailable");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}
