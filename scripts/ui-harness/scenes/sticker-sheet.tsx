/**
 * ホームや図鑑で写真を押すと開く面。**この app でいちばん大きい未検査の画面**
 * だった(929行)。
 *
 * ルートは2つの問い合わせと10個の状態を持つので、見た目を持つ所だけを
 * `StickerSheetBody` として切り出してある。ここで描くのは**その本体**と、
 * 実物と同じ覆いの箱(`fixed inset-0` の面)。
 *
 * 覆いの箱を書き写しているのは、その3行が**状態を1つも持たない容れ物**
 * だから。中身に触る所は全部本物を呼ぶ。
 */
import { useRef, useState } from "react";
import { StickerSheetBody } from "@/components/StickerSheet";
import { FULL } from "./word-card";

const shot = (w: number, h: number, c: string) =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${c}"/></svg>`,
  );

const STICKER = {
  id: "s1",
  word_id: "w1",
  created_at: "2026-08-01T12:30:00Z",
  taken_at: "2026-08-01T12:30:00Z",
  caption: "士林夜市で並んでいるときに",
  location_name: "士林夜市",
  lat: 25.088,
  lng: 121.524,
  object_url: shot(600, 750, "#b07a4a"),
  cutout_url: null,
  selfie_url: shot(600, 750, "#4a90d9"),
  placeholder_url: null,
  placeholder_credit: null,
  branch_plan: null,
  review_count: 2,
  encounter_count: 2,
  word: FULL,
} as never;

const CANDIDATES = [
  { url: shot(160, 160, "#d0483c"), source: "web" },
  { url: shot(160, 160, "#f5a623"), source: "web" },
  { url: shot(160, 160, "#4a90d9"), source: "web" },
];

/**
 * 覆いの面。実物と同じ `fixed inset-0` の箱に入れる —
 * 箱が無いと、中身が画面の高さを超えたときの巻き上がり方が別物になる。
 */
export function StickerSheetScene({ q }: { q: URLSearchParams }) {
  const variant = q.get("variant");
  const [flipped, setFlipped] = useState(variant === "selfie");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const longPressFired = useRef(false);
  return (
    <div
      className="material-in fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="珍珠奶茶"
    >
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-24 pt-3">
        <StickerSheetBody
          sticker={STICKER}
          uiLang="ja"
          isPro={variant === "pro"}
          flipped={flipped}
          setFlipped={setFlipped}
          hasSelfie
          hasPhoto
          // **削除は2段。** 2段目(「本当に削除?」)は押さないと出ないので、
          // 取り消せない操作の**武装した側**を必ず撮る。
          busy={variant === "deleting" ? "delete" : null}
          deleteArmed={variant === "armed" || variant === "deleting"}
          handleDelete={() => {}}
          handleImageFile={() => {}}
          fileInputRef={fileInputRef}
          heroPressStart={() => {}}
          heroPressEnd={() => {}}
          longPressFired={longPressFired}
          enriching={false}
          // 解説の生成に失敗した面。空欄のまま黙らせない、と決めた所。
          enrichError={variant === "failed" ? "AIの生成に失敗しました" : null}
          setEnrichError={() => {}}
          onEnrichRetry={() => {}}
          regenerating={false}
          regenerate={() => {}}
          reporting={variant === "reporting"}
          reportIssue={() => {}}
          // ネット画像の候補は、自分の写真が無いときだけ出る。
          webCandidates={variant === "candidates" ? CANDIDATES : []}
          swapping={null}
          swapWebImage={() => {}}
          applyWebImage={() => {}}
        />
      </div>
    </div>
  );
}
