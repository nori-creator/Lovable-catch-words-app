import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Loader2, ScanLine, Volume2, X, RotateCcw, BookOpen, Sparkles, Plus, Bug, ChevronDown } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { detectScan, detectParts, lookupHeadwords, markScanTap, type DetectedItem, type DictionaryEntry } from "@/lib/scan.functions";
import { synthesizeSpeech } from "@/lib/tts.functions";
import { generateCard, type GeneratedCard } from "@/lib/ai.functions";
import { ScanDetailSheet } from "@/components/ScanDetailSheet";
import { ScanCatchSheet } from "@/components/ScanCatchSheet";

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
  }, [scanning, grabFrame, detectFn, lookupFn]);


  // ---- tap a dot ----
  const openChip = useCallback((item: DetectedItem) => {
    const lowConf = item.confidence < 0.75 && item.alternatives.length > 0;
    setChip({ item, chosenHeadword: item.headword, showingCandidates: lowConf });
    if (!lowConf) {
      void playAudio(item.headword, item);
      void tapFn({ data: { headword: item.headword } }).catch(() => {});
      // §3.3 プリフェッチ: バックグラウンドで詳細カード生成を開始。
      startPrefetch(item.headword);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tapFn, startPrefetch]);

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
    void tapFn({ data: { headword } }).catch(() => {});
    // 候補確定後にプリフェッチ開始(誤選択で無駄打ちしないため候補選択より後)。
    startPrefetch(headword);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, lookupFn, tapFn, startPrefetch]);


  const playAudio = useCallback(async (headword: string, item: DetectedItem) => {
    const t0 = performance.now();
    try {
      const dict = entries[headword];
      let url: string;
      if (dict?.audio_path) {
        // audio_path is a storage key — request signed URL via TTS is overkill;
        // fall through to TTS which will find the cached mp3 by deterministic path.
        const r = await ttsFn({ data: { text: headword } });
        url = r.audio_url;
      } else {
        const r = await ttsFn({ data: { text: headword } });
        url = r.audio_url;
      }
      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.src = url;
      await audioRef.current.play();
      setTapToAudioMs(Math.round(performance.now() - t0));
    } catch {
      // fall back to browser TTS
      if ("speechSynthesis" in window) {
        const u = new SpeechSynthesisUtterance(headword);
        u.lang = "zh-TW";
        speechSynthesis.cancel();
        speechSynthesis.speak(u);
        setTapToAudioMs(Math.round(performance.now() - t0));
      }
    }
    void item;
  }, [entries, ttsFn]);

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

          {/* scanning overlay — multi-stage: 感知→読取→照合 */}
          {scanning && (
            <div className="absolute inset-0 grid place-items-center bg-black/50 backdrop-blur-[6px]">
              {/* candidate probe dots — random positions, appearing/dying to
                  suggest "the AI is looking around". Purely decorative. */}
              <div className="pointer-events-none absolute inset-0">
                {PROBE_DOTS.map((p, i) => (
                  <span
                    key={i}
                    style={{ left: `${p.x}%`, top: `${p.y}%`, animationDelay: `${p.delay}ms` }}
                    className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-300 opacity-0 shadow-[0_0_12px_rgba(103,232,249,0.9)] animate-[probeBlink_1800ms_ease-in-out_infinite]"
                  />
                ))}
              </div>
              {/* dual sweep lines */}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-300 to-transparent animate-[scanline_1.6s_ease-in-out_infinite]" />
              <div className="pointer-events-none absolute inset-y-0 left-0 w-[2px] bg-gradient-to-b from-transparent via-fuchsia-300 to-transparent animate-[scanlineV_2.1s_ease-in-out_infinite]" />
              {/* corner reticles */}
              <div className="pointer-events-none absolute inset-4 rounded-2xl border border-white/20" />
              <ReticleCorners />
              <div className="relative flex flex-col items-center gap-3 text-white">
                <div className="relative grid h-16 w-16 place-items-center">
                  <span className="absolute inset-0 rounded-full bg-cyan-400/30 animate-ping" />
                  <span className="absolute inset-2 rounded-full bg-cyan-400/40 animate-[ping_1.5s_ease-in-out_infinite]" />
                  <ScanLine className="relative h-8 w-8" />
                </div>
                <p className="text-sm font-medium tabular-nums">
                  {scanStage === "sensing" && "シーンを感知中…"}
                  {scanStage === "reading" && "文字と物体を読み取り中…"}
                  {scanStage === "matching" && "辞書と照合中…"}
                </p>
                <div className="flex gap-1.5">
                  <StageDot active={scanStage === "sensing"} done={scanStage !== "sensing"} />
                  <StageDot active={scanStage === "reading"} done={scanStage === "matching"} />
                  <StageDot active={scanStage === "matching"} done={false} />
                </div>
              </div>
            </div>
          )}

          {/* main dots + sub-dots (§3.5) */}
          {items && items.map((it) => {
            const low = it.confidence < 0.75;
            const isText = it.kind === "text";
            const expanded = subItems.some((s) => s.parentId === it.id);
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
                    "block rounded-full shadow-lg ring-2 ring-white/90",
                    isText
                      ? "h-6 w-6 bg-fuchsia-500" // text = マゼンタ (§3.4)
                      : "h-6 w-6 bg-cyan-400",
                    low ? "opacity-80" : "",
                    expanded ? "ring-amber-300" : "",
                  ].join(" ")}
                />
                {isText && (
                  <span className="pointer-events-none absolute inset-0 grid place-items-center text-[10px] font-black text-white">A</span>
                )}
                <span className="pointer-events-none absolute -inset-2 rounded-full bg-white/25 blur-md" />
                {low && (
                  <span className="pointer-events-none absolute -bottom-1 rounded-full bg-amber-400 px-1 text-[9px] font-bold text-black">?</span>
                )}
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

          {/* empty state after scan */}
          {items && items.length === 0 && !scanning && (
            <div className="absolute inset-x-4 bottom-24 rounded-2xl bg-white/90 p-3 text-center text-sm shadow-lg">
              何も検出できませんでした。文字入力で調べてみましょう。
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
            <button
              onClick={doScan}
              disabled={!ready || scanning}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition active:scale-95 disabled:opacity-50"
            >
              {scanning ? <Loader2 className="h-5 w-5 animate-spin" /> : <ScanLine className="h-5 w-5" />}
              スキャン
            </button>
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
          onClose={() => setCatchOpen(null)}
        />
      )}

      <style>{`
        @keyframes scanline { 0% { transform: translateY(0); } 50% { transform: translateY(400px); } 100% { transform: translateY(0); } }
      `}</style>
    </AppShell>
  );
}


function ScanChip({
  headword, zhuyin, pinyin, meaning, pos, verified, candidates, onPickCandidate, onPlay, onDetail, onCatch, onClose,
}: {
  headword: string;
  zhuyin: string;
  pinyin: string;
  meaning: string;
  pos: string;
  verified: boolean;
  item: DetectedItem;
  candidates: string[];
  onPickCandidate: (h: string) => void;
  onPlay: () => void;
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
    <div className="rounded-2xl border border-border bg-gradient-to-br from-card to-sky-50/50 p-4 shadow-md">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <h2 className="text-2xl font-bold tracking-tight">{headword}</h2>
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
      <div className="mt-3 flex gap-2">
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
