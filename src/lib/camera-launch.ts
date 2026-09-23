import { motionReducedNow } from "@/hooks/use-reduced-motion";

/**
 * カメラのタブを押したとき、下のレンズが撮影の世界へ広がる演出。
 *
 * ## なぜ React の状態でやらないのか（オーナー指摘 2026-09-15
 * 「カメラのアイコンを押した時のアニメーションが表示されるのが最初だけで
 * 2回目とか押すと表示されなくなる」）
 *
 * もとは `AppShell` が `cameraOpening` という状態を持ち、その状態が真の間だけ
 * 覆いを描いていた。ところが**この app は画面ごとに `AppShell` を描いている**
 * （16ファイルが各自 `<AppShell>` を持つ）。押すと画面が入れ替わる =
 * **覆いを持っている当人が消える**。演出は始まった瞬間に道連れになる。
 *
 * 最初の1回だけ見えていたのは、初回は行き先の読み込みに時間がかかって
 * 古い画面が少し残るから。2回目からは行き先が手元にあるので即座に入れ替わり、
 * **演出が始まる前に消える**。押す速さではなく、読み込みの速さで出たり
 * 出なかったりしていた。
 *
 * だから React の外に出す。`document.body` に直に貼り、720ms 後に自分で
 * 剥がす。画面が何回入れ替わろうと、貼った物は誰の持ち物でもないので消えない。
 */

/**
 * カメラの絵（lucide の `Camera` と同じ線）。React の外で描くので、
 * 部品ではなく SVG の文字列で持つ。帯の丸・シャッターと同じ 24px・白。
 */
const CAMERA_GLYPH =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>';

/** 演出の長さ(ms)。CSS の `camera-lens-open` と揃える。 */
const OPEN_MS = 720;
/** 動きを減らす設定のときの長さ。CSS の `-reduced` と揃える。 */
const OPEN_MS_REDUCED = 220;

/** いま出ている覆い。**二重に出さない**（連打しても1枚）。 */
let live: { el: HTMLElement; timer: number } | null = null;

/**
 * 撮る画面がいま出ているか。**画面自身に名乗らせる。**
 *
 * ## なぜ道の名前で判断しないのか（オーナー報告 3回目 2026-09-15
 * 「すでにカメラの画面が表示されてるのに、そこから上に上書きで
 * アニメーションが表示される」）
 *
 * ここは `pathname` と行き先を比べていた。末尾の `/` を見ていない、
 * 移動の途中で値が入れ替わる、道が増えたら比べ先も増える — **同じ事を
 * 別の場所から推測している限り、条件を足すたびに抜け道が増える。**
 *
 * 出ているかどうかを知っているのは、出ている画面そのもの。
 * 撮る画面が描かれている間だけ `true` にしてもらえば、道の名前が何であれ、
 * 移動の途中だろうが、**上に重ねて出すことはあり得なくなる**。
 */
let cameraScreenOpen = false;

/** 撮る画面が、描かれている間だけ呼ぶ（外れるときに必ず戻すこと）。 */
export function setCameraScreenOpen(open: boolean): void {
  cameraScreenOpen = open;
}

/**
 * 画面を入れ替えてよい頃合い(ms)。**育った板が画面の真ん中を覆ったあと。**
 *
 * ## なぜ待つのか（オーナー報告 2026-09-16
 * 「カメラのアイコン押したら、カメラの画面の黒い画面（カメラ画面は開いて
 *  ない）に移行し、その上から同じ画面のアニメーションが出て2重になってる。
 *  今開いてる画面からカメラのアニメーションが出るようにして」）
 *
 * 前は押した瞬間に移っていた。行き先の読み込みを先に済ませてある
 * （`useWarmCamera`）ので**すぐ着いてしまい**、まだ小さい板の後ろに
 * 行き先の黒い面が出る。押した画面から育つはずの物が、黒い面の上で
 * 育っているように見える ＝ 二重。
 *
 * かといって「着くまで何もしない」のは前に直した 0.52 秒の待ちに戻る
 * （押しても半秒なにも起きない）。**演出は押した瞬間に始め、入れ替えだけを
 * 板の裏に隠す。** 320ms は板が 264×396 まで育つ頃 — 画面の中央 2/3 を
 * 覆っているので、後ろが入れ替わっても縁しか見えない。
 */
const SWAP_AT_MS = 320;

export function playCameraLaunch(onSwap?: () => void): void {
  if (typeof document === "undefined") return;
  // すでに撮る画面が出ている。開く演出に用は無い（移動だけ通す）。
  if (cameraScreenOpen) {
    onSwap?.();
    return;
  }
  /**
   * **もう出ているなら、何もしない。**
   *
   * 前は「消してから出し直す」にしていた。重ならないので一見正しいが、
   * 連打すると**同じ絵が頭から何度も始まる**ので、見ている側には
   * 「もう1回重ねて出た」と映る（オーナー報告 2026-09-15）。
   * 開く演出は1回の操作に1つ。走っている間の押下は黙って捨てる。
   */
  if (live) {
    onSwap?.();
    return;
  }
  const el = document.createElement("div");
  el.className = "camera-launch";
  el.setAttribute("aria-hidden", "true");
  /**
   * 飛ぶのは**カメラの形をした物**（オーナー指示 2026-09-16、参考動画
   * `Camera transitions @SwatchThisApp`）。
   *
   * 下の丸が持ち上がりながら傾きを解き、画面いっぱいのカメラへ育つ。
   * 中身は行き先の縮図 — 暗い覗き窓と、その下の白いシャッター。育ち切った
   * ときに本物のシャッターとちょうど重なるので、**押す物が入れ替わった**
   * ように見える（丸1つが大きくなるだけだと、何になったのか読めない）。
   */
  const lens = document.createElement("span");
  lens.className = "camera-launch__lens";
  const eye = document.createElement("i");
  eye.className = "camera-launch__eye";
  lens.appendChild(eye);
  el.appendChild(lens);
  /**
   * **下の帯のカメラの丸が、そのままシャッターになる。**（オーナー指示
   * 2026-09-23「カメラのアイコンアニメーションともに下のバーのアイコンが
   * カメラボタンのシャッターアイコンになるようにアニメーションに追加して」）
   *
   * 育つ板（`lens`）とは別の物にする。板は傾きながら画面いっぱいに育つので、
   * その中に置くと一緒に傾いて伸びてしまう。丸は**帯の丸と同じ大きさ・同じ
   * 青・同じ白い絵**で始まり、まっすぐ上がって本物のシャッター（青い丸に
   * 白い絵・白い環）の位置と大きさで止まる。
   */
  const morph = document.createElement("span");
  morph.className = "camera-launch__morph";
  morph.innerHTML = CAMERA_GLYPH;
  el.appendChild(morph);
  document.body.appendChild(el);
  const reduced = motionReducedNow();
  const ms = reduced ? OPEN_MS_REDUCED : OPEN_MS;
  /**
   * **入れ替えは板の裏で。** 動きを減らす設定の人は演出が 220ms しか
   * 無いので、比で縮めて待ち時間が置き去りにならないようにする
   * （前にこれを忘れて、その設定の人だけ待たされ続けた）。
   */
  window.setTimeout(() => onSwap?.(), reduced ? 60 : SWAP_AT_MS);
  const timer = window.setTimeout(() => {
    el.remove();
    live = null;
  }, ms + 40);
  live = { el, timer };
}
