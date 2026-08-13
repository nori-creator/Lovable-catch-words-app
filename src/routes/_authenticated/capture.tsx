import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Camera,
  Loader2,
  RotateCcw,
  Sparkles,
  Check,
  Keyboard,
  ScanLine,
  PartyPopper,
  WifiOff,
} from "lucide-react";
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
import { InputCatchSheet } from "@/components/InputCatchSheet";
import { ScanEffect } from "@/components/ScanEffect";
import { CatchLandingOverlay, runCatchLanding } from "@/components/CatchLanding";
import { usePronounce } from "@/lib/use-pronounce";
import { useT } from "@/lib/i18n";
import { Zh } from "@/components/Zh";
import { useUiLang } from "@/lib/i18n";
import { tStatic } from "@/lib/i18n";

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
      { title: tStatic("page.capture") },
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
  extras?: import("@/lib/extras").WordExtrasDTO;
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
  const t = useT();
  // 日付の書式も表示言語に合わせる(2026/7/30 と Jul 30, 2026)。
  const dateLocale = useUiLang() === "en" ? "en-US" : "ja-JP";
  const pronounce = usePronounce();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { word: wordParam, pending: pendingParam } = Route.useSearch();
  const [mode, setMode] = useState<Mode>("photo");
  // 文字入力キャッチはアプリ共通の InputCatchSheet に統一(重複UIの解消)。
  const [inputSheet, setInputSheet] = useState<null | { text?: string; auto?: boolean }>(null);
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
  const [reencResult, setReencResult] = useState<{
    recalled: boolean;
    encounter_count: number;
    next_due_at: string | null;
  } | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  // `pendingId` の同期版。runAi は同じレンダーの中で呼ばれるので、
  // 直前に setPendingId しても runAi の中からは古い値(null)しか見えない。
  // 「これは復元されたキャプチャか」は失敗時の分岐に効くので ref で持つ。
  const pendingIdRef = useRef<string | null>(null);
  // 解析に失敗して端末に預けたときの**実際の理由**。
  // これを出さないと、401 や壊れた画像のような二度と直らない失敗まで
  // 「写真は預かりました(あとで続きができます)」と出て、
  // ユーザーは直らないものを待ち続けることになる。
  const [savedReason, setSavedReason] = useState<string | null>(null);
  const [reencBusy, setReencBusy] = useState(false);
  // Synchronous re-entrancy guard: `reencResult` is only set after the await, so
  // a fast double-tap would otherwise record two encounters (double SRS grade).
  const reencSubmittingRef = useRef(false);
  // 「いま何を待っているか」— 候補出し(analyze)か、タップ後の切り抜き(cutout)か。
  // 待ち画面の文言をここで切り替える。
  const [waitKind, setWaitKind] = useState<"analyze" | "cutout">("analyze");
  // キャッチ演出中は写真カードを隠し、代わりに飛ぶ画像を出す。
  const [landing, setLanding] = useState(false);
  const heroBoxRef = useRef<HTMLDivElement | null>(null);
  const flyRef = useRef<HTMLImageElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const selfieInputRef = useRef<HTMLInputElement | null>(null);
  const autoOpenedRef = useRef(false);
  const selfieAutoOpenedRef = useRef(false);
  const handledParamRef = useRef<string | null>(null);
  /**
   * 「いま有効な作業はどれか」を表す番号。
   *
   * 待ち画面の「やめる」は `step` を変えるだけで、**走っている非同期処理は
   * 止まらなかった**。写真Aの解析が返ってくると `setSuggestions(A)` と
   * `setStep("select")` を勝手に押し戻すので、やめる → 撮り直す の順に
   * 操作すると、**写真Bを見ながら写真Aの候補を選ぶ**ことになる。
   *
   * 流れを始めるときに番号を取り、await のたびに「まだ自分の番か」を確認する。
   * やめる / やり直す は番号を進めるだけで、走っている処理を無効化できる。
   */
  const runTokenRef = useRef(0);

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

  // Derived catch: /capture?word=◯◯ — 共通の入力キャッチシートで即調べる。
  useEffect(() => {
    if (!wordParam || handledParamRef.current === `w:${wordParam}`) return;
    handledParamRef.current = `w:${wordParam}`;
    tryGetLocation();
    setInputSheet({ text: wordParam, auto: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wordParam]);

  // Offline-queue restore: /capture?pending=<id>.
  useEffect(() => {
    if (!pendingParam || handledParamRef.current === `p:${pendingParam}`) return;
    handledParamRef.current = `p:${pendingParam}`;
    void (async () => {
      const item = await getPendingCapture(pendingParam);
      if (!item) {
        toast.error(t("cap.pendingNotFound"));
        return;
      }
      setPendingId(item.id);
      pendingIdRef.current = item.id;
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
    if (step !== "selfie") {
      selfieAutoOpenedRef.current = false;
      return;
    }
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
          const { location_name } = await geocodeFn({
            data: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          });
          setLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude, name: location_name });
        } catch {
          setLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude, name: null });
        }
      },
      () => {},
      { timeout: 5000 },
    );
  }

  async function runAi(imgOverride?: string) {
    const img = imgOverride ?? objectImg;
    if (!img) return;
    const token = ++runTokenRef.current;
    setWaitKind("analyze");
    setStep("processing");
    setError(null);
    setSavedReason(null);
    tryGetLocation();

    try {
      // The AI only needs a small image — shrinking it cuts upload time and cost.
      const aiImage = await compressImage(img, 768, 0.8);
      if (runTokenRef.current !== token) return;
      // 切り抜きは**候補をタップしてから**走らせる(下の confirmWord)。
      // どの語を選ぶか決める前から待たされる理由はないし、切り抜かれた絵が
      // 「タップした結果」として現れるほうが、何が起きたか分かりやすい。
      const suggestRes = await suggestFn({
        data: { imageBase64: aiImage, targetLanguage: "zh-TW" },
      });
      if (runTokenRef.current !== token) return;
      setSuggestions(suggestRes.suggestions);
      setStep("select");
    } catch (e) {
      console.error(e);
      if (runTokenRef.current !== token) return;
      const reason = e instanceof Error ? e.message : t("cap.aiFailed");

      // 撮った写真は**必ず**残す。
      //
      // 以前この救済は `!navigator.onLine` のときだけ走っていた。ところが
      // navigator.onLine は回線がつながっているかしか見ておらず、
      // キャプティブポータルのWiFi・AIの500・タイムアウトでは true のまま。
      // つまり**いちばん起きやすい失敗ほど救われず**、ユーザーは
      // step:"object"(「タップして撮影」)に戻され、撮ったばかりの写真も
      // 自撮りも画面から消えていた。二度と撮れないものを失わせない。
      //
      // ただし**この写真がキューから復元されたものなら、預け直さない**。
      // 再試行のたびに同じ写真が1件ずつ増え、消えるのは元の1件だけなので、
      // 3回失敗すれば「解析待ち」に同じ写真が3枚並ぶ。
      const saved = pendingIdRef.current
        ? pendingIdRef.current
        : await enqueueCapture({
            object_img: img,
            selfie_img: selfieImg,
            lat: loc?.lat ?? null,
            lng: loc?.lng ?? null,
            location_name: loc?.name ?? null,
          });
      if (runTokenRef.current !== token) return;
      if (saved) {
        // 預かれたことと、**なぜ失敗したか**は別の話。理由を伏せると、
        // 401 や壊れた画像のような直らない失敗まで「あとで続きができます」
        // に見えてしまう。理由を出し、その場で再試行もできるようにする。
        setSavedReason(reason);
        setStep("offlineSaved");
        return;
      }
      // 保存もできなかったときだけ、撮り直しをお願いする。
      setError(reason);
      setStep("object");
      toast.error(t("cap.aiFailedRetry"));
    }
  }

  async function confirmWord(head: string, hint?: Suggestion, opts?: { skipImagePick?: boolean }) {
    const token = ++runTokenRef.current;
    setSelectedHead(head);
    // キャッチ演出の「空中のタメ」で待たせずに鳴らせるよう、ここで先に取る。
    pronounce.prefetch(head);
    setWaitKind("cutout");
    setStep("processing");

    // タップした瞬間に切り抜きを始める。失敗しても写真のまま進める
    // (切り抜きは見た目の格上げであって、キャッチの条件ではない)。
    const cutoutPromise: Promise<string | null> = objectImg
      ? removeBackgroundSmart(objectImg).catch((e) => {
          console.warn("background removal failed, using original", e);
          return null;
        })
      : Promise.resolve(null);

    // Already caught this word? Then this is a re-encounter — the best review
    // moment there is — not a duplicate sticker.
    try {
      const { owned } = await ownedFn({ data: { headword: head, language: "zh-TW" } });
      if (runTokenRef.current !== token) return;
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
        cardFn({
          data: { headword: head, targetLanguage: "zh-TW", hintCategory: hint.category_key },
        })
          .then((c) => {
            if (runTokenRef.current === token) setCard(c);
          })
          .catch(() => {});
      } else {
        const c = await cardFn({ data: { headword: head, targetLanguage: "zh-TW" } });
        if (runTokenRef.current !== token) return;
        setCard(c);
      }
      // 切り抜きが出来上がってからカードを見せる — 切り抜かれた絵が「ポン」と
      // 現れるところまでが、タップに対する返事。
      const cut = (await cutoutPromise) ?? objectImg;
      if (runTokenRef.current !== token) return;
      setCutoutImg(cut);
      setStep("card");
    } catch (e) {
      console.error(e);
      if (runTokenRef.current !== token) return;
      toast.error(t("cap.cardFailed"));
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
            .upload(thumbPath(path), thumb, {
              contentType: thumb.type || "image/webp",
              upsert: true,
            })
            .catch(() => {});
          void putCachedImage(thumbPath(path), thumb);
        }
        // Prime the device cache so the dex shows this image instantly,
        // without ever downloading what we just uploaded.
        void putCachedImage(path, blob);
        return path;
      }

      // 3枚のアップロードは並列。切り抜きは任意なので、失敗しても保存は続ける
      // (以前は cutout の失敗で全体が例外になり、登録が長引いていた)。
      const [object_path, cutout_path, selfie_path] = await Promise.all([
        upload(objectImg, "object"),
        upload(cutoutImg, "cutout").catch(() => null),
        upload(selfieImg, "selfie").catch(() => null),
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

      // 図鑑の再取得は待たない(演出中に裏で終わる) — 体感を最短にする。
      void queryClient.invalidateQueries({ queryKey: ["stickers"] });
      if (pendingId) void removePendingCapture(pendingId);

      // ここからキャッチ演出。切り抜きがふわっと浮いて画面いっぱいに広がり、
      // 上へ抜けたところで図鑑のページが開いて、新しいセルがドンと着弾する
      // (最後の一撃は /dex 側の slam-in が ?justCaught= を見て出す)。
      // 以前このフローだけ演出がなく、保存したら図鑑に飛ぶだけだった。
      setLanding(true);
      await runCatchLanding({
        startEl: heroBoxRef.current,
        fly: flyRef.current,
        speakLine: () => void pronounce(selectedHead),
      });
      navigate({ to: "/dex", search: { justCaught: res.id } });
    } catch (e) {
      console.error(e);
      setLanding(false);
      toast.error(e instanceof Error ? e.message : t("cap.saveFailed"));
      setStep("card");
    }
  }

  function reset() {
    // 走っている解析・切り抜きを無効化してから畳む。番号を進めないと、
    // 前の写真の結果が後から届いて新しい画面を上書きする。
    runTokenRef.current++;
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
    setLanding(false);
    setReenc(null);
    setReencRevealed(false);
    setReencResult(null);
    setPendingId(null);
    pendingIdRef.current = null;
    setSavedReason(null);
  }

  /**
   * 待ち画面の「やめる」。
   *
   * 切り抜き待ちなら候補一覧に戻す — 写真も候補もまだ手元にあるので、
   * そこまで捨てる理由がない。解析待ちなら最初からやり直す。
   * どちらの道でも `reset()`/番号の更新で走っている処理を無効化する。
   */
  function cancelProcessing() {
    if (waitKind === "cutout" && suggestions.length > 0) {
      runTokenRef.current++;
      setSelectedHead("");
      setStep("select");
      return;
    }
    reset();
  }

  async function answerReencounter(recalled: boolean) {
    if (!reenc || reencResult || reencSubmittingRef.current) return;
    reencSubmittingRef.current = true;
    setReencBusy(true);
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
      setReencResult({
        recalled,
        encounter_count: res.encounter_count,
        next_due_at: res.next_due_at,
      });
      await queryClient.invalidateQueries({ queryKey: ["stickers"] });
      await queryClient.invalidateQueries({ queryKey: ["reviews-due"] });
    } catch (e) {
      console.error(e);
      toast.error(t("cap.recordFailed"));
    } finally {
      reencSubmittingRef.current = false;
      setReencBusy(false);
    }
  }

  return (
    <AppShell title={t("title.capture")}>
      {step === "object" && (
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">{t("capture.photoTitle")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("capture.photoHint")}</p>
          </div>
          <label className="block">
            <div className="grid aspect-square place-items-center rounded-3xl border-2 border-dashed border-border bg-card text-muted-foreground transition-colors hover:border-primary hover:bg-accent/40">
              <div className="flex flex-col items-center gap-2">
                <span className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-primary to-rose-500 text-white shadow-lg shadow-primary/30">
                  <Camera className="h-8 w-8" />
                </span>
                <span className="text-sm font-medium">{t("capture.tapToShoot")}</span>
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
            <span className="text-xs text-muted-foreground">{t("capture.or")}</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <button
            onClick={() => setInputSheet({})}
            className="lift flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card p-3 text-sm font-medium text-foreground"
          >
            <Keyboard className="h-4 w-4" />
            {t("capture.typeWord")}
          </button>

          {/* かざして調べるスキャンは、下タブから消えた代わりにここから開ける */}
          <button
            onClick={() => navigate({ to: "/scan" })}
            className="lift flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card p-3 text-sm font-medium text-foreground"
          >
            <ScanLine className="h-4 w-4" />
            {t("capture.openScan")}
          </button>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      )}

      {step === "selfie" && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">{t("capture.selfieTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("capture.selfieHint")}</p>
          {objectImg && (
            <div className="mb-2 grid aspect-square w-32 place-items-center overflow-hidden rounded-2xl bg-secondary">
              <img
                src={objectImg}
                alt={t("cap.photoTaken")}
                className="h-full w-full object-cover"
              />
            </div>
          )}
          <label className="block">
            <div className="grid aspect-[3/4] place-items-center rounded-3xl border-2 border-dashed border-border bg-card text-muted-foreground transition-colors hover:border-primary">
              <div className="flex flex-col items-center gap-2">
                <Camera className="h-10 w-10" />
                <span className="text-sm">{t("capture.addSelfie")}</span>
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
              {t("capture.skipNext")}
            </Button>
            <Button variant="ghost" onClick={reset}>
              <RotateCcw className="mr-1 h-4 w-4" /> {t("capture.redo")}
            </Button>
          </div>
        </div>
      )}

      {step === "processing" && (
        // 分析中もフルスクリーン。撮った写真の上でスキャン演出が走る
        // (「少しだけ待ってね」のような待たせる文言は出さない)。
        <div className="fixed inset-0 z-50 bg-black">
          {objectImg && (
            <img src={objectImg} alt="" className="absolute inset-0 h-full w-full object-cover" />
          )}
          <ScanEffect stage={waitKind === "cutout" ? "matching" : "reading"} />
          {/* 全画面で覆う画面には**必ず出口を置く**。ここには閉じるボタンも
              戻るも無く、処理が返ってこないとアプリを強制終了するしか
              逃げ道が無かった(§16 Freedom & Recovery)。 */}
          <button
            onClick={cancelProcessing}
            className="absolute right-4 top-[calc(1rem+env(safe-area-inset-top))] inline-flex min-h-11 items-center rounded-full bg-white/15 px-4 text-sm font-medium text-white backdrop-blur-sm active:scale-95 motion-reduce:active:scale-100"
          >
            {t("capture.cancel")}
          </button>
        </div>
      )}

      {step === "select" && (
        <div className="space-y-4">
          {/* 撮った写真が上に小さく残る — どれを撮ったかを見ながら語を選べる */}
          {objectImg && (
            <div className="mx-auto grid aspect-square w-40 max-w-full place-items-center overflow-hidden rounded-3xl bg-secondary shadow-lg">
              <img
                src={objectImg}
                alt={t("cap.photoTaken")}
                className="h-full w-full object-cover pop-in"
              />
            </div>
          )}
          <h2 className="text-xl font-semibold tracking-tight">{t("capture.pickTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("capture.pickHint")}</p>
          <div className="grid gap-2">
            {suggestions.map((s) => (
              <button
                key={s.headword}
                onClick={() => confirmWord(s.headword, s, { skipImagePick: true })}
                className="lift flex items-baseline justify-between rounded-2xl border border-border bg-card p-3 text-left transition-colors hover:border-primary hover:bg-accent/40"
              >
                <div>
                  <div lang="zh-Hant" className="text-base font-semibold">
                    {s.headword}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <Zh>{s.reading_zhuyin || s.pinyin}</Zh> · {s.meaning_ja}
                  </div>
                </div>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
                  {s.category_key}
                </span>
              </button>
            ))}
          </div>
          <div className="rounded-2xl border border-dashed border-border bg-card p-3">
            <Label htmlFor="manual" className="text-xs text-muted-foreground">
              {t("capture.otherWord")}
            </Label>
            <div className="mt-1 flex gap-2">
              <Input
                id="manual"
                value={manualWord}
                onChange={(e) => setManualWord(e.target.value)}
                placeholder={t("cap.wordPlaceholder")}
              />
              <Button
                disabled={!manualWord.trim()}
                onClick={() => confirmWord(manualWord.trim(), undefined, { skipImagePick: true })}
              >
                {t("capture.useThis")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {step === "card" && card && (
        <div className="space-y-4">
          <div className="perspective-[1200px]" onClick={() => setFlipped((f) => !f)}>
            <div
              className={`card-flip relative mx-auto aspect-square w-full max-w-sm cursor-pointer ${flipped ? "flipped" : ""}`}
            >
              <div className="card-face absolute inset-0 overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-sky-50 to-white shadow-xl">
                <div className="grid h-full place-items-center p-6">
                  {cutoutImg ? (
                    <img
                      src={cutoutImg}
                      alt={selectedHead}
                      className="max-h-full max-w-full object-contain cutout-pop"
                    />
                  ) : objectImg ? (
                    <img
                      src={objectImg}
                      alt={selectedHead}
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
              </div>
              <div className="card-face card-back absolute inset-0 overflow-hidden rounded-3xl border border-border bg-card shadow-xl">
                {selfieImg ? (
                  <img
                    src={selfieImg}
                    alt={t("cap.selfie")}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="grid h-full place-items-center text-sm text-muted-foreground">
                    {t("capture.noSelfie")}
                  </div>
                )}
              </div>
            </div>
          </div>
          <p className="text-center text-[11px] text-muted-foreground">{t("capture.flipHint")}</p>

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
            <Label htmlFor="caption" className="text-xs text-muted-foreground">
              {t("capture.note")}
            </Label>
            <Textarea
              id="caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder={t("capture.notePlaceholder")}
              rows={2}
            />
          </div>

          {loc?.name && <p className="text-xs text-muted-foreground">📍 {loc.name}</p>}

          <div className="flex gap-2">
            <Button variant="outline" onClick={reset} className="flex-1">
              {t("capture.redo")}
            </Button>
            <Button onClick={handleSave} className="lift flex-1">
              <Check className="mr-1 h-4 w-4" /> {t("capture.addToDex")}
            </Button>
          </div>
        </div>
      )}

      {step === "saving" && (
        // 「保存中…」で止めない: 写真がふわっと浮き上がり、そのまま図鑑へ。
        // 見せ場は暗転した中で始まる。明るい背景だと切り抜きの縁も「キラッ」も
        // 沈んでしまう(スキャンのシートも同じく暗い)。
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/90 backdrop-blur">
          {/* 保存が終わるとこの枠から絵が飛び立つ(runCatchLanding の startEl)。
              飛行中は元の絵を消して、上に載る「飛ぶ画像」に見た目を渡す。 */}
          {(cutoutImg ?? objectImg) && (
            <div
              ref={heroBoxRef}
              className={`grid aspect-square w-64 max-w-[78vw] place-items-center ${landing ? "opacity-0" : ""}`}
            >
              <img
                src={(cutoutImg ?? objectImg)!}
                alt=""
                className="catch-rise max-h-full max-w-full rounded-2xl object-contain shadow-2xl"
              />
            </div>
          )}
          {!landing && (
            <p lang="zh-Hant" className="mt-6 text-lg font-bold tracking-tight text-white">
              {selectedHead}
            </p>
          )}
          <style>{`
            @keyframes catchRise {
              0%   { transform: translateY(18px) scale(0.94); opacity: 0; }
              45%  { transform: translateY(-6px) scale(1.04); opacity: 1; }
              100% { transform: translateY(-14px) scale(1.02); opacity: 1; }
            }
            .catch-rise { animation: catchRise 620ms var(--ease-out-soft) both; }
            @media (prefers-reduced-motion: reduce) { .catch-rise { animation: none; } }
          `}</style>
        </div>
      )}

      {step === "reencounter" && reenc && (
        <div className="space-y-4">
          <div className="rounded-3xl border border-amber-300/60 bg-gradient-to-br from-amber-50 to-white p-5 text-center shadow-lg">
            <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-amber-400/90 px-3 py-1 text-xs font-bold text-amber-950">
              <PartyPopper className="h-3.5 w-3.5" /> {t("capture.reunion")}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("cap.reencBefore")}
              {reenc.location_name
                ? t("cap.reencAt", {
                    place: reenc.location_name,
                    date: new Date(reenc.taken_at).toLocaleDateString(dateLocale),
                  })
                : t("cap.reencOn", {
                    date: new Date(reenc.taken_at).toLocaleDateString(dateLocale),
                  })}
              {t("cap.reencAfter")}
            </p>
            {reenc.cutout_url && (
              <div className="mx-auto my-3 grid aspect-square w-40 place-items-center overflow-hidden rounded-2xl bg-white shadow ring-1 ring-black/5">
                <img
                  src={reenc.cutout_url}
                  alt={reenc.headword}
                  className="h-full w-full object-contain p-2"
                />
              </div>
            )}
            <div lang="zh-Hant" className="text-3xl font-bold tracking-tight">
              {reenc.headword}
            </div>
            <div lang="zh-Hant" className="mt-1 text-xs text-muted-foreground">
              {reenc.reading_zhuyin} {reenc.pinyin && `· ${reenc.pinyin}`}
            </div>

            {!reencRevealed ? (
              <button
                onClick={() => setReencRevealed(true)}
                className="lift mt-4 w-full rounded-2xl border-2 border-dashed border-amber-300 bg-white/70 py-4 text-sm font-semibold text-amber-900"
              >
                {t("capture.rememberQ")}
              </button>
            ) : (
              <div className="mt-4 rounded-2xl bg-white/80 p-4 ring-1 ring-amber-200">
                <p className="text-lg font-semibold">{reenc.meaning_ja}</p>
                {!reencResult ? (
                  <div className="mt-3 flex gap-2">
                    <Button
                      onClick={() => answerReencounter(true)}
                      disabled={reencBusy}
                      className="flex-1"
                    >
                      {t("capture.remembered")}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => answerReencounter(false)}
                      disabled={reencBusy}
                      className="flex-1"
                    >
                      {t("capture.forgot")}
                    </Button>
                  </div>
                ) : (
                  <div className="mt-3 space-y-2 text-sm">
                    <p className="font-semibold">
                      {reencResult.recalled ? t("capture.reviewBest") : t("capture.willAsk")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("cap.reunionNth", { n: reencResult.encounter_count })}
                      {reencResult.next_due_at &&
                        t("cap.nextReview", {
                          date: new Date(reencResult.next_due_at).toLocaleDateString(dateLocale),
                        })}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={reset} className="flex-1">
              <Camera className="mr-1 h-4 w-4" /> {t("capture.shootAnother")}
            </Button>
            {reencResult && (
              <Button
                onClick={() =>
                  navigate({ to: "/dex/$stickerId", params: { stickerId: reenc.sticker_id } })
                }
                className="flex-1"
              >
                {t("capture.seeInDex")}
              </Button>
            )}
          </div>
        </div>
      )}

      {step === "offlineSaved" && (
        <div className="space-y-4">
          <div className="rounded-3xl border border-border bg-card p-8 text-center">
            {/* 圏外の絵は**圏外のときだけ**。オンラインで500が返ったときに
                WiFiの絵を出すと、原因を取り違えたまま電波を探しに行かせる。 */}
            {typeof navigator !== "undefined" && navigator.onLine === false ? (
              <WifiOff className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            ) : (
              <Sparkles className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            )}
            <p className="text-base font-semibold">{t("capture.offlineTitle")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("capture.offlineHint")}</p>
            {savedReason && (
              <p className="mt-3 break-words text-xs text-muted-foreground">
                {t("capture.savedReason", { reason: savedReason })}
              </p>
            )}
          </div>
          {/* その場でもう一度試せる道を必ず残す。ここが「ホームへ」と
              「もう一枚撮る」だけだと、一時的な失敗でも作業が途切れる。 */}
          <Button onClick={() => void runAi()} className="lift w-full">
            <RotateCcw className="mr-1 h-4 w-4" /> {t("capture.savedRetry")}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate({ to: "/home" })} className="flex-1">
              {t("capture.toHome")}
            </Button>
            <Button variant="outline" onClick={reset} className="flex-1">
              <Camera className="mr-1 h-4 w-4" /> {t("capture.oneMore")}
            </Button>
          </div>
        </div>
      )}
      {inputSheet && (
        <InputCatchSheet
          initialMode="text"
          initialText={inputSheet.text}
          autoLookup={inputSheet.auto}
          onClose={() => setInputSheet(null)}
        />
      )}
      {/* キャッチ演出中だけ載る層: 飛ぶ絵・閃光・大きな単語
          (スキャンのシートと同じ一式を共有している) */}
      {landing && (
        <CatchLandingOverlay
          ref={flyRef}
          image={cutoutImg ?? objectImg}
          headword={selectedHead}
          reading={card?.reading_zhuyin ?? null}
        />
      )}
    </AppShell>
  );
}
