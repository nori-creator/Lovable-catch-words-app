/**
 * iOS Safari (and some Android browsers) only allow audio playback that
 * starts synchronously inside a user gesture. Our pronunciation buttons all
 * need an async hop first (signed-URL lookup or TTS round-trip), after which
 * `.play()` is no longer considered gesture-initiated and is silently
 * rejected — the "発音ボタンがあるのに鳴らない" bug.
 *
 * Fix: call primeAudio(el) at the very top of the tap handler, BEFORE any
 * await. Playing a beat of silence inside the gesture unlocks the element,
 * and every later .play() on the same element is then allowed.
 */
const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";

const primed = new WeakSet<HTMLAudioElement>();

export function primeAudio(el: HTMLAudioElement): void {
  if (primed.has(el)) return;
  primed.add(el);
  try {
    el.src = SILENT_WAV;
    void el.play().catch(() => {});
  } catch {
    /* priming is best-effort */
  }
}
