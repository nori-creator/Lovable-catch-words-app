import { useEffect, useRef, useState } from "react";
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
import { downscaleDataUrl, removeBackgroundFast } from "@/lib/cutout";
import type { GeneratedCard } from "@/lib/ai.functions";
import type { DetectedItem, DictionaryEntry } from "@/lib/scan.functions";

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

/** Short synthesized "catch!" chime — WebAudio, no assets. */
function playChime() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const notes = [784, 1175, 1568]; // G5 D6 G6
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "triangle";
      o.frequency.value = f;
      o.connect(g).connect(ctx.destination);
      const t0 = ctx.currentTime + i * 0.09;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.22, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4);
      o.start(t0);
      o.stop(t0 + 0.45);
    });
    setTimeout(() => ctx.close(), 900);
  } catch { /* silent */ }
}

/**
 * §5 catch flow driven from a scan chip.
 * 1. crop the tap region and run @imgly/background-removal in-browser (no API cost)
 * 2. show cutout + verified details + optional selfie/caption (§5.1)
 * 3. on 保存: upload → reuse prefetched card (no additional AI call) → fly to 図鑑
 */
export function ScanCatchSheet({ snapshotDataUrl, item, headword, dict, cardPromise, loc, upgrade, onClose }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const saveFn = useServerFn(saveSticker);
  const caughtFn = useServerFn(markScanCaught);
  const attachFn = useServerFn(attachPhotoToSticker);
  const encounterFn = useServerFn(recordEncounter);
  const [phase, setPhase] = useState<"prep" | "ready" | "landing" | "done">("prep");
  const [cutoutUrl, setCutoutUrl] = useState<string | null>(null);
  const [objectDataUrl, setObjectDataUrl] = useState<string | null>(null);
  const [selfieDataUrl, setSelfieDataUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const selfieInputRef = useRef<HTMLInputElement | null>(null);
  const cutoutBoxRef = useRef<HTMLDivElement | null>(null);
  const flyRef = useRef<HTMLImageElement | null>(null);

  // Body scroll lock
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Prepare cutout the moment the sheet opens.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cropped = await cropAround(snapshotDataUrl, item.point);
        if (cancelled) return;
        setObjectDataUrl(cropped);
        const dataUrl = await removeBackgroundFast(cropped);
        if (cancelled) return;
        setCutoutUrl(dataUrl);
        if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(12);
        setPhase("ready");
      } catch (e) {
        console.warn("cutout failed, using crop", e);
        setCutoutUrl((prev) => prev ?? objectDataUrl);
        setPhase("ready");
      }
    })();
    return () => { cancelled = true; };
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

  async function runLandingAnimation(): Promise<void> {
    setPhase("landing");
    playChime();
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate([18, 40, 60]);
    // give the fly image one frame to mount
    await new Promise((r) => setTimeout(r, 30));
    const startEl = cutoutBoxRef.current;
    const fly = flyRef.current;
    const dexEl = document.querySelector('[data-nav="/dex"]') as HTMLElement | null;
    if (!startEl || !fly || !dexEl) { await new Promise((r) => setTimeout(r, 700)); return; }
    const from = startEl.getBoundingClientRect();
    const to = dexEl.getBoundingClientRect();
    fly.style.left = `${from.left}px`;
    fly.style.top = `${from.top}px`;
    fly.style.width = `${from.width}px`;
    fly.style.height = `${from.height}px`;
    fly.style.opacity = "1";
    fly.style.transform = "translate(0,0) scale(1)";
    void fly.offsetWidth;
    fly.style.transition = "transform 820ms cubic-bezier(0.5, -0.2, 0.35, 1.25), opacity 820ms ease";
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    fly.style.transform = `translate(${dx}px, ${dy}px) scale(0.08) rotate(-6deg)`;
    fly.style.opacity = "0.85";
    await new Promise((r) => setTimeout(r, 840));
    // impact — pulse the dex icon
    dexEl.classList.add("dex-impact");
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(50);
    setTimeout(() => dexEl.classList.remove("dex-impact"), 900);
  }

  async function doSave() {
    if (phase !== "ready" || !objectDataUrl || !cutoutUrl || saving) return;
    setSaving(true);
    setErr(null);
    try {
      // §3.3 acceptance: the prefetched card is reused — no additional AI call
      // here. A reunion upgrade doesn't need the card at all (word exists).
      const card = upgrade ? null : await cardPromise;

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Not signed in");
      const ts = Date.now();
      async function upload(u: string | null, kind: string): Promise<string | null> {
        if (!u) return null;
        const blob = await dataUrlToBlob(u);
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
        upload(objectDataUrl, "object"),
        upload(cutoutUrl, "cutout"),
        upload(selfieDataUrl, "selfie"),
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
        void encounterFn({
          data: {
            sticker_id: upgrade.sticker_id,
            recalled: true,
            lat: loc.lat,
            lng: loc.lng,
            location_name: loc.name,
          },
        }).catch(() => {});
        stickerId = upgrade.sticker_id;
      } else {
        if (!card) throw new Error("カード情報の生成に失敗しました");
        const res = await saveFn({
          data: {
            word: {
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
            },
            language: "zh-TW",
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
        toast.success("はじめてのキャッチ! 明日、この単語を覚えてるか聞くね", { duration: 5000 });
      } else {
        toast.success(upgrade ? "再会! ゴーストが本物になりました✨" : "図鑑に1体増えました！");
      }
      setTimeout(() => navigate({ to: "/dex/$stickerId", params: { stickerId } }), 550);
    } catch (e) {
      console.error(e);
      setErr(e instanceof Error ? e.message : "保存に失敗しました");
      toast.error("保存に失敗しました");
      setSaving(false);
      setPhase("ready");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gradient-to-b from-black/85 via-black/70 to-black/85 backdrop-blur-md animate-in fade-in duration-200" role="dialog">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="pl-1 text-xs font-medium text-white/80">キャッチ</span>
        {phase === "ready" && !saving && (
          <button
            onClick={onClose}
            aria-label="閉じる"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white active:scale-95"
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
          {cutoutUrl ? (
            <img
              src={cutoutUrl}
              alt={headword}
              className={`h-full w-full object-contain ${phase === "ready" ? "cutout-pop" : ""} ${phase === "landing" ? "opacity-0" : ""}`}
            />
          ) : (
            <div className="grid h-full w-full place-items-center rounded-3xl bg-white/5">
              <div className="flex flex-col items-center gap-2 text-white/80">
                <Loader2 className="h-8 w-8 animate-spin" />
                <p className="text-[11px]">切り抜き中…</p>
              </div>
            </div>
          )}
        </div>

        {/* Word summary + optional selfie/caption */}
        <div className="mt-5 rounded-3xl bg-card p-4 shadow-2xl">
          <div className="flex items-baseline gap-2">
            <h2 className="text-2xl font-bold tracking-tight">{headword}</h2>
            {dict ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-900 ring-1 ring-emerald-200">
                ✓ 検証済み
              </span>
            ) : (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900 ring-1 ring-amber-200">
                AI生成
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {dict?.zhuyin || item.zhuyin}
            {(dict?.pinyin || item.pinyin) && <span className="ml-2">{dict?.pinyin || item.pinyin}</span>}
          </p>
          <p className="mt-2 text-base font-medium">{dict?.meaning_ja || item.meaning_ja}</p>

          <div className="mt-4 space-y-3 border-t border-border pt-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">一言感想 <span className="ml-1 text-[10px]">(任意)</span></label>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="どこで見つけた?どんな気持ち?"
                rows={2}
                maxLength={140}
                className="mt-1 w-full resize-none rounded-xl border border-border bg-secondary/50 p-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">一緒に自撮り <span className="ml-1 text-[10px]">(任意)</span></label>
              <div className="mt-1 flex items-center gap-2">
                {selfieDataUrl ? (
                  <img src={selfieDataUrl} alt="" className="h-14 w-14 rounded-full object-cover ring-2 ring-primary/40" />
                ) : (
                  <div className="grid h-14 w-14 place-items-center rounded-full bg-secondary text-muted-foreground">
                    <Camera className="h-5 w-5" />
                  </div>
                )}
                <button
                  onClick={() => selfieInputRef.current?.click()}
                  type="button"
                  className="rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground active:scale-95"
                >
                  {selfieDataUrl ? "撮り直す" : "自撮りを追加"}
                </button>
                <input
                  ref={selfieInputRef}
                  type="file"
                  accept="image/*"
                  capture="user"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleSelfie(e.target.files[0])}
                />
              </div>
            </div>
          </div>

          {err && <p className="mt-3 rounded-xl bg-destructive/10 p-2 text-xs text-destructive">{err}</p>}

          <button
            onClick={doSave}
            disabled={phase !== "ready" || saving}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition active:scale-95 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : phase === "done" ? <Check className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
            {phase === "done" ? "図鑑に着地！" : "図鑑へ収める"}
          </button>
        </div>
      </div>

      {/* Flying cutout during landing */}
      {phase === "landing" && cutoutUrl && (
        <img
          ref={flyRef}
          src={cutoutUrl}
          alt=""
          className="pointer-events-none fixed z-[60] object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,0.4)]"
          style={{ willChange: "transform, opacity", left: 0, top: 0 }}
        />
      )}

      <style>{`
        @keyframes cutoutPop {
          0%   { transform: scale(0.55) translateY(24px); opacity: 0; }
          55%  { transform: scale(1.08) translateY(-6px); opacity: 1; }
          100% { transform: scale(1) translateY(0); }
        }
        .cutout-pop { animation: cutoutPop 560ms cubic-bezier(0.2, 0.9, 0.3, 1.2); }
        @keyframes dexImpact {
          0%   { transform: scale(1); filter: brightness(1); }
          25%  { transform: scale(1.35); filter: brightness(1.5) drop-shadow(0 0 12px hsl(var(--primary))); }
          60%  { transform: scale(0.92); }
          100% { transform: scale(1); filter: brightness(1); }
        }
        .dex-impact { animation: dexImpact 780ms cubic-bezier(0.3, 1.6, 0.4, 1); }
      `}</style>
    </div>
  );
}
