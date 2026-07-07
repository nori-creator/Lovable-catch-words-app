import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Loader2, ScanLine, Volume2, X, RotateCcw, BookOpen, Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { detectScan, lookupHeadwords, markScanTap, type DetectedItem, type DictionaryEntry } from "@/lib/scan.functions";
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


type ChipState = {
  item: DetectedItem;
  chosenHeadword: string; // may switch after picking a candidate
  showingCandidates: boolean;
};

function ScanPage() {
  const detectFn = useServerFn(detectScan);
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
  const startPrefetch = useCallback((headword: string): Promise<GeneratedCard> => {
    const cache = prefetchRef.current;
    const hit = cache.get(headword);
    if (hit) return hit;
    const p = cardFn({ data: { headword, targetLanguage: "zh-TW" } });
    cache.set(headword, p);
    // Drop failed prefetches so the next tap can retry.
    p.catch(() => { cache.delete(headword); });
    return p;
  }, [cardFn]);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [items, setItems] = useState<DetectedItem[] | null>(null);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [entries, setEntries] = useState<Record<string, DictionaryEntry>>({});
  const [chip, setChip] = useState<ChipState | null>(null);
  const [detectMs, setDetectMs] = useState<number | null>(null);
  const [tapToAudioMs, setTapToAudioMs] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState<{ headword: string; item: DetectedItem } | null>(null);
  const [catchOpen, setCatchOpen] = useState<{ headword: string; item: DetectedItem } | null>(null);
  const [scanLoc, setScanLoc] = useState<{ lat: number | null; lng: number | null; name: string | null }>({ lat: null, lng: null, name: null });


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
    setEntries({});
    setDetectMs(null);
    setTapToAudioMs(null);
    const frame = grabFrame();
    if (!frame) { setError("フレームを取得できませんでした"); return; }
    setSnapshot(frame);
    setScanning(true);
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

      const [{ items }, look] = await Promise.all([
        detectFn({ data: { imageBase64: frame, lat, lng } }),
        // lookup runs after detect returns; kick off placeholder so structure stays parallel-ready
        Promise.resolve(null),
      ]);
      const dt = Math.round(performance.now() - t0);
      setDetectMs(dt);
      setItems(items);
      void look;

      if (items.length > 0) {
        const { entries } = await lookupFn({ data: { headwords: items.map((i) => i.headword) } });
        setEntries(entries);
      }
    } catch (e) {
      setError((e as Error).message || "検出に失敗しました");
    } finally {
      setScanning(false);
    }
  }, [scanning, grabFrame, detectFn, lookupFn]);

  // ---- tap a dot ----
  const openChip = useCallback((item: DetectedItem) => {
    const lowConf = item.confidence < 0.75 && item.alternatives.length > 0;
    setChip({ item, chosenHeadword: item.headword, showingCandidates: lowConf });
    if (!lowConf) {
      void playAudio(item.headword, item);
      void tapFn({ data: { headword: item.headword } }).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tapFn]);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, lookupFn, tapFn]);

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
    setItems(null); setSnapshot(null); setChip(null); setEntries({});
    setDetectMs(null); setTapToAudioMs(null);
  }, []);

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

          {/* scanning overlay */}
          {scanning && (
            <div className="absolute inset-0 grid place-items-center bg-black/40 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-2 text-white">
                <ScanLine className="h-10 w-10 animate-pulse" />
                <p className="text-sm font-medium">読み取り中…</p>
              </div>
              <div className="absolute inset-x-0 top-0 h-1 animate-[scanline_1.6s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-cyan-300 to-transparent" />
            </div>
          )}

          {/* dots */}
          {items && items.map((it) => {
            const low = it.confidence < 0.75;
            const isText = it.kind === "text";
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

          {/* metrics badge */}
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
            onPickCandidate={(h) => pickCandidate(h, chip.item)}
            onPlay={() => playAudio(displayHeadword, chip.item)}
            onClose={() => setChip(null)}
          />
        )}
      </div>

      <style>{`
        @keyframes scanline { 0% { transform: translateY(0); } 50% { transform: translateY(400px); } 100% { transform: translateY(0); } }
      `}</style>
    </AppShell>
  );
}

function ScanChip({
  headword, zhuyin, pinyin, meaning, pos, verified, candidates, onPickCandidate, onPlay, onClose,
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
  onClose: () => void;
}) {
  if (candidates.length > 0) {
    return (
      <div className="rounded-2xl border border-border bg-white p-4 shadow-md">
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
    <div className="rounded-2xl border border-border bg-gradient-to-br from-white to-sky-50 p-4 shadow-md">
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
