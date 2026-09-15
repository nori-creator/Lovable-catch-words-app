import { useLayoutEffect, useRef } from "react";
import { createSpring } from "@/lib/spring";
import { motionReducedNow } from "@/hooks/use-reduced-motion";

/**
 * 押した札が、**そのまま**単語の詳細の写真になる動き。
 *
 * ## 作り直した理由（オーナー報告 4回目 2026-09-16
 * 「いまだに、ホームの画像を押したあとに単語の詳細にいくアニメーションが変。
 *  一からやり直して。ホームのアルバムの画像がキュッと少し縮んで、ぱっと
 *  広がってそのままタンゴの詳細の画像になるアニメーション」）
 *
 * 前の作りは**写しを1枚飛ばす**方式だった（`HeroFlight`）。画面の一番上に
 * 同じ絵の複製を置き、`[data-sheet-hero]` を探して、そこへ向かって飛ばす。
 * これを雛形で道ごと繋いで測ったら、こう出た:
 *
 * | 時刻 | 面の濃さ | 入場クラス | 飛んでいる写し |
 * |---|---|---|---|
 * | 0ms | 0.00 | – | **有り** |
 * | 99ms | **1.00** | – | **有り** ← 面と写しが同時に見える＝二重 |
 * | 297ms | **0.00** | **material-in** | 無し ← **入場演出が頭からやり直す** |
 * | 594ms | 1.00 | material-in | 無し |
 *
 * 写しが着いた瞬間に「飛んでいる」が偽になり、そこで初めて入場クラスが
 * 付く。つまり**飛び終わってから、ふつうのフェードがもう一度走る**。
 * 実機は描画が遅いぶん前半が潰れるので、見えるのはフェードだけ — 報告の
 * 「パッと切り替わる」「チカチカする」はこれ。
 *
 * ## 何を変えたか — 写しを作らない
 * **動かすのは本物の見出しそのもの**（FLIP: 最後の姿を測り、押した所へ
 * 一旦ずらして、そこから戻す）。こうすると、前の作りが抱えていた2つの
 * 失敗の余地が**構造として消える**:
 *
 *  ・二重に見えない … 絵は1枚しか無い
 *  ・行き先を探さない … 動かしている物が行き先そのもの。見つからない、
 *    という状態があり得ない（前は `querySelector` が空振りすると、
 *    黙ってふつうの切り替えに落ちていた）
 *
 * 入場クラスも、**開いた時に一度だけ**決めて動きの途中では変えない。
 * 途中で変わると、上の表のように演出がやり直しになる。
 */

/** 押した札の、画面上の位置と大きさ。 */
export type HeroOrigin = {
  x: number;
  y: number;
  w: number;
  h: number;
  /** その札がいま出している絵。届くまでの間、見出しの地に敷く。 */
  url: string;
  /** 札の角の丸み(px)。 */
  radius: number;
};

/**
 * 「キュッ」の深さ。押した札の 0.92 倍から始める。
 *
 * オーナーの言う「キュッと少し縮んで、ぱっと広がって」の前半。押している
 * 間の縮み(`:active`)に頼ると、**指を離すのが速い人には出ない**ので、
 * 動きそのものの中に入れる。0.92 は札 207px で 17px ぶん — 目で拾えて、
 * かつ札が消えたようには見えない深さ。
 */
const SQUEEZE = 0.92;

/**
 * 「ぱっ」の跳ね。**大きさのばねだけ**に掛ける。
 *
 * `spring.ts` は 1/60 秒刻みの半陰的オイラーなので、理屈の行き過ぎ量は
 * そのまま出ない。**雛形で本物の道を通して実測した**（札 229px → 見出し
 * 358px、いちばん広がった幅 ÷ 落ち着いた幅）:
 *
 * | `damping` | 実測 | 見え方 |
 * |---|---|---|
 * | 0.62 | 1.011 倍（+3.9px） | ほとんど出ない |
 * | 0.58 | 1.023 倍（+8.2px） | 分かる |
 * | **0.54** | **1.032 倍（+11.3px）** | **はっきり「ぱっ」** |
 * | 0.50 | 1.045 倍（+16.2px） | 弾みすぎ |
 *
 * 居場所は跳ねさせない — 跳ねると行き先を通り過ぎて見える。
 */
const POP = { damping: 0.54, response: 0.4 } as const;
/** 居場所は行き過ぎ無しで詰める。 */
const GLIDE = { damping: 1, response: 0.4 } as const;

/** 動きを減らす設定のときの長さ(ms)。位置は変えず、濃さだけ。 */
const REDUCED_MS = 160;

/**
 * 見出しの箱に付ける。`origin` が来た回だけ動く。
 *
 * @param origin 押した札の矩形。`null` なら何もしない（ふつうに出る）。
 * @param key    開くたびに変わる値（札の id）。これが変わった時だけ走る。
 * @param onDone 動き終わった合図。面の入場クラスを外す等に使う。
 */
export function useHeroReveal(origin: HeroOrigin | null, key: string | null, onDone?: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  /** もう走らせた開き方。同じ開きで二度走らせない。 */
  const ranFor = useRef<string | null>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useLayoutEffect(() => {
    const el = ref.current;
    /**
     * **閉じたら、走らせた印を捨てる。**
     *
     * 印を残したままだと「同じ札をもう一度開く」が素通りする — 閉じても
     * `key` は同じままなので `ranFor.current === key` が成り立ってしまう。
     * 雛形で実測して見つけた（1回目 0.92→1.031倍、2回目は**まったく
     * 動かない**）。
     */
    if (!el || !origin || !key) {
      ranFor.current = null;
      return;
    }
    if (ranFor.current === key) return;
    ranFor.current = key;

    // **最後の姿を測る**（FLIP の L）。この時点で本物は組み上がっている。
    const last = el.getBoundingClientRect();
    if (last.width < 1 || last.height < 1) return;

    const finish = () => {
      el.style.transformOrigin = "";
      el.style.translate = "";
      el.style.scale = "";
      el.style.backgroundImage = "";
      el.style.backgroundSize = "";
      el.style.backgroundPosition = "";
      el.style.borderRadius = "";
      el.style.overflow = "";
      el.style.willChange = "";
      doneRef.current?.();
    };

    if (motionReducedNow()) {
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: REDUCED_MS, easing: "ease-out" });
      finish();
      return;
    }

    /**
     * **写真を1コマ目から出す。** 詳細の写真は端末の控えから取り出すので、
     * 届くまでに数百ms掛かることがある。その間ずっと空の箱が広がるのでは
     * 「そのまま詳細の画像になる」に見えない。押した札がいま出している絵を
     * 地に敷いておく。同じ写真なので、本物が乗った瞬間の入れ替わりは見えない。
     */
    el.style.backgroundImage = `url("${origin.url}")`;
    el.style.backgroundSize = "cover";
    el.style.backgroundPosition = "center";
    el.style.overflow = "hidden";
    el.style.willChange = "translate, scale";

    // **押した所へ一旦ずらす**（FLIP の I）。左上を基準に置くと、拡大と
    // 移動を1つの `scale` + `translate` で表せる。
    el.style.transformOrigin = "0 0";

    /**
     * **ばねは px で回す。0〜1 の割合では回さない。**
     *
     * `spring.ts` の「止まった」判定は `|x-target| < 0.05` と
     * `|v| < 0.5` で、どちらも**画面上の px として**選ばれた値。倍率
     * (0.66 → 1.0) をそのまま入れると、1.0 まで 0.05 の所で打ち切られる
     * ＝ 跳ねが丸ごと消える（前に同じ罠を踏んで、行き過ぎが意図の
     * 4.6% に対し実測 0.7% しか出なかった）。
     *
     * だから**幅と高さを px で**動かし、倍率はそこから割り算で出す。
     */
    const w0 = origin.w * SQUEEZE;
    const h0 = origin.h * SQUEEZE;
    const x0 = origin.x + (origin.w - w0) / 2 - last.left;
    const y0 = origin.y + (origin.h - h0) / 2 - last.top;
    const endRadius = parseFloat(getComputedStyle(el).borderRadius) || 0;

    const paint = () => {
      el.style.translate = `${px.value()}px ${py.value()}px`;
      el.style.scale = `${pw.value() / last.width} ${ph.value() / last.height}`;
      el.style.borderRadius = `${pr.value()}px`;
    };

    const px = createSpring(x0, paint, GLIDE);
    const py = createSpring(y0, paint, GLIDE);
    const pw = createSpring(w0, paint, POP);
    const ph = createSpring(h0, paint, POP);
    const pr = createSpring(origin.radius, paint, GLIDE);
    const all = [px, py, pw, ph, pr];
    paint();

    /**
     * 止まったかを見る係。**ばね自身の刻みに片付けを任せない** —
     * ばねは止まると自分の rAF を畳むので、そこから先は誰も呼ばれない。
     * 片付けを最後の1本に合わせたいので、こちらで見張る。
     */
    let watch = 0;
    const rest = () =>
      Math.abs(px.value()) < 0.5 &&
      Math.abs(py.value()) < 0.5 &&
      Math.abs(pw.value() - last.width) < 0.5 &&
      Math.abs(ph.value() - last.height) < 0.5;
    const watchStep = () => {
      if (rest()) {
        all.forEach((sp) => sp.dispose());
        finish();
        return;
      }
      watch = requestAnimationFrame(watchStep);
    };

    // 1コマ置いてから目標を渡す。同じコマで渡すと、押した所に置いた姿が
    // 一度も描かれないまま動き出す（＝「キュッ」が出ない）。
    const id = requestAnimationFrame(() => {
      px.to(0);
      py.to(0);
      pw.to(last.width);
      ph.to(last.height);
      pr.to(endRadius);
      watch = requestAnimationFrame(watchStep);
    });

    return () => {
      cancelAnimationFrame(id);
      cancelAnimationFrame(watch);
      all.forEach((sp) => sp.dispose());
    };
  }, [origin, key]);

  return ref;
}
