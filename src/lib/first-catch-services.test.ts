import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { firstCatchPhoto } from "./first-catch-services";

afterEach(() => vi.unstubAllGlobals());

describe("first photo on iOS-like browsers", () => {
  it("uses the loaded camera image even when decode() rejects", async () => {
    const revoke = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: () => "blob:camera", revokeObjectURL: revoke });
    class CameraImage {
      naturalWidth = 2400;
      naturalHeight = 1600;
      width = 2400;
      height = 1600;
      complete = false;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      decode = () => Promise.reject(new Error("Safari decode failed"));
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    }
    const drawImage = vi.fn();
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage }),
      toDataURL: () => `data:image/jpeg;base64,${"A".repeat(300)}`,
    };
    vi.stubGlobal("Image", CameraImage);
    vi.stubGlobal("document", { createElement: () => canvas });
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    const photo = await firstCatchPhoto({ type: "image/heic", size: 1024 } as File);
    expect(photo).toMatch(/^data:image\/jpeg;base64,/);
    expect(canvas.width).toBe(1280);
    expect(canvas.height).toBe(853);
    expect(drawImage).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith("blob:camera");
  });

  it("releases an unsupported image and reports a recoverable error", async () => {
    const revoke = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: () => "blob:unsupported", revokeObjectURL: revoke });
    class UnsupportedImage {
      complete = false;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onerror?.()); }
    }
    vi.stubGlobal("Image", UnsupportedImage);
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    await expect(firstCatchPhoto({ type: "image/heic", size: 1024 } as File))
      .rejects.toThrow("FIRST_CATCH_PHOTO_UNSUPPORTED");
    expect(revoke).toHaveBeenCalledWith("blob:unsupported");
  });
});
