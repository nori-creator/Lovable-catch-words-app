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
 *   1) 画面いっぱいの写真と光の点（`coverPoint` で写真に合わせる）
 *   2) 候補の箱（本物の `ScanCandidateStrip`。中だけが縦に動く）
 *   3) 本物の `TabBar`（カメラの中なので暗い）
 *
 * 出会い方3通り（はじめて・持っている・再会）を必ず入れる。
 * `?variant=nothing` で「何も見つからなかった」形。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Camera, Home, Settings, Sparkles } from "lucide-react";
import { TabBar } from "@/components/TabBar";
import { ScanCandidateStrip, ScanDots } from "@/routes/_authenticated/scan";
import { clampToVisible, coverPoint } from "@/lib/scan-layout";

const ITEMS = [
  { label: "ホーム", icon: Home },
  { label: "図鑑", icon: BookOpen },
  { label: "カメラ", icon: Camera, lens: true },
  { label: "復習", icon: Sparkles },
  { label: "設定", icon: Settings },
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

const FOUND = [
  mk("d1", "珍珠奶茶", "ㄓㄣ ㄓㄨ ㄋㄞˇ ㄔㄚˊ", "タピオカミルクティー", [305, 350]),
  mk("d2", "吸管", "ㄒㄧ ㄍㄨㄢˇ", "ストロー", [295, 140]),
  mk("d3", "杯子", "ㄅㄟ ㄗ˙", "コップ", [720, 505]),
  mk("d4", "半糖", "ㄅㄢˋ ㄊㄤˊ", "甘さ半分", [380, 770], "text"),
  mk("d5", "少冰", "ㄕㄠˇ ㄅㄧㄥ", "氷少なめ", [620, 770], "text"),
  mk("d6", "珍珠", "ㄓㄣ ㄓㄨ", "タピオカ", [270, 450]),
] as never[];

export function ScanResultScene({ q }: { q: URLSearchParams }) {
  const nothing = q.get("variant") === "nothing";
  const items = nothing ? [] : FOUND;
  const [activeId, setActiveId] = useState<string | null>(null);
  const [box, setBox] = useState({ w: 390, h: 844 });
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const [sheetTop, setSheetTop] = useState(844);
  useEffect(() => {
    const measure = () => {
      setBox({ w: window.innerWidth, h: window.innerHeight });
      setSheetTop(sheetRef.current?.getBoundingClientRect().top ?? window.innerHeight);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  // 出会い方: 写真あり → 持っている / 写真なし → 再会 / 載っていない → はじめて
  const ctx = {
    owned: { 杯子: { has_photo: true }, 半糖: { has_photo: false } },
    tappedSet: new Set<string>(),
  } as never;
  const dotStyle = useCallback(
    (it: { point: [number, number] }) =>
      clampToVisible(coverPoint(it.point, { w: 720, h: 1280 }, box), {
        w: box.w,
        bottom: sheetTop,
      }),
    [box, sheetTop],
  );
  return (
    <div className="fixed inset-0 z-20 overflow-hidden bg-black">
      <img src={PHOTO} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <ScanDots
        items={items}
        scanCtx={ctx}
        dotStyle={dotStyle as never}
        onOpen={(it) => setActiveId((it as { id: string }).id)}
        activeId={activeId}
        boxWidth={box.w}
      />
      <div
        ref={sheetRef}
        className="fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 space-y-2 px-4"
      >
        <ScanCandidateStrip
          items={items}
          scanCtx={ctx}
          activeId={activeId}
          onFocus={setActiveId}
          onOpen={(it) => setActiveId(it.id)}
          onAgain={() => {}}
          nothingFound={nothing}
        />
      </div>
      <TabBar cursor={2} indicatorOpacity={0} onCamera>
        {ITEMS.map(({ label, icon: Icon, lens }, i) => (
          <li key={label} className="flex-1">
            <button
              className="tabbar__cell group w-full rounded-full text-caption text-muted-foreground"
              data-tab={i}
            >
              <Icon className={`h-5 w-5 ${lens ? "text-primary" : ""}`} />
              <span>{label}</span>
            </button>
          </li>
        ))}
      </TabBar>
    </div>
  );
}
