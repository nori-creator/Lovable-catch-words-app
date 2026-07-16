import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, Keyboard, Loader2, Mic, ScanLine, Volume2, X, RotateCcw, BookOpen, Sparkles, Plus, Bug, ChevronDown } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { detectScan, detectParts, getScanContext, lookupHeadwords, markScanTap, type DetectedItem, type DictionaryEntry, type ScanContext } from "@/lib/scan.functions";
import { synthesizeSpeech } from "@/lib/tts.functions";
import { generateCard, type GeneratedCard } from "@/lib/ai.functions";
import { preloadCutout } from "@/lib/cutout";
import { primeAudio } from "@/lib/audio";
import { logAppEvent } from "@/lib/metrics.functions";
import { ScanDetailSheet } from "@/components/ScanDetailSheet";
import { ScanCatchSheet } from "@/components/ScanCatchSheet";
import { InputCatchSheet } from "@/components/InputCatchSheet";
import { ScanEffect } from "@/components/ScanEffect";
import { Sound, unlockAudio } from "@/lib/sound-engine";
import { haptic } from "@/lib/haptics";

export const Route = createFileRoute("/_authenticated/scan")({
  component: ScanPage,
  head: () => ({
    meta: [{ title: "スキャン | Catchwords" }, { name: "description", content: "カメラをかざして台湾華語の単語をその場で調べる。" }],
  }),
});

// § metrics — a tiny bus so the Catch flow can report catch_ms back here
// without prop-drilling. Only meaningful when dev overlay is on.
type Metrics = {
  detect_ms: number | null;
  parts_ms: number | null;
  lookup_ms: number | null;
  tap_to_audio_ms: number | null;
  prefetch_ms: number | null;
  catch_ms: number | null;
};



type ChipState = {
  item: DetectedItem;
  chosenHeadword: string; // may switch after picking a candidate
  showingCandidates: boolean;
};

/** §3.1b discovery radar: how this word relates to the user's collection. */
type DotState = "new" | "reunion" | "owned" | "seen";

type ScanCtx = { owned: ScanContext["owned"]; tappedSet: Set<string> };

const normHead = (s: string) => s.normalize("NFC").trim();

function dotStateFor(headword: string, ctx: ScanCtx | undefined): DotState {
  if (!ctx) return "seen";
  const key = normHead(headword);
  const entry = ctx.owned[key];
  if (entry) return entry.has_photo ? "owned" : "reunion";
  if (ctx.tappedSet.has(key)) return "seen";
  return "new";
}

function daysAgo(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86400000));
}

// A sub-item is a §3.5 part detection whose normalized coords have already
// been remapped into the parent frame (0..1000). We keep the parent id and
// tag it so the renderer can draw it as a smaller "child" dot.
type SubItem = DetectedItem & { parentId: string; sub: true };

function ScanPage() {
  const detectFn = useServerFn(detectScan);
  const partsFn = useServerFn(detectParts);
  const lookupFn = useServerFn(lookupHeadwords);
  const tapFn = useServerFn(markScanTap);
  const ttsFn = useServerFn(synthesizeSpeech);
  const cardFn = useServerFn(generateCard);
  const scanCtxFn = useServerFn(getScanContext);
  const logEvent = useServerFn(logAppEvent);

  // §3.1b: the user's collection, cached lightly for dot-state matching.
  const { data: rawScanCtx } = useQuery({
    queryKey: ["scan-context"],
    queryFn: () => scanCtxFn(),
    staleTime: 5 * 60 * 1000,
  });
  const scanCtx = useMemo<ScanCtx | undefined>(
    () => (rawScanCtx ? { owned: rawScanCtx.owned, tappedSet: new Set(rawScanCtx.tapped) } : undefined),
    [rawScanCtx],
  );

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // §3.3 プリフェッチ: タップされた語だけ generateCard をバックグラウンド起動し、
  // セッション内(スキャン画面が開いている間)は再利用する。タップされていない
  // 物体の詳細生成は行わない(コスト10倍防止)。
  const prefetchRef = useRef<Map<string, Promise<GeneratedCard>>>(new Map());
  const prefetchTimingRef = useRef<Map<string, number>>(new Map());
  const startPrefetch = useCallback((headword: string): Promise<GeneratedCard> => {
    const cache = prefetchRef.current;
    const hit = cache.get(headword);
    if (hit) return hit;
    const t0 = performance.now();
    const p = cardFn({ data: { headword, targetLanguage: "zh-TW" } });
    cache.set(headword, p);
    p.then(() => {
      prefetchTimingRef.current.set(headword, Math.round(performance.now() - t0));
    }).catch(() => { cache.delete(headword); });
    return p;
  }, [cardFn]);


  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanStage, setScanStage] = useState<"idle" | "sensing" | "reading" | "matching">("idle");
  const [items, setItems] = useState<DetectedItem[] | null>(null);
  const [subItems, setSubItems] = useState<SubItem[]>([]);
  const [expandingId, setExpandingId] = useState<string | null>(null); // parent id currently loading parts
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [entries, setEntries] = useState<Record<string, DictionaryEntry>>({});
  const [chip, setChip] = useState<ChipState | null>(null);
  const [detectMs, setDetectMs] = useState<number | null>(null);
  const [partsMs, setPartsMs] = useState<number | null>(null);
  const [lookupMs, setLookupMs] = useState<number | null>(null);
  const [tapToAudioMs, setTapToAudioMs] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState<{ headword: string; item: DetectedItem } | null>(null);
  const [catchOpen, setCatchOpen] = useState<{ headword: string; item: DetectedItem } | null>(null);
  const [inputCatchOpen, setInputCatchOpen] = useState<"text" | "voice" | null>(null);
  const [scanLoc, setScanLoc] = useState<{ lat: number | null; lng: number | null; name: string | null }>({ lat: null, lng: null, name: null });

  // Dev metrics overlay — gated so it doesn't pollute normal use.
  const [devOn, setDevOn] = useState(false);
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("dev");
      const ls = window.localStorage.getItem("catchwords_dev");
      if (q === "1" || ls === "1") setDevOn(true);
    } catch { /* ignore */ }
  }, []);



  // Warm the cutout model while the user frames the shot, so the first
  // catch doesn't pay the model download + init cost (roadmap B2).
  useEffect(() => {
    preloadCutout();
  }, []);

  // ---- camera lifecycle ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 1280 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setReady(true);
      } catch (e) {
        setError((e as Error).message || "カメラを起動できませんでした");
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  // ---- capture + downscale to longest side 1024 ----
  const grabFrame = useCallback((): string | null => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return null;
    const longest = Math.max(v.videoWidth, v.videoHeight);
    const scale = Math.min(1, 1024 / longest);
    const w = Math.round(v.videoWidth * scale);
    const h = Math.round(v.videoHeight * scale);
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(v, 0, 0, w, h);
    return c.toDataURL("image/jpeg", 0.82);
  }, []);

  const doScan = useCallback(async () => {
    if (scanning) return;
    unlockAudio();
    haptic("medium");
    setError(null);
    setChip(null);
    setItems(null);
    setSubItems([]);
    setEntries({});
    setDetectMs(null);
    setPartsMs(null);
    setLookupMs(null);
    setTapToAudioMs(null);
    const frame = grabFrame();
    if (!frame) { setError("フレームを取得できませんでした"); return; }
    setSnapshot(frame);
    setScanning(true);
    // KPI: first scan ever (localStorage-deduped).
    try {
      if (!localStorage.getItem("kpi-first-scan")) {
        localStorage.setItem("kpi-first-scan", "1");
        void logEvent({ data: { kind: "first_scan" } }).catch(() => {});
      }
    } catch { /* ignore */ }
    setScanStage("sensing");
    // Cycle status text so the wait feels intentional. Cleared in finally.
    const stageTimer1 = window.setTimeout(() => setScanStage("reading"), 700);
    const stageTimer2 = window.setTimeout(() => setScanStage("matching"), 1500);
    const t0 = performance.now();
    try {
      // location best-effort (§3.7)
      let lat: number | null = null, lng: number | null = null;
      try {
        const pos = await new Promise<GeolocationPosition>((res, rej) => {
          navigator.geolocation.getCurrentPosition(res, rej, { timeout: 800, maximumAge: 60000 });
        });
        lat = pos.coords.latitude; lng = pos.coords.longitude;
      } catch { /* ignore */ }
      setScanLoc({ lat, lng, name: null });

      const { items } = await detectFn({ data: { imageBase64: frame, lat, lng } });
      const dt = Math.round(performance.now() - t0);
      setDetectMs(dt);
      setItems(items);

      if (items.length > 0) {
        setScanStage("matching");
        const tl = performance.now();
        const { entries } = await lookupFn({ data: { headwords: items.map((i) => i.headword) } });
        setLookupMs(Math.round(performance.now() - tl));
        setEntries(entries);
      }

    } catch (e) {
      setError((e as Error).message || "検出に失敗しました");
    } finally {
      window.clearTimeout(stageTimer1);
      window.clearTimeout(stageTimer2);
      setScanning(false);
      setScanStage("idle");
    }
  }, [scanning, grabFrame, detectFn, lookupFn, logEvent]);


  // ---- tap a dot ----
  const openChip = useCallback((item: DetectedItem) => {
    const lowConf = item.confidence < 0.75 && item.alternatives.length > 0;
    setChip({ item, chosenHeadword: item.headword, showingCandidates: lowConf });
    if (!lowConf) {
      void playAudio(item.headword, item);
      // §3.3 プリフェッチ: バックグラウンドで詳細カード生成を開始。
      startPrefetch(item.headword);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startPrefetch]);

  const pickCandidate = useCallback(async (headword: string, item: DetectedItem) => {
    setChip({ item, chosenHeadword: headword, showingCandidates: false });
    // fetch dict entry for the newly-chosen headword if not cached
    if (!entries[headword]) {
      try {
        const { entries: e } = await lookupFn({ data: { headwords: [headword] } });
        setEntries((prev) => ({ ...prev, ...e }));
      } catch { /* noop */ }
    }
    void playAudio(headword, item);
    // 候補確定後にプリフェッチ開始(誤選択で無駄打ちしないため候補選択より後)。
    startPrefetch(headword);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, lookupFn, startPrefetch]);


  const playAudio = useCallback(async (headword: string, item: DetectedItem) => {
    // Must run synchronously inside the tap gesture, before any await —
    // otherwise iOS rejects the later .play() and the button stays silent.
    if (!audioRef.current) audioRef.current = new Audio();
    primeAudio(audioRef.current);
    const t0 = performance.now();
    // タップ記録は音声再生開始後に1回だけ送る(tap_to_audio_msを同梱、§7)。
    const reportTap = (ms: number) => {
      setTapToAudioMs(ms);
      void tapFn({ data: { headword, tap_to_audio_ms: ms } }).catch(() => {});
    };
    try {
      const dict = entries[headword];
      let url: string;
      if (dict?.audio_url) {
        // §4.3 事前生成音声: 署名URLが手元にあるのでサーバー往復ゼロで即再生。
        url = dict.audio_url;
      } else {
        const r = await ttsFn({ data: { text: headword } });
        url = r.audio_url;
      }
      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.src = url;
      await audioRef.current.play();
      reportTap(Math.round(performance.now() - t0));
    } catch {
      // fall back to browser TTS
      if ("speechSynthesis" in window) {
        const u = new SpeechSynthesisUtterance(headword);
        u.lang = "zh-TW";
        speechSynthesis.cancel();
        speechSynthesis.speak(u);
        reportTap(Math.round(performance.now() - t0));
      } else {
        void tapFn({ data: { headword } }).catch(() => {});
      }
    }
    void item;
  }, [entries, ttsFn, tapFn]);

  const reset = useCallback(() => {
    setItems(null); setSubItems([]); setSnapshot(null); setChip(null); setEntries({});
    setDetectMs(null); setPartsMs(null); setLookupMs(null); setTapToAudioMs(null);
    setDetailOpen(null); setCatchOpen(null); setExpandingId(null);
    prefetchRef.current.clear();
    prefetchTimingRef.current.clear();
  }, []);

  // ---- §3.5 「+細かく」: crop a region around the parent tap point and run a
  // second (parts-only) detection. Coords come back in the cropped 0..1000
  // frame; we remap into the parent frame before storing so the same dot
  // renderer can draw them.
  const expandParts = useCallback(async (parent: DetectedItem) => {
    if (!snapshot || expandingId) return;
    // Skip if we already have children for this parent
    if (subItems.some((s) => s.parentId === parent.id)) return;
    setExpandingId(parent.id);
    const t0 = performance.now();
    try {
      // Crop a square around the tap point ~40% of the shortest side.
      const img = new Image();
      await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("img")); img.src = snapshot; });
      const cx = (parent.point[0] / 1000) * img.width;
      const cy = (parent.point[1] / 1000) * img.height;
      const side = Math.min(img.width, img.height) * 0.42;
      const x = Math.max(0, Math.min(img.width - side, cx - side / 2));
      const y = Math.max(0, Math.min(img.height - side, cy - side / 2));
      const c = document.createElement("canvas");
      c.width = c.height = Math.round(side);
      const ctx = c.getContext("2d");
      if (!ctx) throw new Error("canvas");
      ctx.drawImage(img, x, y, side, side, 0, 0, c.width, c.height);
      const cropDataUrl = c.toDataURL("image/jpeg", 0.85);

      const { items: parts } = await partsFn({ data: { imageBase64: cropDataUrl, parentHeadword: parent.headword } });
      setPartsMs(Math.round(performance.now() - t0));

      // Remap normalized crop coords → parent-frame normalized coords.
      // Crop region in parent-frame normalized units:
      const rx0 = (x / img.width) * 1000;
      const ry0 = (y / img.height) * 1000;
      const rw = (side / img.width) * 1000;
      const rh = (side / img.height) * 1000;
      const mapped: SubItem[] = parts.map((p) => ({
        ...p,
        parentId: parent.id,
        sub: true,
        point: [rx0 + (p.point[0] / 1000) * rw, ry0 + (p.point[1] / 1000) * rh],
      }));
      setSubItems((prev) => [...prev, ...mapped]);

      // Lookup verified dict entries for the sub-parts so chips can badge them
      if (mapped.length > 0) {
        try {
          const { entries: e } = await lookupFn({ data: { headwords: mapped.map((m) => m.headword) } });
          setEntries((prev) => ({ ...prev, ...e }));
        } catch { /* noop */ }
      }
    } catch (e) {
      setError((e as Error).message || "詳細検出に失敗しました");
    } finally {
      setExpandingId(null);
    }
  }, [snapshot, expandingId, subItems, partsFn, lookupFn]);



  // ---- overlay coord conversion (normalized 0..1000 → pixels within box) ----
  const boxSize = useBoxSize(boxRef);
  const dotStyle = useCallback((it: DetectedItem): React.CSSProperties => {
    const [x, y] = it.point;
    const left = (x / 1000) * boxSize.w;
    const top = (y / 1000) * boxSize.h;
    return { left, top };
  }, [boxSize]);

  const chosenDict = chip ? entries[chip.chosenHeadword] : undefined;
  const displayHeadword = chip?.chosenHeadword ?? "";
  const displayZhuyin = chosenDict?.zhuyin ?? chip?.item.zhuyin ?? "";
  const displayPinyin = chosenDict?.pinyin ?? chip?.item.pinyin ?? "";
  const displayMeaning = chosenDict?.meaning_ja ?? chip?.item.meaning_ja ?? "";
  const displayPos = chosenDict?.pos ?? chip?.item.pos ?? "";
  const verified = Boolean(chosenDict && chosenDict.source === "verified");

  return (
    <AppShell title="スキャン">
      <div className="space-y-3">
        <div
          ref={boxRef}
          className="relative aspect-[3/4] w-full overflow-hidden rounded-3xl bg-black shadow-lg ring-1 ring-black/10"
        >
          {/* live camera */}
          {!snapshot && (
            <video
              ref={videoRef}
              playsInline
              muted
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
          {/* frozen snapshot after scan */}
          {snapshot && (
            <img src={snapshot} alt="" className="absolute inset-0 h-full w-full object-cover" />
          )}

          {/* Vision Pro–style scan overlay (see ScanEffect.tsx) */}
          {scanning && scanStage !== "idle" && (
            <ScanEffect stage={scanStage} />
          )}

          {/* dots — §3.1b 4-state discovery radar + §3.5 expandable parts */}
          {items && items.map((it) => {
            const low = it.confidence < 0.75;
            const isText = it.kind === "text";
            const expanded = subItems.some((s) => s.parentId === it.id);
            const state = dotStateFor(it.headword, scanCtx);
            const fill =
              state === "reunion"
                ? "bg-amber-400" // 金色: 前に調べたゴーストとの再会 (§3.1b)
                : state === "owned"
                  ? "bg-white/80"
                  : isText
                    ? "bg-fuchsia-500" // text = マゼンタ (§3.4)
                    : "bg-cyan-400";
            return (
              <button
                key={it.id}
                onClick={() => openChip(it)}
                style={dotStyle(it)}
                className={`absolute -translate-x-1/2 -translate-y-1/2 grid place-items-center transition-transform active:scale-90`}
                aria-label={it.headword}
              >
                <span
                  className={[
                    "block rounded-full shadow-lg ring-2",
                    state === "reunion" ? "ring-amber-200" : "ring-white/90",
                    state === "owned" ? "h-5 w-5 opacity-90" : "h-6 w-6",
                    fill,
                    low ? "opacity-80" : "",
                    expanded ? "ring-amber-300" : "",
                  ].join(" ")}
                />
                {isText && state !== "owned" && (
                  <span className="pointer-events-none absolute inset-0 grid place-items-center text-[10px] font-black text-white">A</span>
                )}
                {state === "owned" && (
                  <span className="pointer-events-none absolute inset-0 grid place-items-center">
                    <Check className="h-3.5 w-3.5 text-emerald-600" strokeWidth={3.5} />
                  </span>
                )}
                {state === "new" && (
                  <span className="pointer-events-none absolute -inset-1.5 animate-ping rounded-full bg-white/40" />
                )}
                {state === "reunion" && (
                  <span className="pointer-events-none absolute -inset-2 animate-pulse rounded-full bg-amber-300/50 blur-sm" />
                )}
                {state !== "new" && state !== "reunion" && (
                  <span className="pointer-events-none absolute -inset-2 rounded-full bg-white/25 blur-md" />
                )}
                {low && (
                  <span className="pointer-events-none absolute -bottom-1 rounded-full bg-amber-400 px-1 text-[9px] font-bold text-black">?</span>
                )}
                {/* 単語+発音をスキャン直後から表示 — タップ前に読み方が分かる */}
                <span className="pointer-events-none absolute top-full mt-1 left-1/2 max-w-[140px] -translate-x-1/2 truncate whitespace-nowrap rounded-full bg-black/65 px-2 py-0.5 text-center text-[10px] font-semibold leading-tight text-white backdrop-blur-sm">
                  {it.headword}
                  {it.zhuyin && <span className="ml-1 font-normal opacity-90">{it.zhuyin}</span>}
                </span>
              </button>
            );
          })}
          {/* sub-dots from §3.5 — smaller, dashed ring, amber accent */}
          {subItems.map((s) => (
            <button
              key={s.id}
              onClick={() => openChip(s)}
              style={dotStyle(s)}
              className="absolute -translate-x-1/2 -translate-y-1/2 grid place-items-center transition-transform active:scale-90 animate-in fade-in zoom-in duration-300"
              aria-label={s.headword}
            >
              <span className="block h-4 w-4 rounded-full bg-amber-300 ring-2 ring-white/90 shadow-md" />
              <span className="pointer-events-none absolute -inset-2 rounded-full border border-dashed border-amber-300/70" />
            </button>
          ))}
          {/* parts loader (§3.5) — subtle pulse over the parent region */}
          {expandingId && items?.find((i) => i.id === expandingId) && (
            <div
              style={dotStyle(items.find((i) => i.id === expandingId)!)}
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
            >
              <span className="block h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-amber-300/80 animate-[partsPulse_1.2s_ease-in-out_infinite]" />
            </div>
          )}

          {/* empty state after scan — always offer the typed escape hatch (§2 onboarding) */}
          {items && items.length === 0 && !scanning && (
            <div className="absolute inset-x-4 bottom-24 rounded-2xl bg-white/90 p-3 text-center text-sm shadow-lg">
              <p>何も検出できませんでした。文字や物にもう少し近づいてみて。</p>
              <button
                onClick={() => setInputCatchOpen("text")}
                className="mt-2 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground active:scale-95"
              >
                文字入力で調べる
              </button>
            </div>
          )}

          {/* legend */}
          {ready && !snapshot && !scanning && (
            <div className="absolute left-3 top-3 flex gap-2 rounded-full bg-black/50 px-3 py-1 text-[11px] text-white backdrop-blur">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-cyan-400" />モノ</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-fuchsia-500" />文字</span>
            </div>
          )}

          {/* compact metrics badge (always visible after a scan) */}
          {(detectMs !== null || tapToAudioMs !== null) && (
            <div className="absolute right-3 top-3 rounded-full bg-black/50 px-2 py-1 text-[10px] text-white backdrop-blur">
              {detectMs !== null && <span>検出 {detectMs}ms</span>}
              {tapToAudioMs !== null && <span className="ml-2">音声 {tapToAudioMs}ms</span>}
            </div>
          )}
        </div>


        {/* controls */}
        <div className="flex items-center justify-center gap-3">
          {!snapshot ? (
            <>
              <button
                onClick={() => setInputCatchOpen("text")}
                aria-label="文字入力でキャッチ"
                className="grid h-11 w-11 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition active:scale-95"
              >
                <Keyboard className="h-5 w-5" />
              </button>
              <button
                onClick={doScan}
                disabled={!ready || scanning}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition active:scale-95 disabled:opacity-50"
              >
                {scanning ? <Loader2 className="h-5 w-5 animate-spin" /> : <ScanLine className="h-5 w-5" />}
                スキャン
              </button>
              <button
                onClick={() => setInputCatchOpen("voice")}
                aria-label="聞こえたフレーズを復唱してキャッチ"
                className="grid h-11 w-11 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition active:scale-95"
              >
                <Mic className="h-5 w-5" />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={reset}
                className="inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground shadow"
              >
                <RotateCcw className="h-4 w-4" /> もう一度
              </button>
              <button
                onClick={doScan}
                disabled={scanning}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow"
              >
                <Camera className="h-4 w-4" /> 再スキャン
              </button>
            </>
          )}
        </div>

        {error && (
          <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
        )}

        {/* chip / mini card */}
        {chip && (
          <ScanChip
            headword={displayHeadword}
            zhuyin={displayZhuyin}
            pinyin={displayPinyin}
            meaning={displayMeaning}
            pos={displayPos}
            verified={verified}
            state={dotStateFor(displayHeadword, scanCtx)}
            foundAt={scanCtx?.owned[normHead(displayHeadword)]?.found_at ?? null}
            item={chip.item}
            candidates={chip.showingCandidates ? [chip.item.headword, ...chip.item.alternatives] : []}
            expanding={expandingId === chip.item.id}
            canExpand={chip.item.kind === "object" && !("sub" in chip.item)}
            onPickCandidate={(h) => pickCandidate(h, chip.item)}
            onPlay={() => playAudio(displayHeadword, chip.item)}
            onExpand={() => expandParts(chip.item)}
            onDetail={() => {
              if (!chip.chosenHeadword) return;
              // Prefetch is already running (started at tap). Reuse the same promise.
              startPrefetch(chip.chosenHeadword);
              setDetailOpen({ headword: chip.chosenHeadword, item: chip.item });
            }}
            onCatch={() => {
              if (!chip.chosenHeadword || !snapshot) return;
              startPrefetch(chip.chosenHeadword);
              setCatchOpen({ headword: chip.chosenHeadword, item: chip.item });
            }}
            onClose={() => setChip(null)}
          />
        )}

        {/* Dev metrics panel (?dev=1 or localStorage.catchwords_dev=1) */}
        {devOn && (
          <DevMetrics
            values={{
              detect_ms: detectMs,
              parts_ms: partsMs,
              lookup_ms: lookupMs,
              tap_to_audio_ms: tapToAudioMs,
              prefetch_ms: chip ? (prefetchTimingRef.current.get(chip.chosenHeadword) ?? null) : null,
              catch_ms: null,
            }}
            targets={SCAN_TARGETS}
          />
        )}
      </div>


      {detailOpen && (
        <ScanDetailSheet
          headword={detailOpen.headword}
          item={detailOpen.item}
          dict={entries[detailOpen.headword]}
          cardPromise={startPrefetch(detailOpen.headword)}
          onClose={() => setDetailOpen(null)}
        />
      )}

      {catchOpen && snapshot && (
        <ScanCatchSheet
          snapshotDataUrl={snapshot}
          item={catchOpen.item}
          headword={catchOpen.headword}
          dict={entries[catchOpen.headword]}
          cardPromise={startPrefetch(catchOpen.headword)}
          loc={scanLoc}
          upgrade={(() => {
            // §5.3: catching a gold (ghost) dot upgrades the existing sticker.
            const entry = scanCtx?.owned[normHead(catchOpen.headword)];
            return entry && !entry.has_photo ? { sticker_id: entry.sticker_id } : null;
          })()}
          onClose={() => setCatchOpen(null)}
        />
      )}

      {inputCatchOpen && (
        <InputCatchSheet initialMode={inputCatchOpen} onClose={() => setInputCatchOpen(null)} />
      )}

      <style>{`
        @keyframes scanline { 0% { transform: translateY(0); opacity: 0.2; } 50% { transform: translateY(400px); opacity: 1; } 100% { transform: translateY(0); opacity: 0.2; } }
        @keyframes scanlineV { 0% { transform: translateX(0); opacity: 0.2; } 50% { transform: translateX(300px); opacity: 1; } 100% { transform: translateX(0); opacity: 0.2; } }
        @keyframes probeBlink {
          0%, 100% { opacity: 0; transform: translate(-50%, -50%) scale(0.6); }
          40%      { opacity: 1; transform: translate(-50%, -50%) scale(1.1); }
          70%      { opacity: 0.6; transform: translate(-50%, -50%) scale(0.9); }
        }
        @keyframes partsPulse {
          0%, 100% { transform: translate(-50%, -50%) scale(0.8); opacity: 0.6; }
          50%      { transform: translate(-50%, -50%) scale(1.15); opacity: 1; }
        }
      `}</style>
    </AppShell>
  );
}


function ScanChip({
  headword, zhuyin, pinyin, meaning, pos, verified, state, foundAt, candidates, expanding, canExpand,
  onPickCandidate, onPlay, onExpand, onDetail, onCatch, onClose,
}: {
  headword: string;
  zhuyin: string;
  pinyin: string;
  meaning: string;
  pos: string;
  verified: boolean;
  state: DotState;
  foundAt: string | null;
  item: DetectedItem;
  candidates: string[];
  expanding: boolean;
  canExpand: boolean;
  onPickCandidate: (h: string) => void;
  onPlay: () => void;
  onExpand: () => void;
  onDetail: () => void;
  onCatch: () => void;
  onClose: () => void;
}) {
  if (candidates.length > 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 shadow-md">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">どちらですか?</p>
          <button onClick={onClose} className="text-muted-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex flex-wrap gap-2">
          {candidates.map((c) => (
            <button
              key={c}
              onClick={() => onPickCandidate(c)}
              className="rounded-full bg-amber-100 px-3 py-1.5 text-base font-semibold text-amber-900 ring-1 ring-amber-200 active:scale-95"
            >
              {c}?
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className={`rounded-2xl border p-4 shadow-md ${
      state === "reunion"
        ? "border-amber-300 bg-gradient-to-br from-amber-50 to-yellow-50"
        : "border-border bg-gradient-to-br from-card to-sky-50/50"
    }`}>
      {state === "reunion" && foundAt && (
        <p className="mb-2 rounded-xl bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-900">
          ✨ {daysAgo(foundAt)}日前に調べた「{headword}」だ! 撮って図鑑を完成させよう
        </p>
      )}
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <h2 className="text-2xl font-bold tracking-tight">{headword}</h2>
            {state === "owned" && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                <Check className="h-3 w-3 text-emerald-600" /> 取得済み
              </span>
            )}
            {verified ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-900 ring-1 ring-emerald-200">
                ✓ 検証済み
              </span>
            ) : (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900 ring-1 ring-amber-200">
                AI生成・未検証
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {zhuyin} {pinyin && <span className="ml-2">{pinyin}</span>}
          </div>
          <p className="mt-2 text-base font-medium">{meaning}</p>
          {pos && (
            <span className="mt-1 inline-block rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-900 ring-1 ring-violet-200">
              {pos}
            </span>
          )}
        </div>
        <button
          onClick={onPlay}
          aria-label="発音を再生"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 active:scale-95"
        >
          <Volume2 className="h-5 w-5" />
        </button>
        <button onClick={onClose} aria-label="閉じる" className="p-1 text-muted-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {canExpand && (
          <button
            onClick={onExpand}
            disabled={expanding}
            className="inline-flex items-center justify-center gap-1.5 rounded-full bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-900 ring-1 ring-amber-200 active:scale-95 disabled:opacity-60"
            title="この物体を構成する部品を追加検出"
          >
            {expanding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            {expanding ? "解析中…" : "細かく"}
          </button>
        )}
        <button
          onClick={onDetail}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground active:scale-95"
        >
          <Sparkles className="h-4 w-4" /> 詳しく
        </button>
        <button
          onClick={onCatch}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 active:scale-95"
        >
          <BookOpen className="h-4 w-4" /> キャッチ
        </button>
      </div>
    </div>
  );
}


// ---- helper micro-components for loader / dev overlay ----

const PROBE_DOTS: { x: number; y: number; delay: number }[] = [
  { x: 22, y: 18, delay: 0 },   { x: 78, y: 24, delay: 250 },
  { x: 62, y: 46, delay: 500 }, { x: 30, y: 60, delay: 750 },
  { x: 82, y: 66, delay: 1000 },{ x: 46, y: 80, delay: 1250 },
  { x: 18, y: 40, delay: 350 }, { x: 70, y: 82, delay: 600 },
];

function ReticleCorners() {
  const base = "pointer-events-none absolute h-4 w-4 border-white/70";
  return (
    <>
      <span className={`${base} left-4 top-4 border-l-2 border-t-2 rounded-tl`} />
      <span className={`${base} right-4 top-4 border-r-2 border-t-2 rounded-tr`} />
      <span className={`${base} left-4 bottom-4 border-l-2 border-b-2 rounded-bl`} />
      <span className={`${base} right-4 bottom-4 border-r-2 border-b-2 rounded-br`} />
    </>
  );
}

function StageDot({ active, done }: { active: boolean; done: boolean }) {
  return (
    <span
      className={[
        "h-1.5 rounded-full transition-all duration-300",
        active ? "w-6 bg-cyan-300" : done ? "w-1.5 bg-cyan-500" : "w-1.5 bg-white/30",
      ].join(" ")}
    />
  );
}

// §9 targets (MVP pass line). Values in ms.
const SCAN_TARGETS = {
  detect_ms: 2500,
  parts_ms: 2500,
  lookup_ms: 400,
  tap_to_audio_ms: 1000,
  prefetch_ms: 3000,
  catch_ms: 8000,
} as const;

function DevMetrics({ values, targets }: { values: Metrics; targets: Record<keyof Metrics, number> }) {
  const [open, setOpen] = useState(true);
  const rows: { key: keyof Metrics; label: string }[] = [
    { key: "detect_ms",       label: "検出 (§9 ≤2500ms)" },
    { key: "parts_ms",        label: "+細かく (§3.5)" },
    { key: "lookup_ms",       label: "辞書照合" },
    { key: "tap_to_audio_ms", label: "タップ→音声 (§9 ≤1000ms)" },
    { key: "prefetch_ms",     label: "詳細プリフェッチ (§9 ≤500ms表示)" },
    { key: "catch_ms",        label: "キャッチ完了" },
  ];
  return (
    <div className="rounded-xl border border-dashed border-amber-400 bg-amber-50/70 p-3 text-xs">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-2 text-amber-900 font-semibold">
        <span className="flex items-center gap-1.5"><Bug className="h-3.5 w-3.5" /> 開発者計測 (§9)</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && (
        <ul className="mt-2 space-y-1">
          {rows.map((r) => {
            const v = values[r.key];
            const t = targets[r.key];
            const ok = v !== null && v <= t;
            const bad = v !== null && v > t;
            return (
              <li key={r.key} className="flex items-center justify-between gap-2">
                <span className="text-amber-950/80">{r.label}</span>
                <span className={`tabular-nums font-mono ${ok ? "text-emerald-700" : bad ? "text-red-700" : "text-muted-foreground"}`}>
                  {v === null ? "—" : `${v}ms`}
                  <span className="ml-1 text-[10px] opacity-60">/ {t}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-2 text-[10px] text-amber-900/70">
        表示切替: <code>?dev=1</code> か <code>localStorage.catchwords_dev=1</code>
      </p>
    </div>
  );
}



function useBoxSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, [ref]);
  return size;
}
