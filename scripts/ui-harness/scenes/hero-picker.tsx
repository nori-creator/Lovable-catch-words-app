/**
 * 「この札の主役の写真」を選ぶ面(要望 #17)。
 *
 * 前はここが `window.confirm` の素のネイティブの窓で、
 * **押すとファイル選択へ直行**していた。窓そのものはアプリの字体にも
 * 暗いテーマにも従わないので、検査の目にも映らなかった。
 *
 * 見るのは3通り:
 * - `full`   … 4種類とも在る札
 * - `few`    … 元写真しか無い札(**押せない選択肢を並べていないか**)
 * - `picked` … すでに選んである札(どれが選ばれているか一目で分かるか)
 */
import { HeroPhotoPicker } from "@/components/HeroPhotoPicker";

/** 見本の絵。data: URL なので通信は起きない。 */
const SQ = (hue: number) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" fill="hsl(${hue} 60% 62%)"/></svg>`,
  )}`;

export function HeroPickerScene({ q }: { q: URLSearchParams }) {
  const variant = q.get("variant") ?? "full";
  const few = variant === "few";
  return (
    <HeroPhotoPicker
      sources={
        few
          ? { object_url: SQ(30) }
          : {
              object_url: SQ(30),
              cutout_url: SQ(200),
              selfie_url: SQ(340),
              placeholder_url: SQ(120),
            }
      }
      current={variant === "picked" ? "cutout" : null}
      saving={false}
      onPick={() => {}}
      onReplaceFile={() => {}}
      onClose={() => {}}
    />
  );
}
