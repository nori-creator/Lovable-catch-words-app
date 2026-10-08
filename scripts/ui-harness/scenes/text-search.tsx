/**
 * **文字で調べた語のキャッチ**（写真の無い回）の4つの段。
 *
 * オーナー報告 2026-10-08（画面の録画、「貓」を打って調べた回）:
 *   a) 物も写真も無いのに、黒い粒子の「AI が分析中…」が11秒ほど続く
 *   b) 剥がす札に何も載っていない（白く光る台紙だけ）
 *   c) 白い画面に語だけが数秒止まる
 *   d) 図鑑のカテゴリーへ入っていく動きが無い
 *
 * - `?scene=text-analyzing` … 意味を調べている間（語そのもの + 意味を調べています）
 * - `?scene=text-peel-web` … ネットの画像が届いた札
 * - `?scene=text-peel-only` … 画像が届かなかった時の、語を組んだ札
 * - `?scene=text-landing` … 札を剥がして図鑑のカテゴリーのマス目へ着地
 *   （`&art=web` でネットの画像の札、`&dest=header` でマス目がまだ無い回 → カテゴリーの見出しへ）
 *
 * どれも本物の部品を描く（`CaptureLookupPanel` / `CaptureCardPanel` / `PeelSticker` /
 * `runCatchLanding`）。札の絵は本番と同じ `textStickerDataUrl` で作る。
 */
import { useEffect, useRef, useState } from "react";
import { CaptureCardPanel, CaptureLookupPanel } from "@/components/screens/CaptureScreen";
import { CatchLandingOverlay, runCatchLanding } from "@/components/CatchLanding";
import { parseCatchAnimation } from "@/lib/catch-animation-pref";
import { textStickerDataUrl } from "@/lib/text-sticker";

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

/** a) 意味を調べている間。 */
export function TextAnalyzingScene() {
  return <CaptureLookupPanel headword={HEAD} lang="zh-TW" onCancel={() => {}} />;
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
