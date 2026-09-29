/**
 * 開発者が選んだ会社で発音を作る（`tts-providers.ts` の表を使う）。
 *
 * - 設定は `app_config.key='tts_voice'`。呼ぶたびに DB へ行かないよう 30 秒ためる
 *   （`ai_models` と同じ）。
 * - **1回だけ・6秒で見切る。** 押した人を待たせないのが先。駄目なら呼び出し側が
 *   これまでの声に落とす（その音はこれまでの置き場所に貯める — 新しい声の
 *   置き場所に古い声を入れない）。
 */
import { findKey } from "./ai-provider.server";
import {
  azureSsml,
  choiceFor,
  elevenLabsBody,
  geminiAudioFrom,
  geminiBody,
  hexToBytes,
  isVoiceLocked,
  minimaxBody,
  providerInfo,
  voiceTag,
  type GeminiDiagnosis,
  type GeminiVoiceInfo,
  type TtsChoice,
  type TtsVoiceConfig,
} from "./tts-providers";

let cache: { at: number; value: TtsVoiceConfig | null } = { at: 0, value: null };

export async function getTtsVoiceConfig(): Promise<TtsVoiceConfig | null> {
  const now = Date.now();
  if (now - cache.at < 30_000) return cache.value;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (k: string, v: string) => { maybeSingle: () => Promise<{ data: unknown }> };
        };
      };
    };
    const { data } = await db
      .from("app_config")
      .select("value")
      .eq("key", "tts_voice")
      .maybeSingle();
    const value = ((data as { value?: TtsVoiceConfig } | null)?.value ??
      null) as TtsVoiceConfig | null;
    cache = { at: now, value };
    return value;
  } catch {
    cache = { at: now, value: null };
    return null;
  }
}

/** 保存した直後に、30 秒待たずに新しい声へ切り替える。 */
export function forgetTtsVoiceConfig(): void {
  cache = { at: 0, value: null };
}

export async function activeChoice(language: string): Promise<TtsChoice | null> {
  return choiceFor(await getTtsVoiceConfig(), language);
}

/** いまの声の札（置き場所の鍵に混ぜる）。 */
export async function currentVoiceTag(language: string): Promise<string> {
  return voiceTag(await activeChoice(language));
}

/** その言語の声が固定されているか（台湾の声。固定中は別の声・端末の声へ落とさない）。 */
export async function isLockedFor(language: string): Promise<boolean> {
  return isVoiceLocked(await getTtsVoiceConfig(), language);
}

/** 鍵が揃っているか（値は返さない）。Gemini は Google の鍵の別名も見る。 */
export function providerKeysPresent(id: string): boolean {
  const info = providerInfo(id);
  if (!info) return false;
  if (id === "gemini") return findKey("google") !== null;
  return info.keyEnvs.every((k) => Boolean(process.env[k]));
}

const TIMEOUT_MS = 6000;
/** Gemini は文を読み終えてから返すので、Azure などより余裕を持たせる。 */
const GEMINI_TIMEOUT_MS = 12_000;

async function post(url: string, init: RequestInit, timeoutMs = TIMEOUT_MS): Promise<Response> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`TTS ${res.status} ${body.slice(0, 160)}`);
  }
  return res;
}

export type SynthesizedAudio = { bytes: Uint8Array; mime: string };

/** 一時的な失敗（混雑・圏外・時間切れ）か。 */
function isTransient(e: unknown): boolean {
  const m = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  return /TTS (429|5\d\d)|timeout|aborted|fetch failed|network/i.test(m);
}

/**
 * 選んだ会社で音を作る（MP3。Gemini は WAV）。鍵が無い・失敗したら投げる。
 * **一時的な失敗は同じ声で1回だけやり直す** — 台湾の声は別の声に切り替えないので、
 * 混んでいた時に黙って別の声にならないよう、同じ声をもう一度頼む。
 */
export async function synthesizeAudio(
  choice: TtsChoice,
  text: string,
  speed: number,
  language: string,
): Promise<SynthesizedAudio> {
  try {
    return await synthesizeOnce(choice, text, speed, language);
  } catch (e) {
    if (!isTransient(e)) throw e;
    await new Promise((r) => setTimeout(r, 400));
    return synthesizeOnce(choice, text, speed, language);
  }
}

/** 音の中身だけ欲しい所（前の呼び名）。 */
export async function synthesizeWithChoice(
  choice: TtsChoice,
  text: string,
  speed: number,
  language: string,
): Promise<Uint8Array> {
  return (await synthesizeAudio(choice, text, speed, language)).bytes;
}

async function synthesizeOnce(
  choice: TtsChoice,
  text: string,
  speed: number,
  language: string,
): Promise<SynthesizedAudio> {
  const info = providerInfo(choice.provider);
  if (!info?.implemented) throw new Error(`TTS provider not connected: ${choice.provider}`);
  if (choice.provider === "gemini") {
    // 鍵の名前は別名も見る（`findKey("google")`）。値は表に出さない。
    const key = findKey("google");
    if (!key) throw new Error("TTS key missing: GEMINI_API_KEY");
    const model = choice.model || info.models[0];
    const res = await post(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        // 鍵は URL ではなく見出しに置く（URL はログに残りやすい）。
        headers: { "x-goog-api-key": key.value, "Content-Type": "application/json" },
        body: JSON.stringify(geminiBody(text, choice.voice)),
      },
      GEMINI_TIMEOUT_MS,
    );
    return geminiAudioFrom(await res.json());
  }
  const missing = info.keyEnvs.filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`TTS key missing: ${missing.join(", ")}`);
  return { bytes: await synthesizeMp3Provider(choice, text, speed, language), mime: "audio/mpeg" };
}

async function synthesizeMp3Provider(
  choice: TtsChoice,
  text: string,
  speed: number,
  language: string,
): Promise<Uint8Array> {
  const info = providerInfo(choice.provider)!;

  if (choice.provider === "azure") {
    // https://<region>.tts.speech.microsoft.com/cognitiveservices/v1
    const region = process.env.AZURE_SPEECH_REGION!;
    const res = await post(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": process.env.AZURE_SPEECH_KEY!,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
        "User-Agent": "catchwords",
      },
      body: azureSsml(text, choice.voice, speed),
    });
    return new Uint8Array(await res.arrayBuffer());
  }

  if (choice.provider === "elevenlabs") {
    const model = choice.model || info.models[0];
    const res = await post(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(choice.voice)}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": process.env.ELEVENLABS_API_KEY!,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify(elevenLabsBody(text, model, speed, language)),
      },
    );
    return new Uint8Array(await res.arrayBuffer());
  }

  if (choice.provider === "minimax") {
    const model = choice.model || info.models[0];
    const host = (process.env.MINIMAX_API_HOST || "https://api.minimax.io").replace(/\/$/, "");
    const group = process.env.MINIMAX_GROUP_ID;
    const res = await post(
      `${host}/v1/t2a_v2${group ? `?GroupId=${encodeURIComponent(group)}` : ""}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.MINIMAX_API_KEY!}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(minimaxBody(text, model, choice.voice, speed, language)),
      },
    );
    const json = (await res.json()) as {
      data?: { audio?: string };
      base_resp?: { status_code?: number; status_msg?: string };
    };
    if (json.base_resp?.status_code) {
      throw new Error(
        `TTS minimax ${json.base_resp.status_code} ${json.base_resp.status_msg ?? ""}`,
      );
    }
    if (!json.data?.audio) throw new Error("TTS minimax empty audio");
    return hexToBytes(json.data.audio);
  }

  throw new Error(`TTS provider not connected: ${choice.provider}`);
}

// ---- 診断（開発者だけ。鍵の値は返さない・課金しない） -----------------------------

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

/** 返事の1件から、画面に出す最小の項目だけ取る（形が違っても落ちない）。 */
export function readGeminiVoice(raw: unknown): GeminiVoiceInfo | null {
  const v = raw as Record<string, unknown> | null;
  if (!v || typeof v !== "object") return null;
  const str = (k: string[]) => {
    for (const key of k) if (typeof v[key] === "string" && v[key]) return v[key] as string;
    return "";
  };
  const id = str(["name", "voiceName", "voice_name", "id"]);
  if (!id) return null;
  const langs = (v.languageCodes ?? v.language_codes ?? v.languages) as unknown;
  return {
    id: id.replace(/^voices\//, ""),
    name: str(["displayName", "display_name", "title"]) || id.replace(/^voices\//, ""),
    gender: str(["gender", "genderPresentation"]),
    accent: str(["accent"]),
    languages: Array.isArray(langs) ? langs.filter((x): x is string => typeof x === "string") : [],
  };
}

/**
 * Gemini の TTS が使えるかを、**課金の無い問い合わせだけ**で確かめる:
 * ① 鍵が在るか（名前だけ）、② 3.8 の2つのモデルが見えるか、③ 拡張の声のライブラリに
 * 台湾（zh-TW）の声が男女それぞれ在るか。実際に鳴らすのは「試しに鳴らす」（少額の課金）。
 */
export async function diagnoseGemini(): Promise<GeminiDiagnosis> {
  const key = findKey("google");
  const out: GeminiDiagnosis = {
    keyPresent: key !== null,
    keyEnv: key?.env ?? null,
    models: [],
    voices: { female: [], male: [] },
    voicesError: null,
  };
  if (!key) return out;
  const headers = { "x-goog-api-key": key.value };
  const get = (path: string) =>
    fetch(`${GEMINI_BASE}${path}`, { headers, signal: AbortSignal.timeout(10_000) });
  const models = providerInfo("gemini")?.models ?? [];
  out.models = await Promise.all(
    models.map(async (id) => {
      try {
        const r = await get(`/models/${encodeURIComponent(id)}`);
        return { id, ok: r.ok, status: r.status };
      } catch {
        return { id, ok: false, status: 0 };
      }
    }),
  );
  for (const gender of ["female", "male"] as const) {
    try {
      const r = await get(`/voices?language_code=zh-TW&gender=${gender}&page_size=50`);
      if (!r.ok) {
        const body = await r.text().catch(() => "");
        out.voicesError = `HTTP ${r.status} ${body.slice(0, 140).replace(/\s+/g, " ")}`;
        continue;
      }
      const json = (await r.json()) as { voices?: unknown[] };
      out.voices[gender] = (json.voices ?? [])
        .map(readGeminiVoice)
        .filter((x): x is GeminiVoiceInfo => x !== null)
        .slice(0, 50);
    } catch (e) {
      out.voicesError = e instanceof Error ? e.message.slice(0, 140) : "voices request failed";
    }
  }
  return out;
}
