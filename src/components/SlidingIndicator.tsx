import { useEffect, useRef } from "react";
import { createSpring, type Spring } from "@/lib/spring";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";

/**
 * 「いまここ」を示す、**滑って伸びる印**。
 *
 * 下のタブでも、設定の丸い選択肢でも、同じ物を使う（オーナー指示 2026-09-15
 * 「このアプリの全ての切り替え機能の切り替えのボタンを押した時、必ず添付した
 * 動画のような残像感、滑らか感を出して。例えば設定の変更のボタン」）。
 *
 * ## 何を再現したものか
 * App Store（iOS 26）のタブ。コマ送りにして読み取った形:
 *   ・選んだ所に**明るい角丸の長方形**が乗る
 *   ・切り替えると**伸びて両方を跨ぎ**、先端が先に着いて後端が遅れて追う
 *   ・伸びている最中も**角の丸みは変わらない**（真円のカプセルではない）
 *
 * ## 伸びは「振り付け」ではなく、物理から出す
 * 幅を時間で膨らませて縮める、と書くこともできる。やらない。
 * **左端と右端に別々のばねを持たせ、進む側を速くする**だけで、伸びも、尾も、
 * 着地の縮みも勝手に出てくる。しかもばねなので:
 *   ・途中で別の所を押しても、いまの位置から続く（飛ばない）
 *   ・指で払っている間は 1:1 で付いてくる
 * 時間で書いた振り付けは、この2つができない。
 *
 * ## 置き方
 * **並んでいる物の親に、最初の子として置く。** 位置は自分以外の兄弟を
 * 実測して決めるので、余白でも隙間でも何が挟まっても合う。
 */
export function SlidingIndicator({
  /**
   * いまの位置（小数可）。指で払っている最中は `1.4` のような値が来る。
   * 負のときは隠す（どれも選ばれていない）。
   */
  index,
  /** 見た目。地の色や高さはここで決める。 */
  className,
  /**
   * 角の丸み ÷ 高さ。**幅が変わっても変わらない**ように px で当てる。
   *   ・0.3  … 角丸の長方形（App Store のタブ）
   *   ・0.5  … 真円のカプセル（丸い選択肢）
   */
  radiusRatio = 0.3,
  /** 先に着く側の速さ（秒）。小さいほど機敏。 */
  lead = 0.3,
  /** 遅れて追う側の速さ（秒）。**尾の長さはここで決まる。** */
  trail = 0.62,
}: {
  index: number;
  className?: string;
  radiusRatio?: number;
  lead?: number;
  trail?: number;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  /** 左端と右端、別々のばね。**この2本の速さの差が「伸び」そのもの**。 */
  const leftRef = useRef<Spring | null>(null);
  const rightRef = useRef<Spring | null>(null);
  const reduced = usePrefersReducedMotion();
  /** `paint` から読むので ref に控える（effect を張り直さないため）。 */
  const indexRef = useRef(index);
  indexRef.current = index;

  useEffect(() => {
    const el = ref.current;
    const track = el?.parentElement;
    if (!el || !track) return;

    /**
     * 並んでいる物の左右端（親の左端からの px）。
     *
     * **`clientWidth ÷ 個数` で割らない。**（オーナー指摘 2026-09-15
     * 「アイコンが中心に来てない。バランスが悪い」）
     *
     * 親に内側の余白があると `clientWidth` はそれを**含む**一方、中の物は
     * 余白の内側から始まる。割り算で出した位置は左にずれ、1つぶんの幅も
     * 広すぎる。5つ並べた下のタブでは、5番目で**約 21px のずれ**になり、
     * アイコンが印の中心から外れて見えていた（実測）。
     * 本物を測れば、余白でも隙間でも何が挟まっても合う。
     */
    const cells = () => {
      const base = track.getBoundingClientRect().left;
      return Array.from(track.children)
        .filter((c): c is HTMLElement => c instanceof HTMLElement && c !== el)
        .map((child) => {
          const r = child.getBoundingClientRect();
          return { l: r.left - base, r: r.right - base };
        });
    };
    /** いまの位置（小数）→ そのときの左右端。物と物の間は混ぜる。 */
    const edgesAt = (at: number) => {
      const cs = cells();
      if (cs.length === 0) return { l: 0, r: 1 };
      const c = Math.max(0, Math.min(at, cs.length - 1));
      const i = Math.floor(c);
      const f = c - i;
      const a = cs[i];
      const b = cs[Math.min(i + 1, cs.length - 1)];
      return { l: a.l + (b.l - a.l) * f, r: a.r + (b.r - a.r) * f };
    };

    const paint = () => {
      const l = leftRef.current?.value() ?? 0;
      const r = rightRef.current?.value() ?? 0;
      /**
       * **幅そのものを動かす。`scaleX` では伸ばさない。**
       *
       * `scaleX` で伸ばすと、両端の丸が横に潰れて**楕円**になる
       * （オーナー指摘「青い形がバランス悪い」）。参照を止めて見ると、印は
       * 伸びている最中も角の丸みがまったく変わらず、伸びるのは真ん中の
       * 直線部分だけ。液体というより、ゴムの板が引かれる形。
       *
       * 幅を直に書くと1要素ぶんの再レイアウトが起きるが、中身の無い
       * `<span>` 1枚なので実質ただ。**形が正しいことのほうが大事**。
       */
      el.style.transform = `translate3d(${l}px,0,0)`;
      el.style.width = `${Math.max(r - l, 1)}px`;
      el.style.borderRadius = `${el.offsetHeight * radiusRatio}px`;
      el.style.opacity = indexRef.current < 0 ? "0" : "1";
    };

    const e0 = edgesAt(Math.max(indexRef.current, 0));
    leftRef.current = createSpring(e0.l, paint, { damping: 1, response: lead });
    rightRef.current = createSpring(e0.r, paint, { damping: 1, response: lead });
    paint();

    /**
     * **画面の幅が変わったら、ばねの値を入れ直す。**
     *
     * ばねが持っているのは px の位置なので、横向きにすると古い幅で出した
     * 位置のままになる。しかも `index` は変わらないので下の effect も走らず、
     * **次に押すまで直らない**。動かして直すのではなく `set` で入れ直す
     * （画面が回っている最中に印がぬるっと滑ると、回転そのものと喧嘩する）。
     */
    const onResize = () => {
      const e = edgesAt(Math.max(indexRef.current, 0));
      leftRef.current?.set(e.l);
      rightRef.current?.set(e.r);
      paint();
    };
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(track);
    return () => {
      window.removeEventListener("resize", onResize);
      ro.disconnect();
      leftRef.current?.dispose();
      rightRef.current?.dispose();
      leftRef.current = null;
      rightRef.current = null;
    };
  }, [radiusRatio, lead]);

  useEffect(() => {
    const el = ref.current;
    const track = el?.parentElement;
    const L = leftRef.current;
    const R = rightRef.current;
    if (!track || !L || !R || index < 0) return;

    const base = track.getBoundingClientRect().left;
    const cs = Array.from(track.children)
      .filter((c): c is HTMLElement => c instanceof HTMLElement && c !== el)
      .map((child) => {
        const r = child.getBoundingClientRect();
        return { l: r.left - base, r: r.right - base };
      });
    if (cs.length === 0) return;
    const at = Math.max(0, Math.min(index, cs.length - 1));
    const i = Math.floor(at);
    const f = at - i;
    const a = cs[i];
    const b = cs[Math.min(i + 1, cs.length - 1)];
    const l = a.l + (b.l - a.l) * f;
    const r = a.r + (b.r - a.r) * f;

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
     * ## 指で払っている最中にも尾を引かせる（2026-09-15）
     * 「スワイプした時に表示される青い部分…残像みたいなのが実装できてない」。
     * 原因は**差が小さすぎたこと**。タップで飛ぶときは目標が一度に遠くへ
     * 動くので差が出るが、指で払っている間は位置が少しずつしか動かないので、
     * 2本とも目標に貼り付いたまま進む = **伸びがまったく出ない**。
     * 遅れる側をはっきり遅くすると、払っている間も尾が出る。
     *
     * **跳ねさせない**(damping 1): 押した位置に印が行き過ぎて戻ると、
     * 押した所と違う所に居る一瞬ができる。
     */
    const goingRight = r > R.value();
    const fast = { damping: 1, response: lead };
    const slow = { damping: 1, response: trail };
    R.to(r, goingRight ? fast : slow);
    L.to(l, goingRight ? slow : fast);
  }, [index, reduced, lead, trail]);

  return (
    <span ref={ref} aria-hidden className={`pointer-events-none absolute ${className ?? ""}`} />
  );
}
