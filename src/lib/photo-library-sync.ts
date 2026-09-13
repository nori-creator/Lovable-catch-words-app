import { Capacitor } from "@capacitor/core";

const KEY = "photo-library-sync-v1";
const EVENT = "photo-library-sync-changed";

/** 初期値はオン。明示的にオフへ変えた端末だけ保存しない。 */
export function isPhotoLibrarySyncEnabled(): boolean {
  if (typeof localStorage === "undefined") return true;
  return localStorage.getItem(KEY) !== "0";
}

export function setPhotoLibrarySyncEnabled(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    /* 保存できない端末では既定のオンとして扱う */
  }
}

export function photoLibrarySyncEvent(): string {
  return EVENT;
}

export function canSyncToPhotoLibrary(): boolean {
  return Capacitor.isNativePlatform();
}
