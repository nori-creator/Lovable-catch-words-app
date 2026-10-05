import { stopSpeechBuffer, unlockSpeechOutput } from "./speech-buffer";
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
/**
 * 一瞬の無音（8kHz・8bit・50ms）。**中身のある** WAV にする — 前の物はデータが0バイトで、
 * 端末によっては読み込みに失敗し、解禁の再生そのものが成り立たないことがあった。
 */
let silentWav: string | null = null;
export function silentWavDataUrl(): string {
  if (silentWav) return silentWav;
  const samples = 400;
  const bytes = new Uint8Array(44 + samples);
  const view = new DataView(bytes.buffer);
  const ascii = (at: number, text: string) => {
    for (let i = 0; i < text.length; i++) bytes[at + i] = text.charCodeAt(i);
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, 8000, true);
  view.setUint32(28, 8000, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  ascii(36, "data");
  view.setUint32(40, samples, true);
  bytes.fill(0x80, 44); // 8bit の無音
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  silentWav = `data:audio/wav;base64,${btoa(bin)}`;
  return silentWav;
}

const primed = new WeakSet<HTMLAudioElement>();

export function primeAudio(el: HTMLAudioElement): void {
  if (primed.has(el)) return;
  primed.add(el);
  try {
    el.src = silentWavDataUrl();
    void el.play()?.catch?.(() => {});
  } catch {
    /* priming is best-effort */
  }
}

/**
 * **発音を鳴らす `<audio>` はアプリ全体で1つ**（2026-10-05 オーナー報告「iPhone/iPad の
 * Safari で発音ボタンを押しても音が出ない」）。
 *
 * 前は発音ボタン・カード・復習・チュートリアルの部品が**それぞれ自前の `<audio>`** を持って
 * いた。iPhone の Safari は「指で触れた中で一度 `play()` した要素」しか後から鳴らさないので、
 * 解禁が要素ごとにやり直しになり、タップの外で鳴らす所（カードの自動再生・はがした後の
 * 読み上げ）は、その画面の要素がまだ解禁されていないと黙っていた。1つにすれば、どこかで
 * 1回触れれば以後どこからでも鳴る。
 */
let sharedEl: HTMLAudioElement | null = null;
export function sharedSpeechElement(): HTMLAudioElement | null {
  if (sharedEl) return sharedEl;
  if (typeof window === "undefined" || typeof Audio === "undefined") return null;
  try {
    sharedEl = new Audio();
    sharedEl.preload = "auto";
  } catch {
    sharedEl = null;
  }
  return sharedEl;
}

/**
 * 端末の声（speechSynthesis）の解禁。iPhone は**最初の1回の `speak()` を指の操作の中で**
 * 呼ばないと、それ以降の読み上げを黙って捨てる。サーバの音が取れずに端末の声へ落ちる時は
 * 通信の後（指の外）なので、タップの中で音量0の1回を先に話しておく。
 */
let speechPrimed = false;
export function primeSpeechSynthesis(): void {
  if (speechPrimed || typeof window === "undefined" || !("speechSynthesis" in window)) return;
  speechPrimed = true;
  try {
    if (typeof SpeechSynthesisUtterance === "undefined") return;
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    window.speechSynthesis.speak(u);
  } catch {
    /* best-effort */
  }
}

/**
 * **最初に画面に触れた時に、音の出口をまとめて開ける。** 発音ボタン以外の所（「次へ」・
 * 札のめくり）が最初のタップでも、その後の自動再生・遅れて鳴る読み上げが鳴るように。
 * iPhone で「指の操作」と数えられるのは touchend / click / keydown（touchstart・pointerdown は
 * 数えられない）。Web Audio は背面に回るたびに止まるので、触れるたびに再開を試す。
 */
let unlockInstalled = false;
export function installAudioUnlock(): void {
  if (unlockInstalled || typeof document === "undefined") return;
  unlockInstalled = true;
  const unlock = () => {
    const el = sharedSpeechElement();
    if (el) primeAudio(el);
    unlockSpeechOutput();
    primeSpeechSynthesis();
  };
  for (const type of ["touchend", "click", "keydown"]) {
    document.addEventListener(type, unlock, { capture: true, passive: true });
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
  // 読み解き済みの発音（Web Audio、`speech-buffer.ts`）も同じ排他に入れる。
  stopSpeechBuffer();
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

/** 試験用。 */
export function resetAudioForTest(): void {
  sharedEl = null;
  speechPrimed = false;
  unlockInstalled = false;
  currentAudio = null;
}
