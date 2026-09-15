import { Capacitor, registerPlugin } from "@capacitor/core";
import { isPhotoLibrarySyncEnabled } from "./photo-library-sync";

type PhotoLibraryPlugin = {
  saveDataUrl(options: { dataUrl: string; filename: string }): Promise<{ saved: boolean }>;
};

const PhotoLibrary = registerPlugin<PhotoLibraryPlugin>("PhotoLibrary");

export type PhotoLibrarySaveResult = "saved" | "disabled" | "failed";

/** Webの自動ダウンロードは、ボタンを押した瞬間に始めないとブラウザに止められる。 */
export function photoLibrarySaveRequiresUserGesture(): boolean {
  return !Capacitor.isNativePlatform();
}

function captureFilename(now = new Date()): string {
  return `Catchwords-${now.toISOString().replace(/[:.]/g, "-")}.jpg`;
}

/**
 * Lovable をスマホのブラウザで開いている場合の保存経路。
 *
 * WebページはOSの写真ライブラリへ無断で書き込めない。その代わり、ユーザーが
 * 「図鑑に追加」を押した同じ操作の中でJPEGをダウンロードする。Androidでは
 * Google Photosの「このデバイス上」/ Downloads から見える。ネイティブ版は
 * 下のCapacitorプラグインを使うため、この経路には来ない。
 */
function downloadCapture(dataUrl: string, filename: string): boolean {
  if (typeof document === "undefined") return false;
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  return true;
}

/** 端末の共有フォト領域（Web版はDownloads）へ保存する。失敗してもキャッチは止めない。 */
export async function saveCaptureToPhotoLibrary(dataUrl: string): Promise<PhotoLibrarySaveResult> {
  if (!isPhotoLibrarySyncEnabled()) return "disabled";
  const filename = captureFilename();

  if (!Capacitor.isNativePlatform()) {
    try {
      return downloadCapture(dataUrl, filename) ? "saved" : "failed";
    } catch (error) {
      console.warn("photo download failed", error);
      return "failed";
    }
  }

  try {
    const result = await PhotoLibrary.saveDataUrl({
      dataUrl,
      filename,
    });
    return result.saved ? "saved" : "failed";
  } catch (error) {
    console.warn("photo library save failed", error);
    return "failed";
  }
}
