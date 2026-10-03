/**
 * スキャンした後の画面を**実物と同じ座標で**組む。
 *
 * （オーナー指摘 2026-09-22「スキャンモードのときに下に文字が被ったり、
 *  出てきた単語の候補の下に黒い余白があったり…スキャンの後は画面下に
 *  単語の候補1行が出てきてスクロールでき、その単語のものの光の点が
 *  大きくなったり、揺れる」）
 *
 * 部品だけを撮ると、部品どうしの重なり（写真の下の黒い地・下の帯との
 * 被り）は一度も写らない。実物と同じ3つを同じ座標で置く:
 *   1) 写真と光の点。写真の箱は操作シートの上まで（本番と同じ `containPoint`）
 *   2) 候補の箱（本物の `ScanCandidateStrip`。中だけが縦に動く）
 *   3) 本物の `TabBar`（カメラの中なので暗い）
 *
 * 出会い方3通り（はじめて・持っている・再会）を必ず入れる。
 * `?variant=nothing` で「何も見つからなかった」形。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Camera, Home, Settings, Sparkles } from "lucide-react";
import { TabBar } from "@/components/TabBar";
import { getUiLang, tStatic } from "@/lib/i18n";
import {
  ScanAgainButton,
  ScanCandidateStrip,
  ScanDots,
  ScanSnapshotPhoto,
} from "@/routes/_authenticated/scan";
import { containPoint } from "@/lib/scan-layout";

// 本番の下のタブと同じ名前（表示言語で）。日本語を直書きすると英語・中文の見本が嘘になる。
const ITEMS = [
  { key: "nav.home", icon: Home },
  { key: "nav.dex", icon: BookOpen },
  { key: "nav.camera", icon: Camera, lens: true },
  { key: "nav.review", icon: Sparkles },
  { key: "nav.settings", icon: Settings },
];

/** 撮った写真の代わり。実物と同じ縦長（720×1280）の絵。 */
const PHOTO =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280">
      <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#5b4632"/><stop offset="1" stop-color="#2b2118"/></linearGradient></defs>
      <rect width="720" height="1280" fill="url(#g)"/>
      <rect x="120" y="300" width="200" height="330" rx="30" fill="#d9b58c"/>
      <rect x="140" y="250" width="160" height="60" rx="14" fill="#f3e3cc"/>
      <rect x="205" y="120" width="14" height="190" fill="#e0564c"/>
      <circle cx="170" cy="560" r="16" fill="#3a2716"/><circle cx="215" cy="585" r="16" fill="#3a2716"/>
      <rect x="420" y="520" width="200" height="260" rx="20" fill="#9fb8c8"/>
      <rect x="80" y="880" width="560" height="170" rx="18" fill="#f5efe4"/>
      <text x="360" y="990" font-size="84" text-anchor="middle" fill="#8a2a1f" font-family="sans-serif">半糖 少冰</text>
    </svg>`,
  );

const mk = (
  id: string,
  headword: string,
  zhuyin: string,
  meaning: string,
  point: [number, number],
  kind: "object" | "text" = "object",
) => ({
  id,
  kind,
  headword,
  zhuyin,
  pinyin: "",
  meaning_ja: meaning,
  pos: "N",
  point,
  confidence: 0.9,
  alternatives: [] as string[],
});

/** 意味は**読む人の言語で**（本番のスキャンは表示言語で意味を返す）。 */
const MEANINGS: Record<string, [string, string, string]> = {
  珍珠奶茶: ["タピオカミルクティー", "bubble tea", "加了粉圓的奶茶"],
  吸管: ["ストロー", "straw", "喝飲料用的管子"],
  杯子: ["コップ", "cup", "裝飲料的容器"],
  半糖: ["甘さ半分", "half sugar", "甜度減半"],
  少冰: ["氷少なめ", "less ice", "冰塊少一點"],
  珍珠: ["タピオカ", "tapioca pearls", "粉圓"],
};
const meaningOf = (w: string) =>
  MEANINGS[w][getUiLang() === "en" ? 1 : getUiLang() === "zh-TW" ? 2 : 0];
// 関数にする: 場面の束は `main.tsx` が表示言語を書く前に読まれるので、読み込んだ時に
// 作ると前の言語のまま固まる。
const found = () =>
  [
    mk("d1", "珍珠奶茶", "ㄓㄣ ㄓㄨ ㄋㄞˇ ㄔㄚˊ", meaningOf("珍珠奶茶"), [305, 350]),
    mk("d2", "吸管", "ㄒㄧ ㄍㄨㄢˇ", meaningOf("吸管"), [295, 140]),
    mk("d3", "杯子", "ㄅㄟ ㄗ˙", meaningOf("杯子"), [720, 505]),
    mk("d4", "半糖", "ㄅㄢˋ ㄊㄤˊ", meaningOf("半糖"), [380, 770], "text"),
    mk("d5", "少冰", "ㄕㄠˇ ㄅㄧㄥ", meaningOf("少冰"), [620, 770], "text"),
    mk("d6", "珍珠", "ㄓㄣ ㄓㄨ", meaningOf("珍珠"), [270, 450]),
  ] as never[];

export function ScanResultScene({ q }: { q: URLSearchParams }) {
  const nothing = q.get("variant") === "nothing";
  const [items] = useState(() => (nothing ? [] : found()));
  const [activeId, setActiveId] = useState<string | null>(null);
  /**
   * **本番と同じ置き方**（2026-09-28）: 写真の箱は上から**操作シートの上まで**。
   * 候補の輪が写真に重ならない（オーナー指摘「候補の表示が後ろの画面にかぶって、
   * ものが隠れてる」）。点は写真と同じ `containPoint` で置く。
   */
  const [box, setBox] = useState({ w: 390, h: 600 });
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const [sheetH, setSheetH] = useState(160);
  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    const measure = () => {
      const h = el.getBoundingClientRect().height;
      setSheetH(h);
      // 本番の `.scan-frame` と同じ: 上は 2.75rem、下は面の上端 + 1.5rem（面の裏まで）。
      const top = 44;
      const bottom = el.getBoundingClientRect().top + 24;
      setBox({ w: window.innerWidth, h: Math.max(200, bottom - top) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  // 出会い方: 写真あり → 持っている / 写真なし → 再会 / 載っていない → はじめて
  const ctx = {
    owned: { 杯子: { has_photo: true }, 半糖: { has_photo: false } },
    tappedSet: new Set<string>(),
  } as never;
  const dotStyle = useCallback(
    (it: { point: [number, number] }) => containPoint(it.point, { w: 720, h: 1280 }, box),
    [box],
  );
  return (
    <div className="fixed inset-0 z-20 overflow-hidden">
      <div className="capture-viewfinder__light fixed inset-0" aria-hidden />
      <div
        className="scan-frame fixed overflow-hidden"
        style={{ height: box.h, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}
        data-scan-photo-box
        data-sheet-h={Math.round(sheetH)}
      >
        <ScanSnapshotPhoto src={PHOTO} />
        <ScanDots
          items={items}
          scanCtx={ctx}
          dotStyle={dotStyle as never}
          onOpen={(it) => setActiveId((it as { id: string }).id)}
          activeId={activeId}
          boxWidth={box.w}
        />
        <ScanAgainButton onAgain={() => {}} />
      </div>
      <div
        ref={sheetRef}
        className="scan-sheet fixed inset-x-0 bottom-0 z-30 space-y-2 pb-[calc(5.25rem+env(safe-area-inset-bottom))] pt-3"
      >
        <ScanCandidateStrip
          items={items}
          scanCtx={ctx}
          activeId={activeId}
          onFocus={setActiveId}
          onOpen={(it) => setActiveId(it.id)}
          nothingFound={nothing}
        />
      </div>
      <TabBar cursor={2} indicatorOpacity={0} onCamera>
        {ITEMS.map(({ key, icon: Icon, lens }, i) => (
          <li key={key} className="flex-1">
            <button
              className="tabbar__cell group w-full rounded-full text-caption text-muted-foreground"
              data-tab={i}
            >
              <Icon className={`h-5 w-5 ${lens ? "text-primary" : ""}`} />
              <span>{tStatic(key)}</span>
            </button>
          </li>
        ))}
      </TabBar>
    </div>
  );
}
