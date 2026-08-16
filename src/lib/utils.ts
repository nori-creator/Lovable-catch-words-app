import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * 書体の階調(`--text-*`)を tailwind-merge に教える。
 *
 * ## 教えないと、静かに消える
 * tailwind-merge は class 名から役割を推測する。`text-body` のような
 * **知らない `text-*`** は「文字色」と見なされるので、同じ `cn()` の中に
 * `text-primary-foreground` があると**打ち消し合って後の1つだけが残る** —
 * つまり大きさの指定が消え、文字は親から継いだ大きさで描かれる。
 *
 * 実際そうなっていた: ボタンの土台に `text-body`(15px)を書いたのに、
 * 見た目の種類が持つ `text-primary-foreground` に消され、
 * 検査は「階調に無い大きさ 16px」と出した(継いだ 16px が残っていた)。
 * **クラスを書いただけでは効いていない**という、いつもの形。
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["caption", "footnote", "body", "headline", "title", "hero"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
