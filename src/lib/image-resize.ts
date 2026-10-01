/**
 * 写真の縮小・縮小写真（サムネイル）・その置き場所。
 *
 * もとは切り抜き（`cutout.ts`）の中に同居していた。切り抜きは 2026-10-01 に消したが、
 * これらは撮った写真の保存・一覧に毎回使うので、ここへ移した。
 */
/** 長い辺を `maxSide` 以下に縮めた data URL（すでに小さい JPEG はそのまま返す）。 */
export async function downscaleDataUrl(
  dataUrl: string,
  maxSide: number,
  quality = 0.85,
  format: "image/jpeg" | "image/png" = "image/jpeg",
): Promise<string> {
  const img = new Image();
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error("image load failed"));
    img.src = dataUrl;
  });
  const longest = Math.max(img.width, img.height);
  if (longest <= maxSide && dataUrl.startsWith("data:image/jpeg")) return dataUrl;
  const scale = Math.min(1, maxSide / longest);
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  const ctx = c.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL(format, quality);
}

/**
 * Small grid thumbnail (~10-50KB) for a just-uploaded image. Uploaded next to
 * the original as `${path}.thumb.webp`; the 図鑑/アルバム grids load these
 * instead of multi-MB camera photos (the "画像が上からカクカク降りてくる" was
 * baseline-JPEG decode of full-size photos). toBlob falls back to PNG on
 * browsers without WebP encoding — blob.type carries the real content type.
 */
export async function makeThumbBlob(dataUrl: string, maxSide = 400): Promise<Blob | null> {
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("image load failed"));
      img.src = dataUrl;
    });
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.width * scale));
    c.height = Math.max(1, Math.round(img.height * scale));
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise<Blob | null>((res) => c.toBlob((b) => res(b), "image/webp", 0.8));
  } catch {
    return null;
  }
}

/** Storage-path convention shared with listMyStickers on the server. */
export function thumbPath(path: string): string {
  return `${path}.thumb.webp`;
}
