import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GRID_PHOTO_LIMIT, gridPhotoPaths, pickGridPhotoUrls } from "./encounters.functions";
import { dexCycleFrames } from "./dex-book";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("図鑑の升目で入れ替わる再会の写真（上限つき・小さな写し）", () => {
  it("上限まで、同じ写真は1つ。写し（.thumb.webp）と元の写真を並べる", () => {
    const rows = [
      { image_path: "u/1.jpg", cutout_path: null },
      { image_path: null, cutout_path: "u/2.png" },
      { image_path: "u/1.jpg", cutout_path: null },
      { image_path: null, cutout_path: null },
      { image_path: "u/3.jpg", cutout_path: null },
      { image_path: "u/4.jpg", cutout_path: null },
      { image_path: "u/5.jpg", cutout_path: null },
    ];
    const got = gridPhotoPaths(rows);
    expect(got).toHaveLength(GRID_PHOTO_LIMIT);
    expect(GRID_PHOTO_LIMIT).toBeLessThanOrEqual(4);
    expect(got[0]).toEqual({ path: "u/1.jpg", thumb: "u/1.jpg.thumb.webp" });
    expect(got.map((g) => g.path)).toEqual(["u/1.jpg", "u/2.png", "u/3.jpg", "u/4.jpg"]);
  });

  it("写しが在れば写し、無ければ元の写真、どちらも無ければ出さない", () => {
    const wanted = gridPhotoPaths([
      { image_path: "u/1.jpg", cutout_path: null },
      { image_path: "u/2.jpg", cutout_path: null },
      { image_path: "u/3.jpg", cutout_path: null },
    ]);
    const urls = pickGridPhotoUrls(wanted, [
      { path: "u/1.jpg.thumb.webp", signedUrl: "T1", error: null },
      { path: "u/1.jpg", signedUrl: "O1", error: null },
      { path: "u/2.jpg.thumb.webp", signedUrl: null, error: "Object not found" },
      { path: "u/2.jpg", signedUrl: "O2", error: null },
      { path: "u/3.jpg.thumb.webp", signedUrl: null, error: "Object not found" },
      { path: "u/3.jpg", signedUrl: null, error: "Object not found" },
    ]);
    expect(urls).toEqual(["T1", "O2"]);
  });

  it("描くのは表と次の1枚だけ（画面の外・動かさない時は表だけ）", () => {
    expect(dexCycleFrames(6, 2, true)).toEqual([
      { k: 2, role: "current" },
      { k: 3, role: "next" },
    ]);
    expect(dexCycleFrames(6, 5, true)).toEqual([
      { k: 5, role: "current" },
      { k: 0, role: "next" },
    ]);
    expect(dexCycleFrames(6, 2, false)).toEqual([{ k: 2, role: "current" }]);
    expect(dexCycleFrames(1, 0, true)).toEqual([{ k: 0, role: "current" }]);
    expect(dexCycleFrames(0, 0, true)).toEqual([]);
  });

  it("升目は詳細の全部の写真の問い合わせを使わない", () => {
    const dex = source("components/screens/DexScreen.tsx");
    const fn = dex.slice(dex.indexOf("function DexCyclingPhoto("));
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    expect(body).toMatch(/useServerFn\(listStickerGridPhotos\)/);
    expect(body).not.toMatch(/useServerFn\(listStickerPhotos\)/);
    expect(body).toMatch(/dexCycleFrames\(/);
    expect(body).not.toMatch(/list\.map\(/);
  });
});

describe("図鑑の画面のつなぎ", () => {
  const dex = source("components/screens/DexScreen.tsx");
  it("番号は全部の札を読み終えてから覚える", () => {
    expect(dex).toMatch(/loadingMore=\{stickers\?\.loadingMore \?\? false\}/);
    expect(dex).toMatch(
      /localDexNumberStore\(readUid\(\), lang\),[^)]*!loadingMore && !truncated,/,
    );
  });
  it("写真の升目の広告は捕まえた札のマスだけで数える", () => {
    expect(dex).toMatch(/\? dexAdGroupSizes\(sections\)/);
    expect(dex).not.toMatch(/sections\.map\(\(sec\) => sec\.slots\.length\)/);
  });
});
