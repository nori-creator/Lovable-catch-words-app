import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  native: false,
  saveDataUrl: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => mocks.native },
  registerPlugin: () => ({ saveDataUrl: mocks.saveDataUrl }),
}));

import {
  photoLibrarySaveRequiresUserGesture,
  saveCaptureToPhotoLibrary,
} from "./device-photo-library";

describe("端末フォトへの保存", () => {
  beforeEach(() => {
    mocks.native = false;
    mocks.saveDataUrl.mockReset();
    vi.unstubAllGlobals();
  });

  it("設定がOFFなら端末へ何も書かない", async () => {
    vi.stubGlobal("localStorage", { getItem: () => "0" });
    expect(await saveCaptureToPhotoLibrary("data:image/jpeg;base64,AA==")).toBe("disabled");
    expect(mocks.saveDataUrl).not.toHaveBeenCalled();
  });

  it("Lovableのブラウザ版ではJPEGをダウンロードする", async () => {
    vi.stubGlobal("localStorage", { getItem: () => "1" });
    const click = vi.fn();
    const remove = vi.fn();
    const appendChild = vi.fn();
    const anchor = { href: "", download: "", hidden: false, click, remove };
    vi.stubGlobal("document", {
      createElement: vi.fn(() => anchor),
      body: { appendChild },
    });

    expect(await saveCaptureToPhotoLibrary("data:image/jpeg;base64,AA==")).toBe("saved");
    expect(anchor.href).toBe("data:image/jpeg;base64,AA==");
    expect(anchor.download).toMatch(/^Catchwords-.*\.jpg$/);
    expect(appendChild).toHaveBeenCalledWith(anchor);
    expect(click).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    expect(photoLibrarySaveRequiresUserGesture()).toBe(true);
  });

  it("Androidアプリでは共有フォト用プラグインへ渡す", async () => {
    mocks.native = true;
    mocks.saveDataUrl.mockResolvedValue({ saved: true });
    vi.stubGlobal("localStorage", { getItem: () => "1" });

    expect(await saveCaptureToPhotoLibrary("data:image/jpeg;base64,AA==")).toBe("saved");
    expect(mocks.saveDataUrl).toHaveBeenCalledWith({
      dataUrl: "data:image/jpeg;base64,AA==",
      filename: expect.stringMatching(/^Catchwords-.*\.jpg$/),
    });
    expect(photoLibrarySaveRequiresUserGesture()).toBe(false);
  });

  it("端末側が拒否したら失敗として画面へ返す", async () => {
    mocks.native = true;
    mocks.saveDataUrl.mockRejectedValue(new Error("denied"));
    vi.stubGlobal("localStorage", { getItem: () => "1" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(await saveCaptureToPhotoLibrary("data:image/jpeg;base64,AA==")).toBe("failed");
    warn.mockRestore();
  });
});
