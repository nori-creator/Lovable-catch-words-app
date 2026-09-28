import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { PenLine, X } from "lucide-react";
import { PageCurlBook, type BookPage } from "@/components/PageCurlBook";
import { StoryInk, StoryInkView, type StoryItem } from "@/components/StoryInk";
import { HomeScene } from "./home";
import { photo as samplePhoto } from "./peel-sticker";

/**
 * **ホームの上の「月ごとのアルバムの本棚」**（試作・本番のホームは未変更）。
 *
 * > オーナー指示 2026-09-27「アルバムの1番うえに、月ごとのアルバムの本を並べる
 * > 本棚の試作品作って、デザイン案複数提示して。ホームのうえに背表紙で毎月の
 * > ホームアルバムが並んでいて、タップしたらアニメーションとともにアルバムの
 * > 表紙が現れ、ページをめくるとその月のアルバムの写真が見える。それぞれの月の
 * > アルバムの表紙もユーザーが落書き、デザインできるようにして。…リアルな本棚に
 * > 背表紙が並ぶようにして。ホームの上部に並べたい。」
 *
 * - 棚の案は3つ: **A 木の棚**（添付のゲーム棚）/ **B 白い浮き棚**（添付の白い棚）/
 *   **C 図書館**（革の背・題箋・背バンド）。
 * - **本の厚さ = その月に撮った枚数。** 多く撮った月ほど厚い。今月の本には栞が出る。
 * - 背を押すと、本が棚から**引き抜かれ**、宙で**90°回って表紙がこちらを向き**、
 *   画面の真ん中まで来る（3D の本: 背・表紙・小口の3面）。そのままページを
 *   めくれる（`PageCurlBook`、どこを掴んでもめくれる）。
 * - 「表紙に描く」で表紙に落書き（手書き・文字・色。`StoryInk` と同じ操作）。
 *   描いた物は棚の本の表紙とめくる本の表紙の両方に出る。
 */

type Design = "wood" | "white" | "library";
const DESIGNS: Array<{ key: Design; label: string }> = [
  { key: "wood", label: "A 木の棚" },
  { key: "white", label: "B 白い浮き棚" },
  { key: "library", label: "C 図書館" },
];

// ---- その月のデータ（決まった値。撮影・ログインに依らない） -------------------
type Month = { key: string; y: number; m: number; count: number };
const COUNTS = [8, 14, 5, 22, 30, 12, 18, 26, 9, 34, 21, 17];
const MONTHS: Month[] = COUNTS.map((count, i) => {
  const idx = 9 + i; // 2025年10月から
  const y = 2025 + Math.floor(idx / 12);
  const m = (idx % 12) + 1;
  return { key: `${y}-${m}`, y, m, count };
});
const CURRENT = MONTHS[MONTHS.length - 1].key;

/** 棚の案ごとの本の色（月の順に巡る）。 */
const PALETTE: Record<Design, string[]> = {
  wood: [
    "#23365e",
    "#7d2430",
    "#2f5a45",
    "#b58a2c",
    "#1f5f66",
    "#9a4a2e",
    "#5a3564",
    "#5d6a2e",
    "#3e4a5c",
    "#a7552c",
    "#262a33",
    "#6c8a6e",
  ],
  white: [
    "#d9c9b0",
    "#e7c3bd",
    "#b9c8b0",
    "#b7c7d8",
    "#efe4c8",
    "#cbbfd9",
    "#d6ae96",
    "#bcd6c8",
    "#c9c5bd",
    "#eadca0",
    "#d8b3b8",
    "#c3cbd0",
  ],
  library: [
    "#5b1e1e",
    "#6b4423",
    "#1f3d2c",
    "#1d2b4a",
    "#7a4b2a",
    "#3b2a40",
    "#4a4f2a",
    "#6e2d24",
    "#243a3f",
    "#5e3b1d",
    "#2b2b2b",
    "#4b2f24",
  ],
};
const monthColor = (d: Design, i: number) => PALETTE[d][i % PALETTE[d].length];
const EN = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/**
 * 厚さ（px）。**枚数が多いほど厚い**。本物の背は高さの 1/5 ほどしか無いので
 * 細めにするが、指で押せる幅（28px）は下回らせない（高さが 130px 以上あるので
 * 押す面の広さは 44×44 の面積を越える）。
 */
const thickness = (count: number) => Math.round(Math.min(44, 28 + count * 0.5));
/** 高さは本ごとに少し違う（本物の棚は揃っていない）。 */
const heightOf = (d: Design, i: number) => {
  const base = d === "white" ? 126 : 132;
  return base + ((i * 37) % 19);
};

// ---- 写真（その月のページ） --------------------------------------------------
const WORDS = [
  "珍珠奶茶",
  "夜市",
  "腳踏車",
  "芒果",
  "雨傘",
  "捷運",
  "獎學金",
  "便當",
  "公車",
  "面紙",
  "滷肉飯",
  "咖啡",
  "蘋果",
  "書店",
  "颱風",
  "月餅",
];
const tile = (hue: number) =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="hsl(${hue} 45% 62%)"/><circle cx="140" cy="62" r="26" fill="hsl(${hue} 60% 82%)"/><path d="M0 200 L70 110 L120 160 L150 130 L200 190 V200Z" fill="hsl(${hue} 35% 40%)"/></svg>`,
  );

function DayPage({ month, day, n }: { month: Month; day: number; n: number }) {
  const words = [0, 1, 2].slice(0, 2 + ((month.m + day) % 2)).map((k) => {
    const w = WORDS[(month.m * 3 + day * 2 + k) % WORDS.length];
    return {
      w,
      src:
        (month.m + day + k) % 4 === 0
          ? samplePhoto
          : tile((month.m * 29 + k * 67 + day * 13) % 360),
    };
  });
  const date = [3, 12, 24][day];
  const wd = ["日", "月", "火", "水", "木", "金", "土"][
    new Date(month.y, month.m - 1, date).getDay()
  ];
  return (
    <div style={{ position: "absolute", inset: 0, padding: "22px 18px" }}>
      <p style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.5, color: "#2b2723" }}>
        {month.m}月{date}日
        <span style={{ fontSize: 13, fontWeight: 600, marginLeft: 8, color: "#8a8176" }}>
          {wd}曜日
        </span>
      </p>
      <div
        style={{
          marginTop: 14,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "18px 14px",
        }}
      >
        {words.map(({ w, src }, k) => (
          <figure
            key={w}
            style={{
              rotate: `${k % 2 ? 3 : -3}deg`,
              background: "#fffdf8",
              padding: "6px 6px 0",
              borderRadius: 4,
              boxShadow: "0 6px 14px -8px rgb(0 0 0 / .45)",
            }}
          >
            <img
              src={src}
              alt=""
              draggable={false}
              style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 2 }}
            />
            {/* ホームと同じ: 語は写真の下の白い余白に書く。 */}
            <figcaption
              lang="zh-Hant"
              style={{
                height: 30,
                display: "grid",
                placeItems: "center",
                fontSize: 16,
                fontWeight: 700,
                color: "#3a3128",
              }}
            >
              {w}
            </figcaption>
          </figure>
        ))}
      </div>
      <p
        style={{
          position: "absolute",
          bottom: 12,
          right: 16,
          fontSize: 11,
          color: "#a39a8e",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {n}
      </p>
    </div>
  );
}

// ---- 表紙 ---------------------------------------------------------------------
type CoverState = { color?: string; window: boolean; items: StoryItem[] };
const full: CSSProperties = { position: "absolute", inset: 0 };

/** 布・紙・革の地（棚の案ごと）。 */
function material(d: Design, color: string): string {
  if (d === "wood")
    // 布装: 縦横の織り目。
    return `repeating-linear-gradient(0deg, rgb(255 255 255 / .04) 0 1px, transparent 1px 3px),
      repeating-linear-gradient(90deg, rgb(0 0 0 / .07) 0 1px, transparent 1px 3px), ${color}`;
  if (d === "white")
    // 並製本のマットな紙: ごく細かい粒だけ。
    return `radial-gradient(rgb(0 0 0 / .035) 0.6px, transparent 0.8px) 0 0 / 3px 3px, ${color}`;
  // 革: まだらな艶。
  return `radial-gradient(120% 80% at 30% 20%, rgb(255 255 255 / .1), transparent 60%),
    radial-gradient(90% 60% at 80% 90%, rgb(0 0 0 / .25), transparent 70%), ${color}`;
}
const inkOn = (d: Design) => (d === "white" ? "#3b3630" : "#e7cf8e");

function Cover({
  design,
  month,
  index,
  cover,
  withItems = true,
}: {
  design: Design;
  month: Month;
  index: number;
  cover: CoverState;
  withItems?: boolean;
}) {
  const color = cover.color ?? monthColor(design, index);
  const ink = inkOn(design);
  return (
    <div style={{ ...full, background: material(design, color), overflow: "hidden" }}>
      {/* 背の側の溝（ハードカバーの蝶番）。 */}
      {design !== "white" && (
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 14,
            width: 3,
            background: "linear-gradient(90deg, rgb(0 0 0 / .25), rgb(255 255 255 / .12))",
          }}
        />
      )}
      <div style={{ position: "absolute", top: "9%", left: 0, right: 0, textAlign: "center" }}>
        <p
          style={{
            fontSize: 12,
            letterSpacing: 6,
            fontWeight: 700,
            color: ink,
            opacity: 0.85,
          }}
        >
          {month.y}
        </p>
        <p
          style={{
            marginTop: 4,
            fontFamily: design === "library" ? "'Hiragino Mincho ProN', Georgia, serif" : undefined,
            fontSize: 44,
            fontWeight: 800,
            letterSpacing: -1,
            lineHeight: 1,
            color: ink,
            textShadow: design === "white" ? "none" : "0 1px 0 rgb(0 0 0 / .35)",
          }}
        >
          {month.m}月
        </p>
        <p style={{ marginTop: 6, fontSize: 11, letterSpacing: 4, color: ink, opacity: 0.7 }}>
          {EN[month.m - 1]} · {month.count}枚
        </p>
      </div>
      {cover.window && (
        <div
          style={{
            position: "absolute",
            left: "22%",
            right: "22%",
            top: "40%",
            aspectRatio: "1",
            padding: 6,
            background: "#fffdf8",
            boxShadow: "inset 0 0 0 1px rgb(0 0 0 / .08), 0 2px 6px rgb(0 0 0 / .3)",
            rotate: "-2deg",
          }}
        >
          <img
            src={samplePhoto}
            alt=""
            draggable={false}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </div>
      )}
      {withItems && <StoryInkView items={cover.items} />}
    </div>
  );
}

// ---- 背表紙 -------------------------------------------------------------------
function Spine({
  design,
  month,
  index,
  w,
  h,
  cover,
}: {
  design: Design;
  month: Month;
  index: number;
  w: number;
  h: number;
  cover: CoverState;
}) {
  const color = cover.color ?? monthColor(design, index);
  const ink = inkOn(design);
  // 丸い背の光（左が影、左寄りに光、右端で落ちる）。
  const round =
    design === "white"
      ? "linear-gradient(90deg, rgb(0 0 0 / .1), rgb(255 255 255 / .18) 30%, transparent 60%, rgb(0 0 0 / .1))"
      : "linear-gradient(90deg, rgb(0 0 0 / .32), rgb(255 255 255 / .16) 24%, rgb(255 255 255 / .04) 46%, rgb(0 0 0 / .12) 78%, rgb(0 0 0 / .34))";
  const band = (top: number) => (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top,
        height: design === "library" ? 5 : 2,
        background:
          design === "library"
            ? "linear-gradient(rgb(255 255 255 / .18), rgb(0 0 0 / .35))"
            : "linear-gradient(90deg, #b8913f, #f1d99a 40%, #b8913f)",
        opacity: design === "library" ? 1 : 0.9,
      }}
    />
  );
  return (
    <div
      style={{
        position: "relative",
        width: w,
        height: h,
        borderRadius: design === "white" ? 2 : "3px 3px 2px 2px",
        background: `${round}, ${material(design, color)}`,
        overflow: "hidden",
      }}
    >
      {design === "wood" && (
        <>
          {band(9)}
          {band(13)}
          {band(h - 15)}
          {band(h - 11)}
        </>
      )}
      {design === "library" && (
        <>
          {band(12)}
          {band(h * 0.62)}
          {band(h * 0.75)}
          {band(h - 17)}
        </>
      )}
      {design === "library" ? (
        // 題箋（生成りの紙の札）に月を書く。
        <div
          style={{
            position: "absolute",
            left: 4,
            right: 4,
            top: 24,
            padding: "4px 0",
            background: "linear-gradient(#efe4c6, #dccfa9)",
            boxShadow: "inset 0 0 0 1px rgb(90 60 20 / .35)",
            textAlign: "center",
            color: "#3a2a16",
            fontFamily: "'Hiragino Mincho ProN', Georgia, serif",
            lineHeight: 1.05,
          }}
        >
          <div style={{ fontSize: 17, fontWeight: 700 }}>{month.m}</div>
          <div style={{ fontSize: 8, letterSpacing: 0.5 }}>{month.y}</div>
        </div>
      ) : design === "white" ? (
        <>
          <div
            style={{
              position: "absolute",
              top: 8,
              left: 0,
              right: 0,
              textAlign: "center",
              fontSize: 15,
              fontWeight: 800,
              color: ink,
            }}
          >
            {month.m}
          </div>
          <div
            style={{
              position: "absolute",
              top: 30,
              left: "50%",
              translate: "-50% 0",
              writingMode: "vertical-rl",
              fontSize: 9,
              letterSpacing: 2.5,
              fontWeight: 700,
              color: ink,
              opacity: 0.75,
            }}
          >
            {EN[month.m - 1]} {month.y}
          </div>
        </>
      ) : (
        <>
          <div
            style={{
              position: "absolute",
              top: 20,
              left: "50%",
              translate: "-50% 0",
              writingMode: "vertical-rl",
              fontSize: 16,
              fontWeight: 800,
              color: ink,
              textShadow: "0 1px 0 rgb(0 0 0 / .4)",
            }}
          >
            {/* 縦書きでも数字は立てる（2桁は1マスに収める＝縦中横）。 */}
            <span style={{ textCombineUpright: "all" }}>{month.m}</span>月
          </div>
          <div
            style={{
              position: "absolute",
              bottom: 20,
              left: 0,
              right: 0,
              textAlign: "center",
              fontSize: 8,
              fontWeight: 700,
              color: ink,
              opacity: 0.8,
            }}
          >
            {month.y}
          </div>
        </>
      )}
      {/* 表紙に描いた物がある本は、背にも小さな印（描いた色）を付ける。 */}
      {cover.items.length > 0 && (
        <div
          style={{
            position: "absolute",
            bottom: design === "wood" ? 34 : design === "library" ? 26 : 10,
            left: "50%",
            width: 7,
            height: 7,
            translate: "-50% 0",
            borderRadius: 99,
            background: "#ff375f",
            boxShadow: "0 0 0 1.5px rgb(255 255 255 / .8)",
          }}
        />
      )}
    </div>
  );
}

// ---- 棚 -----------------------------------------------------------------------
const SHELF: Record<
  Design,
  { back: string; plankTop: string; plankFront: string; pad: string; radius: number }
> = {
  wood: {
    back: `repeating-linear-gradient(90deg, rgb(0 0 0 / .05) 0 2px, transparent 2px 23px),
      linear-gradient(180deg, #3a2415, #4d311d 60%, #3a2415)`,
    plankTop: "linear-gradient(#d6a870, #b98650)",
    plankFront: `repeating-linear-gradient(90deg, rgb(90 50 20 / .18) 0 1px, transparent 1px 7px, rgb(255 230 190 / .08) 7px 9px, transparent 9px 17px),
      linear-gradient(#b17c47, #8e5d31)`,
    pad: "14px",
    radius: 14,
  },
  white: {
    back: "radial-gradient(120% 90% at 50% 0%, #fbfaf7, #efece6)",
    plankTop: "linear-gradient(#ffffff, #f4f3f0)",
    plankFront: "linear-gradient(#fbfbfa, #ebeae6)",
    pad: "18px",
    radius: 14,
  },
  library: {
    back: `repeating-linear-gradient(90deg, rgb(255 255 255 / .025) 0 1px, transparent 1px 11px),
      linear-gradient(180deg, #1d130d, #2b1c12 60%, #1d130d)`,
    plankTop: "linear-gradient(#6b4a31, #553823)",
    plankFront: "linear-gradient(#5a3b24, #402817)",
    pad: "14px",
    radius: 10,
  },
};

function YearMark({ design, y }: { design: Design; y: number }) {
  // 年の変わり目に立てる**ブックエンド**。
  const style: CSSProperties =
    design === "white"
      ? {
          background: "linear-gradient(90deg,#fff,#eeede9)",
          color: "#8b867d",
          boxShadow: "1px 0 3px rgb(0 0 0 / .12)",
        }
      : design === "wood"
        ? {
            background: "linear-gradient(90deg,#c9975f,#a8773f)",
            color: "#4a2d14",
            boxShadow: "2px 0 4px rgb(0 0 0 / .35)",
          }
        : {
            background: "linear-gradient(90deg,#c9a55a,#8f7234)",
            color: "#2a1d0c",
            boxShadow: "2px 0 4px rgb(0 0 0 / .45)",
          };
  return (
    <div
      aria-hidden="true"
      style={{
        ...style,
        flex: "none",
        width: 16,
        height: 64,
        borderRadius: "3px 3px 0 0",
        writingMode: "vertical-rl",
        display: "grid",
        placeItems: "center",
        fontSize: 9,
        fontWeight: 800,
        letterSpacing: 1,
        margin: "0 4px",
      }}
    >
      {y}
    </div>
  );
}

function Shelf({
  design,
  covers,
  hiddenKey,
  onOpen,
}: {
  design: Design;
  covers: Record<string, CoverState>;
  hiddenKey: string | null;
  onOpen: (key: string, el: HTMLElement) => void;
}) {
  const s = SHELF[design];
  const scroller = useRef<HTMLDivElement>(null);
  // 最新（今月）は右の端。開いたときに見えている所から始める。
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [design]);
  return (
    <div
      style={{
        position: "relative",
        borderRadius: s.radius,
        background: s.back,
        overflow: "hidden",
        boxShadow:
          design === "white"
            ? "inset 0 0 0 1px rgb(0 0 0 / .04)"
            : "inset 0 10px 24px rgb(0 0 0 / .45), 0 10px 24px -14px rgb(0 0 0 / .5)",
      }}
    >
      <div
        ref={scroller}
        role="list"
        aria-label="月ごとのアルバム"
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: design === "white" ? 3 : 1,
          padding: `${s.pad} 16px 0`,
          overflowX: "auto",
          scrollbarWidth: "none",
          minHeight: 176,
        }}
      >
        {MONTHS.map((mo, i) => {
          const prev = MONTHS[i - 1];
          const cover = covers[mo.key];
          const w = thickness(mo.count);
          const h = heightOf(design, i);
          return (
            <div key={mo.key} role="listitem" style={{ display: "flex", alignItems: "flex-end" }}>
              {(!prev || prev.y !== mo.y) && <YearMark design={design} y={mo.y} />}
              <button
                type="button"
                aria-label={`${mo.y}年${mo.m}月のアルバム（${mo.count}枚）`}
                data-spine={mo.key}
                onClick={(e) => onOpen(mo.key, e.currentTarget)}
                className="album-spine"
                style={{
                  position: "relative",
                  flex: "none",
                  padding: 0,
                  border: 0,
                  background: "none",
                  visibility: hiddenKey === mo.key ? "hidden" : undefined,
                  filter:
                    design === "white"
                      ? "drop-shadow(1px 0 1.5px rgb(0 0 0 / .14))"
                      : "drop-shadow(2px 0 2px rgb(0 0 0 / .45))",
                }}
              >
                <Spine design={design} month={mo} index={i} w={w} h={h} cover={cover} />
                {/* 今月の本には栞（しおり）の紐が上から覗く。 */}
                {mo.key === CURRENT && (
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      top: -12,
                      left: "58%",
                      width: 4,
                      height: 18,
                      borderRadius: 2,
                      background: "linear-gradient(90deg, #c62d3a, #e0535d)",
                      rotate: "8deg",
                    }}
                  />
                )}
              </button>
            </div>
          );
        })}
        {/* 右の端のブックエンド（白い棚は小さな鉢も置く）。 */}
        {design === "white" ? (
          <div
            aria-hidden="true"
            style={{ flex: "none", marginLeft: 14, display: "grid", justifyItems: "center" }}
          >
            <div
              style={{
                width: 34,
                height: 30,
                borderRadius: "50% 50% 40% 40%",
                background: "radial-gradient(circle at 40% 40%, #8fb08a, #5d7f58)",
                marginBottom: -4,
              }}
            />
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: "3px 3px 8px 8px",
                background: "linear-gradient(90deg, #e6dccd, #d4c7b3)",
              }}
            />
          </div>
        ) : (
          <div aria-hidden="true" style={{ flex: "none", width: 12 }} />
        )}
      </div>
      {/* 棚板: 上の面と前の面。 */}
      <div style={{ height: 7, background: s.plankTop }} />
      <div
        style={{
          height: design === "white" ? 10 : 16,
          background: s.plankFront,
          boxShadow:
            design === "white"
              ? "0 12px 16px -10px rgb(0 0 0 / .28)"
              : "inset 0 -2px 3px rgb(0 0 0 / .3)",
        }}
      />
      {design === "white" && <div style={{ height: 14 }} />}
    </div>
  );
}

// ---- 本を開く（3D） ------------------------------------------------------------
type Opening = {
  key: string;
  phase: "opening" | "open" | "closing";
  from: DOMRect;
};

const reduceMotion = () =>
  typeof document !== "undefined" && document.documentElement.dataset.motion === "reduce";

function useStage() {
  const [vp, setVp] = useState({ w: 390, h: 844 });
  useEffect(() => {
    const set = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    set();
    window.addEventListener("resize", set);
    return () => window.removeEventListener("resize", set);
  }, []);
  const W = Math.min(vp.w - 40, 340);
  const H = Math.round(W * 1.38);
  const cx = vp.w / 2;
  const cy = Math.min(vp.h / 2 - 20, 24 + 60 + H / 2);
  return { W, H, cx, cy };
}

function OpenBook({
  design,
  month,
  index,
  cover,
  opening,
  onOpened,
  onClosed,
  onClose,
  onEdit,
}: {
  design: Design;
  month: Month;
  index: number;
  cover: CoverState;
  opening: Opening;
  onOpened: () => void;
  onClosed: () => void;
  onClose: () => void;
  onEdit: () => void;
}) {
  const { W, H, cx, cy } = useStage();
  const book = useRef<HTMLDivElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const coverShade = useRef<HTMLDivElement>(null);
  const [showFlat, setShowFlat] = useState(false);
  const [hide3d, setHide3d] = useState(false);

  const sw = opening.from.width;
  const sh = opening.from.height;
  const s = sh / H; // 背の高さに合わせた縮み
  const T = sw / s; // 本の厚さ（開いた大きさで）

  const at = (x: number, y: number, k: number, deg: number) =>
    `translate3d(${x - W / 2}px, ${y - H / 2}px, 0) scale3d(${k}, ${k}, ${k}) rotateY(${deg}deg)`;
  const fromX = opening.from.left + sw / 2;
  const fromY = opening.from.top + sh / 2;

  useLayoutEffect(() => {
    const el = book.current;
    if (!el) return;
    const reduce = reduceMotion();
    if (opening.phase === "opening") {
      setShowFlat(false);
      setHide3d(false);
      const frames: Keyframe[] = reduce
        ? [
            { transform: at(cx, cy, 1, 0), opacity: 0 },
            { transform: at(cx, cy, 1, 0), opacity: 1 },
          ]
        : [
            { transform: at(fromX, fromY, s, 90), easing: "cubic-bezier(.3,.0,.4,1)" },
            // ① 棚から上へ引き抜く（背の高さの 1/4 ほど）。
            {
              transform: at(fromX, fromY - sh * 0.28, s * 1.03, 88),
              offset: 0.2,
              easing: "cubic-bezier(.2,.8,.2,1)",
            },
            // ② 宙で回りながら真ん中へ。少しだけ行き過ぎて戻る（紙の重さ）。
            { transform: at(cx, cy, 1.015, -2), offset: 0.86, easing: "cubic-bezier(.3,0,.3,1)" },
            { transform: at(cx, cy, 1, 0) },
          ];
      const a = el.animate(frames, { duration: reduce ? 200 : 820, fill: "forwards" });
      scrim.current?.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: reduce ? 200 : 520,
        fill: "forwards",
      });
      // 表紙は横を向いている間は暗く、正面を向くにつれ明るくなる。
      coverShade.current?.animate(
        [{ opacity: 0.7 }, { opacity: 0.7, offset: 0.2 }, { opacity: 0 }],
        { duration: reduce ? 1 : 820, fill: "forwards" },
      );
      a.onfinish = () => {
        setShowFlat(true);
        // めくれる本が描かれてから 3D の本を外す（1コマでも空くとチカつく）。
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            setHide3d(true);
            onOpened();
          }),
        );
      };
      return () => a.cancel();
    }
    if (opening.phase === "closing") {
      setHide3d(false);
      setShowFlat(false);
      const frames: Keyframe[] = reduce
        ? [{ opacity: 1 }, { opacity: 0 }]
        : [
            { transform: at(cx, cy, 1, 0), easing: "cubic-bezier(.4,0,.6,1)" },
            {
              transform: at(fromX, fromY - sh * 0.28, s * 1.03, 88),
              offset: 0.78,
              easing: "cubic-bezier(.3,0,.2,1)",
            },
            // 棚に差し戻す。
            { transform: at(fromX, fromY, s, 90) },
          ];
      const a = el.animate(frames, { duration: reduce ? 180 : 620, fill: "forwards" });
      scrim.current?.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: reduce ? 180 : 620,
        fill: "forwards",
      });
      coverShade.current?.animate([{ opacity: 0 }, { opacity: 0.7 }], {
        duration: reduce ? 1 : 620,
        fill: "forwards",
      });
      a.onfinish = onClosed;
      return () => a.cancel();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opening.phase]);

  const pages: BookPage[] = [
    {
      key: "cover",
      content: <Cover design={design} month={month} index={index} cover={cover} />,
      // 表紙の裏は見返し（無地の厚い紙）。
      back: <div style={{ ...full, background: design === "white" ? "#efe9df" : "#e4dac6" }} />,
    },
    ...[0, 1, 2].map((d, i) => ({
      key: `d${d}`,
      content: <DayPage month={month} day={d} n={i + 1} />,
    })),
  ];

  const face: CSSProperties = { position: "absolute", backfaceVisibility: "hidden" };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 90 }}>
      <div
        ref={scrim}
        onClick={opening.phase === "open" ? onClose : undefined}
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0,
          background: "rgb(20 16 12 / .55)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
        }}
      />
      {/* 3D の本（開く・閉じる間だけ）。 */}
      <div style={{ position: "absolute", inset: 0, perspective: 1300, pointerEvents: "none" }}>
        <div
          ref={book}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: W,
            height: H,
            transformStyle: "preserve-3d",
            /* 表紙を z=0 に置き、回す軸は本の厚みの真ん中。開き切った時の表紙が
               遠近で拡大されず、めくれる本と同じ大きさで入れ替われる。 */
            transformOrigin: `50% 50% ${-T / 2}px`,
            transform: at(fromX, fromY, s, 90),
            visibility: hide3d ? "hidden" : undefined,
          }}
        >
          {/* 表紙 */}
          <div
            style={{
              ...face,
              inset: 0,
              borderRadius: "2px 8px 8px 2px",
              overflow: "hidden",
              boxShadow: "0 30px 50px -20px rgb(0 0 0 / .6)",
            }}
          >
            <Cover design={design} month={month} index={index} cover={cover} />
            <div ref={coverShade} style={{ ...full, background: "#000", opacity: 0.7 }} />
          </div>
          {/* 背（棚で見えていた絵をそのまま拡大） */}
          <div
            style={{
              ...face,
              top: 0,
              left: (W - T) / 2,
              width: T,
              height: H,
              transform: `translateZ(${-T / 2}px) rotateY(-90deg) translateZ(${W / 2}px)`,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: sw,
                height: sh,
                transform: `scale(${1 / s})`,
                transformOrigin: "0 0",
              }}
            >
              <Spine design={design} month={month} index={index} w={sw} h={sh} cover={cover} />
            </div>
          </div>
          {/* 小口（ページの束の端） */}
          <div
            style={{
              ...face,
              top: 4,
              left: (W - T) / 2,
              width: T,
              height: H - 8,
              transform: `translateZ(${-T / 2}px) rotateY(90deg) translateZ(${W / 2 - 3}px)`,
              background:
                "repeating-linear-gradient(90deg, #f3ecde 0 1px, #d9cfbd 1px 2px), #efe7d8",
            }}
          />
          {/* 裏表紙 */}
          <div
            style={{
              ...face,
              inset: 0,
              transform: `translateZ(${-T}px) rotateY(180deg)`,
              background: material(design, cover.color ?? monthColor(design, index)),
            }}
          />
        </div>
      </div>
      {/* めくれる本（開き切ったら差し替える。3D の最後のコマと同じ場所・大きさ）。 */}
      {showFlat && (
        <div
          style={{
            position: "absolute",
            left: cx - W / 2,
            top: cy - H / 2,
            width: W,
          }}
        >
          <PageCurlBook pages={pages} />
        </div>
      )}
      {opening.phase === "open" && (
        <>
          <p
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: cy - H / 2 - 40,
              textAlign: "center",
              color: "#fff",
              fontWeight: 700,
              fontSize: 15,
              textShadow: "0 1px 2px rgb(0 0 0 / .4)",
            }}
          >
            {month.y}年{month.m}月 · {month.count}枚
          </p>
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: cy + H / 2 + 16,
              display: "flex",
              justifyContent: "center",
              gap: 10,
            }}
          >
            <button type="button" onClick={onEdit} style={glassBtn}>
              <PenLine size={18} />
              表紙に描く
            </button>
            <button type="button" onClick={onClose} style={glassBtn} aria-label="閉じる">
              <X size={18} />
              閉じる
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const glassBtn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  minHeight: 44,
  padding: "0 16px",
  borderRadius: 999,
  background: "rgb(255 255 255 / .18)",
  border: "1px solid rgb(255 255 255 / .35)",
  color: "#fff",
  fontWeight: 700,
  fontSize: 14,
  backdropFilter: "blur(14px)",
  WebkitBackdropFilter: "blur(14px)",
};

// ---- 表紙に描く ----------------------------------------------------------------
function CoverEditor({
  design,
  month,
  index,
  cover,
  onDone,
  onCancel,
}: {
  design: Design;
  month: Month;
  index: number;
  cover: CoverState;
  onDone: (c: CoverState) => void;
  onCancel: () => void;
}) {
  const [base, setBase] = useState<CoverState>(cover);
  const items = useRef<StoryItem[]>(cover.items);
  const keep = useCallback((v: StoryItem[]) => {
    items.current = v;
  }, []);
  const colors = [
    monthColor(design, index),
    ...PALETTE[design].filter((c) => c !== monthColor(design, index)).slice(0, 6),
  ];
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 95,
        overflowY: "auto",
        background: "rgb(18 16 14 / .94)",
        padding: "12px 16px 40px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <button type="button" onClick={onCancel} style={glassBtn}>
          やめる
        </button>
        <p style={{ color: "#fff", fontWeight: 700 }}>{month.m}月の表紙</p>
        <button
          type="button"
          onClick={() => onDone({ ...base, items: items.current })}
          style={{ ...glassBtn, background: "#0a84ff", borderColor: "#0a84ff" }}
        >
          完了
        </button>
      </div>
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          justifyContent: "center",
          margin: "6px 0 12px",
        }}
      >
        {colors.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`表紙の色 ${c}`}
            aria-pressed={(base.color ?? colors[0]) === c}
            onClick={() => setBase((b) => ({ ...b, color: c }))}
            style={{
              width: 30,
              height: 30,
              borderRadius: 99,
              background: c,
              boxShadow:
                (base.color ?? colors[0]) === c
                  ? "0 0 0 2px #121212, 0 0 0 4px #fff"
                  : "0 0 0 1px rgb(255 255 255 / .3)",
            }}
          />
        ))}
        <button
          type="button"
          aria-pressed={base.window}
          onClick={() => setBase((b) => ({ ...b, window: !b.window }))}
          style={{ ...glassBtn, minHeight: 36, padding: "0 12px", fontSize: 12 }}
        >
          写真 {base.window ? "あり" : "なし"}
        </button>
      </div>
      <div style={{ maxWidth: 340, margin: "0 auto" }}>
        <StoryInk
          initial={cover.items}
          onChange={keep}
          aspect={1.38}
          paperClass=""
          background={
            <Cover design={design} month={month} index={index} cover={base} withItems={false} />
          }
        />
      </div>
      <p
        style={{ color: "rgb(255 255 255 / .6)", fontSize: 12, textAlign: "center", marginTop: 12 }}
      >
        手書き・文字を置いて、指で動かす／2本指で大きさと傾き。ごみ箱へ運ぶと消えます。
      </p>
    </div>
  );
}

// ---- 場面 ---------------------------------------------------------------------
const pill = (on: boolean): CSSProperties => ({
  minHeight: 44,
  padding: "0 12px",
  borderRadius: 999,
  border: "1px solid var(--border)",
  background: on ? "var(--primary)" : "var(--card)",
  color: on ? "var(--primary-foreground)" : "var(--foreground)",
  fontWeight: 600,
  fontSize: 13,
});

/** 見本として、今月の表紙には最初から落書きを置いておく（描けることが一目で分かる）。 */
const SAMPLE_DOODLE: StoryItem[] = [
  {
    id: "d1",
    kind: "text",
    text: "台北の秋",
    font: "signature",
    color: "#ff375f",
    bg: "soft",
    x: 0.5,
    y: 1.2,
    w: 0.56,
    rot: -6,
    z: 1,
  },
  {
    id: "d2",
    kind: "sketch",
    strokes: [
      {
        color: "#ffd60a",
        width: 6,
        pts: [
          [20, 40],
          [10, 20],
          [22, 8],
          [34, 20],
          [46, 8],
          [58, 20],
          [48, 40],
          [34, 54],
          [20, 40],
        ],
      },
    ],
    box: [0, 0, 68, 62],
    x: 0.8,
    y: 0.34,
    w: 0.16,
    rot: 12,
    z: 2,
  },
];

export function AlbumShelfScene({ q }: { q: URLSearchParams }) {
  const [design, setDesign] = useState<Design>(
    DESIGNS.find((d) => d.key === q.get("shelf"))?.key ?? "wood",
  );
  const [covers, setCovers] = useState<Record<string, CoverState>>(() =>
    Object.fromEntries(
      MONTHS.map((m) => [
        m.key,
        { window: true, items: m.key === CURRENT ? SAMPLE_DOODLE : [] } as CoverState,
      ]),
    ),
  );
  const [opening, setOpening] = useState<Opening | null>(null);
  const [editing, setEditing] = useState(false);

  const open = (key: string, el: HTMLElement) => {
    if (opening) return;
    const spine = el.firstElementChild as HTMLElement;
    setOpening({ key, phase: "opening", from: spine.getBoundingClientRect() });
  };
  const index = opening ? MONTHS.findIndex((m) => m.key === opening.key) : -1;

  // `?open=1`: 今月の本を開いた所から撮る（検査用）。
  useEffect(() => {
    if (q.get("open") !== "1") return;
    const t = window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-spine="${CURRENT}"]`);
      if (el) open(CURRENT, el);
    }, 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-3 pb-28">
      <div role="radiogroup" aria-label="本棚の案" className="flex flex-wrap gap-1.5">
        {DESIGNS.map((d) => (
          <button
            key={d.key}
            type="button"
            role="radio"
            aria-checked={design === d.key}
            onClick={() => setDesign(d.key)}
            style={pill(design === d.key)}
          >
            {d.label}
          </button>
        ))}
      </div>
      <p className="text-caption leading-relaxed text-muted-foreground">
        ホームのいちばん上に置く棚です。背を押すと本が引き抜かれ、表紙がこちらを向いて開きます。
        本の厚さは、その月に撮った枚数。今月の本には栞が出ています。
      </p>

      <Shelf design={design} covers={covers} hiddenKey={opening?.key ?? null} onOpen={open} />

      {/* 棚の下は、いつものホーム（今日のアルバム）。 */}
      <HomeScene q={q} />

      {opening && index >= 0 && (
        <OpenBook
          key={`${opening.key}-${design}`}
          design={design}
          month={MONTHS[index]}
          index={index}
          cover={covers[opening.key]}
          opening={opening}
          onOpened={() => setOpening((o) => (o ? { ...o, phase: "open" } : o))}
          onClose={() => {
            // 閉じる前に、背がいまどこに居るかを測り直す（棚が動いていても戻れる）。
            const el = document.querySelector<HTMLElement>(`[data-spine="${opening.key}"]`);
            const r = (el?.firstElementChild as HTMLElement | null)?.getBoundingClientRect();
            setOpening((o) => (o ? { ...o, phase: "closing", from: r ?? o.from } : o));
          }}
          onClosed={() => setOpening(null)}
          onEdit={() => setEditing(true)}
        />
      )}
      {editing && opening && index >= 0 && (
        <CoverEditor
          design={design}
          month={MONTHS[index]}
          index={index}
          cover={covers[opening.key]}
          onCancel={() => setEditing(false)}
          onDone={(c) => {
            setCovers((all) => ({ ...all, [opening.key]: c }));
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}
