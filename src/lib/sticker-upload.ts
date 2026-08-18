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
