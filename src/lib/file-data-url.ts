/**
 * 選んだファイルを data URL にする。
 *
 * ## なぜ切り出したか
 * 同じ `FileReader` の3行が `ImagePicker` / `StickerSheet`(2箇所) /
 * `ScanCatchSheet` / `InputCatchSheet` に**5つ**書かれていた。
 * この app が繰り返してきた「同じ処理が兄弟の画面に散らばって、片方だけ
 * 直る」形そのもの(声の選び方3箇所・写真の選び方10箇所)。
 * 新しく足す所からは、必ずここを使う。
 */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    // **失敗を握り潰さない。** 読めなかったファイルを空文字で先へ流すと、
    // 「送ったのに何も起きない」になる。
    r.onerror = () => reject(r.error ?? new Error("ファイルを読み込めませんでした"));
    r.readAsDataURL(file);
  });
}
