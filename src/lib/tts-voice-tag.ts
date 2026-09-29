import { TTS_VOICE_DEFAULT } from "./tts-cache";

/**
 * **端末が覚えている「いまの声の札」。**（オーナー指示 2026-09-23 発音の声の切替）
 *
 * 端末は鳴らした音を IndexedDB に貯め、2回目からはネットに出ない。鍵に声の札を
 * 混ぜないと、開発者が声を変えても端末は**古い声を鳴らし続ける**（貯めた語は
 * サーバに一度も聞きに行かないので、変わったことに気づけない）。
 *
 * 札はサーバ（`getTtsVoiceTags`）から1起動に1回だけ取り、ここに控える。取れる
 * までは前回の控え、控えも無ければこれまでの `alloy`（今ある音をそのまま使う）。
 */
const LS_KEY = "catchwords-tts-voice-tags";

let tags: Record<string, string> | null = null;

function load(): Record<string, string> {
  if (tags) return tags;
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(LS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    tags = parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    tags = {};
  }
  return tags;
}

export function voiceTagFor(language: string): string {
  const t = load()[language];
  return typeof t === "string" && t ? t : TTS_VOICE_DEFAULT;
}

/** サーバから取った札を控える。変わった言語があれば true。 */
export function rememberVoiceTags(next: Record<string, string>): boolean {
  const prev = load();
  const changed = Object.keys(next).some((k) => prev[k] !== next[k]);
  tags = { ...prev, ...next };
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(tags));
  } catch {
    /* 私用モードなど — 控えは任意 */
  }
  return changed;
}

/**
 * **声が固定されている言語**（台湾の声。開発者の設定）。固定中は、サーバの音が取れなくても
 * 端末の別の声で読まない（オーナー指示 2026-09-29「アプリ全体で1つの同一の音声」）。
 * 控えは札と同じ所（起動のたびにサーバから取り直す）。
 */
const LOCK_KEY = "catchwords-tts-voice-locked";
let locked: Record<string, boolean> | null = null;

function loadLocked(): Record<string, boolean> {
  if (locked) return locked;
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(LOCK_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    locked = parsed && typeof parsed === "object" ? (parsed as Record<string, boolean>) : {};
  } catch {
    locked = {};
  }
  return locked;
}

export function isVoiceLockedFor(language: string): boolean {
  return loadLocked()[language] === true;
}

export function rememberVoiceLocks(next: Record<string, boolean>) {
  locked = { ...loadLocked(), ...next };
  try {
    localStorage.setItem(LOCK_KEY, JSON.stringify(locked));
  } catch {
    /* 私用モードなど — 控えは任意 */
  }
}

let refreshing: Promise<void> | null = null;

/** 1起動に1回だけ札を取り直す（失敗しても何度も叩かない）。 */
export function refreshVoiceTagsOnce(
  fetcher: () => Promise<{ tags: Record<string, string>; locked?: Record<string, boolean> }>,
) {
  refreshing ??= fetcher()
    .then((r) => {
      rememberVoiceTags(r.tags ?? {});
      if (r.locked) rememberVoiceLocks(r.locked);
    })
    .catch(() => {});
  return refreshing;
}

/** 試験用。 */
export function resetVoiceTagsForTest() {
  tags = null;
  locked = null;
  refreshing = null;
}
