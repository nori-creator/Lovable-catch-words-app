import { describe, expect, it } from "vitest";
import {
  baseStickerId,
  encounterAlbumId,
  isEncounterAlbumId,
  mergeAlbumEncounters,
  type AlbumEncounter,
} from "./album-encounters";
import type { StickerWithWord } from "./stickers.functions";

const sticker = {
  id: "s1",
  created_at: "2026-09-01T03:00:00Z",
  taken_at: "2026-09-01T03:00:00Z",
  object_url: "orig",
  selfie_url: "selfie",
  caption: "最初の一言",
  album_x: 0.3,
} as unknown as StickerWithWord;

const enc: AlbumEncounter = {
  id: "e1",
  sticker_id: "s1",
  created_at: "2026-09-23T05:00:00Z",
  location_name: "士林",
  lat: 25,
  lng: 121,
  image_url: "again",
  thumb_url: null,
};

describe("再会の写真もアルバムに（オーナー指示 2026-09-23）", () => {
  it("その日の写しとして足す（写真・時刻・場所だけ差し替え、一言と置き方は持ち越さない）", () => {
    const out = mergeAlbumEncounters([sticker], [enc]);
    expect(out).toHaveLength(2);
    const copy = out[1];
    expect(copy.id).toBe(encounterAlbumId("s1", "e1"));
    expect(copy.created_at).toBe(enc.created_at);
    expect(copy.object_url).toBe("again");
    expect(copy.selfie_url).toBeNull();
    expect(copy.caption).toBeNull();
    expect(copy.album_x).toBeNull();
    expect(copy.location_name).toBe("士林");
  });
  it("元の札が一覧に無い再会は足さない", () => {
    expect(mergeAlbumEncounters([sticker], [{ ...enc, sticker_id: "other" }])).toHaveLength(1);
  });
  it("写しを押したら元の札を開く・置き方は保存しない", () => {
    const id = encounterAlbumId("s1", "e1");
    expect(isEncounterAlbumId(id)).toBe(true);
    expect(baseStickerId(id)).toBe("s1");
    expect(isEncounterAlbumId("s1")).toBe(false);
    expect(baseStickerId("s1")).toBe("s1");
  });
});
