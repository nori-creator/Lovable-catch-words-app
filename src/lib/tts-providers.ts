/**
 * **発音の声を出す会社を、開発者が選べるようにする。**（オーナー指示 2026-09-23
 * 「台湾華語の発音が機械音で気に入らないから、Azure、VoAI 絕好聲創、ATEN 優聲學、
 *  MiniMax Speech 2.8、ElevenLabs v3など、開発者の私だけ、apiを設定できるようにして」）
 *
 * ここは**表と純粋な関数だけ**（試験から触れるように）。実際に外へ頼むのは
 * `tts-provider.server.ts`。
 *
 * ## OpenRouter を通さない
 * 発音は押してから鳴るまでの速さが命。間に1社挟むと往復が1つ増える。
 * さらに（2026-09 時点）OpenRouter の読み上げは GPT-4o mini TTS・Gemini TTS・
 * Voxtral など自社の一覧の物だけで、Azure・ElevenLabs・MiniMax・VoAI・ATEN は
 * 選べない。各社へ直に頼む。
 *
 * ## 鍵は DB に置かない
 * `ai_models` と同じ決まり。DB（`app_config.key='tts_voice'`）には
 * 「どの会社の・どの声・どのモデル」だけを置き、鍵は環境変数の名前で引く。
 *
 * ## 声を変えたら、貯めた音も替わる
 * 音はサーバ（Storage）にも端末（IndexedDB）にも貯めてあり、置き場所の鍵に
 * **声の札**（`voiceTag`）を混ぜる。札が変われば別の置き場所になるので、
 * 古い声が残って鳴り続けることは無い。何も選んでいない時の札は、これまでの
 * `alloy` のまま（今ある音をそのまま使い続けるため）。
 */

import { TTS_VOICE_DEFAULT } from "./tts-cache";
import { TARGET_LANGUAGES } from "./target-lang";

export type TtsProviderId = "azure" | "elevenlabs" | "minimax" | "voai" | "aten";

export type TtsProviderInfo = {
  id: TtsProviderId;
  label: string;
  /** 鍵の環境変数（全部そろって使える）。 */
  keyEnvs: string[];
  /**
   * 繋いであるか。VoAI と ATEN は**公式の API 仕様を取れなかった**ので
   * 繋いでいない（推測で書くと、鳴らない・違う声が貯まる）。契約時に
   * 仕様書を受け取ったら足す。
   */
  implemented: boolean;
  /** 選べるモデル（先頭が既定）。空ならモデルの指定は無い。 */
  models: string[];
  /** 学習言語ごとの声の候補（先頭が既定）。空なら声の ID を手で入れる。 */
  voices: Partial<Record<string, string[]>>;
  note: string;
};

export const TTS_PROVIDERS: TtsProviderInfo[] = [
  {
    id: "azure",
    label: "Azure AI Speech",
    keyEnvs: ["AZURE_SPEECH_KEY", "AZURE_SPEECH_REGION"],
    implemented: true,
    models: [],
    voices: {
      "zh-TW": ["zh-TW-HsiaoChenNeural", "zh-TW-YunJheNeural", "zh-TW-HsiaoYuNeural"],
      en: ["en-US-AvaMultilingualNeural", "en-US-AndrewMultilingualNeural", "en-US-JennyNeural"],
    },
    note: "台湾華語（zh-TW）専用の声がある。",
  },
  {
    id: "elevenlabs",
    label: "ElevenLabs",
    keyEnvs: ["ELEVENLABS_API_KEY"],
    implemented: true,
    // Flash が最速。v3 は表現が豊かだが、会社自身がリアルタイム向けではないと言っている。
    models: ["eleven_flash_v2_5", "eleven_turbo_v2_5", "eleven_multilingual_v2", "eleven_v3"],
    voices: {},
    note: "声の ID は ElevenLabs の Voice Library からコピーして入れる。",
  },
  {
    id: "minimax",
    label: "MiniMax Speech 2.8",
    keyEnvs: ["MINIMAX_API_KEY"],
    implemented: true,
    models: ["speech-2.8-turbo", "speech-2.8-hd"],
    voices: {},
    note: "声の ID は MiniMax の管理画面から入れる。台湾の発音かどうかは声しだい。",
  },
  {
    id: "voai",
    label: "VoAI 絕好聲創",
    keyEnvs: ["VOAI_API_KEY"],
    implemented: false,
    models: [],
    voices: {},
    note: "公式の API 仕様書を取得できなかったため未接続。契約後に仕様書をもらえば足せる。",
  },
  {
    id: "aten",
    label: "ATEN 優聲學",
    keyEnvs: ["ATEN_AIVOICE_API_KEY"],
    implemented: false,
    models: [],
    voices: {},
    note: "API は企業版の契約で提供（公開の仕様書なし）。仕様書をもらえば足せる。",
  },
];

export function providerInfo(id: string | undefined | null): TtsProviderInfo | null {
  return TTS_PROVIDERS.find((p) => p.id === id) ?? null;
}

/** 1つの学習言語に使う声。 */
export type TtsChoice = {
  provider: TtsProviderId;
  voice: string;
  model?: string;
};

/** `app_config.key='tts_voice'` の中身。学習言語ごと。 */
export type TtsVoiceConfig = {
  languages?: Partial<Record<string, TtsChoice>>;
};

/** 声を選べる学習言語（学習言語の表をそのまま使う）。 */
export const TTS_LANGUAGES = TARGET_LANGUAGES;

/** 声の ID・モデル名に使ってよい字（置き場所の道にも混ざるので絞る）。 */
const SAFE = /^[A-Za-z0-9_.:()\- ]{1,100}$/;

/**
 * 保存する前の掃除。知らない会社・繋いでいない会社・変な字は捨てる
 * （その言語は「これまでの声」に戻る）。
 */
export function cleanTtsConfig(raw: unknown): TtsVoiceConfig {
  const out: Partial<Record<string, TtsChoice>> = {};
  const langs = (raw as TtsVoiceConfig | null)?.languages;
  if (!langs || typeof langs !== "object") return {};
  for (const lang of TTS_LANGUAGES) {
    const c = (langs as Record<string, unknown>)[lang] as Partial<TtsChoice> | undefined;
    if (!c || typeof c !== "object") continue;
    const info = providerInfo(c.provider);
    if (!info?.implemented) continue;
    const voice = typeof c.voice === "string" ? c.voice.trim() : "";
    if (!SAFE.test(voice)) continue;
    const model = typeof c.model === "string" ? c.model.trim() : "";
    if (model && !SAFE.test(model)) continue;
    out[lang] = { provider: info.id, voice, ...(model ? { model } : {}) };
  }
  return Object.keys(out).length ? { languages: out } : {};
}

/**
 * **声の札。** 貯めた音の置き場所（サーバ・端末の両方）に混ぜる。
 * 何も選んでいなければ、これまでの `alloy`。
 *
 * 道にも PostgREST の絞り込みにも入るので、英数字と `_` `-` だけにする
 * （`.` は絞り込みの区切りと紛れる）。
 */
export function voiceTag(choice: TtsChoice | null | undefined): string {
  if (!choice) return TTS_VOICE_DEFAULT;
  const part = (s: string) => s.replace(/[^A-Za-z0-9-]+/g, "_").slice(0, 60);
  return [choice.provider, part(choice.voice), choice.model ? part(choice.model) : ""]
    .filter(Boolean)
    .join("_");
}

/** その言語で使う声（選んでいなければ null = これまでの声）。 */
export function choiceFor(
  config: TtsVoiceConfig | null | undefined,
  language: string,
): TtsChoice | null {
  const c = config?.languages?.[language];
  return c && providerInfo(c.provider)?.implemented ? c : null;
}

// ---- 各社への頼み方（純粋な部分） ------------------------------------------

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (ch) =>
    ch === "<"
      ? "&lt;"
      : ch === ">"
        ? "&gt;"
        : ch === "&"
          ? "&amp;"
          : ch === "'"
            ? "&apos;"
            : "&quot;",
  );
}

/** Azure の SSML。速さは `prosody rate` の百分率（0.95 → -5%）。 */
export function azureSsml(text: string, voice: string, speed: number): string {
  const lang = voice.split("-").slice(0, 2).join("-");
  const rate = Math.round((speed - 1) * 100);
  return (
    `<speak version='1.0' xml:lang='${escapeXml(lang)}'>` +
    `<voice name='${escapeXml(voice)}'>` +
    `<prosody rate='${rate >= 0 ? "+" : ""}${rate}%'>${escapeXml(text)}</prosody>` +
    `</voice></speak>`
  );
}

/** ElevenLabs で言語を固定できるのは Turbo / Flash v2.5 だけ（他は付けると断られる）。 */
export function elevenLabsBody(text: string, model: string, speed: number, language: string) {
  const enforce = model === "eleven_flash_v2_5" || model === "eleven_turbo_v2_5";
  return {
    text,
    model_id: model,
    ...(enforce ? { language_code: language.startsWith("zh") ? "zh" : "en" } : {}),
    voice_settings: { speed: Math.min(1.2, Math.max(0.7, speed)) },
  };
}

export function minimaxBody(
  text: string,
  model: string,
  voice: string,
  speed: number,
  language: string,
) {
  return {
    model,
    text,
    stream: false,
    language_boost: language.startsWith("zh") ? "Chinese" : "English",
    voice_setting: { voice_id: voice, speed, vol: 1, pitch: 0 },
    audio_setting: { sample_rate: 32000, bitrate: 128000, format: "mp3", channel: 1 },
    output_format: "hex",
  };
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  if (clean.length % 2 !== 0 || /[^0-9a-fA-F]/.test(clean)) throw new Error("bad hex audio");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}
