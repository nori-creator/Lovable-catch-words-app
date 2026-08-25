import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTargetLang } from "@/lib/target-lang-pref";
import { WordCandidateRow } from "@/components/WordCandidateRow";
import { useEffect, useRef, useState, type RefObject } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Camera,
  Volume2,
  Loader2,
  RotateCcw,
  Sparkles,
  Check,
  Keyboard,
  ScanLine,
  PartyPopper,
  WifiOff,
  ImagePlus,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { suggestWords, generateCard } from "@/lib/ai.functions";
import { saveSticker } from "@/lib/stickers.functions";
import { checkOwnedWord, recordEncounter, type OwnedWord } from "@/lib/encounters.functions";
import { enqueueCapture, getPendingCapture, removePendingCapture } from "@/lib/offline-queue";
import { makeThumbBlob, preloadCutout, removeBackgroundSmart, thumbPath } from "@/lib/cutout";
import { cutoutAtCatch, recordCatchTiming, useCatchSpeed } from "@/lib/catch-speed";
import { putCachedImage } from "@/lib/image-cache";
import { uploadStickerImage } from "@/lib/sticker-upload";
import { WordCard } from "@/components/WordCard";
import { InputCatchSheet } from "@/components/InputCatchSheet";
import { ScanEffect } from "@/components/ScanEffect";
import { CatchLandingOverlay, runCatchLanding } from "@/components/CatchLanding";
import { usePronounce } from "@/lib/use-pronounce";
import { useCatchLocation } from "@/lib/use-catch-location";
import { localeOf, useT } from "@/lib/i18n";
import { formatCount } from "@/lib/count";
import { Zh } from "@/components/Zh";
import { useUiLang } from "@/lib/i18n";
import { tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/capture")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { word?: string; pending?: string; retake?: string } => {
    const out: { word?: string; pending?: string; retake?: string } = {};
    // 派生キャッチ: /capture?word=咖啡 で文字入力フローを自動実行
    if (typeof search.word === "string" && search.word) out.word = search.word;
    // オフラインキューからの復元: /capture?pending=<id>
    if (typeof search.pending === "string" && search.pending) out.pending = search.pending;
    // 撮り直しの提案から来たとき: /capture?retake=雨傘
    // **文字入力は走らせない** — 目的はカメラで撮り直すことなので、
    // 「何を撮りに来たか」を思い出させる一行を出すだけにする。
    if (typeof search.retake === "string" && search.retake) out.retake = search.retake;
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
  /** 他の候補との**使い分け**を一言。出ない回もあるので任意。 */
  distinction?: string;
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
  /**
   * AI が「どの棚にも当てはまらない」と判断したときの新しい棚の提案。
   * 形は信用しない — 保存側の `normalizeShelfProposal` が直すか諦める。
   */
  new_shelf?: {
    key?: string;
    label?: string;
    emoji?: string;
    room_key?: string;
    room_label?: string;
  } | null;
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
  /**
   * いま撮った物を**何語として扱うか**（設定の学習言語）。
   * 候補の提案・カードの生成・持っているかの判定・保存の全部が
   * この1つの値を見る。バラバラに決め打つと、たとえば
   * 「英語のカードを作ったのに台湾華語として保存する」が起きる。
   */
  const targetLanguage = useTargetLang();
  // 日付の書式も表示言語に合わせる(2026/7/30 と Jul 30, 2026)。
  const dateLocale = localeOf(useUiLang());
  const pronounce = usePronounce();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { word: wordParam, pending: pendingParam, retake: retakeParam } = Route.useSearch();
  const [mode, setMode] = useState<Mode>("photo");
  // 文字入力キャッチはアプリ共通の InputCatchSheet に統一(重複UIの解消)。
  const [inputSheet, setInputSheet] = useState<null | { text?: string; auto?: boolean }>(null);
  const [step, setStep] = useState<Step>("object");
  const [objectImg, setObjectImg] = useState<string | null>(null);
  const [cutoutImg, setCutoutImg] = useState<string | null>(null);
  /** 速さのつまみ(要望 #18)。既定は「切り抜きモード」。 */
  const catchSpeed = useCatchSpeed();
  /**
   * 走っている切り抜き。**カードを出す時刻とは切り離す。**
   * 切り抜きモードで待つのは「図鑑に入れる直前」だけ。
   */
  const cutoutPromiseRef = useRef<Promise<string | null> | null>(null);
  const [selfieImg, setSelfieImg] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedHead, setSelectedHead] = useState<string>("");
  const [manualWord, setManualWord] = useState<string>("");
  const [card, setCard] = useState<CardData | null>(null);
  const [caption, setCaption] = useState("");
  /**
   * どこで撮ったか。**画面を開いた時から温めておき、保存の直前に短く待つ。**
   * 以前は解析の頭で `getCurrentPosition` を投げっぱなしにしていたので、
   * 候補を早く選んだ回や初回フィックスが遅い回で `loc` が null のまま
   * 保存されていた(オーナー指摘「地図のデータが保存されてない」)。
   * かざす側は既にこの形で解いてあり、その解がこちらに伝わっていなかった。
   */
  const { loc, resolve: resolveLocation, setLoc } = useCatchLocation();
  const [flipped, setFlipped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reenc, setReenc] = useState<OwnedWord | null>(null);
  const [reencResult, setReencResult] = useState<{
    recalled: boolean | null;
    encounter_count: number;
    next_due_at: string | null;
    photo_saved: boolean;
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
  // Synchronous re-entrancy guard: `reencResult` is only set after the await, so
  // a fast double-tap would otherwise record two encounters (double SRS grade).
  const reencSubmittingRef = useRef(false);
  /** 保存が通ったか。通ったあとの失敗を「保存の失敗」と言わないための印。 */
  const savedRef = useRef(false);
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
  const saveFn = useServerFn(saveSticker);
  const ownedFn = useServerFn(checkOwnedWord);
  const encounterFn = useServerFn(recordEncounter);

  // Warm the cutout model while the user frames the shot, so the first
  // catch doesn't pay the model download + init cost (roadmap B2).
  useEffect(() => {
    preloadCutout();
  }, []);

  // 着いたらすぐ**外**カメラを開く(派生キャッチとオフライン復元のときは除く)。
  //
  // **自撮り側の自動 click は外したが、こちらは残す。** 壊れ方が違う:
  // ここは `capture="environment"` で、端末が既定で開くのも外カメラなので、
  // 自動の click が効かなかったときの結果は「開かない」— 下の `<label>` を
  // 押せば済む。自撮り側は既定と逆を向いているので、効かなかったときに
  // **逆のカメラが開く**。1タップ減らす価値と、間違ったカメラが開く害は
  // 釣り合わない。ここは②「一瞬でも早く」の本線なので、タップを増やさない。
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

  // **自動でカメラを開かない**(オーナー報告 2026-08-21)。
  //
  // > 「自撮りを追加ってボタン押しても、カメラが自動的にインカメラに
  // >  なってない。」
  //
  // ここは自撮りの段に入った瞬間に `selfieInputRef.current?.click()` を
  // `setTimeout` から投げていた。**指で押していない click** なので、
  // 端末によっては何も起きないか、開いても `capture="user"` が無視されて
  // 外カメラや選択ダイアログが出る。前の周にスキャン側で同じ形を直したとき、
  // 「撮る経路は `<label>` なので効いている」と書いたが、**この自動の
  // click が残っていた**ぶんだけ、そちらも壊れていた。
  //
  // 下の `<label>` を指で押せば `capture="user"` はそのまま効く。
  // 1タップ増えるが、**開いたカメラが逆を向いている**よりよい。

  async function handleObjectFile(file: File) {
    // **写真を読めなかったことを言う。**
    //
    // `fileToDataUrl` の reject を誰も受けておらず、失敗すると画面は
    // 何も変わらなかった。撮ったのに何も起きない画面は、押せていない
    // のか壊れているのか区別がつかない(独立監査の指摘)。
    try {
      const url = await fileToDataUrl(file);
      const compressed = await compressImage(url, 1600);
      setObjectImg(compressed);
      setStep("selfie");
    } catch (e) {
      console.error(e);
      setError(t("cap.photoReadFailed"));
      toast.error(t("cap.photoReadFailed"));
    }
  }

  async function handleSelfieFile(file: File | null) {
    if (file) {
      try {
        const url = await fileToDataUrl(file);
        setSelfieImg(await compressImage(url, 1280));
      } catch (e) {
        // 自撮りは任意。読めなくてもキャッチは止めない。
        console.warn("selfie read failed", e);
      }
    }
    await runAi();
  }

  async function runAi(imgOverride?: string) {
    const img = imgOverride ?? objectImg;
    if (!img) return;
    const token = ++runTokenRef.current;
    setWaitKind("analyze");
    setStep("processing");
    setError(null);
    setSavedReason(null);

    try {
      // The AI only needs a small image — shrinking it cuts upload time and cost.
      const aiImage = await compressImage(img, 768, 0.8);
      if (runTokenRef.current !== token) return;
      // 切り抜きは**候補をタップしてから**走らせる(下の confirmWord)。
      // どの語を選ぶか決める前から待たされる理由はないし、切り抜かれた絵が
      // 「タップした結果」として現れるほうが、何が起きたか分かりやすい。
      const suggestRes = await suggestFn({
        data: { imageBase64: aiImage, targetLanguage: targetLanguage },
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
      const here = await resolveLocation();
      const saved = pendingIdRef.current
        ? pendingIdRef.current
        : await enqueueCapture({
            object_img: img,
            selfie_img: selfieImg,
            lat: here.lat,
            lng: here.lng,
            location_name: here.name,
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
    const startedAt = Date.now();

    // タップした瞬間に切り抜きを始める。失敗しても写真のまま進める
    // (切り抜きは見た目の格上げであって、キャッチの条件ではない)。
    //
    // ## **カードは、どちらのモードでも待たせずに出す**(オーナー指摘 2026-08-20)
    // 「モードにかかわらず、最速で図鑑に追加できるようにする」。
    // ここは切り抜きが終わるまでカードを出さない作りで、意味も発音も
    // 候補から既に入っているのに**背景を消す処理のために画面が止まって**
    // いた。切り抜きモードで変わるのは「図鑑に入れる前に切り抜くかどうか」
    // であって、**カードを見せる時刻ではない**。
    // だから待つのは保存の直前(`save`)だけにする。
    const wantCutout = cutoutAtCatch(catchSpeed);
    const cutoutPromise: Promise<string | null> =
      objectImg && wantCutout
        ? removeBackgroundSmart(objectImg).catch((e) => {
            console.warn("background removal failed, using original", e);
            return null;
          })
        : Promise.resolve(null);
    cutoutPromiseRef.current = cutoutPromise;

    // Already caught this word? Then this is a re-encounter — the best review
    // moment there is — not a duplicate sticker.
    try {
      const { owned } = await ownedFn({
        data: { headword: head, language: targetLanguage },
      });
      if (runTokenRef.current !== token) return;
      if (owned) {
        setReenc(owned);
        setReencResult(null);
        setStep("reencounter");
        // **写真をここで捨てない。** 切り抜きの完了を待って、そのまま
        // その単語の写真として足す。待つのは画面を出したあとなので、
        // 学習者は演出を見ている間に終わる。
        void cutoutPromise.then((cut) => recordReencounter(objectImg, cut));
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
          data: {
            headword: head,
            targetLanguage: targetLanguage,
            hintCategory: hint.category_key,
          },
        })
          .then((c) => {
            if (runTokenRef.current === token) setCard(c);
          })
          .catch(() => {});
      } else {
        const c = await cardFn({
          data: { headword: head, targetLanguage: targetLanguage },
        });
        if (runTokenRef.current !== token) return;
        setCard(c);
      }
      // **カードは待たずに出す。** 切り抜きが間に合えば、あとから絵が
      // 差し替わる(「ポン」と現れる返事はそのまま残る)。
      if (runTokenRef.current !== token) return;
      setCutoutImg(objectImg);
      setStep("card");
      void cutoutPromise.then((cut) => {
        if (cut && runTokenRef.current === token) setCutoutImg(cut);
      });
      // 要望 #73「切り抜きあり/なしの時間を計測して比較」。
      // 端末に貯めて設定の開発者欄で見る(理由は `lib/catch-speed.ts`)。
      recordCatchTiming({
        ms: Date.now() - startedAt,
        speed: catchSpeed,
        cutout: wantCutout,
      });
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
      // 温めてある位置を**ここで確定させる**。状態を直に読むと、
      // 候補を早く選んだ回はまだ届いていない。
      const here = await resolveLocation();
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

      // **切り抜きモードでは、図鑑に入れる前に切り抜きが揃っていること**
      // (オーナー指摘 2026-08-20)。カードは待たずに出しているので、
      // 間に合っていなければここで待つ。速いモードでは即座に null が返る。
      const cutForSave = (await cutoutPromiseRef.current) ?? cutoutImg;

      // 3枚のアップロードは並列。切り抜きは任意なので、失敗しても保存は続ける
      // (以前は cutout の失敗で全体が例外になり、登録が長引いていた)。
      const [object_path, cutout_path, selfie_path] = await Promise.all([
        upload(objectImg, "object"),
        upload(cutForSave, "cutout").catch(() => null),
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
          // AI が「どの棚にも当てはまらない」と言ったときの新しい棚。
          // ここを渡し忘れると、提案は生成されるのに**保存側に届かない** —
          // このアプリで何度もやっている「直したものが動く経路に無い」形。
          new_shelf: card.new_shelf ?? null,
          language: targetLanguage,
          object_path,
          cutout_path,
          selfie_path,
          caption: caption || null,
          location_name: here.name,
          lat: here.lat,
          lng: here.lng,
        },
      });

      // **ここから先の失敗は「保存の失敗」ではない。**
      //
      // 以前は演出も遷移も同じ try の中にあり、`catch` は一律
      // 「保存に失敗しました」を出してカード画面へ戻していた。
      // ユーザーは失敗したと思ってもう一度「図鑑に追加」を押し、
      // **同じ写真の同じ語が2枚並ぶ**(重複の確認は語を選ぶ段階にしか
      // 無く、保存時には無い)。嘘の失敗が、正しい対処を誤りに変えていた
      // (独立監査の指摘)。
      //
      // 保存は済んでいるので、以後は何が転んでも図鑑へ送る。
      savedRef.current = true;

      // 図鑑の再取得は待たない(演出中に裏で終わる) — 体感を最短にする。
      void queryClient.invalidateQueries({ queryKey: ["stickers"] });
      if (pendingId) void removePendingCapture(pendingId);

      // ここからキャッチ演出。切り抜きがふわっと浮いて画面いっぱいに広がり、
      // 上へ抜けたところで図鑑のページが開いて、新しいセルがドンと着弾する
      // (最後の一撃は /dex 側の slam-in が ?justCaught= を見て出す)。
      // 以前このフローだけ演出がなく、保存したら図鑑に飛ぶだけだった。
      setLanding(true);
      try {
        await runCatchLanding({
          startEl: heroBoxRef.current,
          // ref のまま渡す。演出の層はこの直前の setLanding(true) で
          // 初めて描かれるので、ここで .current を読むと必ず null になる。
          fly: flyRef,
          speakLine: () => void pronounce(selectedHead),
        });
      } catch (e) {
        // 演出が転んでも保存は済んでいる。見せ場を諦めて図鑑へ送る。
        console.warn("catch landing failed", e);
      }
      navigate({ to: "/dex", search: { justCaught: res.id } });
    } catch (e) {
      console.error(e);
      setLanding(false);
      if (savedRef.current) {
        // 保存は通っている。ここで「失敗」と言うと、押し直して二重登録になる。
        toast.error(t("cap.savedButLandingFailed"));
        navigate({ to: "/dex", search: {} });
        return;
      }
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
    setReencResult(null);
    setPendingId(null);
    pendingIdRef.current = null;
    savedRef.current = false;
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

  /**
   * 再会を記録する。**当てものは出さない。**
   *
   * これまでは「意味、覚えてる?」と伏せて出し、開くと母語の意味が出て、
   * 「覚えてた / 忘れてた」を押させていた。撮った本人がその物の母語を
   * 知らないはずがないので、問いとして成り立っていない(オーナー指摘)。
   *
   * 代わりに、**今回撮った写真をその単語に足す**。今まではここで写真を
   * 捨てていた。復習の間隔は動かさない(`recalled: null`)。
   */
  async function recordReencounter(objectImg: string | null, cutoutImg: string | null) {
    if (!reenc || reencResult || reencSubmittingRef.current) return;
    reencSubmittingRef.current = true;
    try {
      // 再会も「どこで会い直したか」が残るべき記録。
      const here = await resolveLocation();
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id ?? null;
      const ts = Date.now();
      // 写真の保存に失敗しても、再会の記録そのものは残す —
      // 「撮ったのに何も起きなかった」が一番困る。
      const [image_path, cutout_path] = userId
        ? await Promise.all([
            uploadStickerImage({ userId, dataUrl: objectImg, kind: "encounter", ts }).catch(
              () => null,
            ),
            uploadStickerImage({ userId, dataUrl: cutoutImg, kind: "encounter-cutout", ts }).catch(
              () => null,
            ),
          ])
        : [null, null];

      const res = await encounterFn({
        data: {
          sticker_id: reenc.sticker_id,
          recalled: null,
          lat: here.lat,
          lng: here.lng,
          location_name: here.name,
          image_path,
          cutout_path,
        },
      });
      setReencResult({
        recalled: null,
        encounter_count: res.encounter_count,
        next_due_at: res.next_due_at,
        photo_saved: !!(image_path || cutout_path),
      });
      await queryClient.invalidateQueries({ queryKey: ["stickers"] });
      await queryClient.invalidateQueries({ queryKey: ["sticker-photos"] });
    } catch (e) {
      console.error(e);
      toast.error(t("cap.recordFailed"));
    } finally {
      reencSubmittingRef.current = false;
    }
  }

  return (
    <AppShell title={t("title.capture")}>
      {step === "object" && (
        <div className="space-y-4">
          <div>
            <h2 className="text-title font-semibold tracking-tight">{t("capture.photoTitle")}</h2>
            <p className="mt-1 text-body text-muted-foreground">{t("capture.photoHint")}</p>
          </div>
          {/* 復習の「もう一度撮ってみる?」から来たとき、何を撮りに来たかを
              思い出させる。ここに来るまでに数タップ挟まるので、
              単語を持ってこないと目的が消える。 */}
          {retakeParam && (
            <p className="ja-phrase rounded-2xl bg-secondary px-3 py-2 text-footnote font-semibold">
              {t("retake.hint", { w: retakeParam })}
            </p>
          )}
          <label className="block">
            <div className="grid aspect-square place-items-center rounded-3xl border-2 border-dashed border-border bg-card text-muted-foreground transition-colors hover:border-primary hover:bg-accent/40">
              <div className="flex flex-col items-center gap-2">
                <span className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-primary to-rose-500 text-white shadow-lg shadow-primary/30">
                  <Camera className="h-8 w-8" />
                </span>
                <span className="text-body font-medium">{t("capture.tapToShoot")}</span>
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
            <span className="text-footnote text-muted-foreground">{t("capture.or")}</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <button
            onClick={() => setInputSheet({})}
            className="lift flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card p-3 text-body font-medium text-foreground"
          >
            <Keyboard className="h-4 w-4" />
            {t("capture.typeWord")}
          </button>

          {/* かざして調べるスキャンは、下タブから消えた代わりにここから開ける */}
          <button
            onClick={() => navigate({ to: "/scan" })}
            className="lift flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card p-3 text-body font-medium text-foreground"
          >
            <ScanLine className="h-4 w-4" />
            {t("capture.openScan")}
          </button>

          {error && <p className="text-body text-destructive-ink">{error}</p>}
        </div>
      )}

      {step === "selfie" && (
        <div className="space-y-4">
          <h2 className="text-title font-semibold tracking-tight">{t("capture.selfieTitle")}</h2>
          <p className="text-body text-muted-foreground">{t("capture.selfieHint")}</p>
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
                <span className="text-body">{t("capture.addSelfie")}</span>
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
            className="absolute right-4 top-[calc(1rem+env(safe-area-inset-top))] inline-flex min-h-11 items-center rounded-full bg-white/15 px-4 text-body font-medium text-white backdrop-blur-sm active:scale-95 motion-reduce:active:scale-100"
          >
            {t("capture.cancel")}
          </button>
        </div>
      )}

      {step === "select" && (
        <PickWordPanel
          objectImg={objectImg}
          suggestions={suggestions}
          manualWord={manualWord}
          setManualWord={setManualWord}
          onPick={(s) => confirmWord(s.headword, s, { skipImagePick: true })}
          onManual={() => confirmWord(manualWord.trim(), undefined, { skipImagePick: true })}
        />
      )}

      {step === "card" && card && (
        <CaptureCardPanel
          card={card}
          selectedHead={selectedHead}
          cutoutImg={cutoutImg}
          objectImg={objectImg}
          selfieImg={selfieImg}
          flipped={flipped}
          setFlipped={setFlipped}
          caption={caption}
          setCaption={setCaption}
          placeName={loc?.name ?? null}
          onRedo={reset}
          onSave={handleSave}
        />
      )}

      {step === "saving" && (
        <CaptureSavingPanel
          image={cutoutImg ?? objectImg}
          headword={selectedHead}
          landing={landing}
          heroBoxRef={heroBoxRef}
        />
      )}

      {step === "reencounter" && reenc && (
        <ReencounterPanel
          reenc={reenc}
          reencResult={reencResult}
          dateLocale={dateLocale}
          onAgain={reset}
          onSeeInDex={() =>
            navigate({ to: "/dex/$stickerId", params: { stickerId: reenc.sticker_id } })
          }
        />
      )}

      {step === "offlineSaved" && (
        <OfflineSavedPanel
          savedReason={savedReason}
          onRetry={() => void runAi()}
          onHome={() => navigate({ to: "/home" })}
          onAgain={reset}
        />
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

/**
 * 保存中の面 — **撮るたびに必ず通るのに、一度も測っていなかった。**
 *
 * 「保存中…」で止めない: 写真がふわっと浮き上がり、そのまま図鑑へ。
 * 見せ場は暗転した中で始まる。明るい背景だと切り抜きの縁も「キラッ」も
 * 沈んでしまう(スキャンのシートも同じく暗い)。
 *
 * ルートが状態機械を持つので、描く所だけを出して検査の雛形から呼べるようにする。
 */
export function CaptureSavingPanel({
  image,
  headword,
  landing,
  heroBoxRef,
}: {
  image: string | null;
  headword: string;
  /** 飛行が始まったか。始まったら元の絵と字を消して、上に載る層へ渡す。 */
  landing: boolean;
  heroBoxRef?: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/90 backdrop-blur">
      {/* 保存が終わるとこの枠から絵が飛び立つ(runCatchLanding の startEl)。
          飛行中は元の絵を消して、上に載る「飛ぶ画像」に見た目を渡す。 */}
      {image && (
        <div
          ref={heroBoxRef}
          className={`grid aspect-square w-64 max-w-[78vw] place-items-center ${landing ? "opacity-0" : ""}`}
        >
          <img
            src={image}
            alt=""
            className="catch-rise max-h-full max-w-full rounded-2xl object-contain shadow-2xl"
          />
        </div>
      )}
      {!landing && (
        <p lang="zh-Hant" className="mt-6 text-headline font-bold tracking-tight text-white">
          {headword}
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
  );
}

/**
 * 同じものにもう一度出会ったときの面。
 *
 * **意味は伏せない。** 撮った本人がその物の母語を知らないはずがないので、
 * 「覚えてる?」と伏せる問いは成り立たない(オーナー指摘)。
 * ここでやるのは「前にいつ撮ったか」を思い出させることと、
 * 今回の1枚をその単語に足すこと。
 *
 * ルートが状態機械を持つので、描く所だけを出して検査の雛形から呼べるように
 * する。**この面は今まで一度も機械の目に映っていなかった。**
 */
export function ReencounterPanel({
  reenc,
  reencResult,
  dateLocale,
  onAgain,
  onSeeInDex,
}: {
  reenc: OwnedWord;
  reencResult: { encounter_count: number; photo_saved?: boolean } | null;
  dateLocale: string;
  onAgain: () => void;
  onSeeInDex: () => void;
}) {
  const t = useT();
  return (
    <div className="space-y-4">
      {/* **素の Tailwind の番号と `white` の直書きをやめる。**
          `from-amber-50 to-white` は明るい面の前提で固定なので、暗いテーマでは
          面だけ白いまま、文字はテーマの明るい色になり、**見出し語が 1.01:1
          = 完全に読めない**状態だった(検査に入れて初めて写った)。
          琥珀はこの app のトークン `--warn` が持っている。 */}
      <div className="rounded-3xl border border-warn/40 bg-[color-mix(in_oklab,var(--warn)_12%,var(--card))] p-5 text-center shadow-lg">
        {/* 琥珀の上の文字は `--warn-foreground`。**白は乗らない** —
            琥珀はどのテーマでも明るい側の色なので、白を置くと 2.46:1 にしかならない。 */}
        <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-warn px-3 py-1 text-footnote font-bold text-warn-foreground">
          <PartyPopper className="h-3.5 w-3.5" /> {t("capture.reunion")}
        </div>
        <p className="ja-phrase mt-2 text-balance text-body text-muted-foreground">
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
          <div className="mx-auto my-3 grid aspect-square w-40 place-items-center overflow-hidden rounded-2xl bg-card shadow ring-1 ring-border">
            <img
              src={reenc.cutout_url}
              alt={reenc.headword}
              className="h-full w-full object-contain p-2"
            />
          </div>
        )}
        <div lang="zh-Hant" className="text-hero font-bold tracking-tight">
          {reenc.headword}
        </div>
        <div lang="zh-Hant" className="mt-1 text-footnote text-muted-foreground">
          {reenc.reading_zhuyin} {reenc.pinyin && `· ${reenc.pinyin}`}
        </div>

        {/* **意味は伏せない。** 撮った本人がその物の母語を知らないはずが
              ないので、「覚えてる?」と伏せる問いは成り立たない。
              再会でやることは「前にいつ撮ったか」を思い出させることと、
              今回の1枚をその単語に足すこと。 */}
        <div className="mt-3 rounded-2xl bg-card/90 p-4 ring-1 ring-warn/30">
          <p className="text-headline font-semibold">{reenc.meaning_ja}</p>
          <p className="mt-2 text-footnote text-muted-foreground">
            {reencResult
              ? t("cap.reunionNth", { n: formatCount(reencResult.encounter_count) })
              : t("cap.reunionSaving")}
          </p>
          {reencResult?.photo_saved && (
            <p className="mt-1 inline-flex items-center gap-1.5 text-footnote font-medium text-ok-ink">
              <ImagePlus className="h-3.5 w-3.5" />
              {t("cap.photoAdded")}
            </p>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" onClick={onAgain} className="flex-1">
          <Camera className="mr-1 h-4 w-4" /> {t("capture.shootAnother")}
        </Button>
        {reencResult && (
          <Button onClick={onSeeInDex} className="flex-1">
            {t("capture.seeInDex")}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * 撮ったあとに語を選ぶ面。
 *
 * 候補には**使い分けの一言**と**発音ボタン**が付く(オーナー指摘)。
 * 日本語の1語が台湾華語では複数の別語になるので、意味だけ並べても
 * 「どれも同じに見える」。
 *
 * ルートが状態機械とカメラを持つので、描く所だけを出す。
 * **カメラが要るのは撮る2段だけ**で、ここから先は写真の data URL さえ
 * あれば描ける。
 */
export function PickWordPanel({
  objectImg,
  suggestions,
  manualWord,
  setManualWord,
  onPick,
  onManual,
}: {
  objectImg: string | null;
  suggestions: Suggestion[];
  manualWord: string;
  setManualWord: (v: string) => void;
  onPick: (s: Suggestion) => void;
  onManual: () => void;
}) {
  const t = useT();
  const pronounce = usePronounce();
  return (
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
      <h2 className="text-title font-semibold tracking-tight">{t("capture.pickTitle")}</h2>
      <p className="text-body text-muted-foreground">{t("capture.pickHint")}</p>
      <div className="grid gap-2">
        {/* 札の中身は `WordCandidateRow` に1つだけ置いてある。
            打ち込んだ語の候補(`InputCatchSheet`)と**同じ役目・同じ見た目**で、
            以前はここに写しがあったせいで見出し語の大きさが違い、
            **表記の設定(注音/拼音)もこちら側だけ読んでいなかった**。 */}
        {suggestions.map((s) => (
          <WordCandidateRow
            key={s.headword}
            headword={s.headword}
            zhuyin={s.reading_zhuyin}
            pinyin={s.pinyin}
            meaning={s.meaning_ja}
            distinction={s.distinction}
            onPick={() => onPick(s)}
            onPronounce={() => void pronounce(s.headword)}
          />
        ))}
      </div>
      <div className="rounded-2xl border border-dashed border-border bg-card p-3">
        <Label htmlFor="manual" className="text-footnote text-muted-foreground">
          {t("capture.otherWord")}
        </Label>
        <div className="mt-1 flex gap-2">
          <Input
            id="manual"
            value={manualWord}
            onChange={(e) => setManualWord(e.target.value)}
            placeholder={t("cap.wordPlaceholder")}
          />
          <Button disabled={!manualWord.trim()} onClick={onManual}>
            {t("capture.useThis")}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * 圏外で撮って、端末に預かった面。**オフラインのときにしか出ない**ので、
 * 今まで誰も見ていなかった。
 *
 * その場でもう一度試せる道を必ず残す — ここが「ホームへ」と「もう一枚撮る」
 * だけだと、一時的な失敗で作業が途切れる。
 */
export function OfflineSavedPanel({
  savedReason,
  onRetry,
  onHome,
  onAgain,
}: {
  savedReason: string | null;
  onRetry: () => void;
  onHome: () => void;
  onAgain: () => void;
}) {
  const t = useT();
  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-border bg-card p-8 text-center">
        {/* 圏外の絵は**圏外のときだけ**。オンラインで500が返ったときに
              WiFiの絵を出すと、原因を取り違えたまま電波を探しに行かせる。 */}
        {typeof navigator !== "undefined" && navigator.onLine === false ? (
          <WifiOff className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        ) : (
          <Sparkles className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        )}
        <p className="text-body font-semibold">{t("capture.offlineTitle")}</p>
        {/* 中央に2行で置くと決めた案内文。行の長さを揃える。 */}
        <p className="ja-phrase mt-1 text-balance text-body text-muted-foreground">
          {t("capture.offlineHint")}
        </p>
        {savedReason && (
          <p className="ja-phrase mt-3 text-balance break-words text-footnote text-muted-foreground">
            {t("capture.savedReason", { reason: savedReason })}
          </p>
        )}
      </div>
      {/* その場でもう一度試せる道を必ず残す。ここが「ホームへ」と
            「もう一枚撮る」だけだと、一時的な失敗でも作業が途切れる。 */}
      <Button onClick={onRetry} className="lift w-full">
        <RotateCcw className="mr-1 h-4 w-4" /> {t("capture.savedRetry")}
      </Button>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onHome} className="flex-1">
          {t("capture.toHome")}
        </Button>
        <Button variant="outline" onClick={onAgain} className="flex-1">
          <Camera className="mr-1 h-4 w-4" /> {t("capture.oneMore")}
        </Button>
      </div>
    </div>
  );
}

/**
 * 生成が終わったカードの面。**撮るたびに必ず通る。**
 *
 * 表は切り抜き(または撮った写真)、裏は解説。押すと裏返る。
 * 下に一言を書く欄と、図鑑へ入れるボタン。
 *
 * `<video>` は使わない — ここまで来ると写真は静止画になっている。
 */
export function CaptureCardPanel({
  card,
  selectedHead,
  cutoutImg,
  objectImg,
  selfieImg,
  flipped,
  setFlipped,
  caption,
  setCaption,
  placeName,
  onRedo,
  onSave,
}: {
  card: CardData;
  selectedHead: string;
  cutoutImg: string | null;
  objectImg: string | null;
  /** 裏面。自撮りが無ければ「まだ無い」と描く。 */
  selfieImg: string | null;
  flipped: boolean;
  setFlipped: (f: (v: boolean) => boolean) => void;
  caption: string;
  setCaption: (v: string) => void;
  placeName: string | null;
  onRedo: () => void;
  onSave: () => void;
}) {
  const t = useT();
  return (
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
                <img src={objectImg} alt={selectedHead} className="h-full w-full object-cover" />
              ) : null}
            </div>
          </div>
          <div className="card-face card-back absolute inset-0 overflow-hidden rounded-3xl border border-border bg-card shadow-xl">
            {selfieImg ? (
              <img src={selfieImg} alt={t("cap.selfie")} className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full place-items-center text-body text-muted-foreground">
                {t("capture.noSelfie")}
              </div>
            )}
          </div>
        </div>
      </div>
      <p className="text-center text-caption text-muted-foreground">{t("capture.flipHint")}</p>

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
        // 撮った直後は**意味と発音だけ**。残りは裏の生成が届いた順に現れる
        // (オーナー指摘 2026-08-21)。
        minimal
      />

      <div>
        <Label htmlFor="caption" className="text-footnote text-muted-foreground">
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

      {placeName && <p className="text-footnote text-muted-foreground">📍 {placeName}</p>}

      <div className="flex gap-2">
        <Button variant="outline" onClick={onRedo} className="flex-1">
          {t("capture.redo")}
        </Button>
        <Button onClick={onSave} className="lift flex-1">
          <Check className="mr-1 h-4 w-4" /> {t("capture.addToDex")}
        </Button>
      </div>
    </div>
  );
}
