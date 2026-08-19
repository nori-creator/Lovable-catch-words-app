/**
 * 写真1枚を storage に上げる所。
 *
 * ## なぜ切り出したか
 * これまで `capture.tsx` の保存関数の**中に閉じた関数**として書いてあり、
 * 初回のキャッチからしか呼べなかった。再会(同じものをもう一度撮る)の枝は
 * この関数に手が届かず、**撮った写真をそのまま捨てていた**。
 * 同じ手順を2つ目の場所に書き写すと、片方だけ直す事故が必ず起きるので、
 * 呼べる場所に出す。
 */
import { supabase } from "@/integrations/supabase/client";
import { makeThumbBlob, thumbPath } from "@/lib/cutout";
import { putCachedImage } from "@/lib/image-cache";

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return await res.blob();
}

/**
 * 上げて、storage のパスを返す。上げるものが無ければ null。
 *
 * 一覧用の小さい画像も一緒に作るが、**そちらの失敗では投げない** —
 * 一覧は元の画像に落ちるようになっている。本体の失敗だけが失敗。
 */
export async function uploadStickerImage(opts: {
  userId: string;
  dataUrl: string | null;
  /** ファイル名に入る種別(object / cutout / selfie / encounter …)。 */
  kind: string;
  /** 同じ回のアップロードで揃える時刻。省略すると now。 */
  ts?: number;
}): Promise<string | null> {
  const { userId, dataUrl, kind } = opts;
  if (!dataUrl) return null;
  const ts = opts.ts ?? Date.now();
  const blob = await dataUrlToBlob(dataUrl);
  const ext = blob.type.includes("png") ? "png" : "jpg";
  const path = `${userId}/${ts}-${kind}.${ext}`;
  const thumbPromise = makeThumbBlob(dataUrl); // 本体を上げている間に作る
  const { error } = await supabase.storage.from("stickers").upload(path, blob, {
    contentType: blob.type,
    upsert: false,
  });
  if (error) throw error;
  const thumb = await thumbPromise;
  if (thumb) {
    await supabase.storage
      .from("stickers")
      .upload(thumbPath(path), thumb, {
        contentType: thumb.type || "image/webp",
        upsert: true,
      })
      .catch(() => {});
    void putCachedImage(thumbPath(path), thumb);
  }
  // 端末側の控えに入れておく。いま上げたものを下ろし直さずに図鑑へ出せる。
  void putCachedImage(path, blob);
  return path;
}

/**
 * 画像の URL を、保存できる data URL にする。
 *
 * ネットの画像は CORS があるのでサーバ経由で取りに行くしかない。
 * **AI が作った画像は最初から `data:image/png;base64,…` で返ってくる**
 * (`images.functions.ts` の `generateOneAiImage`)ので、取りに行く必要が無い。
 *
 * ## なぜ関数にしたか
 * この判断が `ImagePicker.tsx` にしか無く、`StickerSheet.tsx` の3箇所は
 * **無条件に**サーバへ渡していた。`fetchImageAsDataUrl` は `https:` 以外を
 * 投げる(SSRF 除け)ので、生成画像は**画面に出るのに押しても保存できない**
 * 状態だった(自動の仮画像は無言で失敗、差し替えは「写真の取得に失敗」)。
 * 判断が2箇所に散っている限り片方だけ直る。だから1つにする。
 */
export async function toImageDataUrl(
  url: string,
  fetchImage: (args: { data: { url: string } }) => Promise<{ dataUrl: string }>,
): Promise<string> {
  if (url.startsWith("data:")) return url;
  const { dataUrl } = await fetchImage({ data: { url } });
  return dataUrl;
}
