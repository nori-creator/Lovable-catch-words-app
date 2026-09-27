import { useEffect, useState } from "react";
import { cutoutClippedEdges } from "./capture-framing";

/**
 * 切り抜いた絵が**写真の縁で切れているか**を、画面に出る前に調べる
 * （オーナー指摘 2026-09-27「シールを剥がす時に初めて収まってないと気付く」）。
 *
 * 小さく縮めて透明度だけを見るので、端末の負担は無視できる（160px 四方）。
 * 読めない絵（別のサーバの画像で canvas が汚れる等）は「切れていない」とする —
 * 知らせる手段が無いだけで、キャッチを止める理由にはしない。
 */
export function useCutoutClipped(url: string | null): boolean {
  const [clipped, setClipped] = useState(false);
  useEffect(() => {
    setClipped(false);
    if (!url) return;
    let alive = true;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    img
      .decode()
      .then(() => {
        if (!alive) return;
        const scale = Math.min(1, 160 / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, w, h);
        const rgba = ctx.getImageData(0, 0, w, h).data;
        const alpha = new Uint8Array(w * h);
        let opaque = 0;
        for (let i = 0; i < alpha.length; i++) {
          alpha[i] = rgba[i * 4 + 3];
          if (alpha[i] >= 128) opaque++;
        }
        // ほぼ全部が不透明なら、切り抜けなかった写真そのもの（地が残っている）。
        // それは「物が切れている」のではないので知らせない。
        if (opaque / alpha.length > 0.95) return;
        setClipped(cutoutClippedEdges(alpha, w, h).length > 0);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [url]);
  return clipped;
}
