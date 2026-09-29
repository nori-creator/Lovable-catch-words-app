/**
 * **台湾の声の聞き比べ**（オーナー指示 R20「プレビューで gemini と azure の音声を聞き比べたい。
 * またアプリ内から開発者の私が簡単に設定できるように解説して」）。
 *
 * 上: 同じ文を Azure と Gemini の声で押すだけで鳴らす（届くまでの時間も出す）。
 * 下: アプリの設定と**同じ画面**（`TtsVoiceForm`）。ここで試した操作が、そのままアプリでの手順。
 *
 * 音は Netlify の関数（`netlify/functions/tts-compare.mts`）が作る。鍵は Netlify の環境変数に
 * 置く（アプリの鍵は Lovable の Secrets にあり、この確認用ページからは届かない）。
 * 鍵が無い時は、何をどこに入れればよいかを画面に出す。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { TtsVoiceForm, type TtsVoiceAdminData } from "@/components/TtsVoiceForm";
import {
  TAIWAN_AZURE_VOICES,
  TTS_LANGUAGES,
  TTS_PROVIDERS,
  providerInfo,
  type GeminiDiagnosis,
  type GeminiVoiceInfo,
} from "@/lib/tts-providers";
import { TTS_COMPARE_SAMPLES } from "@/lib/tts-synth";

type Status = {
  azure: boolean;
  gemini: boolean;
  geminiKeyEnv: string | null;
  geminiModels: Array<{ id: string; ok: boolean; status: number }>;
  geminiVoices: Record<"female" | "male", GeminiVoiceInfo[]>;
  geminiVoicesError: string | null;
};

type Voice = { provider: "azure" | "gemini"; voice: string; label: string; note?: string };

const API = "/api/tts-compare";

/** Azure の台湾の声（名前と性別は Microsoft の声の一覧のとおり）。 */
const AZURE: Voice[] = [
  { provider: "azure", voice: TAIWAN_AZURE_VOICES.female[0], label: "女性 HsiaoChen（曉臻）" },
  { provider: "azure", voice: TAIWAN_AZURE_VOICES.female[1], label: "女性 HsiaoYu（曉雨）" },
  { provider: "azure", voice: TAIWAN_AZURE_VOICES.male[0], label: "男性 YunJhe（雲哲）" },
];

/**
 * Gemini の台湾（zh-TW）の声が一覧に無かった時に、参考として鳴らす標準の声。
 * 性別・台湾なまりは公式に書かれていないので、ここでも言わない。
 */
const GEMINI_FALLBACK = ["Kore", "Aoede", "Leda", "Charon", "Puck", "Orus"];

/** 鳴らした音は、同じ声・同じ文ならもう頼まない（課金を増やさない）。 */
const played = new Map<string, { url: string; ms: number }>();

async function speak(
  v: { provider: string; voice: string; model?: string },
  sample: number,
): Promise<{ url: string; ms: number }> {
  const key = `${v.provider}|${v.voice}|${v.model ?? ""}|${sample}`;
  const hit = played.get(key);
  if (hit) return { url: hit.url, ms: hit.ms };
  const t0 = performance.now();
  const r = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...v, sample }),
  });
  if (!r.ok) {
    const e = (await r.json().catch(() => ({}))) as {
      error?: string;
      detail?: string;
      keys?: string[];
    };
    throw new Error(
      e.error === "KEY_MISSING"
        ? `Netlify に鍵がありません: ${(e.keys ?? []).join(", ")}`
        : e.detail
          ? `失敗: ${e.detail}`
          : `失敗（${r.status}）`,
    );
  }
  const url = URL.createObjectURL(await r.blob());
  const ms = Math.round(performance.now() - t0);
  played.set(key, { url, ms });
  return { url, ms };
}

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e3e7ee",
  borderRadius: 18,
  padding: 14,
  marginBottom: 12,
};
const h2: React.CSSProperties = { fontSize: 15, fontWeight: 800, margin: "0 0 8px" };
const small: React.CSSProperties = { fontSize: 12, color: "#5b6472", lineHeight: 1.55 };

export function TtsVoicesScene() {
  const [status, setStatus] = useState<Status | null>(null);
  const [offline, setOffline] = useState(false);
  const [sample, setSample] = useState(0);
  const [model, setModel] = useState(providerInfo("gemini")?.models[0] ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, string>>({});
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetch(API)
      .then((r) =>
        r.ok ? (r.json() as Promise<Status>) : Promise.reject(new Error(String(r.status))),
      )
      .then(setStatus)
      .catch(() => setOffline(true));
  }, []);

  const geminiVoices: Voice[] = useMemo(() => {
    const lib = status?.geminiVoices;
    const found = [
      ...(lib?.female ?? []).map((v) => ({ v, g: "女性" })),
      ...(lib?.male ?? []).map((v) => ({ v, g: "男性" })),
    ];
    if (found.length)
      return found.map(({ v, g }) => ({
        provider: "gemini" as const,
        voice: v.id,
        label: `${g} ${v.name}`,
        note: [v.accent, v.languages.join("/")].filter(Boolean).join(" · "),
      }));
    return GEMINI_FALLBACK.map((name) => ({
      provider: "gemini" as const,
      voice: name,
      label: name,
      note: "標準の声（台湾なまりの保証なし）",
    }));
  }, [status]);

  async function play(v: Voice) {
    const id = `${v.provider}|${v.voice}`;
    setBusy(id);
    try {
      const r = await speak({ ...v, model: v.provider === "gemini" ? model : undefined }, sample);
      audio.current?.pause();
      audio.current = new Audio(r.url);
      void audio.current.play();
      setResult((m) => ({ ...m, [id]: `${r.ms} ミリ秒で届いた` }));
    } catch (e) {
      setResult((m) => ({ ...m, [id]: e instanceof Error ? e.message : "失敗" }));
    } finally {
      setBusy(null);
    }
  }

  const row = (v: Voice) => {
    const id = `${v.provider}|${v.voice}`;
    return (
      <div
        key={id}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 0",
          borderTop: "1px solid #eef1f5",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{v.label}</div>
          {v.note && <div style={small}>{v.note}</div>}
          {result[id] && <div style={{ ...small, color: "#1f5fbf" }}>{result[id]}</div>}
        </div>
        <button
          type="button"
          onClick={() => void play(v)}
          disabled={busy !== null}
          aria-label={`${v.label} を鳴らす`}
          style={{
            minWidth: 64,
            minHeight: 44,
            borderRadius: 999,
            border: 0,
            background: busy === id ? "#9ab8ec" : "#0a84ff",
            color: "#fff",
            fontWeight: 800,
            fontSize: 13,
          }}
        >
          {busy === id ? "…" : "▶ 再生"}
        </button>
      </div>
    );
  };

  const formData: TtsVoiceAdminData = {
    config: {},
    providers: TTS_PROVIDERS.map((p) => ({
      ...p,
      voices: p.voices as Record<string, string[]>,
      keys_present:
        p.id === "azure" ? !!status?.azure : p.id === "gemini" ? !!status?.gemini : false,
    })),
    languages: [...TTS_LANGUAGES],
    taiwanAzureVoices: TAIWAN_AZURE_VOICES,
    legacy: "OpenAI 互換 TTS",
  };

  const keysReady = status?.azure && status?.gemini;

  return (
    <div style={{ paddingBottom: 40 }}>
      <div style={card}>
        <h2 style={h2}>台湾の声を聞き比べる</h2>
        <p style={small}>
          同じ文を、Azure と Gemini
          の声で鳴らします。1回鳴らすごとに少額の課金があります（同じ声・同じ文の2回目からは、この画面に残した音を鳴らすので課金しません）。
        </p>
        {offline && (
          <p style={{ ...small, color: "#b42318" }}>
            この画面は Netlify の確認用ページでだけ動きます（手元の確認では音の関数がありません）。
          </p>
        )}
        {status && !keysReady && <KeySteps status={status} />}
        {status && keysReady && (
          <p style={{ ...small, color: "#1a7f37" }}>
            鍵: Azure あり・Gemini あり（{status.geminiKeyEnv}）
          </p>
        )}
        <div
          role="radiogroup"
          aria-label="読む文"
          style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}
        >
          {TTS_COMPARE_SAMPLES.map((s, i) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={sample === i}
              onClick={() => setSample(i)}
              style={{
                minHeight: 40,
                padding: "0 12px",
                borderRadius: 999,
                border: sample === i ? "2px solid #0a84ff" : "1px solid #d8dde6",
                background: sample === i ? "#eaf3ff" : "#fff",
                fontSize: 14,
              }}
              lang="zh-Hant"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div style={card}>
        <h2 style={h2}>Azure（台湾の声だけ）</h2>
        {AZURE.map(row)}
      </div>

      <div style={card}>
        <h2 style={h2}>Gemini TTS</h2>
        <div
          role="radiogroup"
          aria-label="Gemini のモデル"
          style={{ display: "flex", gap: 6, marginBottom: 6 }}
        >
          {(providerInfo("gemini")?.models ?? []).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={model === m}
              onClick={() => setModel(m)}
              style={{
                flex: 1,
                minHeight: 40,
                borderRadius: 12,
                border: model === m ? "2px solid #0a84ff" : "1px solid #d8dde6",
                background: model === m ? "#eaf3ff" : "#fff",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {m.includes("lite") ? "3.8 Flash-Lite（速い・安い）" : "3.8 Flash（表現が豊か）"}
            </button>
          ))}
        </div>
        {status?.gemini && (
          <p style={small}>
            {status.geminiModels
              .map((m) => `${m.id}: ${m.ok ? "使える" : `使えない（${m.status}）`}`)
              .join(" / ")}
            <br />
            台湾（zh-TW）の声: 女性 {status.geminiVoices.female.length}・男性{" "}
            {status.geminiVoices.male.length}
            {status.geminiVoicesError ? `（一覧の取得に失敗: ${status.geminiVoicesError}）` : ""}
          </p>
        )}
        {geminiVoices.map(row)}
      </div>

      <div style={card}>
        <h2 style={h2}>アプリでの設定（同じ画面）</h2>
        <p style={small}>
          下はアプリの「設定 → 開発者 →
          発音の声を切り替える」と同じ画面です。ここで押しても保存はしません（アプリで押すと、全員の台湾華語の声がすぐ切り替わります）。
        </p>
      </div>
      <TtsVoiceForm
        defaultOpen
        data={formData}
        onTry={async (_language, text, choice) => {
          const i = Math.max(
            0,
            TTS_COMPARE_SAMPLES.indexOf(text as (typeof TTS_COMPARE_SAMPLES)[number]),
          );
          const r = await speak(choice, i);
          return { audio_url: r.url, ms: r.ms };
        }}
        onDiagnose={async (): Promise<GeminiDiagnosis> => {
          const r = await fetch(API);
          const st = (await r.json()) as Status;
          return {
            keyPresent: st.gemini,
            keyEnv: st.geminiKeyEnv,
            models: st.geminiModels,
            voices: st.geminiVoices,
            voicesError: st.geminiVoicesError,
          };
        }}
        onSave={async () => {
          window.alert(
            "確認用ページでは保存しません。アプリの設定で「この声にする」を押すと保存されます。",
          );
        }}
      />
    </div>
  );
}

/** 鍵が無い時の手順（Netlify の環境変数に入れる）。値はチャットに貼らない。 */
function KeySteps({ status }: { status: Status }) {
  const missing = [
    ...(status.azure ? [] : ["AZURE_SPEECH_KEY", "AZURE_SPEECH_REGION"]),
    ...(status.gemini ? [] : ["GEMINI_API_KEY"]),
  ];
  return (
    <div style={{ background: "#fff7e6", borderRadius: 12, padding: 10, marginTop: 8 }}>
      <p style={{ ...small, color: "#8a4b00", fontWeight: 700 }}>
        この確認用ページに鍵がまだありません: {missing.join(", ")}
      </p>
      <ol style={{ ...small, paddingLeft: 18, margin: "6px 0 0" }}>
        <li>
          Netlify を開く →{" "}
          <a
            href="https://app.netlify.com/projects/catchwords/configuration/env"
            target="_blank"
            rel="noreferrer"
          >
            Project configuration → Environment variables
          </a>
        </li>
        <li>
          「Add a variable」→ 名前（Key）に上の名前、値（Value）に鍵を入れて保存（Lovable の Secrets
          に入れたのと同じ値）
        </li>
        <li>Deploys →「Trigger deploy」→「Deploy project」で作り直す（数分）</li>
        <li>この画面を開き直す</li>
      </ol>
    </div>
  );
}
