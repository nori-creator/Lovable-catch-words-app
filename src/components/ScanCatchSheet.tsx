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
import { downscaleDataUrl, makeThumbBlob, removeBackgroundSmart, thumbPath } from "@/lib/cutout";
import { putCachedImage } from "@/lib/image-cache";
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
        // Fire-and-forget: upgrade the hero to a transparent cutout if/when it
        // finishes. Failure or slowness is invisible — the crop already shows.
        void removeBackgroundSmart(cropped)
          .then((dataUrl) => { if (!cancelled) setCutoutUrl(dataUrl); })
          .catch(() => {});
      } catch (e) {
        console.warn("crop failed", e);
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
    // §14 reduced motion: the full-screen fly-to-cabinet flight is exactly the
    // vestibular motion to avoid — keep the chime/haptic, skip the travel.
    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      await new Promise((r) => setTimeout(r, 500));
      return;
    }
    // give the fly image one frame to mount
    await new Promise((r) => setTimeout(r, 30));
    const startEl = cutoutBoxRef.current;
    const fly = flyRef.current;
    const dexEl = document.querySelector('[data-nav="/dex"]') as HTMLElement | null;
    if (!startEl || !fly || !dexEl) { await new Promise((r) => setTimeout(r, 700)); return; }
    const from = startEl.getBoundingClientRect();
    const to = dexEl.getBoundingClientRect();
    const fromCx = from.left + from.width / 2;
    const fromCy = from.top + from.height / 2;
    // Set initial position for the flying cutout
    fly.style.left = `${from.left}px`;
    fly.style.top = `${from.top}px`;
    fly.style.width = `${from.width}px`;
    fly.style.height = `${from.height}px`;
    fly.style.opacity = "1";
    fly.style.transform = "translate(0,0) scale(1)";
    // Position the shimmer trail overlay to match
    const trail = document.getElementById("catch-trail");
    if (trail) {
      trail.style.left = `${fromCx}px`;
      trail.style.top = `${fromCy}px`;
    }
    void fly.offsetWidth;

    // --- 第1幕: 画面いっぱいに「バン」と拡大 + 単語ドーン ---------------------
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const heroScale = (Math.min(vw, vh) * 0.9) / Math.max(from.width, 1);
    const dxHero = vw / 2 - fromCx;
    const dyHero = vh * 0.42 - fromCy;
    fly.style.transition = "transform 460ms cubic-bezier(0.2, 0.9, 0.3, 1.18)";
    fly.style.transform = `translate(${dxHero}px, ${dyHero}px) scale(${heroScale})`;
    const flash = document.getElementById("catch-hero-flash");
    const wordEl = document.getElementById("catch-hero-word");
    if (flash) flash.classList.add("hero-flash-play");
    if (wordEl) wordEl.classList.add("hero-word-play");
    await new Promise((r) => setTimeout(r, 460));
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(30);
    await new Promise((r) => setTimeout(r, 480)); // 見せ場のタメ

    // --- 第2幕: ふわっと上に抜けて図鑑ページへ(着弾は図鑑側の slam-in) -----
    if (wordEl) wordEl.classList.remove("hero-word-play");
    fly.style.transition = "transform 480ms cubic-bezier(0.55, -0.1, 0.6, 0.9), opacity 480ms ease";
    fly.style.transform = `translate(${dxHero}px, ${dyHero - vh * 0.5}px) scale(${heroScale * 0.5})`;
    fly.style.opacity = "0";
    if (trail) trail.style.transform = `translate(-50%, -50%) translate(${dxHero}px, ${dyHero - vh * 0.5}px)`;
    await new Promise((r) => setTimeout(r, 480));
    if (flash) flash.classList.remove("hero-flash-play");
    // Small pulse on the dex tab as the page opens (the real「バン」is the
    // slam-in of the new cell on the dex grid, driven by ?justCaught=).
    dexEl.classList.add("dex-impact");
    void to;
    setTimeout(() => dexEl.classList.remove("dex-impact"), 900);
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
            .upload(thumbPath(path), thumb, { contentType: thumb.type || "image/webp", upsert: true })
            .catch(() => {});
          void putCachedImage(thumbPath(path), thumb);
        }
        void putCachedImage(path, blob);
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
        const meaning = card?.meaning_ja || dict?.meaning_ja || item.meaning_ja;
        if (!meaning) throw new Error("単語情報を取得できませんでした");
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
      // 図鑑のページが開き、新しいセルがバンと追加される(dex側の slam-in)。
      setTimeout(() => navigate({ to: "/dex", search: { justCaught: stickerId } }), 250);
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
                <p className="text-[11px]">読み込み中…</p>
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
            disabled={!objectDataUrl || saving}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition active:scale-95 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : phase === "done" ? <Check className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
            {phase === "done" ? "図鑑に着地！" : "図鑑へ収める"}
          </button>
        </div>
      </div>

      {/* Flying cutout (or the plain crop if the cutout isn't ready) during landing */}
      {phase === "landing" && (cutoutUrl ?? objectDataUrl) && (
        <>
          <div
            id="catch-trail"
            className="pointer-events-none fixed z-[59]"
            style={{
              willChange: "transform",
              transition: "transform 820ms cubic-bezier(0.5, -0.2, 0.35, 1.25)",
              width: 8, height: 8, left: 0, top: 0,
              transform: "translate(-50%, -50%)",
            }}
          >
            <span className="absolute inset-0 -m-6 rounded-full bg-amber-300/60 blur-2xl animate-pulse" />
            <span className="absolute inset-0 -m-3 rounded-full bg-white/80 blur-md" />
          </div>
          <img
            ref={flyRef}
            src={(cutoutUrl ?? objectDataUrl)!}
            alt=""
            className="pointer-events-none fixed z-[60] object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,0.4)]"
            style={{ willChange: "transform, opacity", left: 0, top: 0 }}
          />
        </>
      )}
      {/* Full-screen flash + big word for act 1 of the landing (画面いっぱい演出) */}
      {phase === "landing" && (
        <>
          <div
            id="catch-hero-flash"
            className="pointer-events-none fixed inset-0 z-[58] opacity-0"
            style={{ background: "radial-gradient(circle at 50% 42%, rgba(253,230,138,0.35), rgba(0,0,0,0) 60%)" }}
          />
          <div
            id="catch-hero-word"
            className="pointer-events-none fixed left-1/2 z-[61] -translate-x-1/2 text-center opacity-0"
            style={{ top: "68%" }}
          >
            <div className="text-6xl font-black tracking-tight text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.8)]">
              {headword}
            </div>
            {(dict?.zhuyin || item.zhuyin) && (
              <div className="mt-2 text-xl font-semibold text-amber-200 drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]">
                {dict?.zhuyin || item.zhuyin}
              </div>
            )}
            <div className="mt-1 text-sm font-medium text-white/85">GET!</div>
          </div>
        </>
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
        #catch-hero-flash.hero-flash-play { animation: heroFlash 900ms ease-out forwards; }
        @keyframes heroFlash {
          0%   { opacity: 0; }
          25%  { opacity: 1; }
          100% { opacity: 0.65; }
        }
        #catch-hero-word.hero-word-play { animation: heroWord 460ms cubic-bezier(0.2, 1.4, 0.4, 1) 120ms forwards; }
        @keyframes heroWord {
          0%   { opacity: 0; transform: translateX(-50%) scale(0.5) translateY(24px); }
          100% { opacity: 1; transform: translateX(-50%) scale(1) translateY(0); }
        }
      `}</style>

    </div>
  );
}
