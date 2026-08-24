/**
 * 一言の**自撮り動画**の決まりごと。
 *
 * オーナー(2026-08-21): 「動画は supabase に上げる **B案**」
 * (= `stickers` に列を1つ足して、写真と同じ扱いで残す)
 *
 * ## キャッチの保存経路には入れない
 * オーナーが「最大のペイン」と書いたのは「町で見たものの単語と発音が
 * **一瞬でも早く**知りたい」で、キャッチの保存はその本体。あそこに録画を
 * 挟むと、いちばん壊してはいけない所が遅くなる。**保存が終わったカードから**
 * 「一言を動画で残す」を開く形にする。
 *
 * ## 音声は入れる
 * 復習の録画は `audio: false` にしてある。あれはマイクを掴むと
 * `SpeechRecognition` が結果を返さなくなるからで、**こちらには音声認識が
 * 走っていない**。一言は声が本体なので音を入れる。
 *
 * ## 短く・小さく撮る
 * 置き場所は Supabase = **費用がかかる**。一言は一言なので、長さに上限を
 * 置き、画も小さめに撮る。上限を UI の都合ではなくここに書くのは、
 * 「録画を止める側」と「長すぎると断る側」が別々の数字を持つと、
 * 撮れたのに保存できない回ができるため。
 *
 * 外の世界に触れるものをここに入れないこと(対応の判定は関数を受け取る)。
 */

/** 一言の上限(ミリ秒)。これを超えたら自動で止める。 */
export const MAX_VOICE_VIDEO_MS = 15_000;

/** 撮る大きさ。**小さめ** — 思い出として見返せれば足りる。 */
export const VOICE_VIDEO_WIDTH = 480;
export const VOICE_VIDEO_HEIGHT = 640;

/**
 * 上げる前に断る大きさ(バイト)。
 * 15秒でここを超えることはまず無いが、端末によっては桁が変わる。
 */
export const MAX_VOICE_VIDEO_BYTES = 12 * 1024 * 1024;

/**
 * 試す形式の順。**上から順に、その端末が対応しているものを使う。**
 * webm が第一(Android/PC)、mp4 は iOS Safari のための逃げ道。
 */
export const VIDEO_MIME_CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4",
] as const;

/**
 * その端末で使える形式を選ぶ。1つも無ければ `null`。
 *
 * **`isSupported` を受け取る**のは、ここに `MediaRecorder` を持ち込まない
 * ため(この層は外の世界に触れない)。呼ぶ側が
 * `MediaRecorder.isTypeSupported` を渡す。
 */
export function pickVideoMime(isSupported: (type: string) => boolean): string | null {
  for (const m of VIDEO_MIME_CANDIDATES) {
    try {
      if (isSupported(m)) return m;
    } catch {
      // 対応の問い合わせ自体で落ちる端末がある。次の形式を試す。
    }
  }
  return null;
}

/** その形式で保存するときの拡張子。 */
export function extensionForMime(mime: string | null | undefined): string {
  return (mime ?? "").includes("mp4") ? "mp4" : "webm";
}

/**
 * 置き場所。**札ごとに1本**(撮り直すと上書き)。
 *
 * 写真と同じ `stickers` バケットの、その人のフォルダの下に置く。
 * 札の id を挟むので、別の札の一言を取り違えない。
 */
export function voiceVideoPath(userId: string, stickerId: string, mime: string | null): string {
  return `${userId}/${stickerId}/voice.${extensionForMime(mime)}`;
}

/** 上限を超えたか。**録画を止める側と断る側で同じ数字を使う。** */
export function isTooLong(ms: number): boolean {
  return !Number.isFinite(ms) ? false : ms > MAX_VOICE_VIDEO_MS;
}

export function isTooBig(bytes: number): boolean {
  return !Number.isFinite(bytes) ? false : bytes > MAX_VOICE_VIDEO_BYTES;
}

/**
 * 残り秒(切り上げ)。0 を下回らない。
 * 「あと3秒」を出すため — 上限があることを撮る前ではなく**撮りながら**言う。
 */
export function remainingSeconds(elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return Math.ceil(MAX_VOICE_VIDEO_MS / 1000);
  return Math.max(0, Math.ceil((MAX_VOICE_VIDEO_MS - elapsedMs) / 1000));
}

/** 撮るときに求めるもの。**音を入れる**(復習の録画とここが違う)。 */
export function voiceVideoConstraints(): MediaStreamConstraints {
  return {
    video: {
      facingMode: "user",
      width: { ideal: VOICE_VIDEO_WIDTH },
      height: { ideal: VOICE_VIDEO_HEIGHT },
    },
    audio: true,
  };
}
