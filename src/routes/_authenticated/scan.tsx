import { toast } from "sonner";
import { cardSectionsNow } from "@/lib/card-prefs";
import { saveCaptureToPhotoLibrary } from "@/lib/device-photo-library";
import { setCameraScreenOpen } from "@/lib/camera-launch";
import {
  CameraFlipButton,
  CameraLibraryButton,
  CameraModeStrip,
  CameraShutter,
  CameraZoomMeter,
} from "@/components/CameraChrome";
import { listMyStickers } from "@/lib/stickers.functions";
import { stickerPhotoUrl } from "@/lib/sticker-photo";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTargetLang } from "@/lib/target-lang-pref";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Check,
  Keyboard,
  Loader2,
  Volume2,
  X,
  RotateCcw,
  BookOpen,
  Sparkles,
  Bug,
  ChevronDown,
  ChevronsUpDown,
  Search,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import {
  detectScan,
  getScanContext,
  lookupHeadwords,
  markScanTap,
  type DetectedItem,
  type DictionaryEntry,
  type ScanContext,
} from "@/lib/scan.functions";
import { usePronounce, usePrefetchSpeech } from "@/lib/use-pronounce";
import { generateCard, type GeneratedCard } from "@/lib/ai.functions";
import { logAppEvent } from "@/lib/metrics.functions";
import { geocodeLocation } from "@/lib/geocode.functions";
import { ScanCatchSheet } from "@/components/ScanCatchSheet";
import { InputCatchSheet } from "@/components/InputCatchSheet";
import { ScanEffect } from "@/components/ScanEffect";
import { Sound, unlockAudio } from "@/lib/sound-engine";
import { haptic } from "@/lib/haptics";
import { readableError } from "@/lib/errors";
import { useT, useUiLang } from "@/lib/i18n";
import { Zh } from "@/components/Zh";
import { clampToVisible, coverPoint, focusedIndex } from "@/lib/scan-layout";
import { rankScanCandidates } from "@/lib/jev.functions";
import { putScanHandoff } from "@/lib/scan-handoff";
import { motionReducedNow } from "@/hooks/use-reduced-motion";
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
  if (/動詞/.test(p)) return "bg-bad";
  if (/形容/.test(p)) return "bg-amber-400";
  if (/名詞|代名詞|量詞|数詞/.test(p)) return "bg-white";
  return "bg-white/50";
}

function ScanPage() {
  // 翻訳関数は他のフックより先に用意する。依存配列に入れるため、
  // 使う場所より後で宣言すると初期化前参照になる。
  const t = useT();
  /**
   * かざす画面も「撮る画面」の仲間。開く演出をこの上に重ねない
   * （`lib/camera-launch.ts`）。
   */
  useEffect(() => {
    setCameraScreenOpen(true);
    return () => setCameraScreenOpen(false);
  }, []);
  const navigate = useNavigate();
  /**
   * シャッターの左に出す**いちばん新しい1枚**（撮る画面と同じ物）。
   * 鍵はホームと同じ `["stickers"]` — 同じ物を別の鍵で取り直さない。
   */
  const stickersFn = useServerFn(listMyStickers);
  const { data: allStickers } = useQuery({
    queryKey: ["stickers"],
    queryFn: () => stickersFn(),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
  const lastPhotoUrl = useMemo(() => {
    const items = Array.isArray(allStickers) ? allStickers : (allStickers?.items ?? []);
    for (const s of items) {
      const url = stickerPhotoUrl(s, { thumb: true });
      if (url) return url;
    }
    return null;
  }, [allStickers]);

  const detectFn = useServerFn(detectScan);
  const lookupFn = useServerFn(lookupHeadwords);
  const tapFn = useServerFn(markScanTap);
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

  /**
   * かざして見つけた語を**何語として扱うか**（設定の学習言語）。
   * ここが決め打ちだったので、英語を選んでも台湾華語のカードを取りに
   * 行っていた。
   */
  const targetLanguage = useTargetLang();
  // **何語として読むかを必ず渡す**(`playAudio` の注)。
  const pronounce = usePronounce(targetLanguage);
  // 辞書の意味は**解説を書いた言語**で入っている(`meanings` の鍵)。
  // 表示言語で引かないと、合わない語釈が出るか、何も出ない。
  const uiLang = useUiLang();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  // ズーム(1 = 等倍)。端末が対応していれば光学/デジタルズーム、
  // 非対応なら CSS の scale で代用する。
  /**
   * どちらのカメラを覗いているか。
   *
   * ずっと背面固定だった。撮る側(`capture.tsx`)には自撮りの段があるのに、
   * かざす側には**前後を替える手立てが無かった**(オーナー指摘)。
   * 自分や連れの持ち物にかざしたい場面が普通にある。
   */
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [zoom, setZoom] = useState(1);
  const [zoomMax, setZoomMax] = useState(1);
  const zoomCapsRef = useRef<{ min: number; max: number } | null>(null);
  const pinchRef = useRef<{ startDist: number; startZoom: number } | null>(null);
  // 音声入力はこの画面のまま行う(別シートに飛ばさない)。
  // 認識結果は検索欄に入り、そのまま「調べる」で確定できる。
  const streamRef = useRef<MediaStream | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

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
      const p = cardFn({
        data: { headword, targetLanguage: targetLanguage, sections: cardSectionsNow() },
      });
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
  const [snapshot, setSnapshot] = useState<string | null>(null);
  /** 撮った写真の元の大きさ。光の点を `object-cover` の写真に合わせて置くのに要る。 */
  const [snapshotSize, setSnapshotSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  /**
   * いま注目している候補（下の列で真ん中にある／押した候補）。その光の点が
   * 大きくなって揺れる（オーナー指示 2026-09-22）。
   */
  const [activeId, setActiveId] = useState<string | null>(null);
  /**
   * Jev が付けた「調べたい見込み」の順（候補の id の並び）。スキャンの結果を
   * 出した**後から**届く。届く前に本人が候補を押していたら使わない —
   * 押した後に並びが動くと、押そうとした行が逃げる。
   */
  const [rankOrder, setRankOrder] = useState<string[] | null>(null);
  const touchedRef = useRef(false);
  const [entries, setEntries] = useState<Record<string, DictionaryEntry>>({});
  const [chip, setChip] = useState<ChipState | null>(null);
  /**
   * 見つかった語の音を**並んだ瞬間に**端末へ落としておく。
   *
   * 辞書に作り置きが在る語は `audio_url` を添えるので、サーバ関数を
   * 1回も呼ばずに貯めへ入る。ここが `playAudio` の中に在った
   * 「署名URLが手元にあるので往復ゼロ」の置き換え — タップの中でやると
   * 落とし終わるまで待つが、先に落としておけば押した瞬間に鳴る。
   */
  const spokenWords = useMemo(() => Object.keys(entries), [entries]);
  const spokenUrls = useMemo(() => {
    const out: Record<string, string | null> = {};
    for (const [w, e] of Object.entries(entries)) out[w] = e.audio_url ?? null;
    return out;
  }, [entries]);
  usePrefetchSpeech(spokenWords, { language: targetLanguage, urls: spokenUrls });
  const [detectMs, setDetectMs] = useState<number | null>(null);
  const [lookupMs, setLookupMs] = useState<number | null>(null);
  const [tapToAudioMs, setTapToAudioMs] = useState<number | null>(null);
  const [catchOpen, setCatchOpen] = useState<{ headword: string; item: DetectedItem } | null>(null);
  const [inputCatchOpen, setInputCatchOpen] = useState<"text" | "voice" | null>(null);
  const [inputCatchText, setInputCatchText] = useState("");
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
    // 前のカメラの能力を持ち越さない。前面は倍率を持たないことが多く、
    // 背面の上限のままだと**動かないつまみ**が残る。
    setReady(false);
    setZoom(1);
    setZoomMax(1);
    zoomCapsRef.current = null;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            // `ideal` のまま渡す。`exact` にすると前面しか無い端末・
            // 背面しか無い端末で `OverconstrainedError` になり、
            // 切り替えたとたんカメラが真っ黒になる。
            facingMode: { ideal: facing },
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
    // 起動し直すのは**前後を替えたときだけ**。t を依存に入れると
    // 表示言語を変えた瞬間にカメラが再起動してしまう
    // (エラー文の言語のためにそこまでする必要はない)。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing]);

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

  /**
   * 声で調べる道は**撮り方の「検索」へ移した**（`lib/use-voice-input.ts`）。
   * ここの検索欄を畳んだ時に道連れで消えるところだったので、部品にして
   * 残してある。この画面には「かざして押す」だけを置く。
   */

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
    setRankOrder(null);
    touchedRef.current = false;
    setEntries({});
    setDetectMs(null);
    setLookupMs(null);
    setTapToAudioMs(null);
    const frame = grabFrame();
    if (!frame) {
      setError(t("scan.noFrame"));
      return;
    }
    void saveCaptureToPhotoLibrary(frame).then((result) => {
      if (result === "failed") toast.error(t("cap.photoLibrarySaveFailed"));
    });
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
        const { entries } = await lookupFn({
          data: {
            headwords: items.map((i) => i.headword),
            language: targetLanguage,
            explain_lang: uiLang,
          },
        });
        setLookupMs(Math.round(performance.now() - tl));
        setEntries(entries);
      }
    } catch (e) {
      // 生の英語(`fetch failed` / `PGRST116`)は出さない。日本語で
      // 使っている人には何も分からないし、対処もできない。
      // ただし**こちらが日本語で投げたメッセージは通す** — 「1日の利用
      // 上限に達しました」のような、理由も対処も分かるものまで
      // 「検出に失敗しました」に潰すと、ユーザーは直らないものを
      // 押し続けることになる(監査の指摘)。
      console.error(e);
      setError(readableError(e, t("scan.detectFailed")));
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
      touchedRef.current = true;
      setActiveId(item.id);
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

  /**
   * **候補を押したら、撮影モードと同じ流れで足す**（オーナー指示 2026-09-23）。
   * 撮った写真・場所・押した語を撮影モードへ渡し、そちらの「カード →
   * 保存の演出」（持っている語なら再会の画面）で続ける。検出が迷った語は
   * 撮影モードと同じく「語を選ぶ」から（`lib/scan-handoff.ts`）。
   */
  const addViaCapture = useCallback(
    (item: DetectedItem) => {
      if (!snapshot) return;
      touchedRef.current = true;
      const unsure = item.confidence < 0.75 && item.alternatives.length > 0;
      putScanHandoff({
        image: snapshot,
        headword: item.headword,
        hint: {
          reading_zhuyin: item.zhuyin ?? "",
          pinyin: item.pinyin ?? "",
          meaning_ja: item.meaning_ja ?? "",
          category_key: "",
        },
        alternatives: unsure ? item.alternatives : [],
        loc: scanLoc,
      });
      void navigate({ to: "/capture", search: { mode: "photo" } });
    },
    [snapshot, scanLoc, navigate],
  );

  /**
   * 写真の上の光を押したときは、**その候補に注目して読み上げる**だけ。
   * 下の箱もその行へ送る。足すのは箱の行を押したとき（撮影モードの流れ）。
   */
  const focusDot = useCallback(
    (item: DetectedItem) => {
      touchedRef.current = true;
      setActiveId(item.id);
      pronounce.prefetch(item.headword);
      void playAudio(item.headword, item);
    },
    // playAudio はこの下で定義している（openChip と同じ理由）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const pickCandidate = useCallback(
    async (headword: string, item: DetectedItem) => {
      setChip({ item, chosenHeadword: headword, showingCandidates: false });
      // fetch dict entry for the newly-chosen headword if not cached
      if (!entries[headword]) {
        try {
          const { entries: e } = await lookupFn({
            data: { headwords: [headword], language: targetLanguage, explain_lang: uiLang },
          });
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

  /**
   * かざして見つけた語を読む。
   *
   * ## ここには**発音の道の写しが丸ごと**在った(オーナー報告①⑯)
   * `ttsFn({ data: { text: headword } })` — **何語かを渡していない**ので
   * サーバは既定の台湾華語の声で合成する。中国語に語末の /p/ は無いので、
   * "map" は「マー」になる。控えの側はもっと悪く、
   * `new SpeechSynthesisUtterance` を自分で作って `u.lang = speechLangOf()`
   * (これも引数なし=台湾華語)を当て、**声を1つも選んでいなかった** —
   * 端末がその場の気分で選ぶので、鳴らすたびに違う声になる。
   * オーナーの言う「様々な別のソフトの声がする」はこれ。
   *
   * `usePronounce` はこの全部を持っている(端末の貯め・言語ごとの鍵・
   * 声の決めきり・被り止め)。**写しを消して、そちらを呼ぶ。**
   * 事前生成の署名URLは `usePrefetchSpeech` から同じ貯めに入るので、
   * 「サーバー往復ゼロ」も失わない。
   */
  const playAudio = useCallback(
    async (headword: string, item: DetectedItem) => {
      // iOS: 再生解禁はタップの中で同期的に済ませる必要がある(`usePronounce`
      // の中でも最初にやっている)。
      const t0 = performance.now();
      const reportTap = (ms: number) => {
        setTapToAudioMs(ms);
        void tapFn({ data: { headword, tap_to_audio_ms: ms } }).catch(() => {});
      };
      await pronounce(headword);
      reportTap(Math.round(performance.now() - t0));
      void item;
    },
    [pronounce, tapFn],
  );

  const reset = useCallback(() => {
    setItems(null);
    setSnapshot(null);
    setActiveId(null);
    setRankOrder(null);
    touchedRef.current = false;
    setChip(null);
    setEntries({});
    setDetectMs(null);
    setLookupMs(null);
    setTapToAudioMs(null);
    setCatchOpen(null);
    prefetchRef.current.clear();
    prefetchTimingRef.current.clear();
  }, []);

  // ---- overlay coord conversion (normalized 0..1000 → pixels within box) ----
  const boxSize = useBoxSize(boxRef);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const sheetSize = useBoxSize(sheetRef);
  /**
   * 光の点の位置。写真は画面いっぱいの `object-cover`（覗いていた映像と
   * 同じ見え方）なので、点も同じ切り落としで置く（`lib/scan-layout.ts`）。
   * そのうえで、下の操作シートの裏に入る点はシートの上へ持ち上げる —
   * 隠れた点は押せず、候補を選んだときの動きも見えない。
   */
  const dotStyle = useCallback(
    (it: DetectedItem): React.CSSProperties => {
      const p = coverPoint(it.point, snapshotSize, boxSize);
      if (!snapshot) return p;
      const sheetTop = sheetRef.current?.getBoundingClientRect().top ?? boxSize.h;
      return clampToVisible(p, { w: boxSize.w, bottom: sheetTop });
    },
    // sheetSize.h: シートの高さが変わったら上端も変わるので、置き直す。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [boxSize, sheetSize.h, snapshot, snapshotSize],
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
  const isTarget = (it: DetectedItem) => /[㐀-鿿豈-﫿]/.test(it.headword);
  const visibleItems = useMemo(() => {
    const list = (items ?? []).filter(isTarget);
    if (!rankOrder) return list;
    const at = (id: string) => {
      const i = rankOrder.indexOf(id);
      return i < 0 ? Number.MAX_SAFE_INTEGER : i;
    };
    return [...list].sort((a, b) => at(a.id) - at(b.id));
  }, [items, rankOrder]);

  /**
   * **Jev に「どれを調べたいか」を聞き、候補の並びを替える**（オーナー指示
   * 2026-09-22）。結果を出してから頼むので、スキャンの待ち時間は延びない。
   * 鍵が無い・自信が低い・本人がもう押した、のどれでも並びは変えない。
   */
  const rankFn = useServerFn(rankScanCandidates);
  useEffect(() => {
    if (scanning || !items || rankOrder) return;
    const list = items.filter(isTarget);
    if (list.length < 2) return;
    let cancelled = false;
    void rankFn({
      data: {
        items: list.slice(0, 24).map((it) => ({
          headword: it.headword,
          meaning: it.meaning_ja ?? null,
          kind: it.kind ?? null,
          confidence: it.confidence,
          owned: Boolean(scanCtx?.owned[normHead(it.headword)]),
        })),
      },
    })
      .then((r) => {
        if (cancelled || touchedRef.current || !r.order) return;
        setRankOrder(r.order.map((i) => list[i].id));
        // 先頭が替わるので、光らせる候補も先頭へ（箱が選び直す）。
        setActiveId(null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, scanning]);

  return (
    // スキャンも画面いっぱいのカメラ。上の帯は出さない（撮る画面と同じ）。
    <AppShell title={t("nav.camera")} bare>
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
          {/* live camera。**撮った後も外さない。** 以前は写真を出す間
              `<video>` を外していたので、「もう一度」で戻ると新しい
              `<video>` にはカメラの流れが繋がっておらず**真っ黒**になり、
              写真の上から押す「再スキャン」は映像が無くて必ず失敗していた。
              写真はこの上に重ねて覆う。 */}
          <video
            ref={videoRef}
            playsInline
            muted
            className="absolute inset-0 h-full w-full object-cover"
            // **前面でも鏡像にしない。** 自撮りの見慣れた向きは鏡像だが、
            // ここは見つけた物の上に印を落とす画面で、印の座標は
            // 撮った絵のままの向きで来る。鏡にすると印と物がずれる。
            // ハードウェアズーム非対応の端末では見た目を拡大して代用する。
            style={zoomCapsRef.current ? undefined : { transform: `scale(${zoom})` }}
          />
          {/* frozen snapshot after scan */}
          {snapshot && (
            // **覗いていた映像と同じ見え方**（画面いっぱい）で止める。
            // 以前は「シートの上まで」の短い箱に押し込んでいたので、箱の下に
            // カメラの黒い地がむき出しになっていた（「候補の下に黒い余白」）。
            <img
              src={snapshot}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              onLoad={(e) =>
                setSnapshotSize({
                  w: e.currentTarget.naturalWidth,
                  h: e.currentTarget.naturalHeight,
                })
              }
            />
          )}

          {/* Vision Pro–style scan overlay (see ScanEffect.tsx) */}
          {scanning && scanStage !== "idle" && <ScanEffect stage={scanStage} />}

          <ScanDots
            items={visibleItems}
            scanCtx={scanCtx}
            dotStyle={dotStyle}
            onOpen={focusDot}
            activeId={activeId}
          />

          <ScanCameraControls
            hidden={!!snapshot}
            facing={facing}
            onFlip={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
            // 倍率を持たない端末でも `1×` の札は出す（参考画像のとおり）。
            // 押せる粒になるかどうかは `CameraZoomMeter` が決める。
            showZoom={ready}
            zoom={zoom}
            zoomMin={zoomCapsRef.current?.min ?? 1}
            zoomMax={zoomMax}
            onZoom={applyZoom}
            // シートの上端のすぐ上。シートは `4.25rem + 安全域` の上に
            // 立っているので、その高さを足した所が上端になる。
            zoomBottom={`calc(5rem + env(safe-area-inset-bottom, 0px) + ${sheetSize.h}px + 0.5rem)`}
          />

          {/* compact metrics badge (always visible after a scan) */}
          {(detectMs !== null || tapToAudioMs !== null) && (
            <div className="absolute right-3 top-3 rounded-full bg-black/50 px-2 py-1 text-caption text-white backdrop-blur">
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
          className="fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 space-y-2 px-4"
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
              candidates={
                chip.showingCandidates ? [chip.item.headword, ...chip.item.alternatives] : []
              }
              onPickCandidate={(h) => pickCandidate(h, chip.item)}
              onPlay={() => playAudio(displayHeadword, chip.item)}
              onCatch={() => {
                if (!chip.chosenHeadword || !snapshot) return;
                startPrefetch(chip.chosenHeadword);
                setCatchOpen({ headword: chip.chosenHeadword, item: chip.item });
              }}
              onClose={() => setChip(null)}
            />
          )}

          {error && (
            <p className="rounded-xl bg-destructive/10 p-3 text-body text-destructive-ink">
              {error}
            </p>
          )}

          {/* 2) 操作: スキャン + 母語で調べる欄(常設)。
              細かいアイコンボタン(⌨/🎤)は廃止 — 「候補に無いものは自分の
              言葉で調べる」の一本道にする。音声入力は検索欄の🎤から。 */}
          <div className="flex items-center justify-center gap-3">
            {!snapshot ? (
              <div className="w-full space-y-2">
                {/*
                  **撮る画面と同じ形にする。**（オーナー指示 2026-09-15
                  「撮る画面とスキャン画面を1つにして。スキャンのデザインは
                   無くして、撮る画面のデザインを使って」）

                  前はここだけ青いカプセルのボタンだった。同じ「カメラを
                  覗いて押す」操作なのに、撮る画面は白い丸のシャッター、
                  こちらはカプセル — **同じ動作に2つの形**があった。
                  撮る画面の側へ揃える。
                */}
                {/*
                  撮り方の帯と下の行。**撮る画面とまったく同じ物**を置く
                  （オーナー指示「撮る画面とスキャン画面を1つにして」）。
                  真ん中を押すとスキャンが走り、帯を払うと撮る画面へ渡る。
                */}
                <CameraModeStrip
                  mode="scan"
                  // 選んだ撮り方をそのまま渡す。渡さないと、「検索」を選んだ
                  // 人が「撮影」の画面に着く。
                  onChange={(m) =>
                    void navigate({
                      to: "/capture",
                      search: { mode: m === "search" ? "search" : "photo" },
                    })
                  }
                />
                <div className="capture-actions">
                  <CameraLibraryButton
                    photoUrl={lastPhotoUrl}
                    onOpen={() => void navigate({ to: "/home" })}
                  />
                  <CameraShutter
                    mode="scan"
                    label={t("scan.button")}
                    busy={!ready || scanning}
                    onPress={doScan}
                  />
                  <CameraFlipButton
                    facing={facing}
                    withLabel
                    onFlip={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
                  />
                </div>
                {/*
                  **スキャンのときは、下の検索の欄も調べる釦も出さない。**
                  （オーナー指示 2026-09-16「スキャンボタン押したら下の
                   検索や調べるボタンはすべて要らない」）

                  ここは「かざして、見つかった語を押す」ための画面で、
                  打って調べるのは**撮り方の「検索」**が持っている。
                  同じ役目の入口を2つ置くと、どちらを使う場面なのかが
                  画面から読めなくなる（HIG「一貫性」）。
                */}
              </div>
            ) : null}
          </div>

          {/*
            撮った後の下の段。**候補を1行だけ**、横に送って選ぶ
            （オーナー指示 2026-09-22「スキャンの後は画面したに単語の候補1行が
             出てきてスクロールでき、その単語のものの光の点が大きくなったり、
             揺れる」）。以前は縦に積む一覧（画面の 26% まで）と「もう一度」
             「再スキャン」の2つの釦で、写真の下半分を覆っていた。
          */}
          {snapshot && !scanning && (
            <ScanCandidateStrip
              items={visibleItems}
              scanCtx={scanCtx}
              activeId={activeId}
              onFocus={setActiveId}
              onOpen={addViaCapture}
              onAgain={reset}
              nothingFound={items !== null && visibleItems.length === 0}
            />
          )}
        </div>

        {/* Dev metrics panel (?dev=1 or localStorage.catchwords_dev=1) */}
        {devOn && (
          <DevMetrics
            values={{
              detect_ms: detectMs,
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

/**
 * 語の印を押したときに出る札。**scan の中でいちばん読む所**で、
 * 出会い方(はじめて / 持っている / 再会)で見た目が変わる。
 *
 * `export` にしたのは検査の雛形から描くため。ここは `<video>` を使わない —
 * scan で映像が要るのは撮る前の1箇所だけで、**撮った後の面は静止画で全部
 * 描ける**(`capture` と同じ構図だった)。
 */
export function ScanChip({
  headword,
  zhuyin,
  pinyin,
  meaning,
  pos,
  verified,
  state,
  foundAt,
  candidates,
  onPickCandidate,
  onPlay,
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
  candidates: string[];
  onPickCandidate: (h: string) => void;
  onPlay: () => void;
  onCatch: () => void;
  onClose: () => void;
}) {
  const t = useT();
  if (candidates.length > 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 shadow-md">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-body font-medium text-muted-foreground">{t("scan.whichOne")}</p>
          <button
            onClick={onClose}
            aria-label={t("common.close")}
            // **出口は 44px を割らない。** この札は画面を覆っていて、ここが
            // 唯一の出口。小さいほど「閉じられない」に直結する
            // (同じ事をスキャンの詳細シートで直したのに、こちらへ伝わって
            // いなかった)。
            className="-mr-2 grid h-11 w-11 place-items-center rounded-full text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {candidates.map((c) => (
            <button
              key={c}
              onClick={() => onPickCandidate(c)}
              className="rounded-full bg-amber-100 px-4 py-2.5 text-body font-semibold text-amber-900 ring-1 ring-amber-200 active:scale-95 motion-reduce:active:scale-100 dark:bg-amber-500/20 dark:text-amber-100 dark:ring-amber-400/30"
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
        <p className="mb-2 rounded-xl bg-amber-100 px-3 py-1.5 text-footnote font-semibold text-amber-900 dark:bg-amber-500/20 dark:text-amber-100">
          {t("scan.foundDaysAgoBefore", { n: daysAgo(foundAt) })}
          <Zh>{headword}</Zh>
          {t("scan.foundDaysAgoAfter")}
        </p>
      )}
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <h2 lang="zh-Hant" className="text-title font-bold tracking-tight">
              {headword}
            </h2>
            {state === "owned" && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-secondary px-2 py-0.5 text-caption font-semibold text-muted-foreground">
                <Check className="h-3 w-3 text-ok" /> {t("scan.ownedTag")}
              </span>
            )}
            {verified ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-caption font-semibold text-emerald-900 ring-1 ring-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-200 dark:ring-emerald-400/30">
                {t("scan.verified")}
              </span>
            ) : (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-caption font-semibold text-amber-900 ring-1 ring-amber-200 dark:bg-amber-500/20 dark:text-amber-200 dark:ring-amber-400/30">
                {t("scan.aiUnverified")}
              </span>
            )}
          </div>
          <div lang="zh-Hant" className="mt-0.5 text-footnote text-muted-foreground">
            {zhuyin} {pinyin && <span className="ml-2">{pinyin}</span>}
          </div>
          <p className="mt-2 text-body font-medium">{meaning}</p>
          {pos && (
            <span className="mt-1 inline-block rounded-full bg-violet-100 px-2 py-0.5 text-caption font-medium text-violet-900 ring-1 ring-violet-200 dark:bg-violet-500/20 dark:text-violet-200 dark:ring-violet-400/30">
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
      {/* **「細かく」を消した**(オーナー指示 2026-08-27 ⑱
          「スキャンの細かいボタン削除」)。押した所を切り出して2度目の
          検出を掛ける道で、部品の印が親の印の上に重なって出ていた。
          押す物はこの面に「キャッチ」1つでいい。 */}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={onCatch}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-primary px-3 py-3 text-body font-semibold text-primary-foreground shadow-md shadow-primary/20 active:scale-95 motion-reduce:active:scale-100"
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
    { key: "lookup_ms", label: "辞書照合" },
    { key: "tap_to_audio_ms", label: "タップ→音声 (§9 ≤1000ms)" },
    { key: "prefetch_ms", label: "詳細プリフェッチ (§9 ≤500ms表示)" },
    { key: "catch_ms", label: "キャッチ完了" },
  ];
  return (
    <div className="rounded-xl border border-dashed border-amber-400 bg-amber-50/70 p-3 text-footnote">
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
                  <span className="ml-1 text-caption opacity-60">/ {t}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-2 text-caption text-amber-900/70">
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

/**
 * 撮った後に下へ出る**候補の箱**。箱の中だけが縦に動く。
 *
 * （オーナー指示 2026-09-23「スキャンの単語は一番下に単語の候補を表示し、
 *  縦にスクロールできるようにする。画面は固定し、スクロールするとボックスの
 *  なかの単語の候補が見える」。前日の「候補1行…光の点が大きくなったり、
 *  揺れる」も続けて満たす）
 *
 *  ・箱は**一番下の1行ぶん**（2026-09-23 の指示で2行半から変更）。中の候補は
 *    1語1行で、縦に払うと1行ずつ替わる。写真と画面は動かない
 *    （`overscroll-contain` で、箱の端で画面ごと引っぱられない）。
 *    右に「何件中の何件目」を小さく出し、下にまだあることを伝える。
 *  ・送って**箱の真ん中に来た候補**が「いま見ている候補」になり、写真の上の
 *    その光の点が大きくなって揺れる（`onFocus`）。押すと札が開く。
 *  ・写真の上の点を押したときは、箱のほうもその候補を真ん中へ送る。
 *  ・**右下の端**の丸い釦で撮り直す（以前の「もう一度」と「再スキャン」は、
 *    どちらも覗く画面へ戻るだけなので1つにした）。
 *  ・行を押すと**撮影モードと同じ流れ**で足す（`onOpen`）。
 *  ・出会い方は色だけに頼らない: 持っている語はチェック、再会は字の札。
 */
export function ScanCandidateStrip({
  items,
  scanCtx,
  activeId,
  onFocus,
  onOpen,
  onAgain,
  nothingFound = false,
}: {
  items: DetectedItem[];
  scanCtx: ScanCtx | undefined;
  activeId: string | null;
  onFocus: (id: string) => void;
  onOpen: (it: DetectedItem) => void;
  onAgain: () => void;
  nothingFound?: boolean;
}) {
  const t = useT();
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef(0);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  /**
   * 箱を**こちらから**送っている間は、送りの途中で真ん中を通り過ぎる候補に
   * 注目を移さない。移すと、点を押して選んだ候補が送りの途中の別の候補に
   * 奪われる（実測: 「吸管」の点を押しても、送り終わると「珍珠」が光っていた）。
   */
  const programmaticUntil = useRef(0);

  // 最初は先頭の候補に注目する（何も光っていないと、箱と点の対応が読めない）。
  useEffect(() => {
    if (!activeId && items[0]) onFocus(items[0].id);
  }, [activeId, items, onFocus]);

  // 点を押して注目が移ったら、箱もその候補を真ん中へ。
  useEffect(() => {
    if (!activeId) return;
    const el = rowRefs.current.get(activeId);
    const sc = scrollerRef.current;
    if (!el || !sc) return;
    const max = sc.scrollHeight - sc.clientHeight;
    const target = Math.max(
      0,
      Math.min(max, el.offsetTop + el.offsetHeight / 2 - sc.clientHeight / 2),
    );
    if (Math.abs(sc.scrollTop - target) < 4) return;
    const reduce = motionReducedNow();
    programmaticUntil.current = performance.now() + (reduce ? 100 : 700);
    sc.scrollTo({ top: target, behavior: reduce ? "auto" : "smooth" });
  }, [activeId]);

  const onScroll = () => {
    if (performance.now() < programmaticUntil.current) return;
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      const sc = scrollerRef.current;
      if (!sc) return;
      // 横の列と同じ選び方を、縦に読み替えて使う。
      const boxes = items.map((it) => {
        const el = rowRefs.current.get(it.id);
        return { left: el?.offsetTop ?? 0, width: el?.offsetHeight ?? 0 };
      });
      const i = focusedIndex(boxes, {
        scrollLeft: sc.scrollTop,
        width: sc.clientHeight,
        scrollWidth: sc.scrollHeight,
      });
      if (i >= 0 && items[i].id !== activeId) onFocus(items[i].id);
    });
  };
  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  return (
    <div className="flex items-end gap-2" data-scan-strip>
      {nothingFound ? (
        <div className="min-w-0 flex-1 rounded-2xl px-3 py-2 shadow-lg material-thick">
          <p className="text-footnote font-medium">{t("scan.nothingFound")}</p>
          <p className="ja-phrase text-caption text-muted-foreground">
            {t("scan.nothingFoundHint")}
          </p>
        </div>
      ) : (
        <div className="relative min-w-0 flex-1 overflow-hidden rounded-3xl shadow-lg material-thick">
          {items.length > 1 && (
            // 1行しか見えないので、**まだ下にある**ことを数で言う。
            <span
              aria-hidden
              className="pointer-events-none absolute right-3 top-1/2 z-10 flex -translate-y-1/2 items-center gap-0.5 text-caption tabular-nums text-muted-foreground"
            >
              {Math.max(1, items.findIndex((it) => it.id === activeId) + 1)}/{items.length}
              <ChevronsUpDown className="h-3.5 w-3.5" />
            </span>
          )}
          <div
            ref={scrollerRef}
            onScroll={onScroll}
            role="listbox"
            aria-label={t("scan.found")}
            className="scan-box relative snap-y snap-mandatory overflow-y-auto overscroll-contain p-1"
          >
            {items.map((it) => {
              const st = dotStateFor(it.headword, scanCtx);
              const on = it.id === activeId;
              return (
                <button
                  key={it.id}
                  ref={(el) => {
                    if (el) rowRefs.current.set(it.id, el);
                    else rowRefs.current.delete(it.id);
                  }}
                  role="option"
                  aria-selected={on}
                  onClick={() => onOpen(it)}
                  className={`press-in flex min-h-12 w-full snap-center items-center gap-2.5 rounded-2xl pl-3 pr-16 text-left transition-[box-shadow,background-color] ${
                    on ? "bg-card shadow-sm ring-2 ring-primary" : ""
                  }`}
                >
                  <span
                    aria-hidden
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                      st === "owned"
                        ? "bg-emerald-400"
                        : st === "reunion"
                          ? "bg-amber-400"
                          : "bg-sky-400"
                    }`}
                  />
                  <span lang="zh-Hant" className="shrink-0 text-body font-semibold">
                    {it.headword}
                  </span>
                  {it.zhuyin && (
                    <span className="shrink-0 text-caption text-muted-foreground">{it.zhuyin}</span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-footnote text-muted-foreground">
                    {it.meaning_ja}
                  </span>
                  {st === "owned" ? (
                    <Check
                      className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                      aria-label={t("scan.owned")}
                    />
                  ) : st === "reunion" ? (
                    <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-caption font-semibold text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">
                      {t("scan.reunion")}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {/* 撮り直しは**右下の端**（オーナー指示 2026-09-23）。親指の届く所で、
          候補の行を押す指と重ならない。 */}
      <button
        onClick={onAgain}
        aria-label={t("scan.again")}
        className="press-in grid h-12 w-12 shrink-0 place-items-center rounded-full shadow-lg material-thick"
      >
        <RotateCcw className="h-5 w-5" />
      </button>
    </div>
  );
}

/**
 * 撮ったのに何も見つからなかった面。
 *
 * **これは失敗ではなく結果**なので、赤くも警告にもしない。次にどうすれば
 * よいかを一言添える。撮った写真の上に乗るガラスのシート。
 */
export function ScanNothingFound() {
  const t = useT();
  // ガラスは 80% だった。**後ろは撮った写真**なので、暗い被写体の上では
  // 面が中間色に寄り、副次の文字が 4.17:1 まで落ちていた(実測)。
  // 何が後ろに来ても読めるところまで濃くする — 下のタブ帯で同じ話を
  // オーナーから受けている(「後ろ透けないようにして」)。
  return (
    <div className="rounded-2xl p-4 text-center shadow-lg material-thick">
      <p className="text-body font-medium">{t("scan.nothingFound")}</p>
      <p className="ja-phrase mt-1 text-balance text-footnote text-muted-foreground">
        {t("scan.nothingFoundHint")}
      </p>
    </div>
  );
}

/**
 * 覗いている間だけカメラの上に載る操作。**前後の切替と倍率。**
 *
 * 前後の切替は 2026-08-19 に足した所で、それまで背面固定だった。
 * ここを部品として出すのは、**映像の上に載る操作は雛形で撮れないと
 * 一度も測られない**から。偽の映像は流せないので、雛形では同じ寸法の
 * 暗い面を敷いて、その上に載せて測る。
 *
 * 左右に分けて置く理由: 同じ側に積むと、倍率を持たない前面カメラへ
 * 替えた瞬間に切替ボタンの位置が飛ぶ。倍率つまみは条件付きで出るが、
 * 切替は覗いている間つねに出す。
 */
export function ScanCameraControls({
  hidden,
  facing,
  onFlip,
  showZoom,
  zoom,
  zoomMin,
  zoomMax,
  onZoom,
  zoomBottom = "1rem",
}: {
  /** 撮った絵を止めている間は操作を出さない。 */
  hidden: boolean;
  facing: "environment" | "user";
  onFlip: () => void;
  /** 倍率を持たない端末では出さない(動かないつまみを置かない)。 */
  showZoom: boolean;
  zoom: number;
  zoomMin: number;
  zoomMax: number;
  onZoom: (v: number) => void;
  /**
   * 倍率の粒を、画面の下端からどれだけ上に置くか（CSSの長さ）。
   *
   * **呼ぶ側が渡す。** ここは `fixed inset-0` のカメラ面の中なので、
   * 「下端から 16px」は**画面の下端から 16px**という意味になる。
   * そこには下のタブ帯（下端から 8px・高さ 63px）が浮いていて、
   * 粒 54px のうち **47px が帯の裏に入る**（実測。`scan-bottom` の面）。
   * 帯の裏から暗いカプセルが少しだけ覗く、あの「被っているもの」が
   * これ（オーナー報告 2026-09-16「スキャンモードの時に一番下に
   * ある被ってるもの消して」）。
   *
   * 撮る画面では、倍率は**映像の箱の下端**＝操作の帯のすぐ上に付いて
   * いて、帯とは重ならない。同じ位置になるよう、スキャンでは操作
   * シートの高さを測って渡す。
   */
  zoomBottom?: string;
}) {
  if (hidden) return null;
  return (
    <>
      {/*
        倍率。**縦のスライダーをやめ、iPhone と同じ丸い粒にした**
        (オーナー指示 2026-09-15「Apple風のズームメーターを付けて」)。
        0.1 刻みのスライダーは片手では狙った値に止まらず、しかも
        その端末に無い倍率まで動かせていた。粒は押せばそこへ飛ぶ。
        置き場所も撮る画面と揃えて、映像の下端の中央にする。
      */}
      {showZoom && (
        <div className="absolute inset-x-0 z-10 flex justify-center" style={{ bottom: zoomBottom }}>
          <CameraZoomMeter zoom={zoom} min={zoomMin} max={zoomMax} onZoom={onZoom} />
        </div>
      )}
    </>
  );
}

/**
 * 撮った枠の上に乗る、見つけた語の印。**scan の中心**。
 *
 * 出会い方で光の色が変わる(はじめて=白 / 持っている=緑 / 再会=琥珀)。
 * 印そのものは 16px だが、当たり判定は 44px に広げてある — カメラの上の
 * この印がこの画面の主な操作だから。
 *
 * `<video>` は使わない。印は**撮った静止画の上**に置かれるので、
 * 写真さえ渡せば実物と同じ絵になる。
 */
export function ScanDots({
  items,
  scanCtx,
  dotStyle,
  onOpen,
  activeId = null,
}: {
  items: DetectedItem[];
  scanCtx: ScanCtx | undefined;
  /** 印を置く位置。枠の大きさに依るので、計算はルート側に残す。 */
  dotStyle: (it: DetectedItem) => React.CSSProperties;
  /** 印を押したとき。 */
  onOpen: (it: DetectedItem) => void;
  /** 下の列で注目している候補。その印が大きくなって揺れる。 */
  activeId?: string | null;
}) {
  const t = useT();
  const visibleItems = items;
  const openChip = onOpen;
  return (
    <>
      {/* dots — §3.1b 4-state discovery radar */}
      {visibleItems.map((it) => {
        const low = it.confidence < 0.75;
        const isText = it.kind === "text";
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
            data-active={it.id === activeId || undefined}
            // §11: the dot is 16px but the tap target is padded to the 44px
            // floor — these on-camera markers are the primary interaction.
            // 注目中の印は前へ出す（大きくなった光が隣の印の下に潜らない）。
            className={`scan-dot absolute -translate-x-1/2 -translate-y-1/2 grid h-11 w-11 place-items-center transition-transform active:scale-90 motion-reduce:transition-none motion-reduce:active:scale-100 ${
              it.id === activeId ? "z-10" : ""
            }`}
            aria-label={`${it.headword}${it.zhuyin ? ` ${it.zhuyin}` : ""} — ${state === "owned" ? t("scan.owned") : state === "reunion" ? t("scan.reunion") : "新しい"}`}
          >
            <span
              className={[
                "scan-dot__core block h-4 w-4 rounded-full ring-1 backdrop-blur-[1px]",
                marker,
                low ? "opacity-70" : "",
              ].join(" ")}
            />
            {isText && state !== "owned" && (
              // **印の色はテーマに従わない**(写真の上に置く光なので、
              // 白・緑・琥珀に固定してある)。その上に載せる字だけ
              // `text-foreground/70` にしていたので、暗いテーマでは
              // **白い印の上の白い字**になって消えていた(実測 1.06:1)。
              // 地が固定なら、字も固定にする。
              <span className="pointer-events-none absolute inset-0 grid place-items-center text-caption font-bold text-black/70">
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
              <span className="pointer-events-none absolute -bottom-1 rounded-full bg-amber-400 px-1 text-caption font-bold text-black">
                ?
              </span>
            )}
            {/* 単語+発音をスキャン直後から表示 — タップ前に読み方が分かる。
                  B6: 品詞を小さな色ドットで示す(名詞=白/動詞=ローズ/形容詞=アンバー)。 */}
            <span className="pointer-events-none absolute top-full mt-1 left-1/2 flex max-w-[150px] -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-black/65 px-2 py-0.5 text-center text-caption font-semibold leading-tight text-white backdrop-blur-sm">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${posDotColor(it.pos)}`} />
              <span lang="zh-Hant" className="truncate">
                {it.headword}
                {it.zhuyin && <span className="ml-1 font-normal opacity-90">{it.zhuyin}</span>}
              </span>
            </span>
          </button>
        );
      })}
    </>
  );
}
