/**
 * 開発者が選んだ会社で発音を作る（`tts-providers.ts` の表を使う）。
 *
 * - 設定は `app_config.key='tts_voice'`。呼ぶたびに DB へ行かないよう 30 秒ためる
 *   （`ai_models` と同じ）。
 * - **1回だけ・6秒で見切る。** 押した人を待たせないのが先。駄目なら呼び出し側が
 *   これまでの声に落とす（その音はこれまでの置き場所に貯める — 新しい声の
 *   置き場所に古い声を入れない）。
 */
import {
  azureSsml,
  choiceFor,
  elevenLabsBody,
  hexToBytes,
  minimaxBody,
  providerInfo,
  voiceTag,
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

/** 鍵が揃っているか（値は返さない）。 */
export function providerKeysPresent(id: string): boolean {
  const info = providerInfo(id);
  return Boolean(info && info.keyEnvs.every((k) => Boolean(process.env[k])));
}

const TIMEOUT_MS = 6000;

async function post(url: string, init: RequestInit): Promise<Response> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`TTS ${res.status} ${body.slice(0, 160)}`);
  }
  return res;
}

/** 選んだ会社で MP3 を作る。鍵が無い・失敗したら投げる。 */
export async function synthesizeWithChoice(
  choice: TtsChoice,
  text: string,
  speed: number,
  language: string,
): Promise<Uint8Array> {
  const info = providerInfo(choice.provider);
  if (!info?.implemented) throw new Error(`TTS provider not connected: ${choice.provider}`);
  const missing = info.keyEnvs.filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`TTS key missing: ${missing.join(", ")}`);

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
