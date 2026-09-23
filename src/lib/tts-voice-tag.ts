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

let refreshing: Promise<void> | null = null;

/** 1起動に1回だけ札を取り直す（失敗しても何度も叩かない）。 */
export function refreshVoiceTagsOnce(fetcher: () => Promise<{ tags: Record<string, string> }>) {
  refreshing ??= fetcher()
    .then((r) => void rememberVoiceTags(r.tags ?? {}))
    .catch(() => {});
  return refreshing;
}

/** 試験用。 */
export function resetVoiceTagsForTest() {
  tags = null;
  refreshing = null;
}
