/**
 * キャッチの決め台詞ボイス(2026-07-27)。
 *
 * 空中で一瞬止まった瞬間に、ランダムな「決め台詞」が鳴る。
 * ヒーローの名乗り・歌舞伎の口上・アニメの決め台詞のようなノリで、
 * 同じ単語でも毎回違う声が返ってくる = 何度でも撮りたくなる報酬にする。
 *
 * 実装は端末の SpeechSynthesis のみ(サーバー費用ゼロ・即時再生)。
 * 声色は pitch / rate / volume の組み合わせで作る。
 * 台詞は台湾華語(学習言語)を基本にし、単語そのものを必ず含める:
 *   「◯◯、ゲットだ!」を耳から覚える効果も兼ねる。
 */

export type VoiceLine = {
  id: string;
  /** {w} は単語に置換される。 */
  template: string;
  /** 言語(台湾華語 or 日本語)。 */
  lang: "zh-TW" | "ja";
  /** 0.1〜2。低いほど太い声。 */
  pitch: number;
  /** 0.1〜10。決め台詞なのでゆっくりめが映える。 */
  rate: number;
  label: string;
};

export const DEFAULT_LINES: VoiceLine[] = [
  { id: "get",        template: "{w}、ゲットだぜ!",       lang: "ja",    pitch: 1.5, rate: 1.05, label: "ゲットだぜ" },
  { id: "hero",       template: "参上!{w}!",             lang: "ja",    pitch: 0.7, rate: 0.85, label: "ヒーロー参上" },
  { id: "kabuki",     template: "い〜〜や、{w}!",          lang: "ja",    pitch: 0.6, rate: 0.7,  label: "歌舞伎の口上" },
  { id: "zh_dedao",   template: "{w}，得到了!",            lang: "zh-TW", pitch: 1.4, rate: 1.0,  label: "得到了!" },
  { id: "zh_jiushi",  template: "這就是{w}!",              lang: "zh-TW", pitch: 1.1, rate: 0.9,  label: "這就是〜" },
  { id: "zh_taibang", template: "{w}，太棒了!",            lang: "zh-TW", pitch: 1.6, rate: 1.1,  label: "太棒了!" },
  { id: "calm",       template: "{w}。記憶した。",          lang: "ja",    pitch: 0.8, rate: 0.8,  label: "静かな確信" },
  { id: "shout",      template: "{w}ぅぅっ!",              lang: "ja",    pitch: 1.8, rate: 1.2,  label: "叫び" },
  { id: "zh_shouji",  template: "收集完成，{w}!",           lang: "zh-TW", pitch: 1.2, rate: 0.95, label: "收集完成" },
  { id: "master",     template: "ふっ…{w}、いただいた。",   lang: "ja",    pitch: 0.65, rate: 0.75, label: "師匠風" },
];

const STORE_KEY = "catch-voice-lines-v1";
const ENABLED_KEY = "catch-voice-enabled-v1";

/** 保存済みの台詞一覧(開発者が編集した内容)。無ければ既定。 */
export function loadLines(): VoiceLine[] {
  if (typeof window === "undefined") return DEFAULT_LINES;
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return DEFAULT_LINES;
    const parsed = JSON.parse(raw) as VoiceLine[];
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_LINES;
    return parsed.filter((l) => l && typeof l.template === "string" && l.template.includes("{w}"));
  } catch {
    return DEFAULT_LINES;
  }
}

export function saveLines(lines: VoiceLine[]) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(lines));
  } catch { /* storage unavailable */ }
}

export function isVoiceEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(ENABLED_KEY) !== "0";
}

export function setVoiceEnabled(on: boolean) {
  try {
    localStorage.setItem(ENABLED_KEY, on ? "1" : "0");
  } catch { /* noop */ }
}

/** 台詞を1つランダムに選ぶ(直前と同じものは避ける)。 */
let lastId: string | null = null;
export function pickLine(lines = loadLines()): VoiceLine {
  const pool = lines.length > 1 ? lines.filter((l) => l.id !== lastId) : lines;
  const line = pool[Math.floor(Math.random() * pool.length)] ?? lines[0];
  lastId = line.id;
  return line;
}

function pickVoice(lang: VoiceLine["lang"]): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  if (lang === "zh-TW") {
    return (
      voices.find((v) => /zh[-_]TW|zh[-_]Hant|cmn[-_]Hant/i.test(v.lang)) ??
      voices.find((v) => /^zh/i.test(v.lang))
    );
  }
  return voices.find((v) => /^ja/i.test(v.lang));
}

/**
 * 決め台詞を再生する。呼ぶ側は演出の「空中で止まる」瞬間に叩く。
 * 発話が始まるまでの実測値を返す必要はない — 失敗しても演出は続ける。
 */
export function speakCatchLine(word: string, line: VoiceLine = pickLine()): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  if (!isVoiceEnabled()) return;
  try {
    // 既に鳴っている読み上げは止める(単語の発音と重ならないように)。
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(line.template.replace(/\{w\}/g, word));
    const v = pickVoice(line.lang);
    if (v) u.voice = v;
    u.lang = v?.lang ?? (line.lang === "zh-TW" ? "zh-TW" : "ja-JP");
    u.pitch = Math.max(0.1, Math.min(2, line.pitch));
    u.rate = Math.max(0.1, Math.min(10, line.rate));
    u.volume = 1;
    window.speechSynthesis.speak(u);
  } catch { /* 演出の一部なので失敗は無視 */ }
}
