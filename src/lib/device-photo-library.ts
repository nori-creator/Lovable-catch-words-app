import { Capacitor, registerPlugin } from "@capacitor/core";
import { isPhotoLibrarySyncEnabled } from "./photo-library-sync";

type PhotoLibraryPlugin = {
  saveDataUrl(options: { dataUrl: string; filename: string }): Promise<{ saved: boolean }>;
};

const PhotoLibrary = registerPlugin<PhotoLibraryPlugin>("PhotoLibrary");

/** Androidアプリだけで共有フォト領域へ保存する。失敗してもキャッチは止めない。 */
export async function saveCaptureToPhotoLibrary(dataUrl: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || !isPhotoLibrarySyncEnabled()) return false;
  try {
    const result = await PhotoLibrary.saveDataUrl({
      dataUrl,
      filename: `Catchwords-${new Date().toISOString().replace(/[:.]/g, "-")}.jpg`,
    });
    return result.saved;
  } catch (error) {
    console.warn("photo library save failed", error);
    return false;
  }
}