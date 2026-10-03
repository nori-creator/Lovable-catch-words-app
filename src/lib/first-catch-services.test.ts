import { afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  signInAnonymously: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth } }));
import {
  ensureFirstCatchSession,
  firstCatchPhoto,
  isNetworkFailure,
  FIRST_CATCH_NETWORK,
} from "./first-catch-services";
import { createFirstCatchServices } from "./first-catch-ai-client";

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
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
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
    expect(canvas.width).toBe(1024);
    expect(canvas.height).toBe(683);
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
      set src(_value: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal("Image", UnsupportedImage);
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    await expect(firstCatchPhoto({ type: "image/heic", size: 1024 } as File)).rejects.toThrow(
      "FIRST_CATCH_PHOTO_UNSUPPORTED",
    );
    expect(revoke).toHaveBeenCalledWith("blob:unsupported");
  });
});

describe("anonymous fallback: network failures are not 'unavailable before signup'", () => {
  /** Supabase Auth の通信失敗と同じ形（`AuthRetryableFetchError`, status 0）。 */
  function retryableFetchError() {
    return Object.assign(new Error("Failed to fetch"), {
      name: "AuthRetryableFetchError",
      status: 0,
    });
  }

  it("maps a network failure of signInAnonymously to FIRST_CATCH_NETWORK", async () => {
    auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    auth.signInAnonymously.mockResolvedValueOnce({ data: {}, error: retryableFetchError() });
    await expect(ensureFirstCatchSession()).rejects.toThrow(FIRST_CATCH_NETWORK);
  });

  it("keeps FIRST_CATCH_GUEST_UNAVAILABLE when anonymous sign-in is refused", async () => {
    auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    auth.signInAnonymously.mockResolvedValueOnce({
      data: {},
      error: Object.assign(new Error("Anonymous sign-ins are disabled"), {
        name: "AuthApiError",
        status: 422,
      }),
    });
    await expect(ensureFirstCatchSession()).rejects.toThrow("FIRST_CATCH_GUEST_UNAVAILABLE");
  });

  it("recognises browser fetch failures (Chrome, Safari, Firefox)", () => {
    expect(isNetworkFailure(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkFailure(new TypeError("Load failed"))).toBe(true);
    expect(isNetworkFailure(new TypeError("NetworkError when attempting to fetch resource."))).toBe(
      true,
    );
    expect(isNetworkFailure(retryableFetchError())).toBe(true);
    expect(isNetworkFailure(new Error("FIRST_CATCH_LIMIT"))).toBe(false);
    expect(isNetworkFailure(new Error("FIRST_CATCH_ANALYSIS_TIMEOUT"))).toBe(false);
  });
});

describe("first-catch services", () => {
  const draft = {
    version: 1 as const,
    id: "00000000-0000-4000-8000-000000000009",
    uiLanguage: "zh-TW" as const,
    targetLanguage: "en" as const,
    dailyMinutes: 10 as const,
    stage: "camera" as const,
    photo: null,
    card: null,
    capturedAt: null,
  };

  it("sends a downscaled copy of the photo to the AI", async () => {
    const request = vi.fn(async (_data: unknown) => ({ suggestions: [] }));
    const original = `data:image/jpeg;base64,${"B".repeat(400)}`;
    const small = `data:image/jpeg;base64,${"S".repeat(200)}`;
    const services = createFirstCatchServices(
      request,
      async () => {},
      async () => small,
    );
    await services.suggest(original, draft);
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ action: "suggest", photo: small }),
    );
  });

  it("falls back to the original photo when downscaling fails", async () => {
    const request = vi.fn(async (_data: unknown) => ({ suggestions: [] }));
    const original = `data:image/jpeg;base64,${"B".repeat(400)}`;
    const services = createFirstCatchServices(
      request,
      async () => {},
      async () => {
        throw new Error("image load failed");
      },
    );
    await services.suggest(original, draft);
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ photo: original }));
  });

  it("accepts a candidate without a meaning (no display-language meaning available)", async () => {
    const services = createFirstCatchServices(
      async () => ({
        suggestions: [{ headword: "flower", meaning_ja: "", category_key: "flower" }],
      }),
      async () => {},
    );
    const result = await services.suggest(`data:image/jpeg;base64,${"A".repeat(200)}`, draft);
    expect(result.suggestions[0]).toMatchObject({ headword: "flower", meaning_ja: "" });
  });
});
