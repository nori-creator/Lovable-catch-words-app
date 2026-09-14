import { useEffect, useRef } from "react";
import { APPLE_SPRING, createSpring, type Spring } from "@/lib/spring";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";

/**
 * 下のタブで、いま居る所を示す印。**伸びて、遅れて追いつく。**
 *
 * ## 何を再現したものか
 * オーナーが参照として渡した動き(MovinDesign / @MiruDaws の
 * "a delivery app's tab bar as gooey liquid glass, the icons stretching and
 * merging as you switch")。録画をコマ送りにして読み取った形は:
 *
 *   ・選んだタブに**明るいカプセル**が乗る(バーの内側。浮いた別物ではない)
 *   ・切り替えると、カプセルが**伸びて両方を跨ぎ**、
 *     **先端が先に着いて、後端が遅れて追いつく**(先細りの尾ができる)
 *   ・大きく動くのは 20fps で約4コマ ≒ **200ms** 前後
 *
 * ## 伸びは「振り付け」ではなく、物理から出す
 * 幅を時間で膨らませて縮める、と書くこともできる。やらない。
 * **左端と右端に別々のばねを持たせ、進む側の `response` を速くする**だけで、
 * 伸びも、尾も、着地の縮みも勝手に出てくる。しかもばねなので:
 *   ・途中で別のタブを押しても、いまの位置から続く(飛ばない)
 *   ・指でスワイプしている間は 1:1 で付いてくる
 * 時間で書いた振り付けは、この2つができない。
 *
 * ## 丸みが崩れるのは、崩れてよい
 * `scaleX` で伸ばすので、両端の丸が横に潰れて楕円になる。普通なら欠陥だが、
 * **参照の動きでも伸びている最中の端は潰れている** — 液体が引かれる形その
 * ものなので、ここでは直さない。止まれば元の丸に戻る。
 */
export function TabIndicator({
  /** 指の位置(小数)。`tabIndex + progress`。タブの外に居るときは負。 */
  cursor,
  /** タブの数。 */
  count,
}: {
  cursor: number;
  count: number;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  /** 左端と右端、別々のばね。**この2本の速さの差が「伸び」そのもの**。 */
  const leftRef = useRef<Spring | null>(null);
  const rightRef = useRef<Spring | null>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const el = ref.current;
    const track = el?.parentElement;
    if (!el || !track) return;

    /** 1タブぶんの幅。`<li>` は `flex-1` なので均等。 */
    const unit = () => track.clientWidth / Math.max(count, 1);

    const paint = () => {
      const l = leftRef.current?.value() ?? 0;
      const r = rightRef.current?.value() ?? 0;
      const w = Math.max(r - l, 1);
      const u = unit();
      // 基準の幅は1タブぶん。そこからの倍率で伸ばす。
      el.style.transform = `translate3d(${l}px,0,0) scaleX(${w / Math.max(u, 1)})`;
      el.style.opacity = cursorRef.current < 0 ? "0" : "1";
    };

    const u = unit();
    const at = Math.max(cursorRef.current, 0);
    leftRef.current = createSpring(at * u, paint, APPLE_SPRING.smooth);
    rightRef.current = createSpring(at * u + u, paint, APPLE_SPRING.smooth);
    paint();

    const onResize = () => paint();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      leftRef.current?.dispose();
      rightRef.current?.dispose();
      leftRef.current = null;
      rightRef.current = null;
    };
  }, [count]);

  /** `paint` から読むので ref に控える(effect を張り直さないため)。 */
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;

  useEffect(() => {
    const track = ref.current?.parentElement;
    const L = leftRef.current;
    const R = rightRef.current;
    if (!track || !L || !R) return;
    if (cursor < 0) return;

    const u = track.clientWidth / Math.max(count, 1);
    const l = cursor * u;
    const r = l + u;

    if (reduced) {
      // 伸びも移動も出さない。位置だけ差し替える。
      L.set(l);
      R.set(r);
      return;
    }

    /**
     * **進む側を速く、残る側を遅く。**
     *
     * 右へ移るなら右端が先に着き、左端が遅れて追う → 右へ伸びてから縮む。
     * 左へ移れば逆。どちらへ動いているかは、いまの値との差で分かる。
     *
     * `smooth`(0.5) と `snappy`(0.5/0.85) は Apple の実数値。
     * 先に着く側だけ `response` を 0.34 に詰める — 参照の動きで大きく動く
     * のが約 200ms だったので、そこへ合わせる。**跳ねさせない**(damping 1):
     * 指で押した位置に印が行き過ぎて戻ると、押した所と違う所に居る一瞬が
     * できる。伸びはもう2本の速さの差で出ているので、跳ねは要らない。
     */
    const goingRight = r > R.value();
    const lead = { damping: 1, response: 0.34 };
    const trail = APPLE_SPRING.smooth;
    R.to(r, goingRight ? lead : trail);
    L.to(l, goingRight ? trail : lead);
  }, [cursor, count, reduced]);

  return (
    <span
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute bottom-2 top-2 left-0 origin-left rounded-full bg-primary/12"
      style={{ width: `${100 / Math.max(count, 1)}%` }}
    />
  );
}
