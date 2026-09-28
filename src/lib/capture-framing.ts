/** Crop the video to exactly the object-cover viewport, including digital zoom. */
export function viewfinderCrop(
  videoWidth: number,
  videoHeight: number,
  width: number,
  height: number,
  zoom = 1,
) {
  const scale = Math.max(width / videoWidth, height / videoHeight) * Math.max(1, zoom);
  const sw = width / scale,
    sh = height / scale;
  return { sx: (videoWidth - sw) / 2, sy: (videoHeight - sh) / 2, sw, sh };
}

/**
 * **見た目で補うぶんの倍率**（オーナー報告 2026-09-22
 * 「撮影のカメラが画面で表示される画面が寄りなのに、取った後の画像が
 *  引きの画像になってる…引きで取ると撮り終わった画像はもっと引きに
 *  なってる」）。
 *
 * ## なぜ食い違うか
 * 倍率は2つの道で当たる — 端末のレンズ（`applyConstraints`）と、
 * 見た目だけの拡大（CSS）。前は「端末が倍率を持っていると**言った**」
 * だけで前者に任せ、撮るときの切り出しには `1` を渡していた。
 *
 * ところが `applyConstraints` は、**受け取っておきながら何も変えない**
 * ことがある（Android の一部のカメラでよくある。約束は解決するのに
 * `getSettings().zoom` は 1 のまま）。すると
 *
 *   ・覗いている絵 … レンズが効いていないので等倍
 *   ・撮れる写真 … 切り出しも等倍
 *
 * で一致するはずだが、**効く端末と効かない端末が混ざる**と、
 * どちらの道も「相手がやってくれている」と思って手を引く。
 * 結果、倍率を上げるほど写真だけが引きになる。
 *
 * ## 直し方
 * 「頼んだ倍率」ではなく「**本当に効いた倍率**」を読み、その差だけを
 * 見た目と切り出しの**両方に同じ数**で渡す。レンズが効いたなら 1
 * （どちらも何もしない）、効かなかったなら頼んだぶんそのまま。
 */
export function residualZoom(requested: number, applied: number | null | undefined): number {
  const want = Number.isFinite(requested) && requested > 0 ? requested : 1;
  const got = typeof applied === "number" && Number.isFinite(applied) && applied > 0 ? applied : 1;
  return Math.max(1, want / got);
}

/**
 * **映像を枠に「収める」ときの、絵が実際に描かれる四角**（オーナー指摘
 * 2026-09-27「カメラモードと自撮りモードの画面が寄りすぎ。撮った後の画像も
 * 寄りすぎで見切れてる。カメラを全画面に表示しているのが原因なら全画面表示は
 * 辞めて」）。
 *
 * 前は縦長の画面いっぱいに横長（4:3）の映像を**覆うように**敷いていたので、
 * 390×844 の画面では映像の横幅の**3分の1ほどしか見えていなかった**
 * （0.46 ÷ 1.33）。撮る写真もその見えている所だけを切り出していたので、
 * 覗いても撮っても寄りすぎていた。
 *
 * いまは枠を映像と同じ縦横比にして**全部を見せる**（`object-fit: contain`）。
 * 枠の縦横比がずれた端末でも、絵を切らずに上下か左右に帯が出るだけにする。
 * 帯のぶんを除いた「絵がある四角」を返す。
 */
export function containRect(
  videoWidth: number,
  videoHeight: number,
  width: number,
  height: number,
) {
  const scale = Math.min(width / videoWidth, height / videoHeight);
  const w = videoWidth * scale;
  const h = videoHeight * scale;
  return { x: (width - w) / 2, y: (height - h) / 2, w, h };
}

/**
 * **切り抜いた物が写真の縁で切れているか**（同日「普通に撮った写真がシールの
 * 中に収まるようにして。シールを剥がす時に初めて収まってないと気付く」）。
 *
 * 切り抜きは透明な地に物だけが残る。縁の1列（上下左右）のうち、不透明な点が
 * 一定の割合を超えていれば、物が写真の外まで続いていた — つまりシールでも
 * そこで切れる。剥がす前に知らせるために使う。
 *
 * `alpha` は幅×高さの透明度（0〜255）。縁は各辺 `band` 列ぶんを見る。
 */
export function cutoutClippedEdges(
  alpha: ArrayLike<number>,
  width: number,
  height: number,
  { band = 2, threshold = 0.04, opaque = 128 } = {},
): Array<"top" | "bottom" | "left" | "right"> {
  const edges: Array<"top" | "bottom" | "left" | "right"> = [];
  const at = (x: number, y: number) => alpha[y * width + x] ?? 0;
  const rowShare = (y: number) => {
    let n = 0;
    for (let x = 0; x < width; x++) if (at(x, y) >= opaque) n++;
    return n / width;
  };
  const colShare = (x: number) => {
    let n = 0;
    for (let y = 0; y < height; y++) if (at(x, y) >= opaque) n++;
    return n / height;
  };
  const worst = (f: (i: number) => number, from: number, step: number) => {
    let m = 0;
    for (let i = 0; i < band; i++) m = Math.max(m, f(from + i * step));
    return m;
  };
  if (worst(rowShare, 0, 1) > threshold) edges.push("top");
  if (worst(rowShare, height - 1, -1) > threshold) edges.push("bottom");
  if (worst(colShare, 0, 1) > threshold) edges.push("left");
  if (worst(colShare, width - 1, -1) > threshold) edges.push("right");
  return edges;
}
