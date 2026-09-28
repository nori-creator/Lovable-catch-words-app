import { describe, expect, it } from "vitest";
import { object3dAllowed, pickGlbUrl, readObject3dConfig } from "./object3d";

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
});
