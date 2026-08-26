import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { attachStickerCutout, attachStickerSelfie } from "@/lib/stickers.functions";
import { putCachedImage } from "@/lib/image-cache";
import { downscaleDataUrl } from "@/lib/cutout";

/**
 * **その札に切り抜き／自撮りを足す。**
 *
 * オーナー指示 2026-08-26:
 * > 「画像をタップしたときに、元の画像、切り抜き、自撮りが表示されるけど。
 * >  もし切り抜きをしていない場合は切り抜くというボタンを、自撮りして
 * >  ない場合は自撮りをするボタンを表示して。」
 *
 * ## なぜ切り出したか — 詳細は2つある
 * 札の詳細は**2つの画面**にある。ホームやアルバムから開く `StickerSheet` と、
 * 図鑑から開く `/dex/$stickerId`。足す道は `StickerSheet` の中に直に
 * 書かれていて、**図鑑の側には無かった** — つまり図鑑から開いた人は、
 * 切り抜きも自撮りも足せないまま行き止まりだった。
 *
 * これはこの app が何度も踏んでいる形（声・場所・写真の選び方・ネット画像の
 * 自動添付）なので、**道をここに1つ置いて**両方から呼ぶ。
 *
 * ## 元の写真は差し替えない
 * 切り抜きは**足す**もので、元の写真の代わりではない。撮った物そのものは
 * その人の記録なので、こちらの都合で消さない。
 */

export type PhotoAttach = {
  /** いま上げている最中か。ボタンを止めるのに使う。 */
  busy: boolean;
  /** いま切り抜く（元の写真がある札だけ）。 */
  cutoutNow: (objectUrl: string) => Promise<void>;
  /** いま自撮りを足す。 */
  selfieNow: (file: File) => Promise<void>;
};

/** 署名URL・File のどちらからでも data URL にする。 */
async function toDataUrl(src: Blob): Promise<string> {
  return new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(new Error("read failed"));
    r.readAsDataURL(src);
  });
}

async function upload(blob: Blob, suffix: string): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error("Not signed in");
  const path = `${uid}/${Date.now()}-${suffix}`;
  const { error } = await supabase.storage
    .from("stickers")
    .upload(path, blob, { contentType: blob.type, upsert: false });
  if (error) throw error;
  // 上げた物はそのまま端末にも置く（次に開いたとき取りに行かない）。
  void putCachedImage(path, blob);
  return path;
}

export function usePhotoAttach(
  stickerId: string | null | undefined,
  opts?: { onDone?: () => void; onError?: (e: unknown) => void },
): PhotoAttach {
  const qc = useQueryClient();
  const attachCutoutFn = useServerFn(attachStickerCutout);
  const attachSelfieFn = useServerFn(attachStickerSelfie);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    if (!stickerId) return;
    await qc.invalidateQueries({ queryKey: ["sticker", stickerId] });
    void qc.invalidateQueries({ queryKey: ["stickers"] });
  }

  async function cutoutNow(objectUrl: string) {
    if (!stickerId || !objectUrl || busy) return;
    setBusy(true);
    try {
      const { removeBackgroundSmart } = await import("@/lib/cutout");
      // 署名URLから読み直す。**元の写真を差し替えない** — 足すのは切り抜きだけ。
      const dataUrl = await toDataUrl(await (await fetch(objectUrl)).blob());
      const cut = await removeBackgroundSmart(dataUrl);
      if (!cut) throw new Error("cutout failed");
      const path = await upload(await (await fetch(cut)).blob(), "cutout.png");
      await attachCutoutFn({ data: { sticker_id: stickerId, cutout_path: path } });
      await refresh();
      opts?.onDone?.();
    } catch (e) {
      // **黙って飲まない。** 待ったのに何も起きないのがいちばん困る。
      console.warn("cutout failed", e);
      opts?.onError?.(e);
    } finally {
      setBusy(false);
    }
  }

  async function selfieNow(file: File) {
    if (!stickerId || busy) return;
    setBusy(true);
    try {
      const small = await downscaleDataUrl(await toDataUrl(file), 1280, 0.82);
      const path = await upload(await (await fetch(small)).blob(), "selfie.jpg");
      await attachSelfieFn({ data: { sticker_id: stickerId, selfie_path: path } });
      await refresh();
      opts?.onDone?.();
    } catch (e) {
      // 切り抜きと同じ。**黙って飲まない。**
      console.warn("selfie failed", e);
      opts?.onError?.(e);
    } finally {
      setBusy(false);
    }
  }

  return { busy, cutoutNow, selfieNow };
}
