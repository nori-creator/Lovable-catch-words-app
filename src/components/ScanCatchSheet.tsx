import { useEffect, useRef, useState } from "react";
import { DEFAULT_TARGET_LANGUAGE } from "@/lib/target-lang";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { X, Loader2, Camera, Check, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { saveSticker } from "@/lib/stickers.functions";
import { markScanCaught } from "@/lib/scan.functions";
import { attachPhotoToSticker } from "@/lib/ghost.functions";
import { recordEncounter } from "@/lib/encounters.functions";
import { downscaleDataUrl, makeThumbBlob, thumbPath } from "@/lib/cutout";
import { putCachedImage } from "@/lib/image-cache";
import { usePronounce } from "@/lib/use-pronounce";
import type { GeneratedCard } from "@/lib/ai.functions";
import type { DetectedItem, DictionaryEntry } from "@/lib/scan.functions";
import { CatchLandingOverlay, runCatchLanding } from "@/components/CatchLanding";
import { useT } from "@/lib/i18n";

type Props = {
  snapshotDataUrl: string;
  item: DetectedItem;
  headword: string;
  dict: DictionaryEntry | undefined;
  cardPromise: Promise<GeneratedCard>;
  loc: { lat: number | null; lng: number | null; name: string | null };
  /**
   * Reunion catch (§5.3): when set, the photo replaces this ghost sticker's
   * placeholder instead of creating a new sticker, and the SRS gets the
   * highest possible grade (real-world recall).
   */
  upgrade?: { sticker_id: string } | null;
  onClose: () => void;
};

async function dataUrlToBlob(u: string): Promise<Blob> {
  return (await fetch(u)).blob();
}

/** Center-crop a square around the normalized (0..1000) tap point. */
async function cropAround(dataUrl: string, point: [number, number]): Promise<string> {
  const img = new Image();
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error("image load failed"));
    img.src = dataUrl;
  });
  const cx = (point[0] / 1000) * img.width;
  const cy = (point[1] / 1000) * img.height;
  const side = Math.min(img.width, img.height) * 0.9;
  const x = Math.max(0, Math.min(img.width - side, cx - side / 2));
  const y = Math.max(0, Math.min(img.height - side, cy - side / 2));
  const c = document.createElement("canvas");
  c.width = c.height = Math.round(side);
  const ctx = c.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, x, y, side, side, 0, 0, side, side);
  return c.toDataURL("image/jpeg", 0.88);
}

/**
 * §5 catch flow driven from a scan chip.
 * 1. crop the tap region and run @imgly/background-removal in-browser (no API cost)
 * 2. show cutout + verified details + optional selfie/caption (§5.1)
 * 3. on 保存: upload → reuse prefetched card (no additional AI call) → fly to 図鑑
 */
export function ScanCatchSheet({
  snapshotDataUrl,
  item,
  headword,
  dict,
  cardPromise,
  loc,
  upgrade,
  onClose,
}: Props) {
  const t = useT();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const saveFn = useServerFn(saveSticker);
  const caughtFn = useServerFn(markScanCaught);
  const attachFn = useServerFn(attachPhotoToSticker);
  const encounterFn = useServerFn(recordEncounter);
  const [phase, setPhase] = useState<"prep" | "ready" | "landing" | "done">("prep");
  // Cutout is disabled — always null; the plain crop (objectDataUrl) is used.
  const [cutoutUrl] = useState<string | null>(null);
  const [objectDataUrl, setObjectDataUrl] = useState<string | null>(null);
  const [selfieDataUrl, setSelfieDataUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const selfieInputRef = useRef<HTMLInputElement | null>(null);
  const cutoutBoxRef = useRef<HTMLDivElement | null>(null);
  const flyRef = useRef<HTMLImageElement | null>(null);
  // 演出中に単語の発音を鳴らすため、フックの結果を ref に保持しておく
  // (runLandingAnimation は非フック関数なので直接は呼べない)。
  const pronounce = usePronounce();
  const pronounceRef = useRef(pronounce);
  pronounceRef.current = pronounce;

  // 空中のタメで待たせず鳴らせるよう、音声だけ先に取っておく。
  useEffect(() => {
    pronounceRef.current?.prefetch?.(headword);
  }, [headword]);

  // Body scroll lock
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Show the photo and enable saving the instant we have a crop — the
  // background cutout is a best-effort *visual upgrade*, never a gate on the
  // catch. (Previously the sheet spun "分析中" until background removal finished,
  // and the save button + doSave both required the cutout, so a slow/absent
  // remove.bg model left the word impossible to file. The scan doesn't cut
  // anything out, so there's nothing to wait for.)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cropped = await cropAround(snapshotDataUrl, item.point);
        if (cancelled) return;
        setObjectDataUrl(cropped);
        setPhase("ready"); // ready as soon as the photo exists
        if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(12);
        // Background removal (cutout) is fully disabled for now — the scan
        // never cuts anything out; the plain crop is what we keep and show.
      } catch (e) {
        console.warn("crop failed", e);
        if (cancelled) return;
        // **切り出しに失敗したら、元の写真をそのまま使う。**
        //
        // 以前は `setPhase("ready")` だけで `objectDataUrl` は null のまま
        // だった。すると画面は**ずっとスピナー＋「読み込み中」**を出し続け、
        // 保存ボタンは `disabled={!objectDataUrl}` で永久に押せない。
        // 「読み込み中」は回復を約束する表示なので、回復しないものに使うと
        // ユーザーは待つだけ時間を捨てる(独立監査の指摘)。
        // 切り出しは見た目の格上げであって、キャッチの条件ではない。
        setObjectDataUrl(snapshotDataUrl);
        setPhase("ready");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSelfie(file: File) {
    const reader = new FileReader();
    const dataUrl: string = await new Promise((res, rej) => {
      reader.onload = () => res(reader.result as string);
      reader.onerror = () => rej(new Error("read failed"));
      reader.readAsDataURL(file);
    });
    // Camera files can be several MB — shrink before preview/upload so the
    // album loads fast later (roadmap B1).
    setSelfieDataUrl(await downscaleDataUrl(dataUrl, 1280, 0.82));
  }

  /**
   * キャッチ→図鑑の着弾演出。
   *
   * 振り付けそのものは歴代の版を variant として切り出してあり(effects/
   * catch-landing/)、開発者は設定のエフェクト・ラボで見比べて選べる。
   * 既定は現行版なので、選んでいない人の見え方は変わらない。
   * ここに残すのは**どの版でも共通の前後処理**だけ: phase の切替、チャイム、
   * 振動、そして reduced motion のときは飛行そのものを省く判断。
   */
  async function runLandingAnimation(): Promise<void> {
    setPhase("landing");
    await runCatchLanding({
      startEl: cutoutBoxRef.current,
      // ref のまま渡す。演出の層はこの直前の setPhase("landing") で
      // 初めて描かれるので、ここで .current を読むと必ず null になる。
      fly: flyRef,
      speakLine: () => void pronounceRef.current?.(headword),
    });
  }

  async function doSave() {
    if (!objectDataUrl || saving) return; // cutout is optional — never block on it
    setSaving(true);
    setErr(null);
    try {
      // §3.3 acceptance: the prefetched card is reused — no additional AI call
      // here. A reunion upgrade doesn't need the card at all (word exists).
      // Don't hang on it: if the AI card is slow or failed, we file the word
      // from the verified dictionary instead (details enrich later).
      const card: GeneratedCard | null = upgrade
        ? null
        : await Promise.race<GeneratedCard | null>([
            cardPromise.catch(() => null),
            new Promise<null>((r) => setTimeout(() => r(null), 8000)),
          ]);

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Not signed in");
      const ts = Date.now();
      async function upload(u: string | null, kind: string): Promise<string | null> {
        if (!u) return null;
        const blob = await dataUrlToBlob(u);
        const ext = blob.type.includes("png") ? "png" : "jpg";
        const path = `${userId}/${ts}-${kind}.${ext}`;
        const thumbPromise = makeThumbBlob(u);
        const { error } = await supabase.storage.from("stickers").upload(path, blob, {
          contentType: blob.type,
          upsert: false,
        });
        if (error) throw error;
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
        void putCachedImage(path, blob);
        return path;
      }
      // Only the original object photo is required. A transient failure on the
      // (optional) cutout or selfie must not abort filing the catch — degrade to
      // null instead, matching capture.tsx.
      const [object_path, cutout_path, selfie_path] = await Promise.all([
        upload(objectDataUrl, "object"),
        upload(cutoutUrl, "cutout").catch(() => null),
        upload(selfieDataUrl, "selfie").catch(() => null),
      ]);

      let stickerId: string;
      let firstCatch = false;
      if (upgrade) {
        // §5.3 golden reunion: swap the ghost's placeholder for the real
        // photo, then record the encounter as a top-grade SRS review.
        await attachFn({
          data: {
            sticker_id: upgrade.sticker_id,
            object_path,
            cutout_path,
            selfie_path,
            caption: caption || null,
            location_name: loc.name,
            lat: loc.lat,
            lng: loc.lng,
          },
        });
        // **記録の失敗を黙って捨てない。**
        //
        // 以前は `void … .catch(() => {})` で投げっぱなしだった。
        // 「再会!」のトーストが出て演出が走り、図鑑に着地するのに、
        // 復習の最高評価は書かれていない — その語は明日また
        // 「忘れかけ」として出てくる。何も告げられないまま。
        // 復習画面の採点は同じ失敗をちゃんと伝えているのに、
        // 体験の山場である再会だけが黙って落ちていた(独立監査の指摘)。
        try {
          await encounterFn({
            data: {
              sticker_id: upgrade.sticker_id,
              recalled: true,
              lat: loc.lat,
              lng: loc.lng,
              location_name: loc.name,
            },
          });
        } catch {
          // 写真の添付は済んでいる(キャッチ自体は成功)。
          // 落ちたのは復習の記録だけなので、そこだけ伝えて先へ進む。
          toast.error(t("sheet.reunionNotRecorded"));
        }
        stickerId = upgrade.sticker_id;
      } else {
        const meaning = card?.meaning_ja || dict?.meaning_ja || item.meaning_ja;
        if (!meaning) throw new Error(t("sheet.noWordInfo"));
        const word = card
          ? {
              headword,
              reading_zhuyin: dict?.zhuyin || card.reading_zhuyin,
              pinyin: dict?.pinyin || card.pinyin,
              meaning_ja: dict?.meaning_ja || card.meaning_ja,
              part_of_speech: dict?.pos || card.part_of_speech,
              level: card.level,
              category_key: card.category_key,
              example_sentence: card.example_sentence,
              example_translation: card.example_translation,
              extras: card.extras,
            }
          : {
              // Dictionary-only fallback — enough to file the catch now.
              headword,
              reading_zhuyin: dict?.zhuyin || item.zhuyin || "",
              pinyin: dict?.pinyin || item.pinyin || "",
              meaning_ja: meaning,
              part_of_speech: dict?.pos || "名詞",
              level: "TOCFL-2",
              category_key: "other",
              example_sentence: "",
              example_translation: "",
            };
        const res = await saveFn({
          data: {
            word,
            // 提案は**カードが在るときだけ**来る(辞書だけの経路には無い)。
            new_shelf: card?.new_shelf ?? null,
            language: DEFAULT_TARGET_LANGUAGE,
            object_path,
            cutout_path,
            selfie_path,
            caption: caption || null,
            location_name: loc.name,
            lat: loc.lat,
            lng: loc.lng,
          },
        });
        stickerId = res.id;
        firstCatch = res.first_catch ?? false;
      }

      void caughtFn({ data: { headword } }).catch(() => {});
      await qc.invalidateQueries({ queryKey: ["stickers"] });
      void qc.invalidateQueries({ queryKey: ["scan-context"] });
      await runLandingAnimation();
      setPhase("done");
      if (firstCatch) {
        // Onboarding §2: the SRS teaser is tomorrow's reason to come back.
        toast.success(t("sheet.firstCatch"), { duration: 5000 });
      } else {
        toast.success(upgrade ? t("sheet.reunion") : t("sheet.addedOne"));
      }
      // 図鑑のページが開き、新しいセルがバンと追加される(dex側の slam-in)。
      setTimeout(() => navigate({ to: "/dex", search: { justCaught: stickerId } }), 250);
    } catch (e) {
      console.error(e);
      setErr(e instanceof Error ? e.message : t("cap.saveFailed"));
      toast.error(t("cap.saveFailed"));
      setSaving(false);
      setPhase("ready");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-gradient-to-b from-black/85 via-black/70 to-black/85 backdrop-blur-md animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label={t("sheet.catch")}
    >
      <div className="flex items-center justify-between px-3 py-2">
        <span className="pl-1 text-footnote font-medium text-white/80">{t("sheet.catch")}</span>
        {phase === "ready" && !saving && (
          <button
            onClick={onClose}
            aria-label={t("common.close")}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white active:scale-95 motion-reduce:active:scale-100"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-6">
        {/* Cutout hero */}
        <div
          ref={cutoutBoxRef}
          className="mx-auto mt-2 grid aspect-square w-64 max-w-full place-items-center drop-shadow-[0_20px_40px_rgba(0,0,0,0.55)]"
        >
          {(cutoutUrl ?? objectDataUrl) ? (
            <img
              src={(cutoutUrl ?? objectDataUrl)!}
              alt={headword}
              className={`h-full w-full object-contain ${cutoutUrl ? "cutout-pop" : "rounded-3xl object-cover"} ${phase === "landing" ? "opacity-0" : ""}`}
            />
          ) : (
            <div className="grid h-full w-full place-items-center rounded-3xl bg-white/5">
              <div className="flex flex-col items-center gap-2 text-white/80">
                <Loader2 className="h-8 w-8 animate-spin" />
                <p className="text-caption">{t("sheet.loading")}</p>
              </div>
            </div>
          )}
        </div>

        {/* Word summary + optional selfie/caption */}
        <div className="mt-5 rounded-3xl bg-card p-4 shadow-2xl">
          <div className="flex items-baseline gap-2">
            <h2 lang="zh-Hant" className="text-title font-bold tracking-tight">
              {headword}
            </h2>
            {/* **辞書に行があること = 確認済み、ではない。**
                `lookupHeadwords` は AI が作った未検証の行も返すので、
                直前のスキャン画面で「AI・未検証」と黄色く出ていた語が、
                保存を押す直前のこの画面で緑の「確認済み」に変わっていた。
                保証を出してはいけない場所が、いちばん出してはいけない
                瞬間(確定の直前)だった(独立監査の指摘)。 */}
            {dict?.source === "verified" ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-caption font-semibold text-emerald-900 ring-1 ring-emerald-200">
                {t("sheet.verified")}
              </span>
            ) : (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-caption font-semibold text-amber-900 ring-1 ring-amber-200">
                {t("sheet.aiMade")}
              </span>
            )}
          </div>
          <p lang="zh-Hant" className="mt-0.5 text-footnote text-muted-foreground">
            {dict?.zhuyin || item.zhuyin}
            {(dict?.pinyin || item.pinyin) && (
              <span className="ml-2">{dict?.pinyin || item.pinyin}</span>
            )}
          </p>
          <p className="mt-2 text-body font-medium">{dict?.meaning_ja || item.meaning_ja}</p>

          <div className="mt-4 space-y-3 border-t border-border pt-3">
            <div>
              <label className="text-footnote font-medium text-muted-foreground">
                {t("sheet.noteLabel")}{" "}
                <span className="ml-1 text-caption">{t("sheet.optional")}</span>
              </label>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder={t("sheet.notePlaceholder")}
                rows={2}
                maxLength={140}
                className="mt-1 w-full resize-none rounded-xl border border-border bg-secondary/50 p-2 text-body outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div>
              <label className="text-footnote font-medium text-muted-foreground">
                {t("sheet.selfieLabel")}{" "}
                <span className="ml-1 text-caption">{t("sheet.optional")}</span>
              </label>
              <div className="mt-1 flex items-center gap-2">
                {selfieDataUrl ? (
                  <img
                    src={selfieDataUrl}
                    alt=""
                    className="h-14 w-14 rounded-full object-cover ring-2 ring-primary/40"
                  />
                ) : (
                  <div className="grid h-14 w-14 place-items-center rounded-full bg-secondary text-muted-foreground">
                    <Camera className="h-5 w-5" />
                  </div>
                )}
                {/* **押す物そのものを `<label>` にする(オーナー指摘 2026-08-20)。**
                    「自撮りする」を押してもインカメラにならない、という指摘。
                    `capture="user"` は前から付いていたので、違いは**押し方**
                    だった — ここは `button` から `.click()` を投げていて、
                    端末によっては**その場の指の操作**と見なされず、
                    前後どちらのカメラかの指定ごと落ちる。
                    撮る経路(`capture.tsx`)は最初から `<label>` で包んであり、
                    そちらは効いている。同じ形に揃える。 */}
                <label className="min-h-11 cursor-pointer rounded-full bg-secondary px-3 py-1.5 text-footnote font-medium text-secondary-foreground active:scale-95 motion-reduce:active:scale-100 inline-flex items-center">
                  {selfieDataUrl ? t("sheet.retakeSelfie") : t("sheet.addSelfie")}
                  <input
                    ref={selfieInputRef}
                    type="file"
                    accept="image/*"
                    capture="user"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleSelfie(e.target.files[0])}
                  />
                </label>
              </div>
            </div>
          </div>

          {err && (
            <p className="mt-3 rounded-xl bg-destructive/10 p-2 text-footnote text-destructive-ink">
              {err}
            </p>
          )}

          <button
            onClick={doSave}
            disabled={!objectDataUrl || saving}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-body font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition active:scale-95 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : phase === "done" ? (
              <Check className="h-5 w-5" />
            ) : (
              <Sparkles className="h-5 w-5" />
            )}
            {phase === "done" ? t("sheet.landed") : t("sheet.file")}
          </button>
        </div>
      </div>

      {/* 飛ぶ絵・閃光・大きな単語(スキャンとカメラで共通の一式) */}
      {phase === "landing" && (
        <CatchLandingOverlay
          ref={flyRef}
          image={cutoutUrl ?? objectDataUrl}
          headword={headword}
          reading={dict?.zhuyin || item.zhuyin}
        />
      )}

      {/* Impact ring at the dex icon on landing */}
      <div
        id="catch-impact-ring"
        className="pointer-events-none fixed z-[70] hidden -translate-x-1/2 -translate-y-1/2"
        style={{ left: 0, top: 0 }}
      >
        <span className="block h-6 w-6 rounded-full bg-amber-300/0 ring-2 ring-amber-300" />
      </div>

      {/* Ready-state sparkle burst around the cutout — "this is now yours" */}
      {phase === "ready" && cutoutUrl && (
        <div className="pointer-events-none absolute left-1/2 top-[8.5rem] -translate-x-1/2">
          {[0, 60, 120, 180, 240, 300].map((deg) => (
            <span
              key={deg}
              className="absolute h-1.5 w-1.5 rounded-full bg-amber-200 shadow-[0_0_8px_rgba(253,224,71,0.9)]"
              style={{
                transform: `rotate(${deg}deg) translateY(-120px)`,
                animation: `readyBurst 900ms ease-out forwards`,
                animationDelay: `${deg * 1.5}ms`,
              }}
            />
          ))}
        </div>
      )}

      <style>{`
        @keyframes impactRing {
          0%   { transform: translate(-50%, -50%) scale(0.4); opacity: 0.9; }
          100% { transform: translate(-50%, -50%) scale(6);   opacity: 0; }
        }
        #catch-impact-ring.impact-play span { animation: impactRing 780ms cubic-bezier(0.15, 0.6, 0.3, 1) forwards; }
        @keyframes readyBurst {
          0%   { opacity: 0; }
          20%  { opacity: 1; }
          100% { opacity: 0; transform: rotate(var(--r, 0deg)) translateY(-160px) scale(0.6); }
        }
      `}</style>
    </div>
  );
}
