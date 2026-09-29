import { describe, expect, it } from "vitest";
import {
  isAllowedModelUrl,
  readTripoKey,
  object3dAllowed,
  pickGlbUrl,
  readObject3dConfig,
  readTripoTask,
  tripoTaskBody,
} from "./object3d";

/** 2026-09-28 R13「撮ったものが3Dの360度回転してリアルなものをゲットできる機能」。 */
describe("撮った物を 3D で手に入れる（Pro）", () => {
  it("窓口が無ければ機能は準備中。https 以外の窓口は使わない（鍵を平文で送らない）", () => {
    expect(readObject3dConfig({}).endpoint).toBeNull();
    expect(
      readObject3dConfig({ OBJECT3D_ENDPOINT: "http://gpu.example.com/run" }).endpoint,
    ).toBeNull();
    const c = readObject3dConfig({
      OBJECT3D_ENDPOINT: "https://gpu.example.com/run",
      OBJECT3D_API_KEY: "secret",
      OBJECT3D_PROVIDER: "trellis2",
    });
    expect(c).toEqual({
      endpoint: "https://gpu.example.com/run",
      provider: "trellis2",
      hasKey: true,
    });
    // 鍵の値そのものは設定に持ち回らない。
    expect(JSON.stringify(c)).not.toContain("secret");
  });

  it("知らない名前の窓口は custom", () => {
    expect(readObject3dConfig({ OBJECT3D_PROVIDER: "foo" }).provider).toBe("custom");
  });

  it("Pro だけ", () => {
    expect(object3dAllowed({ isPro: true })).toBe(true);
    expect(object3dAllowed({ isPro: false })).toBe(false);
  });

  it("よくある返事の形から GLB の場所を取り出す", () => {
    expect(pickGlbUrl({ glb: "https://cdn.x/a.glb" })).toBe("https://cdn.x/a.glb");
    expect(pickGlbUrl({ output: ["https://cdn.x/p.png", "https://cdn.x/m.glb"] })).toBe(
      "https://cdn.x/m.glb",
    );
    expect(pickGlbUrl({ model_mesh: { url: "https://fal.media/files/x/model.glb" } })).toBe(
      "https://fal.media/files/x/model.glb",
    );
    expect(pickGlbUrl({ url: "http://cdn.x/a.glb" })).toBeNull();
    expect(pickGlbUrl({ url: "https://cdn.x/a.png" })).toBeNull();
    expect(pickGlbUrl(null)).toBeNull();
  });

  it("Tripo: 下書きは色なし・1万面、仕上げは色と質感つき（添付の GitHub と同じ頼み方）", () => {
    expect(tripoTaskBody("tok", "preview")).toMatchObject({
      type: "image_to_model",
      texture: false,
      face_limit: 10000,
      file: { file_token: "tok" },
    });
    expect(tripoTaskBody("tok", "final")).toMatchObject({ texture: true, pbr: true });
  });

  it("Tripo の進み具合を読む", () => {
    expect(readTripoTask({ code: 0, data: { status: "running", progress: 42 } })).toEqual({
      status: "running",
      progress: 42,
    });
    expect(
      readTripoTask({
        code: 0,
        data: { status: "success", output: { pbr_model: "https://tripo-data.x/m.glb" } },
      }),
    ).toEqual({ status: "success", progress: 100, modelUrl: "https://tripo-data.x/m.glb" });
    expect(readTripoTask({ code: 0, data: { status: "failed", progress: 10 } }).status).toBe(
      "failed",
    );
    expect(readTripoTask({ code: 1003 }).status).toBe("failed");
  });

  it("中継するのは Tripo の配信先だけ（踏み台にされない）", () => {
    expect(isAllowedModelUrl("https://tripo-data.rg1.data.tripo3d.com/a/m.glb")).toBe(true);
    expect(isAllowedModelUrl("https://api.tripo3d.ai/x.glb")).toBe(true);
    expect(isAllowedModelUrl("https://evil.example.com/m.glb")).toBe(false);
    expect(isAllowedModelUrl("http://tripo3d.ai/m.glb")).toBe(false);
    expect(isAllowedModelUrl("https://tripo3d.ai.evil.com/m.glb")).toBe(false);
    expect(isAllowedModelUrl("https://tripo-data.evil.com/m.glb")).toBe(false);
  });
});

describe("readTripoKey（Secrets の名前が違っても鍵を見つける）", () => {
  it("TRIPO_API_KEY を最初に見る", () => {
    expect(readTripoKey({ TRIPO_API_KEY: " tsk_a ", TRIPO_KEY: "tsk_b" })).toEqual({
      key: "tsk_a",
      source: "TRIPO_API_KEY",
    });
  });
  it("別の名前でも拾い、名前を返す", () => {
    expect(readTripoKey({ TRIPO3D_API_KEY: "tsk_c" })?.source).toBe("TRIPO3D_API_KEY");
  });
  it("空なら null", () => {
    expect(readTripoKey({ TRIPO_API_KEY: "  " })).toBeNull();
  });
});
