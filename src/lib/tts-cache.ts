/**
 * Deterministic storage path for cached TTS audio. Because the path is a pure
 * function of (language, voice, text), any code can compute where a word's
 * audio lives without a DB column: if the object exists we reuse it, if not
 * the TTS server function generates and uploads it.
 */
export const TTS_VOICE_DEFAULT = "alloy";

export async function ttsObjectPath(language: string, voice: string, text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${language}/${voice}/${hex}.mp3`;
}
