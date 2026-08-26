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
 * - `cutout` … **切り抜きがまだ無い札**(「いま切り抜く」が出る。
 *   速さを選んだ人がここから掛け直せないと、設定が片道になる)
 * - `album`  … **アルバムの見え方**を触っている面(見出しの下の断り書き)
 *
 * `few` / `cutout` は自撮りも無い札なので「いま自撮りを撮る」も出る
 * (オーナー指示 2026-08-25「自撮りが無ければ自撮りボタンを出す」)。
 */
import { HeroPhotoPicker } from "@/components/HeroPhotoPicker";

/** 見本の絵。data: URL なので通信は起きない。 */
const SQ = (hue: number) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" fill="hsl(${hue} 60% 62%)"/></svg>`,
  )}`;

export function HeroPickerScene({ q }: { q: URLSearchParams }) {
  const variant = q.get("variant") ?? "full";
  // 「いま切り抜く」は**切り抜きがまだ無い札**にだけ出る。
  const few = variant === "few" || variant === "cutout";
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
      surface={variant === "album" ? "album" : "detail"}
      current={variant === "picked" ? "cutout" : null}
      saving={false}
      onPick={() => {}}
      onReplaceFile={() => {}}
      onCutoutNow={variant === "cutout" ? () => {} : undefined}
      onSelfieFile={few ? () => {} : undefined}
      onClose={() => {}}
    />
  );
}
