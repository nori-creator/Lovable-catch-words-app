import { ImageGenerationPanel } from "@/routes/_authenticated/settings";

const previewData = {
  effective: { provider: "lovable" as const, model: "openai/gpt-image-1-mini" },
  keys: { lovable: true, openrouter: false, google: false, openai: false },
};

/** Real settings panel with deterministic credentials status, no backend calls. */
export function ImageSettingsScene() {
  return <ImageGenerationPanel previewData={previewData} />;
}
