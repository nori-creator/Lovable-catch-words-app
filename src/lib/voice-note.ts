/**
 * その札に添える**一言の録音**の決まりごと。
 *
 * オーナー(2026-08-21): 「動画は supabase に上げる **B案**」
 * オーナー(2026-08-26): 「一言は**音声だけ**にして。動画の撮影はやめて。
 *  すでに撮ってあるものは**音として**再生して。再生ボタンは**真ん中**、
 *  日付と場所の名前の隣に置いて」
 *
 * ## なぜ音だけにするか
 * 一言は**声が本体**で、画はほとんど何も足していなかった。そのうえ画は
 * 高く付く — 15秒の自撮り動画は数MB、同じ長さの opus は**数十KB**。
 * 置き場所は Supabase = 費用そのものなので、100倍近い差が毎回付いていた。
 * 撮る側の負担も違う。声だけなら顔を作らなくていいので、道端でも残せる。
 *
 * ## 列の名前は変えない
 * `stickers.voice_video_url` は**そのまま**。オーナーは Supabase に直接
 * 触れないので、列名を変える移行は当たらないと動かない機能を1つ増やす
 * だけになる。名前が古いのは注釈で補う — 中身の形が変わっても、
 * **入っているのは「その札の一言」という同じ物**。
 *
 * ## 前に撮った動画も鳴る
 * `<audio>` は動画のファイルを渡されても音の道だけを鳴らす。だから
 * 既に撮ってある webm/mp4 は、何もしなくてもそのまま聞ける。
 * (置き場所も拡張子も変えないので、撮り直せば同じ道に上書きされる。)
 *
 * ## 上限はここが持つ
 * 「止める側」と「長すぎると断る側」が別々の数字を持つと、撮れたのに
 * 保存できない回ができる。
 *
 * 外の世界に触れるものをここに入れないこと(対応の判定は関数を受け取る)。
 */

/** 一言の上限(ミリ秒)。これを超えたら自動で止める。 */
export const MAX_VOICE_NOTE_MS = 15_000;

/**
 * 上げる前に断る大きさ(バイト)。
 *
 * 15秒の音でここを超えることはまず無い(opus なら 60KB 前後)。
 * 前に撮った**動画**を上書きする回もここを通るので、余裕は残す。
 */
export const MAX_VOICE_NOTE_BYTES = 12 * 1024 * 1024;

/**
 * 試す形式の順。**上から順に、その端末が対応しているものを使う。**
 * webm/opus が第一(Android/PC)、mp4 は iOS Safari のための逃げ道。
 */
export const AUDIO_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/aac",
] as const;

/**
 * その端末で使える形式を選ぶ。1つも無ければ `null`。
 *
 * **`isSupported` を受け取る**のは、ここに `MediaRecorder` を持ち込まない
 * ため(この層は外の世界に触れない)。呼ぶ側が
 * `MediaRecorder.isTypeSupported` を渡す。
 */
export function pickAudioMime(isSupported: (type: string) => boolean): string | null {
  for (const m of AUDIO_MIME_CANDIDATES) {
    try {
      if (isSupported(m)) return m;
    } catch {
      // 対応の問い合わせ自体で落ちる端末がある。次の形式を試す。
    }
  }
  return null;
}

/**
 * その形式で保存するときの拡張子。
 *
 * **前に撮った動画と同じ道に落ちるようにしてある** — `video/webm` も
 * `audio/webm` も `webm`、`video/mp4` も `audio/mp4` も `mp4`。
 * 撮り直しが古い動画をそのまま置き換えるので、消せない物が残らない。
 */
export function extensionForMime(mime: string | null | undefined): string {
  const m = mime ?? "";
  if (m.includes("mp4")) return "mp4";
  if (m.includes("aac")) return "m4a";
  return "webm";
}

/**
 * 置き場所。**札ごとに1本**(撮り直すと上書き)。
 *
 * 写真と同じ `stickers` バケットの、その人のフォルダの下に置く。
 * 札の id を挟むので、別の札の一言を取り違えない。
 */
export function voiceNotePath(userId: string, stickerId: string, mime: string | null): string {
  return `${userId}/${stickerId}/voice.${extensionForMime(mime)}`;
}

/** 上限を超えたか。**録音を止める側と断る側で同じ数字を使う。** */
export function isTooLong(ms: number): boolean {
  return !Number.isFinite(ms) ? false : ms > MAX_VOICE_NOTE_MS;
}

export function isTooBig(bytes: number): boolean {
  return !Number.isFinite(bytes) ? false : bytes > MAX_VOICE_NOTE_BYTES;
}

/**
 * 残り秒(切り上げ)。0 を下回らない。
 * 「あと3秒」を出すため — 上限があることを録る前ではなく**録りながら**言う。
 */
export function remainingSeconds(elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return Math.ceil(MAX_VOICE_NOTE_MS / 1000);
  return Math.max(0, Math.ceil((MAX_VOICE_NOTE_MS - elapsedMs) / 1000));
}

/**
 * 録るときに求めるもの。**カメラを掴まない。**
 *
 * これが音だけになったことで、カメラの許可を訊かれなくなり、
 * 内カメラのランプも点かない。道端で残す物なので、そこが軽いほうがいい。
 */
export function voiceNoteConstraints(): MediaStreamConstraints {
  return { audio: true };
}
