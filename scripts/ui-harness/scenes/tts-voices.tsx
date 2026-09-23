/**
 * 開発者だけの設定: 発音の声を出す会社を選ぶ。（オーナー指示 2026-09-23）
 *
 * 通信はしないので、サーバの返事（`getTtsVoiceAdmin`）と同じ形の見本を渡す。
 * 台湾華語は Azure を選んだ形、英語は何も選んでいない形。「試しに鳴らす」は
 * 音を出さず、届くまでの時間だけ見本の値を返す。
 */
import { useEffect } from "react";
import { TtsVoiceForm, type TtsVoiceAdminData } from "@/components/TtsVoiceForm";
import { TTS_PROVIDERS } from "@/lib/tts-providers";

const DATA: TtsVoiceAdminData = {
  config: { languages: { "zh-TW": { provider: "azure", voice: "zh-TW-HsiaoChenNeural" } } },
  providers: TTS_PROVIDERS.map((p) => ({
    ...p,
    voices: p.voices as Record<string, string[]>,
    keys_present: p.id === "azure",
  })),
  languages: ["zh-TW", "en"],
  legacy: "Google Cloud TTS",
};

export function TtsVoicesScene() {
  useEffect(() => {
    document.querySelector<HTMLDetailsElement>("details")?.setAttribute("open", "");
  }, []);
  return (
    <div className="px-4 py-4">
      <TtsVoiceForm
        data={DATA}
        onTry={async () => ({ audio_url: "data:audio/mpeg;base64,", ms: 312 })}
        onSave={async () => {}}
      />
    </div>
  );
}
