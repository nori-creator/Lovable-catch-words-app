/**
 * **文字で調べた語のキャッチ**（写真の無い回）。
 *
 * オーナー指示 2026-10-08「文字検索したときは検索ボタンを押したらその場でくるくるとロード中に
 * なり、ユーザーが検索したものが学習言語ならそのままシールをはがす場面（シールを表示するときは
 * 必ず画像や発音が表示されてから、画像も変更出来きるように。）に移行し、母語で一対一の関係では
 * なく、複数の単語の候補がある場合…は単語の候補を表示して」:
 *
 * - `?scene=text-searching` … 検索の欄のまま回る（別の待ち画面を出さない）
 * - `?scene=text-candidates` … 母語の「豚の口の周りの肉」が台湾華語で割れた時の候補
 *   （`&case=densha` は「電車」、`&state=preparing` は押した行が回っている間）
 * - `?scene=text-peel-ready` … 絵と発音がそろった札と、その下の「別の画像」
 *
 * 同日のオーナー報告（画面の録画、「貓」を打って調べた回）の札と着地:
 * - `?scene=text-peel-web` … ネットの画像が届いた札
 * - `?scene=text-peel-only` … 画像が届かなかった時の、語を組んだ札
 * - `?scene=text-landing` … 札を剥がして図鑑のカテゴリーのマス目へ着地
 *   （`&art=web` でネットの画像の札、`&dest=header` でマス目がまだ無い回 → カテゴリーの見出しへ）
 *
 * どれも本物の部品を描く（`CaptureObjectPanel` / `TextCandidateList` / `CaptureCardPanel` /
 * `HeroImageChoices` / `PeelSticker` / `runCatchLanding`）。
 */
import { useEffect, useRef, useState } from "react";
import { CaptureCardPanel, CaptureObjectPanel } from "@/components/screens/CaptureScreen";
import { CatchLandingOverlay, runCatchLanding } from "@/components/CatchLanding";
import { HeroImageChoices } from "@/components/HeroImageChoices";
import { TextCandidateList } from "@/components/TextCandidateList";
import { parseCatchAnimation } from "@/lib/catch-animation-pref";
import { textStickerDataUrl } from "@/lib/text-sticker";
import type { TextCandidate } from "@/lib/text-search-flow";

/** ネットの画像の代わり（見本は外へ取りに行かない）。猫の絵。 */
export const WEB_CAT =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#cfe6f5"/><stop offset="1" stop-color="#f6efe4"/></linearGradient></defs><rect width="400" height="400" fill="url(#b)"/><ellipse cx="200" cy="300" rx="120" ry="70" fill="#e59a4c"/><circle cx="200" cy="190" r="92" fill="#f0a95a"/><path d="M122 140 132 60 188 112Z M278 140 268 60 212 112Z" fill="#f0a95a"/><path d="M136 126 142 80 176 112Z M264 126 258 80 224 112Z" fill="#f7c9b0"/><circle cx="166" cy="188" r="11" fill="#2b2b2b"/><circle cx="234" cy="188" r="11" fill="#2b2b2b"/><path d="M190 216h20l-10 10z" fill="#c4656b"/><path d="M200 226c-6 12-22 14-30 6M200 226c6 12 22 14 30 6" stroke="#2b2b2b" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M120 210 70 200M120 222 72 230M280 210 330 200M280 222 328 230" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>',
  );

const CARD = {
  reading_zhuyin: "ㄇㄠ",
  pinyin: "māo",
  meaning_ja: "ネコ",
  part_of_speech: "名詞",
  level: "TOCFL-1",
  category_key: "animal",
  example_sentence: "我家有一隻貓。",
  example_translation: "うちには猫が1匹いる。",
} as never;

const HEAD = "貓";

function artFor(kind: string | null): string {
  return kind === "web" ? WEB_CAT : textStickerDataUrl({ headword: HEAD, lang: "zh-TW" });
}

/** 1) 検索の欄のまま回る（押した直後）。 */
export function TextSearchingScene() {
  const [typed, setTyped] = useState("蓮藕");
  return (
    <CaptureObjectPanel
      initialMode="search"
      retakeWord={null}
      onObjectFile={() => {}}
      typedWord={typed}
      setTypedWord={setTyped}
      onSearch={() => {}}
      searching
      onOpenScan={() => {}}
      error={null}
    />
  );
}

/**
 * 母語の「豚の口の周りの肉」が台湾華語で割れる（オーナー報告 2026-10-09: 前は
 * 嘴邊肉［台湾でよく使う］／豬頰肉［一般的］で、物差しが違って比べられなかった）。
 * どの候補も「文体の札・場面・違い」の同じ3つで並べる。
 */
const PORK_CHEEK: TextCandidate[] = [
  {
    headword: "嘴邊肉",
    reading_zhuyin: "ㄗㄨㄟˇ ㄅㄧㄢ ㄖㄡˋ",
    pinyin: "zuǐbiānròu",
    meaning_ja: "豚のほほ肉（口の周り）",
    register: "spoken",
    scene: "屋台・黑白切の店で注文するとき",
    distinction: "豬頰肉より口語的。店で頼むならこちら",
    usage: "colloquial",
    image_query: "braised pork cheek",
  },
  {
    headword: "豬頰肉",
    reading_zhuyin: "ㄓㄨ ㄐㄧㄚˊ ㄖㄡˋ",
    pinyin: "zhūjiáròu",
    meaning_ja: "豚のほほ肉",
    register: "signage",
    scene: "精肉店の表示・料理本・レシピ",
    distinction: "嘴邊肉の改まった言い方。会話ではあまり言わない",
    usage: "common",
    image_query: "pork cheek meat",
  },
  {
    headword: "松阪豬",
    reading_zhuyin: "ㄙㄨㄥ ㄅㄢˇ ㄓㄨ",
    pinyin: "sōngbǎnzhū",
    meaning_ja: "豚トロ",
    register: "both",
    scene: "焼肉・熱炒の店のメニュー",
    distinction: "口の周りではなく首〜ほほの脂の多い部分",
    usage: "common",
    image_query: "grilled pork jowl",
  },
];

/** 母語の「電車」が台湾華語で割れる（指す物が違う・言い方が違う）。 */
const DENSHA: TextCandidate[] = [
  {
    headword: "火車",
    reading_zhuyin: "ㄏㄨㄛˇ ㄔㄜ",
    pinyin: "huǒchē",
    meaning_ja: "（都市間の）列車",
    register: "both",
    scene: "台鐵の駅・切符を買うとき",
    distinction: "日本の「電車」にいちばん近い日常の言い方",
    usage: "common",
    image_query: "train station taiwan",
  },
  {
    headword: "捷運",
    reading_zhuyin: "ㄐㄧㄝˊ ㄩㄣˋ",
    pinyin: "jiéyùn",
    meaning_ja: "地下鉄・MRT",
    register: "both",
    scene: "台北・高雄の市内を移動するとき",
    distinction: "火車と違い、街の中を走る都市鉄道",
    usage: "common",
    image_query: "taipei metro",
  },
  {
    headword: "列車",
    reading_zhuyin: "ㄌㄧㄝˋ ㄔㄜ",
    pinyin: "lièchē",
    meaning_ja: "列車",
    register: "written",
    scene: "駅の放送・時刻表・ニュース",
    distinction: "火車の改まった言い方。会話ではあまり言わない",
    usage: "formal",
    image_query: "passenger train",
  },
  {
    headword: "電車",
    reading_zhuyin: "ㄉㄧㄢˋ ㄔㄜ",
    pinyin: "diànchē",
    meaning_ja: "電気で走る車両",
    register: "technical",
    scene: "鉄道の解説・車両の種類を言うとき",
    distinction: "乗り物の種類の言葉。乗る時は火車・捷運と言う",
    usage: "academic",
    image_query: "electric train",
  },
];

/**
 * 2) 候補。既定は「豚の口の周りの肉」、`&case=densha` で「電車」。
 * `&state=preparing` は1つめを押して札を用意している間。
 */
export function TextCandidatesScene({ q }: { q: URLSearchParams }) {
  const densha = q.get("case") === "densha";
  const list = densha ? DENSHA : PORK_CHEEK;
  const [preparing, setPreparing] = useState<string | null>(
    q.get("state") === "preparing" ? list[0].headword : null,
  );
  return (
    <TextCandidateList
      query={densha ? "電車" : "豚の口の周りの肉"}
      candidates={list}
      language="zh-TW"
      preparing={preparing}
      onPick={(c) => setPreparing(c.headword)}
      onBack={() => setPreparing(null)}
    />
  );
}

/** 「別の画像」の見本（外へ取りに行かない）。 */
function swatch(bg: string, fg: string, shape: string): string {
  return (
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="${bg}"/>${shape.replaceAll("FG", fg)}</svg>`,
    )
  );
}
const LOTUS = swatch(
  "#efe6d8",
  "#c9a27a",
  '<ellipse cx="60" cy="64" rx="44" ry="30" fill="FG"/><circle cx="44" cy="60" r="7" fill="#efe6d8"/><circle cx="60" cy="54" r="7" fill="#efe6d8"/><circle cx="76" cy="60" r="7" fill="#efe6d8"/><circle cx="52" cy="74" r="6" fill="#efe6d8"/><circle cx="68" cy="74" r="6" fill="#efe6d8"/>',
);
const CHOICES = [
  { url: LOTUS, source: "demo" },
  {
    url: swatch(
      "#e3efe3",
      "#b98d62",
      '<rect x="18" y="44" width="84" height="34" rx="17" fill="FG"/>',
    ),
    source: "demo",
  },
  {
    url: swatch(
      "#f5ede4",
      "#d6b48e",
      '<circle cx="60" cy="60" r="36" fill="FG"/><circle cx="60" cy="60" r="9" fill="#f5ede4"/>',
    ),
    source: "demo",
  },
  {
    url: swatch("#e8eef6", "#a8805a", '<path d="M20 80 Q60 20 100 80Z" fill="FG"/>'),
    source: "demo",
  },
];

const LOTUS_CARD = {
  reading_zhuyin: "ㄌㄧㄢˊ ㄡˇ",
  pinyin: "lián'ǒu",
  meaning_ja: "レンコン",
  part_of_speech: "名詞",
  level: "TOCFL-3",
  category_key: "vegetable",
  example_sentence: "",
  example_translation: "",
} as never;

/** 3) 絵と発音がそろった札。下の「別の画像」を押すと札の絵が替わる。 */
export function TextPeelReadyScene() {
  const [flipped, setFlipped] = useState(false);
  const [caption, setCaption] = useState("");
  const [art, setArt] = useState(LOTUS);
  return (
    <CaptureCardPanel
      card={LOTUS_CARD}
      selectedHead="蓮藕"
      objectImg={null}
      art={art}
      selfieImg={null}
      flipped={flipped}
      setFlipped={setFlipped}
      caption={caption}
      setCaption={setCaption}
      placeName={null}
      onRedo={() => {}}
      onSave={() => {}}
      imageChoices={
        <HeroImageChoices
          ownPhoto={false}
          hasHero
          candidates={CHOICES}
          swapping={null}
          onSwap={(c) => setArt(c.url)}
          isPro={false}
        />
      }
    />
  );
}

/** b) 剥がす札。`web` はネットの画像、`text` は語を組んだ札。 */
export function TextPeelScene({ art }: { art: "web" | "text" }) {
  const [flipped, setFlipped] = useState(false);
  const [caption, setCaption] = useState("");
  return (
    <CaptureCardPanel
      card={CARD}
      selectedHead={HEAD}
      objectImg={null}
      art={artFor(art)}
      selfieImg={null}
      flipped={flipped}
      setFlipped={setFlipped}
      caption={caption}
      setCaption={setCaption}
      placeName={null}
      onRedo={() => {}}
      onSave={() => {}}
    />
  );
}

/** c) d) 札から飛んで、図鑑のその語のカテゴリーへ着地する。 */
export function TextLandingScene({ q }: { q: URLSearchParams }) {
  const art = artFor(q.get("art"));
  const plan = parseCatchAnimation(q.get("plan"));
  const noCell = q.get("dest") === "header";
  const boxRef = useRef<HTMLDivElement | null>(null);
  const flyRef = useRef<HTMLImageElement | null>(null);
  const [landing, setLanding] = useState(false);
  const [dex, setDex] = useState(false);
  const [run, setRun] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [caption, setCaption] = useState("");

  function peel() {
    if (landing) return;
    setLanding(true);
    void runCatchLanding({
      startEl: boxRef.current,
      fly: flyRef,
      plan,
      // 保存の往復の代わりに少しだけ待つ（その間も札は浮いて動いている）。
      gate: new Promise((r) => setTimeout(r, 600)),
      getDestinationId: () => "demo",
      getDestinationCategory: () => "animal",
      openDex: () => setDex(true),
    }).finally(() => setLanding(false));
  }

  // 開いたら少し置いて自動で剥がす（録画・見比べ用）。「もう一度」で最初から。
  useEffect(() => {
    setDex(false);
    setLanding(false);
    const id = window.setTimeout(peel, 900);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  const again = (
    <button
      type="button"
      onClick={() => setRun((n) => n + 1)}
      style={{
        position: "fixed",
        top: 12,
        right: 12,
        zIndex: 10002,
        padding: "8px 12px",
        borderRadius: 999,
        border: 0,
        fontSize: 12,
        background: "rgba(15,23,42,.72)",
        color: "#fff",
      }}
    >
      ↻ もう一度
    </button>
  );

  return (
    <>
      {dex ? (
        <DemoDex noCell={noCell} art={art} />
      ) : (
        <CaptureCardPanel
          card={CARD}
          selectedHead={HEAD}
          objectImg={null}
          art={art}
          selfieImg={null}
          flipped={flipped}
          setFlipped={setFlipped}
          caption={caption}
          setCaption={setCaption}
          placeName={null}
          onRedo={() => {}}
          onSave={peel}
          heroBoxRef={boxRef}
          landing={landing}
          saving={landing}
        />
      )}
      {landing && (
        <CatchLandingOverlay ref={flyRef} image={art} headword={HEAD} reading="ㄇㄠ" lang="zh-TW" />
      )}
      {again}
    </>
  );
}

/**
 * 図鑑の見本。**本番と同じ受け口の約束**だけを持つ: カテゴリーの区切り
 * （`data-dex-cat` と `.dex-cat__head`）と、その札のマス目（`#dex-cell-<id>`）。
 */
function DemoDex({ noCell, art }: { noCell: boolean; art: string }) {
  const groups: Array<{ key: string; label: string; items: string[] }> = [
    { key: "food", label: "🍜 食べ物", items: ["🥟", "🧋", "🍎"] },
    { key: "animal", label: "🐾 動物", items: ["🐶", "🐦", "cat"] },
    { key: "transport", label: "🚲 乗り物", items: ["🚲", "🚌"] },
  ];
  return (
    <div style={{ paddingBottom: 40 }}>
      {groups.map((g) => (
        <section key={g.key} className="dex-cat mb-6" data-dex-cat={g.key}>
          <h3 className="dex-cat__head mb-2 text-body font-semibold tracking-tight">{g.label}</h3>
          <div className="grid grid-cols-3 gap-2.5">
            {g.items
              .filter((x) => !(noCell && x === "cat"))
              .map((x) => (
                <div
                  key={x}
                  id={x === "cat" ? "dex-cell-demo" : undefined}
                  className="relative grid aspect-square place-items-center overflow-hidden rounded-2xl bg-white shadow-md ring-1 ring-black/5"
                >
                  {x === "cat" ? (
                    <img src={art} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span style={{ fontSize: 30, opacity: 0.4 }}>{x}</span>
                  )}
                </div>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
