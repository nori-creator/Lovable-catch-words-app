import { useEffect, useRef } from "react";
import { createSpring, type Spring } from "@/lib/spring";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";

/**
 * 直前に居た所。**画面をまたいでも憶えておく**ための控え。
 *
 * ## なぜモジュールの外に置くのか（オーナー指摘 2026-09-15）
 * > 「下のアイコンをタップして違うページに移った時の残像感滑らか感が
 * >  実装されてない」
 *
 * 指で払ったときは尾が出るのに、**押したときだけ出ない**。原因は動きでは
 * なく**組み立て方**だった。このアプリは画面ごとに `AppShell` を描いていて
 * （16ファイルが各自 `<AppShell>` を持つ）、タブを押すと画面が入れ替わる =
 * **殻ごと作り直される**。作り直されればこの部品も新しく生まれ、ばねは
 * 移動先の位置で初期化される — 動く前から着いているので、動きようがない。
 *
 * 払っているときは同じ画面の中で `progress` が動くだけなので、部品は
 * 生きたまま。だから尾が出ていた。**同じ部品の2つの入り方で挙動が違った。**
 *
 * 殻を画面の外へ出す（レイアウトルートにする）のが本筋だが、16画面が
 * 各自の題と縦の扱いを `AppShell` に渡しているので、その付け替えは別の話。
 * ここでは**位置だけを持ち越す**: 生まれた時に前の場所から始めて、
 * いまの場所へばねで動かす。見た目は繋がったままになる。
 *
 * ## 「行き先の番号」ではなく「いま画面に出ている px」を持ち越す
 * （オーナー指摘 2026-09-15「青いバブルも途中でスライドのアニメーションが
 * 消える」）
 *
 * はじめは直前の**番号**だけを控えていた。ところが画面の入れ替わりで
 * `AppShell` が作り直されるのは**1回とは限らない**（読み込みの段ごとに
 * 起きる）。1回目の作り直しで控えは行き先の番号に更新されるので、
 * 2回目の作り直しでは「前＝行き先」となり、**動かす距離が無くなる** —
 * 滑っている途中でぷつりと着地する。
 *
 * 最後に画面へ書いた px をそのまま控えれば、何回作り直されても
 * **その時いた場所**から続く。並びの幅が変わっていたら割合で読み替える
 * （横向きにした直後など）。
 *
 * 鍵で分けるのは、下のタブと設定の選択肢が**同じ部品を別々に**使うため。
 * 鍵を渡さない使い方（1回きりの物）は何も憶えない。
 */
type Carry = {
  /** 直前に指していた位置（小数）。 */
  index: number;
  /** 最後に**画面へ書いた**左右端(px)と、そのときの並びの幅。 */
  l: number;
  r: number;
  trackW: number;
};
const lastIndex = new Map<string, Carry>();

/**
 * 「いまここ」を示す、**滑って伸びる印**。
 *
 * 下のタブでも、設定の丸い選択肢でも、同じ物を使う（オーナー指示 2026-09-15
 * 「このアプリの全ての切り替え機能の切り替えのボタンを押した時、必ず添付した
 * 動画のような残像感、滑らか感を出して。例えば設定の変更のボタン」）。
 *
 * ## 何を再現したものか
 * App Store（iOS 26）のタブ。コマ送りにして読み取った形:
 *   ・選んだ所に**明るいカプセル**が乗る（角丸の長方形ではなく、端が半円）
 *   ・切り替えると**伸びて両方を跨ぎ**、先端が先に着いて後端が遅れて追う
 *   ・伸びている最中も**角の丸みは変わらない**
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
   *   ・0.5  … 端が半円のカプセル（App Store のタブ・丸い選択肢）
   *   ・0.3  … 角丸の長方形
   */
  radiusRatio = 0.5,
  /** 先に着く側の速さ（秒）。小さいほど機敏。 */
  lead = 0.28,
  /**
   * 遅れて追う側の速さ（秒）。**尾の長さはここで決まる。**
   *
   * 既定 0.42 は当てずっぽうではない。`spring.ts` と同じ式で測った
   * （下のタブ 1升 76px、`damping` 1、1/60 秒刻み）:
   *
   * |  | 隣へ1つ | 端から端へ4つ | 落ち着くまで(隣) |
   * |---|---|---|---|
   * | 旧 0.30 / 0.62 | 1.36 倍 | 2.44 倍 | 767ms |
   * | 新 0.28 / 0.42 | **1.21 倍** | **1.82 倍** | **533ms** |
   *
   * 参照（App Store）をコマ送りで見ると、印は移動中も**だいたい1升ぶんの
   * まま**で、2倍以上に伸びる瞬間は無い。旧の 2.44 倍は尾ではなく
   * 引きずった跡で、オーナー指摘「ちょっとしつこすぎる」はここ。
   */
  trail = 0.42,
  /**
   * 薄める度合い（0〜1）。**カメラのタブには印を乗せない**ための窓口
   * （オーナー指示 2026-09-15「青いバブルで囲うのではなく、カメラの
   * アイコンの中の色を変えてほしい」）。
   *
   * 消す・出すではなく濃さで渡すのは、指で払っている最中に
   * **点いたり消えたりさせない**ため。近づくほど薄れて、通り過ぎると戻る。
   */
  opacity = 1,
  /**
   * 画面をまたいで位置を憶えるときの鍵。渡さなければ憶えない。
   * 同じ鍵を使う印は**同じ並びの上に居ること**（位置を共有するため）。
   */
  persistKey,
}: {
  index: number;
  className?: string;
  radiusRatio?: number;
  lead?: number;
  trail?: number;
  opacity?: number;
  persistKey?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  /** 左端と右端、別々のばね。**この2本の速さの差が「伸び」そのもの**。 */
  const leftRef = useRef<Spring | null>(null);
  const rightRef = useRef<Spring | null>(null);
  const reduced = usePrefersReducedMotion();
  /** `paint` から読むので ref に控える（effect を張り直さないため）。 */
  const indexRef = useRef(index);
  indexRef.current = index;
  const opacityRef = useRef(opacity);
  opacityRef.current = opacity;

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
      el.style.opacity =
        indexRef.current < 0 ? "0" : String(Math.max(0, Math.min(1, opacityRef.current)));
      // **書いた値をそのまま控える。** 作り直されたら、ここから続ける。
      if (persistKey != null) {
        lastIndex.set(persistKey, {
          index: indexRef.current,
          l,
          r,
          trackW: track.getBoundingClientRect().width || 1,
        });
      }
    };

    /**
     * **生まれた場所。前に居た所から始める。**
     * 画面が入れ替わって作り直されたときだけ効く（初めてなら現在地）。
     */
    const now = Math.max(indexRef.current, 0);
    const carry = persistKey != null ? lastIndex.get(persistKey) : undefined;
    let start = edgesAt(now);
    if (carry) {
      // 幅が変わっていたら割合で読み替える（横向きにした直後など）。
      const w = track.getBoundingClientRect().width || 1;
      const k = carry.trackW > 0 ? w / carry.trackW : 1;
      start = { l: carry.l * k, r: carry.r * k };
    }
    leftRef.current = createSpring(start.l, paint, { damping: 1, response: lead });
    rightRef.current = createSpring(start.r, paint, { damping: 1, response: lead });
    paint();

    /**
     * **画面の幅が変わったら、ばねの値を入れ直す。**
     *
     * ばねが持っているのは px の位置なので、横向きにすると古い幅で出した
     * 位置のままになる。しかも `index` は変わらないので下の effect も走らず、
     * **次に押すまで直らない**。動かして直すのではなく `set` で入れ直す
     * （画面が回っている最中に印がぬるっと滑ると、回転そのものと喧嘩する）。
     */
    /**
     * **本当に幅が変わった時だけ入れ直す。**
     *
     * `ResizeObserver` は `observe()` した直後に**必ず1回**呼ばれる（今の
     * 大きさを知らせるため。仕様どおりの振る舞いで、異常ではない）。ここを
     * 素通しにしていたので、生まれた直後のこの1回が「前に居た所から始める」
     * 種を**移動先へ上書きして**いた — その結果、画面をまたいだときの尾が
     * まったく出ず、印が1フレームで飛んでいた（ブラウザ実測 29.2px → 294.5px
     * が1フレーム）。
     *
     * 幅を控えておいて、変わっていない回は何もしない。
     */
    let seenW = track.getBoundingClientRect().width;
    const onResize = () => {
      const w = track.getBoundingClientRect().width;
      if (w === seenW) return;
      seenW = w;
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
  }, [radiusRatio, lead, persistKey]);

  /** 薄さだけが変わった回（指がカメラに近づいた等）も塗り直す。 */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.opacity = index < 0 ? "0" : String(Math.max(0, Math.min(1, opacity)));
  }, [opacity, index]);

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
  }, [index, reduced, lead, trail, persistKey]);

  return (
    <span
      ref={ref}
      aria-hidden
      className={`sliding-indicator pointer-events-none absolute ${className ?? ""}`}
    />
  );
}
