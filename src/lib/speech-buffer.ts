/**
 * **押した瞬間に鳴る発音**（オーナー指示 2026-09-28「発音ボタン押してから発音が実践
 * されるまで…タイムラグがあるから過去に生成したデータは全て端末に保存して瞬間的に
 * 表示されるようにして」）。
 *
 * 音はもう端末に在る（IndexedDB、`tts-store.ts`）。それでも待たされていたのは、押すたびに
 * `<audio>` へ入れ直して**その場で mp3 を読み解いていた**から（iPhone で 0.1〜0.3 秒）。
 * ここでは端末に届いた時点で**先に読み解いておき**（Web Audio の `AudioBuffer`）、
 * 押したら読み解き済みの波形をそのまま流す — 待ちは実質ゼロになる。
 *
 * 読み解いた波形は画面をまたいで1つ。数には上限を置き、古い物から捨てる（捨てても
 * 端末の音から作り直すだけで、ネットには出ない）。使えない端末では何もしない
 * （呼ぶ側は今まで通り `<audio>` で鳴らす）。
 */
const MAX_BUFFERS = 120;

type Ctx = AudioContext;
let ctx: Ctx | null = null;
const buffers = new Map<string, AudioBuffer>();
const decoding = new Map<string, Promise<AudioBuffer | null>>();
let current: AudioBufferSourceNode | null = null;

function getCtx(): Ctx | null {
  if (ctx) return ctx;
  if (typeof window === "undefined") return null;
  const C =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!C) return null;
  try {
    // iPhone は Web Audio を「環境音」として扱い、消音スイッチで黙らせる。発音は
    // 今までの `<audio>`（消音でも鳴る）と同じ扱いにする（Safari 17+ の Audio Session API）。
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    if (nav.audioSession) nav.audioSession.type = "playback";
  } catch {
    /* 無い端末は今まで通り */
  }
  try {
    ctx = new C();
  } catch {
    ctx = null;
  }
  return ctx;
}

/** 読み解き済みか。 */
export function hasSpeechBuffer(key: string): boolean {
  return buffers.has(key);
}

/** 端末に届いた音を先に読み解いておく（何度呼んでも1回だけ）。 */
export function decodeSpeech(key: string, blob: Blob): Promise<AudioBuffer | null> {
  const have = buffers.get(key);
  if (have) return Promise.resolve(have);
  const running = decoding.get(key);
  if (running) return running;
  const c = getCtx();
  if (!c) return Promise.resolve(null);
  const job = blob
    .arrayBuffer()
    .then(
      (bytes) =>
        new Promise<AudioBuffer | null>((resolve) => {
          // 古い Safari は Promise を返さない形しか持たないので、両方で受ける。
          const p = c.decodeAudioData(bytes, resolve, () => resolve(null));
          if (p && typeof (p as Promise<AudioBuffer>).then === "function") {
            (p as Promise<AudioBuffer>).then(resolve, () => resolve(null));
          }
        }),
    )
    .then((buf) => {
      if (buf) {
        buffers.delete(key);
        buffers.set(key, buf);
        while (buffers.size > MAX_BUFFERS) {
          const oldest = buffers.keys().next();
          if (oldest.done) break;
          buffers.delete(oldest.value);
        }
      }
      return buf;
    })
    .catch(() => null)
    .finally(() => decoding.delete(key));
  decoding.set(key, job);
  return job;
}

/**
 * **押した手の中で**（最初の await より前に）呼ぶ。iPhone は指の操作の中でしか
 * 音の出口を開けないので、ここで開けておく。
 */
export function unlockSpeechOutput(): void {
  const c = getCtx();
  if (c && c.state !== "running") void c.resume().catch(() => {});
}

/** 鳴っている読み解き済みの音を止める（ほかの発音が始まる時）。 */
export function stopSpeechBuffer(): void {
  if (!current) return;
  try {
    current.onended = null;
    current.stop();
  } catch {
    /* 既に止まっている */
  }
  current = null;
}

/**
 * 読み解き済みなら、その場で鳴らす。鳴らせたら終わりを待つ Promise、鳴らせなければ
 * `null`（呼ぶ側は今まで通りの道で鳴らす）。
 */
export function playSpeechBuffer(key: string): Promise<void> | null {
  const buf = buffers.get(key);
  const c = getCtx();
  if (!buf || !c) return null;
  stopSpeechBuffer();
  try {
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(c.destination);
    current = src;
    return new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, Math.max(600, buf.duration * 1000 + 400));
      src.onended = () => {
        clearTimeout(timer);
        if (current === src) current = null;
        resolve();
      };
      src.start();
    });
  } catch {
    return null;
  }
}

/** 試験用。 */
export function resetSpeechBuffersForTest(): void {
  buffers.clear();
  decoding.clear();
  current = null;
  ctx = null;
}
