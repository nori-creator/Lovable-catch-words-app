import type { ReactNode } from "react";
import { SlidingIndicator } from "@/components/SlidingIndicator";

/**
 * 下のタブ帯。**画面の下に浮くカプセル**。
 *
 * ## オーナー指示 2026-09-15
 * > 「下のアイコンのバー自体もの形も添付の app store のように変更し、
 * >  青いバブルとアイコン文字の上下のバランス。またバーとのバランスを
 * >  徹底的に再現して。今、バーの余白。またバブルの形文字、アイコンの
 * >  バランスが悪い」
 *
 * ## 参照を測って決めた寸法（App Store / iOS 26）
 * 添付の動画をコマに割り、静止している1枚（端末の画面幅を 1 とする）を
 * 測った。**割合で持つ**のは、元が録画の録画で絶対 px に意味が無いから。
 *
 * | 測った所 | 画面幅に対する割合 | 390px の端末で |
 * |---|---|---|
 * | 帯の幅 | 0.876 | 342px（左右に 6.2% ずつ余白） |
 * | 帯の高さ | 0.142 | 55px |
 * | 帯の角 | 高さ÷2（**完全なカプセル**） | 27px |
 *
 * 帯の中の縦の配り方（帯の高さを 1 とする）:
 *
 * | | 割合 | 55px のとき |
 * |---|---|---|
 * | 上の余白 | 0.19 | 10px |
 * | アイコン | 0.37 | 20px（= `h-5`。いまのアイコンと同じ） |
 * | 間 | 0.12 | 7px |
 * | 文字 | 0.18 | 10px |
 * | 下の余白 | 0.14 | 8px |
 *
 * **印は帯とほぼ同じ高さ**で、帯の内側の余白（4px）のぶんだけ小さい。
 * 拡大して見ると、印の左の半円が帯の左の半円の**すぐ内側に入れ子**になって
 * いる。だから帯の左右に内側の余白は置かない — 5つの升目が端から端まで
 * 詰まっていて、印はちょうど1升ぶん。
 *
 * ## 前の形との違い
 * 前は画面いっぱいの帯に `px-2 py-2` の余白で、印は `inset-y-2.5` の
 * 角丸長方形だった。**参照はどこもそうなっていない** — 幅も、角も、
 * 上下の配りも違う。ここで全部を一度に合わせる。
 */
export function TabBar({
  /** 指の位置(小数)。`tabIndex + progress`。タブの外に居るときは負。 */
  cursor,
  /**
   * 印の濃さ（0〜1）。カメラの升目に近づくと薄くする
   * （オーナー指示「青いバブルで囲うのではなく」）。
   */
  indicatorOpacity = 1,
  /** `<li>` 5つ。**印はここが自分で置く**ので、渡すのは升目だけ。 */
  children,
}: {
  cursor: number;
  indicatorOpacity?: number;
  children: ReactNode;
}) {
  return (
    <nav className="tabbar-dock">
      <div className="tabbar">
        <ul className="tabbar__row">
          {/* いま居る所の印。**升目より先に置く** — 後ろに敷くものなので、
              重なりの順で言えばここが一番下。伸び方の理由は部品の側に。 */}
          <SlidingIndicator
            index={cursor}
            persistKey="tabbar"
            opacity={indicatorOpacity}
            radiusRatio={0.5}
            className="bottom-0 left-0 top-0 bg-primary/14"
          />
          {children}
        </ul>
      </div>
    </nav>
  );
}
