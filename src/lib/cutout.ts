/**
 * Shared in-browser cutout pipeline (@imgly/background-removal).
 *
 * Speed strategy (roadmap B2):
 * - the smallest model variant (isnet_quint8) — same silhouette quality at
 *   sticker sizes, a fraction of the download and inference time
 * - preloadCutout() lets camera screens warm the module + model while the
 *   user is still framing the shot, so the first catch doesn't pay the cold start
 * - inputs are downscaled before segmentation; stickers never need more than
 *   ~1000px on the long side
 */

type ImglyModule = typeof import("@imgly/background-removal");

const CUTOUT_CONFIG = {
  model: "isnet_quint8",
  output: { format: "image/png", quality: 0.9 },
} as const;

let modPromise: Promise<ImglyModule> | null = null;

function loadModule(): Promise<ImglyModule> {
  if (!modPromise) {
    modPromise = import("@imgly/background-removal");
    modPromise.catch(() => {
      modPromise = null; // allow retry after a failed (e.g. offline) load
    });
  }
  return modPromise;
}

/** Warm the wasm module and model weights ahead of the first real cutout. */
export function preloadCutout(): void {
  void loadModule()
    .then((mod) => mod.preload(CUTOUT_CONFIG))
    .catch(() => {});
}

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

/**
 * Preferred cutout path: remove.bg via the server (fast, highest quality)
 * when REMOVE_BG_API_KEY is configured, otherwise the free in-browser
 * pipeline below. Any API failure (no key, quota, network) falls back
 * silently — a catch must never fail because a paid service hiccuped.
 */
export async function removeBackgroundSmart(dataUrl: string): Promise<string> {
  try {
    const { removeBackgroundApi } = await import("./cutout.functions");
    // Higher input resolution than the local path — the API is doing the
    // heavy lifting server-side, so give it more pixels to work with.
    const input = await downscaleDataUrl(dataUrl, 1600, 0.9);
    const r = await removeBackgroundApi({ data: { imageBase64: input } });
    if (r.available && r.image) return r.image;
  } catch {
    /* fall back to local */
  }
  return removeBackgroundFast(dataUrl);
}

/**
 * Remove the background from a data-URL image and return a transparent PNG
 * data URL. Throws on failure — callers keep their own crop fallback.
 */
export async function removeBackgroundFast(dataUrl: string): Promise<string> {
  const t0 = performance.now();
  const small = await downscaleDataUrl(dataUrl, 1000, 0.85);
  const mod = await loadModule();
  const blob = await (await fetch(small)).blob();
  const out = await mod.removeBackground(blob, CUTOUT_CONFIG);
  const result: string = await new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res(reader.result as string);
    reader.onerror = () => rej(new Error("read failed"));
    reader.readAsDataURL(out as Blob);
  });
  if (import.meta.env.DEV) {
    console.info(`[cutout] ${Math.round(performance.now() - t0)}ms`);
  }
  return result;
}
