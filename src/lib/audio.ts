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

/**
 * 排他再生: 発音ボタンが複数箇所(スキャン/カード/復習)にあり、それぞれが
 * 自前の Audio / speechSynthesis を持つため「音声が被る」不具合が出ていた。
 * 再生を始める側は必ず claimAudio(el) を呼ぶ — 直前に鳴っていたものを止めて
 * から自分が「現在の再生者」になる。speechSynthesis を使う側は
 * stopOtherAudio() を speak() の直前に呼ぶ。
 */
let currentAudio: HTMLAudioElement | null = null;

export function stopOtherAudio(except?: HTMLAudioElement): void {
  if (currentAudio && currentAudio !== except) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch {
      /* already detached */
    }
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* noop */
    }
  }
}

export function claimAudio(el: HTMLAudioElement): void {
  stopOtherAudio(el);
  currentAudio = el;
}
