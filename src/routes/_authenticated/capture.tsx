import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Camera, Loader2, RotateCcw, Sparkles, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { suggestWords, generateCard } from "@/lib/ai.functions";
import { geocodeLocation } from "@/lib/geocode.functions";
import { saveSticker } from "@/lib/stickers.functions";

export const Route = createFileRoute("/_authenticated/capture")({
  head: () => ({
    meta: [
      { title: "撮る — Catchwords" },
      { name: "description", content: "対象物と自撮りを撮って、AIが切り抜きフラッシュカードに変換します。" },
    ],
  }),
  component: CapturePage,
});

type Step = "object" | "selfie" | "processing" | "select" | "card" | "saving";

type Suggestion = {
  headword: string;
  reading_zhuyin: string;
  pinyin: string;
  meaning_ja: string;
  category_key: string;
};

type CardData = {
  reading_zhuyin: string;
  pinyin: string;
  meaning_ja: string;
  part_of_speech: string;
  level: string;
  category_key: string;
  example_sentence: string;
  example_translation: string;
};

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return await res.blob();
}

function CapturePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("object");
  const [objectImg, setObjectImg] = useState<string | null>(null);
  const [cutoutImg, setCutoutImg] = useState<string | null>(null);
  const [selfieImg, setSelfieImg] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedHead, setSelectedHead] = useState<string>("");
  const [manualWord, setManualWord] = useState<string>("");
  const [card, setCard] = useState<CardData | null>(null);
  const [caption, setCaption] = useState("");
  const [loc, setLoc] = useState<{ lat: number; lng: number; name: string | null } | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggestFn = useServerFn(suggestWords);
  const cardFn = useServerFn(generateCard);
  const geocodeFn = useServerFn(geocodeLocation);
  const saveFn = useServerFn(saveSticker);

  async function handleObjectFile(file: File) {
    const url = await fileToDataUrl(file);
    setObjectImg(url);
    setStep("selfie");
  }

  async function handleSelfieFile(file: File | null) {
    if (file) {
      const url = await fileToDataUrl(file);
      setSelfieImg(url);
    }
    await runAi();
  }

  async function runAi() {
    if (!objectImg) return;
    setStep("processing");
    setError(null);

    // Try to grab location in parallel; don't fail capture if blocked.
    if (!loc && "geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const { location_name } = await geocodeFn({ data: { lat: pos.coords.latitude, lng: pos.coords.longitude } });
            setLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude, name: location_name });
          } catch {
            setLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude, name: null });
          }
        },
        () => {},
        { timeout: 5000 }
      );
    }

    try {
      const [cutoutRes, suggestRes] = await Promise.all([
        // Background removal in browser. Dynamic import to keep SSR clean.
        (async () => {
          try {
            const mod = await import("@imgly/background-removal");
            const blob = await dataUrlToBlob(objectImg);
            const out = await mod.removeBackground(blob);
            const reader = new FileReader();
            return await new Promise<string>((resolve, reject) => {
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(out as Blob);
            });
          } catch (e) {
            console.warn("background removal failed, using original", e);
            return objectImg;
          }
        })(),
        suggestFn({ data: { imageBase64: objectImg, targetLanguage: "zh-TW" } }),
      ]);
      setCutoutImg(cutoutRes);
      setSuggestions(suggestRes.suggestions);
      setStep("select");
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "AI処理に失敗しました");
      setStep("object");
      toast.error("AI処理に失敗しました。もう一度お試しください。");
    }
  }

  async function confirmWord(head: string, hint?: Suggestion) {
    setSelectedHead(head);
    setStep("processing");
    try {
      if (hint) {
        setCard({
          reading_zhuyin: hint.reading_zhuyin,
          pinyin: hint.pinyin,
          meaning_ja: hint.meaning_ja,
          part_of_speech: "名詞",
          level: "TOCFL-2",
          category_key: hint.category_key,
          example_sentence: "",
          example_translation: "",
        });
        // Get example sentence + level in the background
        cardFn({ data: { headword: head, targetLanguage: "zh-TW", hintCategory: hint.category_key } })
          .then((c) => setCard(c))
          .catch(() => {});
      } else {
        const c = await cardFn({ data: { headword: head, targetLanguage: "zh-TW" } });
        setCard(c);
      }
      setStep("card");
    } catch (e) {
      console.error(e);
      toast.error("カード生成に失敗しました");
      setStep("select");
    }
  }

  async function handleSave() {
    if (!card || !selectedHead) return;
    setStep("saving");
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Not signed in");

      const ts = Date.now();
      async function upload(dataUrl: string | null, kind: string): Promise<string | null> {
        if (!dataUrl) return null;
        const blob = await dataUrlToBlob(dataUrl);
        const ext = blob.type.includes("png") ? "png" : "jpg";
        const path = `${userId}/${ts}-${kind}.${ext}`;
        const { error } = await supabase.storage.from("stickers").upload(path, blob, {
          contentType: blob.type,
          upsert: false,
        });
        if (error) throw error;
        return path;
      }

      const [object_path, cutout_path, selfie_path] = await Promise.all([
        upload(objectImg, "object"),
        upload(cutoutImg, "cutout"),
        upload(selfieImg, "selfie"),
      ]);

      const res = await saveFn({
        data: {
          word: {
            headword: selectedHead,
            reading_zhuyin: card.reading_zhuyin,
            pinyin: card.pinyin,
            meaning_ja: card.meaning_ja,
            part_of_speech: card.part_of_speech,
            level: card.level,
            category_key: card.category_key,
            example_sentence: card.example_sentence,
            example_translation: card.example_translation,
          },
          language: "zh-TW",
          object_path,
          cutout_path,
          selfie_path,
          caption: caption || null,
          location_name: loc?.name ?? null,
          lat: loc?.lat ?? null,
          lng: loc?.lng ?? null,
        },
      });

      await queryClient.invalidateQueries({ queryKey: ["stickers"] });
      await queryClient.invalidateQueries({ queryKey: ["seedWords"] });
      toast.success("ステッカーを図鑑に追加しました！");
      navigate({ to: "/dex/$stickerId", params: { stickerId: res.id } });
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "保存に失敗しました");
      setStep("card");
    }
  }

  function reset() {
    setStep("object");
    setObjectImg(null);
    setCutoutImg(null);
    setSelfieImg(null);
    setSuggestions([]);
    setSelectedHead("");
    setManualWord("");
    setCard(null);
    setCaption("");
    setFlipped(false);
    setError(null);
  }

  return (
    <AppShell title="撮る">
      {step === "object" && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">ステップ 1: 対象物を撮る</h2>
          <p className="text-sm text-muted-foreground">街で見つけたモノにカメラを向けてみてください。</p>
          <label className="block">
            <div className="grid aspect-square place-items-center rounded-3xl border-2 border-dashed border-border bg-card text-muted-foreground transition-colors hover:border-primary hover:bg-accent/40">
              <div className="flex flex-col items-center gap-2">
                <Camera className="h-10 w-10" />
                <span className="text-sm">タップして撮影 / 選択</span>
              </div>
            </div>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleObjectFile(e.target.files[0])}
            />
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      )}

      {step === "selfie" && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">ステップ 2: 自撮りを撮る</h2>
          <p className="text-sm text-muted-foreground">対象物と一緒に自分も撮っておくと、後で振り返るときに思い出が蘇ります。スキップもできます。</p>
          {objectImg && (
            <div className="mb-2 grid aspect-square w-32 place-items-center overflow-hidden rounded-2xl bg-secondary">
              <img src={objectImg} alt="object" className="h-full w-full object-cover" />
            </div>
          )}
          <label className="block">
            <div className="grid aspect-[3/4] place-items-center rounded-3xl border-2 border-dashed border-border bg-card text-muted-foreground transition-colors hover:border-primary">
              <div className="flex flex-col items-center gap-2">
                <Camera className="h-10 w-10" />
                <span className="text-sm">自撮りを追加</span>
              </div>
            </div>
            <input
              type="file"
              accept="image/*"
              capture="user"
              className="hidden"
              onChange={(e) => handleSelfieFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => handleSelfieFile(null)} className="flex-1">
              スキップして次へ
            </Button>
            <Button variant="ghost" onClick={reset} className="">
              <RotateCcw className="mr-1 h-4 w-4" /> やり直す
            </Button>
          </div>
        </div>
      )}

      {step === "processing" && (
        <div className="space-y-6 py-12 text-center">
          <div className="relative mx-auto h-40 w-40 overflow-hidden rounded-3xl bg-secondary shimmer-sweep">
            {objectImg && <img src={objectImg} alt="processing" className="h-full w-full object-cover opacity-60" />}
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2 text-primary">
              <Sparkles className="h-5 w-5 animate-pulse" />
              <span className="font-semibold">AIが切り抜き中...</span>
            </div>
            <p className="text-sm text-muted-foreground">単語を5つ提案します</p>
            <div className="mt-4 flex gap-1.5">
              {["蘋果", "杯子", "桌子", "椅子", "貓"].map((w, i) => (
                <span
                  key={w}
                  className="float-up rounded-full bg-secondary px-3 py-1 text-xs"
                  style={{ animationDelay: `${i * 0.15}s` }}
                >
                  {w}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {step === "select" && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">ステップ 3: 単語を選ぶ</h2>
          <div className="flex gap-3">
            {cutoutImg && (
              <div className="grid aspect-square w-28 shrink-0 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-primary/5 to-secondary p-2">
                <img src={cutoutImg} alt="cutout" className="h-full w-full object-contain pop-in" />
              </div>
            )}
            <p className="text-sm text-muted-foreground">AIがこの画像から5つの候補を提案しました。あなたが学びたい単語を選んでください。</p>
          </div>
          <div className="grid gap-2">
            {suggestions.map((s) => (
              <button
                key={s.headword}
                onClick={() => confirmWord(s.headword, s)}
                className="flex items-baseline justify-between rounded-2xl border border-border bg-card p-3 text-left transition-colors hover:border-primary hover:bg-accent/40"
              >
                <div>
                  <div className="text-base font-semibold">{s.headword}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.reading_zhuyin || s.pinyin} · {s.meaning_ja}
                  </div>
                </div>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">{s.category_key}</span>
              </button>
            ))}
          </div>
          <div className="rounded-2xl border border-dashed border-border bg-card p-3">
            <Label htmlFor="manual" className="text-xs text-muted-foreground">違う単語を入力</Label>
            <div className="mt-1 flex gap-2">
              <Input
                id="manual"
                value={manualWord}
                onChange={(e) => setManualWord(e.target.value)}
                placeholder="例: 椅子"
              />
              <Button
                disabled={!manualWord.trim()}
                onClick={() => confirmWord(manualWord.trim())}
              >
                これにする
              </Button>
            </div>
          </div>
        </div>
      )}

      {step === "card" && card && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">ステップ 4: カード確認</h2>
          <p className="text-sm text-muted-foreground">タップして裏返せます。</p>

          <div className="perspective-[1200px]">
            <div
              className={`card-flip relative mx-auto aspect-[3/4] w-full max-w-xs cursor-pointer ${flipped ? "flipped" : ""}`}
              onClick={() => setFlipped((f) => !f)}
            >
              <div className="card-face absolute inset-0 rounded-3xl border border-border bg-card shadow-xl">
                <div className="grid h-full place-items-center p-6">
                  {cutoutImg && <img src={cutoutImg} alt={selectedHead} className="max-h-full max-w-full object-contain pop-in" />}
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-4 text-center">
                  <div className="text-3xl font-bold tracking-tight">{selectedHead}</div>
                  <div className="text-sm text-muted-foreground">{card.reading_zhuyin}</div>
                </div>
              </div>

              <div className="card-face card-back absolute inset-0 overflow-hidden rounded-3xl border border-border bg-card shadow-xl">
                <div className="flex h-full flex-col">
                  <div className="relative aspect-square w-full bg-secondary">
                    {selfieImg ? (
                      <img src={selfieImg} alt="selfie" className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full place-items-center text-sm text-muted-foreground">
                        自撮り写真なし
                      </div>
                    )}
                  </div>
                  <div className="flex-1 space-y-2 p-4 text-left">
                    <div className="flex items-baseline justify-between">
                      <div className="text-xl font-semibold">{selectedHead}</div>
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px]">{card.level}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{card.reading_zhuyin} · {card.pinyin}</div>
                    <div className="text-sm">{card.meaning_ja}</div>
                    {card.example_sentence && (
                      <div className="mt-2 rounded-xl bg-secondary/60 p-2 text-xs">
                        <div>{card.example_sentence}</div>
                        <div className="mt-0.5 text-muted-foreground">{card.example_translation}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="caption" className="text-xs text-muted-foreground">一言メモ（任意）</Label>
            <Textarea id="caption" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="どんな場面で出会った？" rows={2} />
          </div>

          {loc?.name && (
            <p className="text-xs text-muted-foreground">📍 {loc.name}</p>
          )}

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep("select")} className="flex-1">
              単語を変える
            </Button>
            <Button onClick={handleSave} className="flex-1">
              <Check className="mr-1 h-4 w-4" /> 図鑑に追加
            </Button>
          </div>
        </div>
      )}

      {step === "saving" && (
        <div className="grid place-items-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="mt-4 text-sm text-muted-foreground">保存中...</p>
        </div>
      )}
    </AppShell>
  );
}
