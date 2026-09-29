import { TAIWAN_AZURE_VOICES, providerInfo } from "../../src/lib/tts-providers";
import {
  TTS_COMPARE_SAMPLES,
  azureSpeech,
  diagnoseGeminiWith,
  geminiKeyFrom,
  geminiSpeech,
} from "../../src/lib/tts-synth";

/**
 * **確認用ページで Azure と Gemini の台湾の声を聞き比べる**（オーナー指示 R20「プレビューで
 * gemini と azure の音声を聞き比べたい」）。
 *
 * 鍵は **Netlify の環境変数**から読む（アプリ本体の鍵は Lovable の Secrets にあり、確認用ページ
 * からは届かないため）。鍵の値は返さない・ログに出さない。
 *  - GET  … どちらの鍵があるか（名前だけ）と、Gemini の台湾（zh-TW）の声の一覧（課金なし）
 *  - POST … 決まった文（`TTS_COMPARE_SAMPLES`）を、決まった声で1回読む（少額の課金）
 * 好きな文・好きな声は受けない。1つの IP から 1 分に 30 回まで。
 */
const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store" } });

const SAFE = /^[A-Za-z0-9_.:()\- ]{1,100}$/;
const AZURE_ALLOWED = new Set([...TAIWAN_AZURE_VOICES.female, ...TAIWAN_AZURE_VOICES.male]);

function azureKeys() {
  const key = process.env.AZURE_SPEECH_KEY?.trim();
  const region = process.env.AZURE_SPEECH_REGION?.trim();
  return key && region ? { key, region } : null;
}

export default async function handler(request: Request) {
  const gemini = geminiKeyFrom(process.env);
  const azure = azureKeys();
  if (request.method === "GET") {
    const diag = gemini ? await diagnoseGeminiWith(gemini).catch(() => null) : null;
    return json({
      azure: azure !== null,
      gemini: gemini !== null,
      geminiKeyEnv: gemini?.env ?? null,
      geminiModels: diag?.models ?? [],
      geminiVoices: diag?.voices ?? { female: [], male: [] },
      geminiVoicesError: diag?.voicesError ?? null,
    });
  }
  if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  let body: { provider?: unknown; voice?: unknown; model?: unknown; sample?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "INVALID_INPUT" }, 400);
  }
  const text = TTS_COMPARE_SAMPLES[Number(body.sample)];
  const voice = typeof body.voice === "string" ? body.voice.trim() : "";
  if (!text || !SAFE.test(voice)) return json({ error: "INVALID_INPUT" }, 400);
  try {
    const t0 = Date.now();
    let made;
    if (body.provider === "azure") {
      if (!azure)
        return json(
          { error: "KEY_MISSING", keys: ["AZURE_SPEECH_KEY", "AZURE_SPEECH_REGION"] },
          503,
        );
      if (!AZURE_ALLOWED.has(voice)) return json({ error: "INVALID_INPUT" }, 400);
      made = await azureSpeech({ ...azure, voice, text, speed: 1 });
    } else if (body.provider === "gemini") {
      if (!gemini) return json({ error: "KEY_MISSING", keys: ["GEMINI_API_KEY"] }, 503);
      const models = providerInfo("gemini")?.models ?? [];
      const model =
        typeof body.model === "string" && models.includes(body.model) ? body.model : models[0];
      made = await geminiSpeech({ key: gemini.value, model, voice, text });
    } else return json({ error: "INVALID_INPUT" }, 400);
    return new Response(new Blob([made.bytes as Uint8Array<ArrayBuffer>]), {
      headers: {
        "Content-Type": made.mime,
        "Cache-Control": "no-store",
        "X-TTS-Ms": String(Date.now() - t0),
      },
    });
  } catch (e) {
    // 相手の返事の頭だけ返す（鍵は含まれない）。何が悪いかを画面に出すため。
    const msg = e instanceof Error ? e.message.slice(0, 200) : "TTS failed";
    return json({ error: "TTS_FAILED", detail: msg }, 502);
  }
}

export const config = {
  path: "/api/tts-compare",
  rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
