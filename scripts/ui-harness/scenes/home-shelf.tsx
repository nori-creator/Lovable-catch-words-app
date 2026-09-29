/**
 * **ホームの一番上の本棚**（本番の `HomeShelf` をそのまま使う。R17: 部屋に置いた大きな棚、
 * 部屋は A（自然光）に決まった。オーナー指示 2026-09-29
 * 「ホームのアルバムの一番上に本棚を一列作って。またアルバムを開くとその月の最初のページが
 * 開くようにして。見開きの片側ページを長押しではなくタップすると片側ページが全画面に」）。
 *
 * 写真は端末に同梱の見本、撮った日は今日から遡って 7 か月ぶん。日記は見本の文（保存は
 * その場だけ）。上の帯の右端に小さな棚（本番と同じ並び）、下には今日のアルバムが続く。
 */
import { HomeShelf } from "@/components/HomeShelf";
import { FIXTURES, HomeScene, makeSticker } from "./home";

const PHOTOS = [
  "/first-catch-cafe.webp",
  "/first-catch-cat.webp",
  "/first-catch-flower.webp",
  "/first-catch-interests.webp",
  "/first-catch-ready.webp",
];
const NOTES = ["並んでも飲みたかった！", "猫が店番してた", undefined, "本屋さんで見つけた"];

/** 今日から遡って、1か月に数日ずつ、1日1〜3枚。 */
const ITEMS = Array.from({ length: 7 }, (_, month) =>
  Array.from({ length: 3 + (month % 3) }, (_, k) => {
    const back = month * 30 + k * 6 + (month === 0 ? 0 : 2);
    return Array.from({ length: 1 + ((month + k) % 3) }, (_, j) => {
      const f = FIXTURES[(month * 3 + k + j) % FIXTURES.length];
      return makeSticker(
        {
          ...f,
          object: PHOTOS[(month + k + j) % PHOTOS.length],
          selfie: undefined,
          net: undefined,
          caption: j === 0 ? NOTES[(month + k) % NOTES.length] : undefined,
        },
        month * 100 + k * 10 + j,
        back,
      );
    });
  }).flat(),
).flat();

const DIARIES = [
  "今日は士林夜市へ。珍珠奶茶を頼むとき「半糖少冰」と言えた。\n店員さんに通じてうれしかった。",
  "雨の日。捷運で隣の人が読んでいた本のタイトルが気になって、写真を撮った。\n今天下雨，可是心情很好。",
  "",
  "朝ごはんに蛋餅。お店のおばさんが「要不要加辣？」と聞いてくれた。\n辣は「からい」。やっと聞き取れた！",
];

export function HomeShelfScene({ q }: { q: URLSearchParams }) {
  // 本番と同じ並び: 上の帯（アイコンと「CatchWords」）のすぐ下に、画面の幅いっぱいの部屋と棚。
  // 棚・日付・今日のアルバムは同じ 1 枚の壁（`.home-scene`）の上に載る（R19: 1つの作品）。
  // 部屋は A（自然光）に決まった。`?months=1` で「1か月しか撮っていない人」（本が1冊だけ）を見る。
  const months = Number(q.get("months") ?? 7);
  const items =
    months >= 7
      ? ITEMS
      : ITEMS.filter((s) => Date.now() - Date.parse(s.created_at) < months * 30 * 864e5);
  return (
    <div className="home-scene">
      <HomeShelf
        items={items}
        loaders={{
          diary: async (month) => {
            const [y, m] = month.split("-").map(Number);
            const days = new Set(
              ITEMS.map((s) => new Date(s.created_at))
                .filter((d) => d.getFullYear() === y && d.getMonth() + 1 === m)
                .map((d) => d.getDate()),
            );
            return [...days].map((d, i) => ({
              date: `${month}-${String(d).padStart(2, "0")}`,
              text: DIARIES[i % DIARIES.length],
            }));
          },
          save: async () => {},
        }}
      />
      <HomeScene q={q} />
    </div>
  );
}
