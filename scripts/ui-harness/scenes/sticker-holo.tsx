/**
 * **本物のようなステッカー**（オーナー指示 2026-09-28「ステッカーを表示するときの添付の動画の
 * ように、リアルに動く感じを再現して」）。本体は `src/components/HoloSticker.tsx`（GPU で描く）。
 *
 * 触り方: ステッカーのどこかを押したまま引く → 縁から紙が丸まってめくれ、裏の台紙が見える。
 * 離すと元に戻る。指を乗せて動かす（パソコンはマウスを乗せる）と傾いて、ホロとラメが光る。
 * 「はがす」の方は、半分以上めくって離すと、はがし切って図鑑に入る（保存の合図）。
 */
import { useState } from "react";
import { HoloSticker } from "@/components/HoloSticker";
import { cutout } from "./peel-sticker";

export function StickerHoloScene() {
  const [peeled, setPeeled] = useState(0);
  const [key, setKey] = useState(0);
  return (
    <div className="space-y-4 pb-28">
      <div
        className="grid place-items-center rounded-3xl py-6"
        style={{ background: "linear-gradient(#f4f5f7, #e9ebef)" }}
      >
        <HoloSticker src={cutout} shape="cutout" size={300} ariaLabel="珍珠奶茶のステッカー" />
        <p className="mt-2 text-caption text-muted-foreground">切り抜き（白いふち・ラメ）</p>
      </div>
      <div
        className="grid place-items-center rounded-3xl py-6"
        style={{ background: "linear-gradient(#f4f5f7, #e9ebef)" }}
      >
        <HoloSticker
          key={key}
          src="/first-catch-cafe.webp"
          shape="photo"
          size={280}
          ariaLabel="写真のステッカー"
          onPeel={() => {
            setPeeled((n) => n + 1);
            window.setTimeout(() => setKey((k) => k + 1), 700);
          }}
        />
        <p className="mt-2 text-caption text-muted-foreground">
          写真（半分以上めくって離すと、はがし切る）{peeled > 0 ? ` · はがした回数 ${peeled}` : ""}
        </p>
      </div>
    </div>
  );
}
