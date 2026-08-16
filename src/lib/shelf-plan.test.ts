import { describe, it, expect } from "vitest";
import { buildShelfPlan, shelfKeyOf, type ShelvedItem, type UserShelf } from "./shelf-plan";
import { ROOM_KEYS } from "./category";

const item = (id: string, category: string | null, shelf?: string | null): ShelvedItem => ({
  id,
  shelf_key: shelf ?? null,
  word: { category_key: category },
});

const shelf = (key: string, room: string, label = key, roomLabel = room): UserShelf => ({
  key,
  label,
  emoji: "🧺",
  room_key: room,
  room_label: roomLabel,
});

const plan = (items: ShelvedItem[], userShelves: UserShelf[] = [], activeShelf?: string | null) =>
  buildShelfPlan({
    items,
    userShelves,
    activeShelf,
    labelForCategory: (k) => `cat:${k}`,
    labelForRoom: (k) => `room:${k}`,
  });

describe("shelfKeyOf", () => {
  it("上書きが無ければ語の分類を使う", () => {
    expect(shelfKeyOf(item("a", "fruit"), new Set())).toBe("fruit");
  });

  it("上書きが在ればそれを使う", () => {
    expect(shelfKeyOf(item("a", "fruit", "temple_offering"), new Set(["temple_offering"]))).toBe(
      "temple_offering",
    );
  });

  it("**消えた棚を指していたら語の既定へ戻す**", () => {
    // 棚を消しても写真は消さない(外部キーを張っていない)。
    // 拾い手がここに無いと、消えた棚の名前で1枚が宙に浮く。
    expect(shelfKeyOf(item("a", "fruit", "deleted_shelf"), new Set())).toBe("fruit");
  });

  it("知らない分類は other に落ちる", () => {
    expect(shelfKeyOf(item("a", "存在しない"), new Set())).toBe("other");
    expect(shelfKeyOf(item("a", null), new Set())).toBe("other");
  });
});

describe("buildShelfPlan", () => {
  it("中身のある部屋と棚だけを返す", () => {
    const rooms = plan([item("a", "fruit")]);
    expect(rooms).toHaveLength(1);
    expect(rooms[0].shelves).toHaveLength(1);
    expect(rooms[0].shelves[0].key).toBe("fruit");
    expect(rooms[0].shelves[0].items.map((i) => i.id)).toEqual(["a"]);
  });

  it("既定の部屋の順は正規の順のまま(棚が増えても位置が動かない)", () => {
    // 単語が毎回同じ場所に居ることが記憶の手がかりなので、ここが崩れると
    // 図鑑の存在理由が消える。
    const rooms = plan([item("a", "tool"), item("b", "fruit")]);
    const order = rooms.map((r) => r.key);
    const canonical = ROOM_KEYS.filter((r) => order.includes(r));
    expect(order).toEqual(canonical);
  });

  it("その人の棚は、既定の棚の**後ろ**に同じ部屋の中で並ぶ", () => {
    const rooms = plan(
      [item("a", "fruit"), item("b", "fruit", "night_market_snack")],
      [shelf("night_market_snack", "eat")],
    );
    const eat = rooms.find((r) => r.key === "eat")!;
    expect(eat.shelves.map((s) => s.key)).toEqual(["fruit", "night_market_snack"]);
    expect(eat.shelves[1].custom).toBe(true);
    expect(eat.shelves[0].custom).toBe(false);
  });

  it("知らない部屋を指した棚は、**新しい部屋として後ろに生える**", () => {
    const rooms = plan(
      [item("a", "fruit"), item("b", null, "temple_offering")],
      [shelf("temple_offering", "faith", "廟のお供え", "信仰")],
    );
    expect(rooms.map((r) => r.key)).toEqual(["eat", "faith"]);
    const faith = rooms[1];
    expect(faith.custom).toBe(true);
    expect(faith.label).toBe("信仰");
    expect(faith.shelves[0].label).toBe("廟のお供え");
  });

  it("同じ新しい部屋に複数の棚が入っても、部屋は1つだけ", () => {
    const rooms = plan(
      [item("a", null, "temple_offering"), item("b", null, "temple_charm")],
      [shelf("temple_offering", "faith"), shelf("temple_charm", "faith")],
    );
    expect(rooms).toHaveLength(1);
    expect(rooms[0].shelves.map((s) => s.key)).toEqual(["temple_offering", "temple_charm"]);
  });

  it("空の棚は返さない — 定義だけ在って中身が無い棚は出さない", () => {
    const rooms = plan([item("a", "fruit")], [shelf("temple_offering", "faith")]);
    expect(rooms.map((r) => r.key)).toEqual(["eat"]);
  });

  it("絞り込み中はその棚だけ", () => {
    const rooms = plan(
      [item("a", "fruit"), item("b", "tool"), item("c", null, "temple_offering")],
      [shelf("temple_offering", "faith")],
      "temple_offering",
    );
    expect(rooms).toHaveLength(1);
    expect(rooms[0].shelves).toHaveLength(1);
    expect(rooms[0].shelves[0].items.map((i) => i.id)).toEqual(["c"]);
  });

  it("1枚も無ければ空を返す(空の棚の告知で埋め尽くさない)", () => {
    expect(plan([])).toEqual([]);
  });
});
