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
 * ## 丸みは崩さない（2026-09-15 に直した）
 * 最初は `scaleX` で伸ばしていた。そうすると**両端の丸が横に潰れて楕円**に
 * なる。当時は「液体が引かれる形だから」と残したが、オーナー指摘
 * 「青い形がバランス悪い」はまさにそこだった。
 *
 * 参照を App Store（iOS 26 のタブ）に取り直してコマ送りにすると、印は
 * 伸びている最中も**角の丸みがまったく変わらない**角丸の長方形で、伸びるのは
 * 真ん中の直線部分だけ。液体というより、ゴムの板が引かれる形。
 * だから `scaleX` をやめ、**幅そのもの**を動かす（`paint` の注）。
 *
 * ## 参照（App Store）の寸法
 *   ・タブは5つ。印の幅はタブ1つぶん
 *   ・高さは帯の内側の8割ほど
 *   ・角の丸みは高さの3割ほど（真円のカプセルではない）
 *   ・選んでいるタブは、印だけでなく**字と絵も主色に染まる**
 *     （`AppShell` の `activeProps` が担当）
 */
/**
 * 角の丸み ÷ 高さ。参照（App Store の iOS 26 のタブ）をコマ送りにして
 * 読み取った比。真円のカプセル（0.5）ではなく、角丸の長方形。
 */
const RADIUS_RATIO = 0.3;

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
      /**
       * **幅そのものを動かす。`scaleX` では伸ばさない。**
       *
       * `scaleX` で伸ばすと、両端の丸が横に潰れて**楕円**になる。
       * オーナー指摘 2026-09-15「青い形がバランス悪い」はこれ。
       * 参照（App Store の iOS 26 のタブ）を止めて見ると、印は伸びている
       * 最中も**角の丸みがまったく変わらない**角丸の長方形で、伸びるのは
       * 真ん中の直線部分だけ。液体というより、ゴムの板が引かれる形。
       *
       * 幅を直に書くと1要素ぶんの再レイアウトが起きるが、中身の無い
       * `<span>` 1枚なので実質ただ。**形が正しいことのほうが大事**。
       */
      el.style.transform = `translate3d(${l}px,0,0)`;
      el.style.width = `${w}px`;
      // 角の丸みは**高さから決める**ので、幅が変わっても変わらない。
      // 参照では高さの3割ほど（真円のカプセルではなく、角丸の長方形）。
      el.style.borderRadius = `${el.offsetHeight * RADIUS_RATIO}px`;
      el.style.opacity = cursorRef.current < 0 ? "0" : "1";
    };

    const u = unit();
    const at = Math.max(cursorRef.current, 0);
    leftRef.current = createSpring(at * u, paint, APPLE_SPRING.smooth);
    rightRef.current = createSpring(at * u + u, paint, APPLE_SPRING.smooth);
    paint();

    /**
     * **画面の幅が変わったら、ばねの値を入れ直す。**
     *
     * ばねが持っているのは「px の位置」で、`cursor × 1タブぶんの幅` から
     * 出した値。横向きにすると1タブぶんの幅が変わるので、**持っている px は
     * 古い幅で出した位置のまま**になる。描き直すだけだと、たとえば5番目の
     * タブに居たのに印が真ん中あたりを指したままになり、**次にタブを
     * 押すまで直らない**（`cursor` が変わらないと下の effect が走らない）。
     *
     * 動かして直すのではなく `set` で入れ直す。画面が回っている最中に
     * 印がぬるっと滑ると、回転そのものの動きと喧嘩する。
     */
    const onResize = () => {
      const u2 = unit();
      const at2 = Math.max(cursorRef.current, 0);
      leftRef.current?.set(at2 * u2);
      rightRef.current?.set(at2 * u2 + u2);
      paint();
    };
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
      /**
       * 参照（App Store）の寸法に寄せる:
       *   ・幅  … タブ1つぶん（`paint` が px で書く）
       *   ・高さ … 帯の内側の8割ほど（`inset-y-*` で決まる）
       *   ・丸み … 高さの3割ほど（`paint` が px で書く。**潰れない**）
       * `rounded-full` は付けない — 付けると伸びたときに楕円になる。
       */
      className="pointer-events-none absolute bottom-2.5 top-2.5 left-0 bg-primary/12"
      style={{ width: `${100 / Math.max(count, 1)}%` }}
    />
  );
}
