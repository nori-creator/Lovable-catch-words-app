/**
 * 押した札から詳細の見出しへ**絵が飛ぶ**動き。**本物の `HeroFlight` を使う。**
 *
 * 本物の `StickerSheet` は問い合わせを2本持つので、ここでは飛行が必要とする
 * ものだけを実物と同じ形で置く:
 *   ・押される札（写真が1枚入った小さな箱）
 *   ・行き先の印 `[data-sheet-hero]`（実物と同じ 4:5 の見出し）
 * 飛行そのもの — ばね・行き先の実測・溶けて消える所 — は本物が持っている。
 */
import { useState } from "react";
import { HeroFlight, type FlightOrigin } from "@/components/HeroFlight";

const PHOTO =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150"><rect width="200" height="150" fill="#b07a4a"/></svg>',
  );

export function HeroFlightScene() {
  const [origin, setOrigin] = useState<FlightOrigin | null>(null);
  const [open, setOpen] = useState(false);
  const [heroHidden, setHeroHidden] = useState(false);
  // 実物と同じ: 飛んでいる間は面ごと伏せ、届いた1コマで出す。
  const [panelShown, setPanelShown] = useState(false);
  return (
    <div className="min-h-screen bg-background p-4">
      {/* 押される札。実物のアルバムと同じで、測るのは中の <img>。 */}
      <button
        data-card
        className="photo-lift block"
        onClick={(e) => {
          const img = e.currentTarget.querySelector("img")!;
          const r = img.getBoundingClientRect();
          setOrigin({ x: r.left, y: r.top, w: r.width, h: r.height, url: PHOTO, radius: 2 });
          setHeroHidden(true);
          setPanelShown(false);
          setOpen(true);
        }}
      >
        <span className="photo-print block h-[90px] w-[120px]">
          <img src={PHOTO} alt="" className="block h-full w-full object-cover" />
        </span>
      </button>

      {open && (
        <div
          className={`fixed inset-0 z-50 flex flex-col bg-background p-4 ${heroHidden ? "sheet-hero-hidden" : ""}`}
          style={panelShown ? undefined : { opacity: 0 }}
        >
          {origin && (
            <HeroFlight
              origin={origin}
              onArrive={() => {
                setPanelShown(true);
                setHeroHidden(false);
              }}
              onDone={() => setOrigin(null)}
            />
          )}
          <div data-sheet-hero className="mb-4">
            <div className="relative aspect-[4/5] w-full overflow-hidden rounded-3xl">
              <img src={PHOTO} alt="" className="absolute inset-0 h-full w-full object-cover" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
