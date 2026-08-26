import { describe, it, expect } from "vitest";
import { shouldGeocode, metersBetween, REGEOCODE_METERS } from "./geo-warm";

/**
 * オーナー報告 2026-08-26（3度目）「撮った地図の地名が表示されてない」。
 *
 * 地名は `resolve()` の戻り値に入っていなかった（画面の写しだけが後から
 * 名前を持ち、保存された行は永久に `null`）。直しは「座標と一緒に温める」。
 * ここが守るのは**温め直す条件**だけ — 毎回引くと歩くだけで server を
 * 何十回も叩き、引かなさすぎると名前が古い場所のまま残る。
 */

const TAIPEI = { lat: 25.033, lng: 121.5654 };

describe("metersBetween", () => {
  it("同じ点は 0", () => {
    expect(metersBetween(TAIPEI, TAIPEI)).toBe(0);
  });

  it("緯度 0.001 度 ≒ 111m", () => {
    const d = metersBetween(TAIPEI, { ...TAIPEI, lat: TAIPEI.lat + 0.001 });
    expect(d).toBeGreaterThan(105);
    expect(d).toBeLessThan(118);
  });

  it("**経度は緯度で縮む**（台北では 1 度が 111km より短い）", () => {
    const ns = metersBetween(TAIPEI, { ...TAIPEI, lat: TAIPEI.lat + 0.01 });
    const ew = metersBetween(TAIPEI, { ...TAIPEI, lng: TAIPEI.lng + 0.01 });
    expect(ew).toBeLessThan(ns);
  });
});

describe("shouldGeocode", () => {
  it("まだ一度も引いていなければ引く", () => {
    expect(shouldGeocode(null, TAIPEI)).toBe(true);
  });

  it("**名前が取れていなければ引き直す**（前回返らなかっただけかもしれない）", () => {
    expect(shouldGeocode({ ...TAIPEI, name: null }, TAIPEI)).toBe(true);
  });

  it("同じ場所で名前が在れば引かない（歩くたびに叩かない）", () => {
    expect(shouldGeocode({ ...TAIPEI, name: "士林" }, TAIPEI)).toBe(false);
  });

  it("少し動いただけでは引かない", () => {
    const near = { lat: TAIPEI.lat + 0.0002, lng: TAIPEI.lng };
    expect(metersBetween(TAIPEI, near)).toBeLessThan(REGEOCODE_METERS);
    expect(shouldGeocode({ ...TAIPEI, name: "士林" }, near)).toBe(false);
  });

  it("**別の場所へ動いたら引き直す**（名前が前の街のまま残らない）", () => {
    const far = { lat: TAIPEI.lat + 0.003, lng: TAIPEI.lng };
    expect(metersBetween(TAIPEI, far)).toBeGreaterThan(REGEOCODE_METERS);
    expect(shouldGeocode({ ...TAIPEI, name: "士林" }, far)).toBe(true);
  });
});
