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
