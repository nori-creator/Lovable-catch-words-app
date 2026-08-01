import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Check,
  Keyboard,
  Loader2,
  Mic,
  ScanLine,
  Volume2,
  X,
  RotateCcw,
  BookOpen,
  Sparkles,
  Plus,
  Bug,
  ChevronDown,
  ChevronRight,
  Search,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import {
  detectScan,
  detectParts,
  getScanContext,
  lookupHeadwords,
  markScanTap,
  type DetectedItem,
  type DictionaryEntry,
  type ScanContext,
} from "@/lib/scan.functions";
import { synthesizeSpeech } from "@/lib/tts.functions";
import { generateCard, type GeneratedCard } from "@/lib/ai.functions";
import { claimAudio, primeAudio, stopOtherAudio } from "@/lib/audio";
import { logAppEvent } from "@/lib/metrics.functions";
import { geocodeLocation } from "@/lib/geocode.functions";
import { ScanCatchSheet } from "@/components/ScanCatchSheet";
import { InputCatchSheet } from "@/components/InputCatchSheet";
import { ScanEffect } from "@/components/ScanEffect";
import { Sound, unlockAudio } from "@/lib/sound-engine";
import { haptic } from "@/lib/haptics";
import { useT } from "@/lib/i18n";
import { Zh } from "@/components/Zh";
import { tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/scan")({
  component: ScanPage,
  head: () => ({
    meta: [
      { title: tStatic("page.scan") },
      { name: "description", content: "カメラをかざして台湾華語の単語をその場で調べる。" },
    ],
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

// B6: スキャンのドットラベルを品詞で色分け(名詞=白/動詞=ローズ/形容詞=アンバー)。
// ドット本体の状態色(新規/金/取得済)は変えず、ラベルの小さな色ドットだけで示す。
function posDotColor(pos: string | null | undefined): string {
  const p = (pos ?? "").trim();
  if (/動詞/.test(p)) return "bg-rose-400";
  if (/形容/.test(p)) return "bg-amber-400";
  if (/名詞|代名詞|量詞|数詞/.test(p)) return "bg-white";
  return "bg-white/50";
}

// A sub-item is a §3.5 part detection whose normalized coords have already
// been remapped into the parent frame (0..1000). We keep the parent id and
// tag it so the renderer can draw it as a smaller "child" dot.
type SubItem = DetectedItem & { parentId: string; sub: true };

function ScanPage() {
  // 翻訳関数は他のフックより先に用意する。依存配列に入れるため、
  // 使う場所より後で宣言すると初期化前参照になる。
  const t = useT();
  const detectFn = useServerFn(detectScan);
  const partsFn = useServerFn(detectParts);
  const lookupFn = useServerFn(lookupHeadwords);
  const tapFn = useServerFn(markScanTap);
  const ttsFn = useServerFn(synthesizeSpeech);
  const cardFn = useServerFn(generateCard);
  const scanCtxFn = useServerFn(getScanContext);
  const logEvent = useServerFn(logAppEvent);
  const geocodeFn = useServerFn(geocodeLocation);

  // §3.1b: the user's collection, cached lightly for dot-state matching.
  const { data: rawScanCtx } = useQuery({
    queryKey: ["scan-context"],
    queryFn: () => scanCtxFn(),
    staleTime: 5 * 60 * 1000,
  });
  const scanCtx = useMemo<ScanCtx | undefined>(
    () =>
      rawScanCtx ? { owned: rawScanCtx.owned, tappedSet: new Set(rawScanCtx.tapped) } : undefined,
    [rawScanCtx],
  );

  const videoRef = useRef<HTMLVideoElement | null>(null);
  // ズーム(1 = 等倍)。端末が対応していれば光学/デジタルズーム、
  // 非対応なら CSS の scale で代用する。
  const [zoom, setZoom] = useState(1);
  const [zoomMax, setZoomMax] = useState(1);
  const zoomCapsRef = useRef<{ min: number; max: number } | null>(null);
  const pinchRef = useRef<{ startDist: number; startZoom: number } | null>(null);
  // 音声入力はこの画面のまま行う(別シートに飛ばさない)。
  // 認識結果は検索欄に入り、そのまま「調べる」で確定できる。
  const [voiceListening, setVoiceListening] = useState(false);
  const voiceRecogRef = useRef<{ stop: () => void } | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // §3.3 プリフェッチ: タップされた語だけ generateCard をバックグラウンド起動し、
  // セッション内(スキャン画面が開いている間)は再利用する。タップされていない
  // 物体の詳細生成は行わない(コスト10倍防止)。
  const prefetchRef = useRef<Map<string, Promise<GeneratedCard>>>(new Map());
  const prefetchTimingRef = useRef<Map<string, number>>(new Map());
  const startPrefetch = useCallback(
    (headword: string): Promise<GeneratedCard> => {
      const cache = prefetchRef.current;
      const hit = cache.get(headword);
      if (hit) return hit;
      const t0 = performance.now();
      const p = cardFn({ data: { headword, targetLanguage: "zh-TW" } });
      cache.set(headword, p);
      p.then(() => {
        prefetchTimingRef.current.set(headword, Math.round(performance.now() - t0));
      }).catch(() => {
        cache.delete(headword);
      });
      return p;
    },
    [cardFn],
  );

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
  const [catchOpen, setCatchOpen] = useState<{ headword: string; item: DetectedItem } | null>(null);
  const [inputCatchOpen, setInputCatchOpen] = useState<"text" | "voice" | null>(null);
  const [inputCatchText, setInputCatchText] = useState("");
  const [manualQuery, setManualQuery] = useState("");
  const [scanLoc, setScanLoc] = useState<{
    lat: number | null;
    lng: number | null;
    name: string | null;
  }>({ lat: null, lng: null, name: null });

  // Dev metrics overlay — gated so it doesn't pollute normal use.
  const [devOn, setDevOn] = useState(false);
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("dev");
      const ls = window.localStorage.getItem("catchwords_dev");
      if (q === "1" || ls === "1") setDevOn(true);
    } catch {
      /* ignore */
    }
  }, []);

  // B1(NORI指定): 切り抜きは一旦停止中のため、背景除去モデルの事前読み込みは
  // 行わない(無駄なダウンロードを避け、写真で最速キャッチに集中)。

  // GPSウォームアップ(A4): 以前は撮影時に timeout 800ms の getCurrentPosition
  // 一発勝負で、初回フィックスが間に合わず場所がほぼ保存されなかった。
  // 画面を開いた時点から watchPosition で追従し、撮影時は最新値を即使う。
  const warmPosRef = useRef<{ lat: number; lng: number; at: number } | null>(null);
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        warmPosRef.current = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          at: Date.now(),
        };
      },
      () => {},
      { enableHighAccuracy: false, maximumAge: 60_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // ---- camera lifecycle ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 1280 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        // ズームの可否を調べる。対応端末は track のズーム(画質が落ちない)、
        // 非対応端末は CSS の拡大でフォールバックする。
        const track = stream.getVideoTracks()[0];
        const caps = (track?.getCapabilities?.() ?? {}) as {
          zoom?: { min: number; max: number; step?: number };
        };
        if (caps.zoom) {
          zoomCapsRef.current = {
            min: caps.zoom.min,
            max: Math.min(caps.zoom.max, caps.zoom.min * 6),
          };
          setZoomMax(zoomCapsRef.current.max);
        } else {
          zoomCapsRef.current = null;
          setZoomMax(4); // CSS拡大の上限
        }
        setReady(true);
      } catch (e) {
        // getUserMedia は端末依存の生の英語メッセージ("Requested device not found" 等)を
        // 投げる。ユーザーには表示言語で、次の一手(手動検索)まで案内する。
        const name = (e as { name?: string })?.name ?? "";
        const key =
          name === "NotAllowedError" || name === "SecurityError"
            ? "scan.cameraDenied"
            : name === "NotFoundError" ||
                name === "OverconstrainedError" ||
                name === "DevicesNotFoundError"
              ? "scan.cameraNotFound"
              : name === "NotReadableError" || name === "TrackStartError"
                ? "scan.cameraBusy"
                : "scan.cameraFailed";
        setError(t(key));
      }
    })();
    return () => {
      cancelled = true;
      // 引数名を t にすると翻訳関数 t を隠すので track にする。
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
    // カメラ起動は初回のみ。t を依存に入れると表示言語を変えた瞬間に
    // カメラが再起動してしまう(エラー文の言語のためにそこまでする必要はない)。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** ズーム値をカメラ(または表示)に反映する。 */
  const applyZoom = useCallback((next: number) => {
    const caps = zoomCapsRef.current;
    const max = caps ? caps.max : 4;
    const min = caps ? caps.min : 1;
    const z = Math.max(min, Math.min(max, next));
    setZoom(z);
    if (caps) {
      const track = streamRef.current?.getVideoTracks()[0];
      // applyConstraints は非同期。失敗しても CSS 側で見た目は追従する。
      void track?.applyConstraints?.({ advanced: [{ zoom: z }] } as never).catch(() => {});
    }
  }, []);

  // ピンチでズーム(2本指)。1本指のタップはドットの操作なので触らない。
  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length !== 2) return;
      const [a, b] = [e.touches[0], e.touches[1]];
      pinchRef.current = {
        startDist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        startZoom: zoom,
      };
    },
    [zoom],
  );
  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const p = pinchRef.current;
      if (!p || e.touches.length !== 2) return;
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      applyZoom(p.startZoom * (dist / Math.max(1, p.startDist)));
    },
    [applyZoom],
  );
  const onTouchEnd = useCallback(() => {
    pinchRef.current = null;
  }, []);

  /** その場の音声入力: 認識結果を検索欄へ流し込む(画面遷移なし)。 */
  const toggleVoice = useCallback(() => {
    if (voiceListening) {
      voiceRecogRef.current?.stop();
      setVoiceListening(false);
      return;
    }
    const w = window as unknown as {
      SpeechRecognition?: new () => unknown;
      webkitSpeechRecognition?: new () => unknown;
    };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) {
      setError(t("scan.noVoice"));
      return;
    }
    const rec = new SR() as {
      lang: string;
      interimResults: boolean;
      continuous: boolean;
      maxAlternatives: number;
      onresult: (e: {
        results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
      }) => void;
      onend: () => void;
      onerror: () => void;
      start: () => void;
      stop: () => void;
    };
    rec.lang = "cmn-Hant-TW";
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      setManualQuery(text.trim());
    };
    rec.onend = () => setVoiceListening(false);
    rec.onerror = () => setVoiceListening(false);
    voiceRecogRef.current = rec;
    setVoiceListening(true);
    rec.start();
  }, [voiceListening, t]);

  // ---- capture + downscale to longest side 1024 ----
  const grabFrame = useCallback((): string | null => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return null;
    const longest = Math.max(v.videoWidth, v.videoHeight);
    const scale = Math.min(1, 1024 / longest);
    const w = Math.round(v.videoWidth * scale);
    const h = Math.round(v.videoHeight * scale);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
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
    if (!frame) {
      setError(t("scan.noFrame"));
      return;
    }
    setSnapshot(frame);
    setScanning(true);
    // KPI: first scan ever (localStorage-deduped).
    try {
      if (!localStorage.getItem("kpi-first-scan")) {
        localStorage.setItem("kpi-first-scan", "1");
        void logEvent({ data: { kind: "first_scan" } }).catch(() => {});
      }
    } catch {
      /* ignore */
    }
    setScanStage("sensing");
    // Cycle status text so the wait feels intentional. Cleared in finally.
    const stageTimer1 = window.setTimeout(() => setScanStage("reading"), 700);
    const stageTimer2 = window.setTimeout(() => setScanStage("matching"), 1500);
    const t0 = performance.now();
    try {
      // location best-effort (§3.7): warm watchPosition first, then one
      // patient getCurrentPosition — never block the scan for more than 5s.
      let lat: number | null = null,
        lng: number | null = null;
      const warm = warmPosRef.current;
      if (warm && Date.now() - warm.at < 2 * 60_000) {
        lat = warm.lat;
        lng = warm.lng;
      } else {
        try {
          const pos = await new Promise<GeolocationPosition>((res, rej) => {
            navigator.geolocation.getCurrentPosition(res, rej, {
              timeout: 5000,
              maximumAge: 120_000,
            });
          });
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        } catch {
          /* ignore */
        }
      }
      setScanLoc({ lat, lng, name: null });
      if (lat != null && lng != null) {
        // 地名(「士林」級)は非同期で追いつかせる — スキャンは待たない。
        const glat = lat,
          glng = lng;
        void geocodeFn({ data: { lat: glat, lng: glng } })
          .then(({ location_name }) => {
            if (location_name) {
              setScanLoc((cur) =>
                cur.lat === glat && cur.lng === glng ? { ...cur, name: location_name } : cur,
              );
            }
          })
          .catch(() => {});
      }

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
      setError((e as Error).message || t("scan.detectFailed"));
      haptic("warning");
    } finally {
      window.clearTimeout(stageTimer1);
      window.clearTimeout(stageTimer2);
      setScanning(false);
      setScanStage("idle");
      // Peak-End: reward the wait with a shimmer if anything landed.
      setTimeout(() => {
        if ((items?.length ?? 0) > 0 || (Array.isArray(items) && items.length === 0)) {
          // no-op guard; success sound fires from the items effect below
        }
      }, 0);
    }
  }, [scanning, grabFrame, detectFn, lookupFn, logEvent, items, t, geocodeFn]);

  // Success chime when items arrive.
  useEffect(() => {
    if (items && items.length > 0) {
      Sound.scanSuccess();
      haptic("success");
    } else if (items && items.length === 0) {
      Sound.reviewWrong();
      haptic("warning");
    }
  }, [items]);

  // ---- tap a dot ----
  const openChip = useCallback(
    (item: DetectedItem) => {
      const lowConf = item.confidence < 0.75 && item.alternatives.length > 0;
      setChip({ item, chosenHeadword: item.headword, showingCandidates: lowConf });
      if (!lowConf) {
        void playAudio(item.headword, item);
        // §3.3 プリフェッチ: バックグラウンドで詳細カード生成を開始。
        startPrefetch(item.headword);
      }
    },
    // playAudio はこの下で定義しているため、依存に書くと参照が初期化前になる。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [startPrefetch],
  );

  const pickCandidate = useCallback(
    async (headword: string, item: DetectedItem) => {
      setChip({ item, chosenHeadword: headword, showingCandidates: false });
      // fetch dict entry for the newly-chosen headword if not cached
      if (!entries[headword]) {
        try {
          const { entries: e } = await lookupFn({ data: { headwords: [headword] } });
          setEntries((prev) => ({ ...prev, ...e }));
        } catch {
          /* noop */
        }
      }
      void playAudio(headword, item);
      // 候補確定後にプリフェッチ開始(誤選択で無駄打ちしないため候補選択より後)。
      startPrefetch(headword);
    },
    // 同上: playAudio は後方で定義。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, lookupFn, startPrefetch],
  );

  const playAudio = useCallback(
    async (headword: string, item: DetectedItem) => {
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
        claimAudio(audioRef.current);
        audioRef.current.src = url;
        await audioRef.current.play();
        reportTap(Math.round(performance.now() - t0));
      } catch {
        // fall back to browser TTS
        if ("speechSynthesis" in window) {
          stopOtherAudio();
          const u = new SpeechSynthesisUtterance(headword);
          u.lang = "zh-TW";
          speechSynthesis.speak(u);
          reportTap(Math.round(performance.now() - t0));
        } else {
          void tapFn({ data: { headword } }).catch(() => {});
        }
      }
      void item;
    },
    [entries, ttsFn, tapFn],
  );

  const reset = useCallback(() => {
    setItems(null);
    setSubItems([]);
    setSnapshot(null);
    setChip(null);
    setEntries({});
    setDetectMs(null);
    setPartsMs(null);
    setLookupMs(null);
    setTapToAudioMs(null);
    setCatchOpen(null);
    setExpandingId(null);
    prefetchRef.current.clear();
    prefetchTimingRef.current.clear();
  }, []);

  // ---- §3.5 「+細かく」: crop a region around the parent tap point and run a
  // second (parts-only) detection. Coords come back in the cropped 0..1000
  // frame; we remap into the parent frame before storing so the same dot
  // renderer can draw them.
  const expandParts = useCallback(
    async (parent: DetectedItem) => {
      if (!snapshot || expandingId) return;
      // Skip if we already have children for this parent
      if (subItems.some((s) => s.parentId === parent.id)) return;
      setExpandingId(parent.id);
      const t0 = performance.now();
      try {
        // Crop a square around the tap point ~40% of the shortest side.
        const img = new Image();
        await new Promise<void>((res, rej) => {
          img.onload = () => res();
          img.onerror = () => rej(new Error("img"));
          img.src = snapshot;
        });
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

        const { items: parts } = await partsFn({
          data: { imageBase64: cropDataUrl, parentHeadword: parent.headword },
        });
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
            const { entries: e } = await lookupFn({
              data: { headwords: mapped.map((m) => m.headword) },
            });
            setEntries((prev) => ({ ...prev, ...e }));
          } catch {
            /* noop */
          }
        }
      } catch (e) {
        setError((e as Error).message || t("scan.detailFailed"));
      } finally {
        setExpandingId(null);
      }
    },
    [snapshot, expandingId, subItems, partsFn, lookupFn, t],
  );

  // ---- overlay coord conversion (normalized 0..1000 → pixels within box) ----
  const boxSize = useBoxSize(boxRef);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const sheetSize = useBoxSize(sheetRef);
  /**
   * ドット(光のボタン)の配置。
   * スキャン後は下からシートが せり上がるので、そのままだと下半分のドットが
   * シートの裏に隠れて**押せなくなる**。写真の見える範囲(= シートの上端まで)
   * にドットを収め、常にすべてのドットをタップできるようにする。
   */
  const dotStyle = useCallback(
    (it: DetectedItem): React.CSSProperties => {
      const [x, y] = it.point;
      const reserved = snapshot ? sheetSize.h + 24 : 0;
      const usableH = Math.max(120, boxSize.h - reserved);
      const left = (x / 1000) * boxSize.w;
      const top = (y / 1000) * usableH;
      return { left, top };
    },
    [boxSize, sheetSize.h, snapshot],
  );

  const chosenDict = chip ? entries[chip.chosenHeadword] : undefined;
  const displayHeadword = chip?.chosenHeadword ?? "";
  const displayZhuyin = chosenDict?.zhuyin ?? chip?.item.zhuyin ?? "";
  const displayPinyin = chosenDict?.pinyin ?? chip?.item.pinyin ?? "";
  const displayMeaning = chosenDict?.meaning_ja ?? chip?.item.meaning_ja ?? "";
  const displayPos = chosenDict?.pos ?? chip?.item.pos ?? "";
  const verified = Boolean(chosenDict && chosenDict.source === "verified");

  // Only surface target-language (Chinese) words as candidates — drop English
  // and other non-learning-language detections from the dots and the list.
  const visibleItems = useMemo(
    () => (items ?? []).filter((it) => /[㐀-鿿豈-﫿]/.test(it.headword)),
    [items],
  );

  return (
    <AppShell title={t("nav.camera")}>
      <div className="space-y-3">
        {/*
          カメラは画面いっぱい(フルスクリーン)。世界をスキャンしている感覚は
          小さな窓では出ない — 上下のUIだけをオーバーレイで重ねる。
          スクロールを持つ候補リストは、この下の通常フローに残す。
        */}
        <div
          ref={boxRef}
          className="fixed inset-0 z-20 overflow-hidden bg-black"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {/* live camera */}
          {!snapshot && (
            <video
              ref={videoRef}
              playsInline
              muted
              className="absolute inset-0 h-full w-full object-cover"
              // ハードウェアズーム非対応の端末では見た目を拡大して代用する。
              style={zoomCapsRef.current ? undefined : { transform: `scale(${zoom})` }}
            />
          )}
          {/* frozen snapshot after scan */}
          {snapshot && (
            // 写真もドットと同じ「シートの上」の範囲に収める。
            // こうしておくと座標と見た目がずれない。
            <img
              src={snapshot}
              alt=""
              className="absolute inset-x-0 top-0 w-full object-cover"
              style={{ height: `calc(100% - ${sheetSize.h + 24}px)` }}
            />
          )}

          {/* Vision Pro–style scan overlay (see ScanEffect.tsx) */}
          {scanning && scanStage !== "idle" && <ScanEffect stage={scanStage} />}

          {/* dots — §3.1b 4-state discovery radar + §3.5 expandable parts */}
          {visibleItems.map((it) => {
            const low = it.confidence < 0.75;
            const isText = it.kind === "text";
            const expanded = subItems.some((s) => s.parentId === it.id);
            const state = dotStateFor(it.headword, scanCtx);
            // apple-design: three soft glass "lights", one per state —
            //   new (未発見)                      → white
            //   owned (スキャン済み=写真あり)       → green
            //   reunion (文字/音声で登録・写真なし) → amber
            // All share the same glow + ring treatment so they read as one
            // family rather than loud, clashing dots.
            const marker =
              state === "owned"
                ? "bg-emerald-400 ring-emerald-100/70 shadow-[0_0_10px_2px_rgba(52,211,153,0.5)]"
                : state === "reunion"
                  ? "bg-amber-400 ring-amber-100/70 shadow-[0_0_10px_2px_rgba(251,191,36,0.5)]"
                  : "bg-white ring-white/60 shadow-[0_0_10px_2px_rgba(255,255,255,0.5)]";
            return (
              <button
                key={it.id}
                onClick={() => openChip(it)}
                style={dotStyle(it)}
                // §11: the dot is 16px but the tap target is padded to the 44px
                // floor — these on-camera markers are the primary interaction.
                className={`absolute -translate-x-1/2 -translate-y-1/2 grid h-11 w-11 place-items-center transition-transform active:scale-90 motion-reduce:transition-none motion-reduce:active:scale-100`}
                aria-label={`${it.headword}${it.zhuyin ? ` ${it.zhuyin}` : ""} — ${state === "owned" ? t("scan.owned") : state === "reunion" ? t("scan.reunion") : "新しい"}`}
              >
                <span
                  className={[
                    "block h-4 w-4 rounded-full ring-1 backdrop-blur-[1px] transition-all",
                    marker,
                    low ? "opacity-70" : "",
                    expanded ? "ring-2 ring-amber-200/80" : "",
                  ].join(" ")}
                />
                {isText && state !== "owned" && (
                  <span className="pointer-events-none absolute inset-0 grid place-items-center text-[9px] font-bold text-foreground/70">
                    A
                  </span>
                )}
                {state === "owned" && (
                  <span className="pointer-events-none absolute inset-0 grid place-items-center">
                    <Check className="h-2.5 w-2.5 text-white" strokeWidth={3.5} />
                  </span>
                )}
                {state === "new" && (
                  <span className="pointer-events-none absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full bg-white/30 motion-reduce:animate-none" />
                )}
                {state === "reunion" && (
                  <span className="pointer-events-none absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full bg-amber-300/40 blur-sm motion-reduce:animate-none" />
                )}
                {low && (
                  <span className="pointer-events-none absolute -bottom-1 rounded-full bg-amber-400 px-1 text-[9px] font-bold text-black">
                    ?
                  </span>
                )}
                {/* 単語+発音をスキャン直後から表示 — タップ前に読み方が分かる。
                    B6: 品詞を小さな色ドットで示す(名詞=白/動詞=ローズ/形容詞=アンバー)。 */}
                <span className="pointer-events-none absolute top-full mt-1 left-1/2 flex max-w-[150px] -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-black/65 px-2 py-0.5 text-center text-[10px] font-semibold leading-tight text-white backdrop-blur-sm">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${posDotColor(it.pos)}`} />
                  <span lang="zh-Hant" className="truncate">
                    {it.headword}
                    {it.zhuyin && <span className="ml-1 font-normal opacity-90">{it.zhuyin}</span>}
                  </span>
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
              className="absolute -translate-x-1/2 -translate-y-1/2 grid h-11 w-11 place-items-center transition-transform active:scale-90 animate-in fade-in zoom-in duration-300 motion-reduce:animate-none motion-reduce:transition-none motion-reduce:active:scale-100"
              aria-label={t("scan.partOf", { word: s.headword })}
            >
              <span className="block h-4 w-4 rounded-full bg-amber-300 ring-2 ring-white/90 shadow-md" />
              <span className="pointer-events-none absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-amber-300/70" />
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

          {/* ズーム: ピンチでも動くが、片手でも変えられるよう縦スライダーを置く */}
          {!snapshot && ready && zoomMax > 1 && (
            <div className="absolute right-2 top-1/2 z-10 flex -translate-y-1/2 flex-col items-center gap-2">
              <span className="rounded-full bg-black/45 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
                {zoom.toFixed(1)}×
              </span>
              <input
                type="range"
                aria-label={t("scan.zoom")}
                min={zoomCapsRef.current?.min ?? 1}
                max={zoomMax}
                step={0.1}
                value={zoom}
                onChange={(e) => applyZoom(Number(e.target.value))}
                className="h-40 w-11 cursor-pointer accent-white"
                style={{ writingMode: "vertical-lr", direction: "rtl" }}
              />
            </div>
          )}

          {/* compact metrics badge (always visible after a scan) */}
          {(detectMs !== null || tapToAudioMs !== null) && (
            <div className="absolute right-3 top-3 rounded-full bg-black/50 px-2 py-1 text-[10px] text-white backdrop-blur">
              {detectMs !== null && <span>{t("scan.detectMs", { ms: detectMs })}</span>}
              {tapToAudioMs !== null && (
                <span className="ml-2">{t("scan.audioMs", { ms: tapToAudioMs })}</span>
              )}
            </div>
          )}
        </div>

        {/*
          カメラの上に重ねる操作シート。順番が体験を決める:
            1) タップした単語のチップ(キャッチボタン)が最前面・一番上
               — 以前はリストの下にあり、スクロールしないと押せなかった
            2) スキャンボタンと母語の検索欄(常設)
            3) 見つかった単語の一覧(スクロール可)
        */}
        <div
          ref={sheetRef}
          className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 space-y-2 px-4"
        >
          {/* 1) チップ: ドットをタップした単語 — 常に一番上・すぐキャッチできる */}
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
              candidates={
                chip.showingCandidates ? [chip.item.headword, ...chip.item.alternatives] : []
              }
              expanding={expandingId === chip.item.id}
              canExpand={chip.item.kind === "object" && !("sub" in chip.item)}
              onPickCandidate={(h) => pickCandidate(h, chip.item)}
              onPlay={() => playAudio(displayHeadword, chip.item)}
              onExpand={() => expandParts(chip.item)}
              onCatch={() => {
                if (!chip.chosenHeadword || !snapshot) return;
                startPrefetch(chip.chosenHeadword);
                setCatchOpen({ headword: chip.chosenHeadword, item: chip.item });
              }}
              onClose={() => setChip(null)}
            />
          )}

          {error && (
            <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
          )}

          {/* 2) 操作: スキャン + 母語で調べる欄(常設)。
              細かいアイコンボタン(⌨/🎤)は廃止 — 「候補に無いものは自分の
              言葉で調べる」の一本道にする。音声入力は検索欄の🎤から。 */}
          <div className="flex items-center justify-center gap-3">
            {!snapshot ? (
              <div className="w-full space-y-2">
                <div className="flex justify-center">
                  <button
                    onClick={doScan}
                    disabled={!ready || scanning}
                    className="inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3.5 text-base font-semibold text-primary-foreground shadow-xl shadow-primary/40 transition active:scale-95 disabled:opacity-50"
                  >
                    {scanning ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <ScanLine className="h-5 w-5" />
                    )}
                    {t("scan.button")}
                  </button>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const q = manualQuery.trim();
                    if (!q) return;
                    setInputCatchText(q);
                    setInputCatchOpen("text");
                  }}
                  className="flex gap-2"
                >
                  <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={manualQuery}
                      onChange={(e) => setManualQuery(e.target.value)}
                      placeholder={
                        voiceListening ? t("scan.listening") : t("scan.searchPlaceholder")
                      }
                      className="w-full rounded-full border border-border bg-background/90 py-2.5 pl-9 pr-4 text-sm shadow-lg outline-none backdrop-blur focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={toggleVoice}
                    aria-label={t("scan.voiceLabel")}
                    aria-pressed={voiceListening}
                    className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border shadow-lg backdrop-blur transition active:scale-95 ${
                      voiceListening
                        ? "animate-pulse border-red-400 bg-red-500 text-white"
                        : "border-border bg-background/90 text-muted-foreground"
                    }`}
                  >
                    <Mic className="h-4 w-4" />
                  </button>
                  <button
                    type="submit"
                    disabled={!manualQuery.trim()}
                    className="press-in inline-flex min-h-11 shrink-0 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg disabled:opacity-50"
                  >
                    {t("scan.searchGo")}
                  </button>
                </form>
              </div>
            ) : (
              <>
                <button
                  onClick={reset}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-secondary px-5 py-2.5 text-sm font-medium text-secondary-foreground shadow"
                >
                  <RotateCcw className="h-4 w-4" /> {t("scan.again")}
                </button>
                <button
                  onClick={doScan}
                  disabled={scanning}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow"
                >
                  <Camera className="h-4 w-4" /> {t("scan.rescan")}
                </button>
              </>
            )}
          </div>

          {/* Nothing found: a completed scan produced no target-language words.
              Without this the user just stares at a frozen photo with no dots
              and no explanation. */}
          {items !== null && !scanning && visibleItems.length === 0 && (
            <div className="rounded-2xl bg-background/80 p-4 text-center shadow-lg backdrop-blur-xl">
              <p className="text-sm font-medium">{t("scan.nothingFound")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("scan.nothingFoundHint")}</p>
            </div>
          )}

          {/* 3) 見つかった単語(スクロールできるガラスのシート) */}
          {visibleItems.length > 0 && !scanning && (
            <div className="max-h-[26vh] overflow-y-auto overscroll-contain rounded-2xl bg-background/80 p-1.5 shadow-lg backdrop-blur-xl">
              {
                <div className="space-y-1.5">
                  <p className="px-1 text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
                    {t("scan.found")}
                  </p>
                  {visibleItems.map((it) => {
                    const st = dotStateFor(it.headword, scanCtx);
                    return (
                      <button
                        key={it.id}
                        onClick={() => openChip(it)}
                        className="press-in flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2.5 text-left shadow-sm"
                      >
                        <span
                          className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                            st === "owned"
                              ? "bg-emerald-400"
                              : st === "reunion"
                                ? "bg-amber-400"
                                : "bg-sky-400"
                          }`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline gap-2">
                            <span lang="zh-Hant" className="truncate text-base font-semibold">
                              {it.headword}
                            </span>
                            {it.zhuyin && (
                              <span className="shrink-0 text-[11px] text-muted-foreground">
                                {it.zhuyin}
                              </span>
                            )}
                          </span>
                          {it.meaning_ja && (
                            <span className="block truncate text-xs text-muted-foreground">
                              {it.meaning_ja}
                            </span>
                          )}
                        </span>
                        {/* §2: don't lean on colour alone — reunion carries a text tag,
                      owned a check, new a chevron. */}
                        {st === "owned" ? (
                          <span className="flex shrink-0 items-center gap-1 text-[10px] font-semibold text-muted-foreground">
                            <Check className="h-3.5 w-3.5" /> {t("scan.owned")}
                          </span>
                        ) : st === "reunion" ? (
                          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900 ring-1 ring-amber-200 dark:bg-amber-500/20 dark:text-amber-200 dark:ring-amber-400/30">
                            {t("scan.reunion")}
                          </span>
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                      </button>
                    );
                  })}
                </div>
              }
            </div>
          )}
        </div>

        {/* Dev metrics panel (?dev=1 or localStorage.catchwords_dev=1) */}
        {devOn && (
          <DevMetrics
            values={{
              detect_ms: detectMs,
              parts_ms: partsMs,
              lookup_ms: lookupMs,
              tap_to_audio_ms: tapToAudioMs,
              prefetch_ms: chip
                ? (prefetchTimingRef.current.get(chip.chosenHeadword) ?? null)
                : null,
              catch_ms: null,
            }}
            targets={SCAN_TARGETS}
          />
        )}
      </div>

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
        <InputCatchSheet
          initialMode={inputCatchOpen}
          initialText={inputCatchText}
          autoLookup={!!inputCatchText}
          onClose={() => {
            setInputCatchOpen(null);
            setInputCatchText("");
            setManualQuery("");
          }}
        />
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
  headword,
  zhuyin,
  pinyin,
  meaning,
  pos,
  verified,
  state,
  foundAt,
  candidates,
  expanding,
  canExpand,
  onPickCandidate,
  onPlay,
  onExpand,
  onCatch,
  onClose,
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
  onCatch: () => void;
  onClose: () => void;
}) {
  const t = useT();
  if (candidates.length > 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 shadow-md">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">{t("scan.whichOne")}</p>
          <button
            onClick={onClose}
            aria-label={t("common.close")}
            className="-mr-2 grid h-9 w-9 place-items-center rounded-full text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {candidates.map((c) => (
            <button
              key={c}
              onClick={() => onPickCandidate(c)}
              className="rounded-full bg-amber-100 px-4 py-2.5 text-base font-semibold text-amber-900 ring-1 ring-amber-200 active:scale-95 motion-reduce:active:scale-100 dark:bg-amber-500/20 dark:text-amber-100 dark:ring-amber-400/30"
            >
              {c}?
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div
      className={`rounded-2xl border p-4 shadow-md ${
        state === "reunion"
          ? "border-amber-300 bg-gradient-to-br from-amber-50 to-yellow-50 dark:border-amber-400/30 dark:from-amber-500/10 dark:to-yellow-500/5"
          : "border-border bg-gradient-to-br from-card to-sky-50/50 dark:to-sky-500/5"
      }`}
    >
      {state === "reunion" && foundAt && (
        <p className="mb-2 rounded-xl bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-900 dark:bg-amber-500/20 dark:text-amber-100">
          {t("scan.foundDaysAgoBefore", { n: daysAgo(foundAt) })}
          <Zh>{headword}</Zh>
          {t("scan.foundDaysAgoAfter")}
        </p>
      )}
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <h2 lang="zh-Hant" className="text-2xl font-bold tracking-tight">
              {headword}
            </h2>
            {state === "owned" && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                <Check className="h-3 w-3 text-emerald-600" /> {t("scan.ownedTag")}
              </span>
            )}
            {verified ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-900 ring-1 ring-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-200 dark:ring-emerald-400/30">
                {t("scan.verified")}
              </span>
            ) : (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900 ring-1 ring-amber-200 dark:bg-amber-500/20 dark:text-amber-200 dark:ring-amber-400/30">
                {t("scan.aiUnverified")}
              </span>
            )}
          </div>
          <div lang="zh-Hant" className="mt-0.5 text-xs text-muted-foreground">
            {zhuyin} {pinyin && <span className="ml-2">{pinyin}</span>}
          </div>
          <p className="mt-2 text-base font-medium">{meaning}</p>
          {pos && (
            <span className="mt-1 inline-block rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-900 ring-1 ring-violet-200 dark:bg-violet-500/20 dark:text-violet-200 dark:ring-violet-400/30">
              {pos}
            </span>
          )}
        </div>
        <button
          onClick={onPlay}
          aria-label={t("scan.playPron")}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 active:scale-95 motion-reduce:active:scale-100"
        >
          <Volume2 className="h-5 w-5" />
        </button>
        <button
          onClick={onClose}
          aria-label={t("common.close")}
          className="-mr-2 -mt-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {canExpand && (
          <button
            onClick={onExpand}
            disabled={expanding}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-amber-100 px-4 py-2 text-xs font-semibold text-amber-900 ring-1 ring-amber-200 active:scale-95 disabled:opacity-60 motion-reduce:active:scale-100 dark:bg-amber-500/20 dark:text-amber-100 dark:ring-amber-400/30"
            title={t("scan.partsTitle")}
          >
            {expanding ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            {expanding ? t("scan.analyzingParts") : t("scan.finer")}
          </button>
        )}
        <button
          onClick={onCatch}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-primary px-3 py-3 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 active:scale-95 motion-reduce:active:scale-100"
        >
          <BookOpen className="h-4 w-4" /> {t("scan.catch")}
        </button>
      </div>
    </div>
  );
}

// ---- helper micro-components for loader / dev overlay ----

const PROBE_DOTS: { x: number; y: number; delay: number }[] = [
  { x: 22, y: 18, delay: 0 },
  { x: 78, y: 24, delay: 250 },
  { x: 62, y: 46, delay: 500 },
  { x: 30, y: 60, delay: 750 },
  { x: 82, y: 66, delay: 1000 },
  { x: 46, y: 80, delay: 1250 },
  { x: 18, y: 40, delay: 350 },
  { x: 70, y: 82, delay: 600 },
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

function DevMetrics({
  values,
  targets,
}: {
  values: Metrics;
  targets: Record<keyof Metrics, number>;
}) {
  const [open, setOpen] = useState(true);
  const rows: { key: keyof Metrics; label: string }[] = [
    { key: "detect_ms", label: "検出 (§9 ≤2500ms)" },
    { key: "parts_ms", label: "+細かく (§3.5)" },
    { key: "lookup_ms", label: "辞書照合" },
    { key: "tap_to_audio_ms", label: "タップ→音声 (§9 ≤1000ms)" },
    { key: "prefetch_ms", label: "詳細プリフェッチ (§9 ≤500ms表示)" },
    { key: "catch_ms", label: "キャッチ完了" },
  ];
  return (
    <div className="rounded-xl border border-dashed border-amber-400 bg-amber-50/70 p-3 text-xs">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-amber-900 font-semibold"
      >
        <span className="flex items-center gap-1.5">
          <Bug className="h-3.5 w-3.5" /> 開発者計測 (§9)
        </span>
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
                <span
                  className={`tabular-nums font-mono ${ok ? "text-emerald-700" : bad ? "text-red-700" : "text-muted-foreground"}`}
                >
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
