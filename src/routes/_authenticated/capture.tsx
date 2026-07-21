import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { ImagePicker } from "@/components/ImagePicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Camera, Loader2, RotateCcw, Sparkles, Check, Keyboard, PartyPopper, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { suggestWords, generateCard } from "@/lib/ai.functions";
import { geocodeLocation } from "@/lib/geocode.functions";
import { saveSticker } from "@/lib/stickers.functions";
import { checkOwnedWord, recordEncounter, type OwnedWord } from "@/lib/encounters.functions";
import { enqueueCapture, getPendingCapture, removePendingCapture } from "@/lib/offline-queue";
import { makeThumbBlob, preloadCutout, removeBackgroundSmart, thumbPath } from "@/lib/cutout";
import { putCachedImage } from "@/lib/image-cache";
import { WordCard } from "@/components/WordCard";

export const Route = createFileRoute("/_authenticated/capture")({
  validateSearch: (search: Record<string, unknown>): { word?: string; pending?: string } => {
    const out: { word?: string; pending?: string } = {};
    // 派生キャッチ: /capture?word=咖啡 で文字入力フローを自動実行
    if (typeof search.word === "string" && search.word) out.word = search.word;
    // オフラインキューからの復元: /capture?pending=<id>
    if (typeof search.pending === "string" && search.pending) out.pending = search.pending;
    return out;
  },
  head: () => ({
    meta: [
      { title: "集める — Catchwords" },
      { name: "description", content: "写真でも文字入力でも、見つけた言葉をすぐに図鑑へ。" },
    ],
  }),
  component: CapturePage,
});

type Mode = "photo" | "text";
type Step =
  | "mode"
  | "object"
  | "selfie"
  | "processing"
  | "select"
  | "textInput"
  | "imagePick"
  | "card"
  | "saving"
  | "reencounter"
  | "offlineSaved";

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
  extras?: {
    collocations: string[];
    synonyms: string[];
    antonyms: string[];
    etymology: string;
    radicals: string;
    mnemonic: string;
    trivia: string;
    common_situation: string;
    usage_note: string;
    examples_extra: { zh: string; ja: string }[];
  };
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

/**
 * Canvas re-encode: shrinks the image AND strips EXIF metadata (GPS etc.)
 * embedded by the camera, so uploads and AI calls never leak it.
 */
async function compressImage(dataUrl: string, maxEdge: number, quality = 0.85): Promise<string> {
  if (typeof document === "undefined") return dataUrl;
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("image load failed"));
      img.src = dataUrl;
    });
    const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return dataUrl;
  }
}

function CapturePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { word: wordParam, pending: pendingParam } = Route.useSearch();
  const [mode, setMode] = useState<Mode>("photo");
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
  const [reenc, setReenc] = useState<OwnedWord | null>(null);
  const [reencRevealed, setReencRevealed] = useState(false);
  const [reencResult, setReencResult] = useState<{ recalled: boolean; encounter_count: number; next_due_at: string | null } | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const selfieInputRef = useRef<HTMLInputElement | null>(null);
  const autoOpenedRef = useRef(false);
  const selfieAutoOpenedRef = useRef(false);
  const handledParamRef = useRef<string | null>(null);

  const suggestFn = useServerFn(suggestWords);
  const cardFn = useServerFn(generateCard);
  const geocodeFn = useServerFn(geocodeLocation);
  const saveFn = useServerFn(saveSticker);
  const ownedFn = useServerFn(checkOwnedWord);
  const encounterFn = useServerFn(recordEncounter);

  // Warm the cutout model while the user frames the shot, so the first
  // catch doesn't pay the model download + init cost (roadmap B2).
  useEffect(() => {
    preloadCutout();
  }, []);

  // Auto-open the rear camera when landing on /capture (unless we arrived
  // with a derived-catch word or an offline-queue restore).
  useEffect(() => {
    if (autoOpenedRef.current) return;
    if (step !== "object") return;
    if (wordParam || pendingParam) return;
    autoOpenedRef.current = true;
    const t = setTimeout(() => cameraInputRef.current?.click(), 60);
    return () => clearTimeout(t);
  }, [step, wordParam, pendingParam]);

  // Derived catch: /capture?word=◯◯ (tapped a collocation/synonym on a card).
  useEffect(() => {
    if (!wordParam || handledParamRef.current === `w:${wordParam}`) return;
    handledParamRef.current = `w:${wordParam}`;
    setMode("text");
    setManualWord(wordParam);
    tryGetLocation();
    void confirmWord(wordParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wordParam]);

  // Offline-queue restore: /capture?pending=<id>.
  useEffect(() => {
    if (!pendingParam || handledParamRef.current === `p:${pendingParam}`) return;
    handledParamRef.current = `p:${pendingParam}`;
    void (async () => {
      const item = await getPendingCapture(pendingParam);
      if (!item) {
        toast.error("保存されていた写真が見つかりませんでした");
        return;
      }
      setPendingId(item.id);
      setObjectImg(item.object_img);
      setSelfieImg(item.selfie_img);
      if (item.lat != null && item.lng != null) {
        setLoc({ lat: item.lat, lng: item.lng, name: item.location_name });
      }
      await runAi(item.object_img);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingParam]);

  // Auto-open front camera as soon as the selfie step begins.
  useEffect(() => {
    if (step !== "selfie") { selfieAutoOpenedRef.current = false; return; }
    if (selfieAutoOpenedRef.current) return;
    selfieAutoOpenedRef.current = true;
    const t = setTimeout(() => selfieInputRef.current?.click(), 120);
    return () => clearTimeout(t);
  }, [step]);


  async function handleObjectFile(file: File) {
    const url = await fileToDataUrl(file);
    const compressed = await compressImage(url, 1600);
    setObjectImg(compressed);
    setStep("selfie");
  }

  async function handleSelfieFile(file: File | null) {
    if (file) {
      const url = await fileToDataUrl(file);
      setSelfieImg(await compressImage(url, 1280));
    }
    await runAi();
  }

  function tryGetLocation() {
    if (loc || !("geolocation" in navigator)) return;
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

  async function runAi(imgOverride?: string) {
    const img = imgOverride ?? objectImg;
    if (!img) return;
    setStep("processing");
    setError(null);
    tryGetLocation();

    try {
      // The AI only needs a small image — shrinking it cuts upload time and cost.
      const aiImage = await compressImage(img, 768, 0.8);
      const [cutoutRes, suggestRes] = await Promise.all([
        removeBackgroundSmart(img).catch((e) => {
          console.warn("background removal failed, using original", e);
          return img;
        }),
        suggestFn({ data: { imageBase64: aiImage, targetLanguage: "zh-TW" } }),
      ]);
      setCutoutImg(cutoutRes);
      setSuggestions(suggestRes.suggestions);
      setStep("select");
    } catch (e) {
      console.error(e);
      // Offline? Keep the shot: queue it locally and analyze when back online.
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        const saved = await enqueueCapture({
          object_img: img,
          selfie_img: selfieImg,
          lat: loc?.lat ?? null,
          lng: loc?.lng ?? null,
          location_name: loc?.name ?? null,
        });
        if (saved) {
          setStep("offlineSaved");
          return;
        }
      }
      setError(e instanceof Error ? e.message : "AI処理に失敗しました");
      setStep("object");
      toast.error("AI処理に失敗しました。もう一度お試しください。");
    }
  }

  async function confirmWord(head: string, hint?: Suggestion, opts?: { skipImagePick?: boolean }) {
    setSelectedHead(head);
    setStep("processing");

    // Already caught this word? Then this is a re-encounter — the best review
    // moment there is — not a duplicate sticker.
    try {
      const { owned } = await ownedFn({ data: { headword: head, language: "zh-TW" } });
      if (owned) {
        setReenc(owned);
        setReencRevealed(false);
        setReencResult(null);
        setStep("reencounter");
        return;
      }
    } catch {
      // Ownership check is best-effort; fall through to the normal flow.
    }

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
        cardFn({ data: { headword: head, targetLanguage: "zh-TW", hintCategory: hint.category_key } })
          .then((c) => setCard(c))
          .catch(() => {});
      } else {
        const c = await cardFn({ data: { headword: head, targetLanguage: "zh-TW" } });
        setCard(c);
      }
      // Text-input path needs to pick an image next
      if (mode === "text" && !objectImg && !opts?.skipImagePick) {
        setStep("imagePick");
      } else {
        setStep("card");
      }
    } catch (e) {
      console.error(e);
      toast.error("カード生成に失敗しました");
      setStep(mode === "text" ? "textInput" : "select");
    }
  }

  function onImagePicked(dataUrl: string) {
    setObjectImg(dataUrl);
    setCutoutImg(dataUrl);
    setStep("card");
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
        const thumbPromise = makeThumbBlob(dataUrl); // encode while the main upload runs
        const { error } = await supabase.storage.from("stickers").upload(path, blob, {
          contentType: blob.type,
          upsert: false,
        });
        if (error) throw error;
        // Grid thumbnail alongside — best-effort, the grid falls back to the
        // original when it's missing (old stickers, encode failure).
        const thumb = await thumbPromise;
        if (thumb) {
          await supabase.storage
            .from("stickers")
            .upload(thumbPath(path), thumb, { contentType: thumb.type || "image/webp", upsert: true })
            .catch(() => {});
          void putCachedImage(thumbPath(path), thumb);
        }
        // Prime the device cache so the dex shows this image instantly,
        // without ever downloading what we just uploaded.
        void putCachedImage(path, blob);
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
            extras: card.extras,
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
      if (pendingId) await removePendingCapture(pendingId);
      toast.success("ステッカーを図鑑に追加しました！");
      navigate({ to: "/dex/$stickerId", params: { stickerId: res.id } });
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "保存に失敗しました");
      setStep("card");
    }
  }

  function reset() {
    setMode("photo");
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
    setReenc(null);
    setReencRevealed(false);
    setReencResult(null);
    setPendingId(null);
  }

  async function answerReencounter(recalled: boolean) {
    if (!reenc || reencResult) return;
    try {
      const res = await encounterFn({
        data: {
          sticker_id: reenc.sticker_id,
          recalled,
          lat: loc?.lat ?? null,
          lng: loc?.lng ?? null,
          location_name: loc?.name ?? null,
        },
      });
      setReencResult({ recalled, encounter_count: res.encounter_count, next_due_at: res.next_due_at });
      await queryClient.invalidateQueries({ queryKey: ["stickers"] });
      await queryClient.invalidateQueries({ queryKey: ["reviews-due"] });
    } catch (e) {
      console.error(e);
      toast.error("記録に失敗しました");
    }
  }

  return (
    <AppShell title="集める">
      {step === "object" && (
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">写真で集める</h2>
            <p className="mt-1 text-sm text-muted-foreground">街で見つけたモノにカメラを向けてみてください。</p>
          </div>
          <label className="block">
            <div className="grid aspect-square place-items-center rounded-3xl border-2 border-dashed border-border bg-card text-muted-foreground transition-colors hover:border-primary hover:bg-accent/40">
              <div className="flex flex-col items-center gap-2">
                <span className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-primary to-rose-500 text-white shadow-lg shadow-primary/30">
                  <Camera className="h-8 w-8" />
                </span>
                <span className="text-sm font-medium">タップして撮影</span>
              </div>
            </div>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleObjectFile(e.target.files[0])}
            />
          </label>

          <div className="flex items-center gap-3 pt-2">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">または</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <button
            onClick={() => { setMode("text"); setStep("textInput"); }}
            className="lift flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card p-3 text-sm font-medium text-foreground"
          >
            <Keyboard className="h-4 w-4" />
            単語を文字で入力
          </button>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      )}

      {step === "selfie" && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">ステップ 2: 自撮りを撮る（任意）</h2>
          <p className="text-sm text-muted-foreground">対象物と一緒に自分も撮ると、後で振り返るときに記憶が蘇ります。</p>
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
              ref={selfieInputRef}
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
            <Button variant="ghost" onClick={reset}>
              <RotateCcw className="mr-1 h-4 w-4" /> やり直す
            </Button>
          </div>
        </div>
      )}

      {step === "processing" && (
        <div className="fixed inset-0 z-50 bg-black">
          {objectImg && (
            <img
              src={objectImg}
              alt="processing"
              className="absolute inset-0 h-full w-full object-cover opacity-70"
            />
          )}
          <div className="absolute inset-0 shimmer-sweep" />
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 bg-gradient-to-t from-black/80 via-black/50 to-transparent px-6 pb-16 pt-24 text-center text-white">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 animate-pulse" />
              <span className="font-semibold">{mode === "text" ? "意味と例文を生成中..." : "AIが分析中..."}</span>
            </div>
            <p className="text-sm text-white/80">少しだけ待ってね</p>
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
            <p className="text-sm text-muted-foreground">AIが候補を提案しました。学びたい単語を選んでください。</p>
          </div>
          <div className="grid gap-2">
            {suggestions.map((s) => (
              <button
                key={s.headword}
                onClick={() => confirmWord(s.headword, s, { skipImagePick: true })}
                className="lift flex items-baseline justify-between rounded-2xl border border-border bg-card p-3 text-left transition-colors hover:border-primary hover:bg-accent/40"
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
                onClick={() => confirmWord(manualWord.trim(), undefined, { skipImagePick: true })}
              >
                これにする
              </Button>
            </div>
          </div>
        </div>
      )}

      {step === "textInput" && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">単語を入力</h2>
          <p className="text-sm text-muted-foreground">中国語（繁体字）か日本語、どちらでもOK。AIが意味と例文を作ります。</p>
          <div>
            <Label htmlFor="word" className="text-xs text-muted-foreground">単語</Label>
            <Input
              id="word"
              value={manualWord}
              onChange={(e) => setManualWord(e.target.value)}
              placeholder="例: 咖啡 / コーヒー"
              autoFocus
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={reset} className="flex-1">戻る</Button>
            <Button disabled={!manualWord.trim()} onClick={() => { tryGetLocation(); confirmWord(manualWord.trim()); }} className="flex-1">
              次へ <Sparkles className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {step === "imagePick" && card && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">この単語の画像を選ぶ</h2>
          <div className="rounded-2xl border border-border bg-card p-3">
            <div className="text-xl font-semibold">{selectedHead}</div>
            <div className="text-xs text-muted-foreground">{card.reading_zhuyin} · {card.meaning_ja}</div>
          </div>
          <ImagePicker query={selectedHead} onPicked={onImagePicked} />
          <button onClick={() => setStep("textInput")} className="text-xs text-muted-foreground underline">単語を変える</button>
        </div>
      )}

      {step === "card" && card && (
        <div className="space-y-4">
          <div
            className="perspective-[1200px]"
            onClick={() => setFlipped((f) => !f)}
          >
            <div
              className={`card-flip relative mx-auto aspect-square w-full max-w-sm cursor-pointer ${flipped ? "flipped" : ""}`}
            >
              <div className="card-face absolute inset-0 overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-sky-50 to-white shadow-xl">
                <div className="grid h-full place-items-center p-6">
                  {cutoutImg ? (
                    <img src={cutoutImg} alt={selectedHead} className="max-h-full max-w-full object-contain pop-in" />
                  ) : objectImg ? (
                    <img src={objectImg} alt={selectedHead} className="h-full w-full object-cover" />
                  ) : null}
                </div>
              </div>
              <div className="card-face card-back absolute inset-0 overflow-hidden rounded-3xl border border-border bg-card shadow-xl">
                {selfieImg ? (
                  <img src={selfieImg} alt="selfie" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full place-items-center text-sm text-muted-foreground">自撮りなし</div>
                )}
              </div>
            </div>
          </div>
          <p className="text-center text-[11px] text-muted-foreground">画像をタップで自撮りにフリップ</p>

          <WordCard
            word={{
              headword: selectedHead,
              reading_zhuyin: card.reading_zhuyin,
              pinyin: card.pinyin,
              meaning_ja: card.meaning_ja,
              part_of_speech: card.part_of_speech,
              level: card.level,
              example_sentence: card.example_sentence,
              example_translation: card.example_translation,
              extras: card.extras ?? null,
            }}
          />

          <div>
            <Label htmlFor="caption" className="text-xs text-muted-foreground">一言メモ（任意）</Label>
            <Textarea id="caption" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="どんな場面で出会った？" rows={2} />
          </div>

          {loc?.name && (
            <p className="text-xs text-muted-foreground">📍 {loc.name}</p>
          )}

          <div className="flex gap-2">
            <Button variant="outline" onClick={reset} className="flex-1">
              やり直す
            </Button>
            <Button onClick={handleSave} className="lift flex-1">
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

      {step === "reencounter" && reenc && (
        <div className="space-y-4">
          <div className="rounded-3xl border border-amber-300/60 bg-gradient-to-br from-amber-50 to-white p-5 text-center shadow-lg">
            <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-amber-400/90 px-3 py-1 text-xs font-bold text-amber-950">
              <PartyPopper className="h-3.5 w-3.5" /> 再会！
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              この言葉、{new Date(reenc.taken_at).toLocaleDateString("ja-JP")}
              {reenc.location_name ? `に ${reenc.location_name} で` : "に"}ゲットしています。
            </p>
            {reenc.cutout_url && (
              <div className="mx-auto my-3 grid aspect-square w-40 place-items-center overflow-hidden rounded-2xl bg-white shadow ring-1 ring-black/5">
                <img src={reenc.cutout_url} alt={reenc.headword} className="h-full w-full object-contain p-2" />
              </div>
            )}
            <div className="text-3xl font-bold tracking-tight">{reenc.headword}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {reenc.reading_zhuyin} {reenc.pinyin && `· ${reenc.pinyin}`}
            </div>

            {!reencRevealed ? (
              <button
                onClick={() => setReencRevealed(true)}
                className="lift mt-4 w-full rounded-2xl border-2 border-dashed border-amber-300 bg-white/70 py-4 text-sm font-semibold text-amber-900"
              >
                意味、覚えてる？ — タップして答え合わせ
              </button>
            ) : (
              <div className="mt-4 rounded-2xl bg-white/80 p-4 ring-1 ring-amber-200">
                <p className="text-lg font-semibold">{reenc.meaning_ja}</p>
                {!reencResult ? (
                  <div className="mt-3 flex gap-2">
                    <Button onClick={() => answerReencounter(true)} className="flex-1">
                      覚えてた！
                    </Button>
                    <Button variant="outline" onClick={() => answerReencounter(false)} className="flex-1">
                      忘れてた…
                    </Button>
                  </div>
                ) : (
                  <div className="mt-3 space-y-2 text-sm">
                    <p className="font-semibold">
                      {reencResult.recalled ? "現実世界での復習、最強です 🎉" : "大丈夫、明日また出題します"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      再会 {reencResult.encounter_count} 回目
                      {reencResult.next_due_at &&
                        ` · 次の復習: ${new Date(reencResult.next_due_at).toLocaleDateString("ja-JP")}`}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={reset} className="flex-1">
              <Camera className="mr-1 h-4 w-4" /> 別のものを撮る
            </Button>
            {reencResult && (
              <Button
                onClick={() => navigate({ to: "/dex/$stickerId", params: { stickerId: reenc.sticker_id } })}
                className="flex-1"
              >
                図鑑で見る
              </Button>
            )}
          </div>
        </div>
      )}

      {step === "offlineSaved" && (
        <div className="space-y-4">
          <div className="rounded-3xl border border-border bg-card p-8 text-center">
            <WifiOff className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-base font-semibold">オフラインなので写真だけ保存しました</p>
            <p className="mt-1 text-sm text-muted-foreground">
              電波が戻ったら、ホームの「解析待ち」から続きができます。撮った瞬間は逃していません。
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate({ to: "/home" })} className="flex-1">
              ホームへ
            </Button>
            <Button onClick={reset} className="flex-1">
              <Camera className="mr-1 h-4 w-4" /> もう一枚撮る
            </Button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
