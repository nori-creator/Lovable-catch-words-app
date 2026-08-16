/**
 * ホーム画面の場面。**ルートに書かれている本物のコンポーネントを描く。**
 *
 * ホームは起動して最初に見る面なのに、中身がルートのファイルに直書きで、
 * **一度も機械で見ていなかった**。復習と同じやり方でルート側に `export` を
 * 足し、ここからそのまま描く。HTMLをこちらに書き写すことはしない —
 * それをやると「直しても画像が変わらない検査」に戻る。
 */
import {
  BackgroundPicker,
  DayHeader,
  HomeEmptyState,
  JournalLink,
  PastDays,
  PendingCapturesCard,
  ScrapbookAlbum,
} from "@/routes/_authenticated/home";
import type { StickerWithWord } from "@/lib/stickers.functions";
import type { PendingCapture } from "@/lib/offline-queue";

const svg = (w: number, h: number, color: string) =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="4" fill="${color}"/></svg>`,
  );

/**
 * アルバムに並ぶ3通り: ①自撮りがある ②モノの写真だけ ③画像がまだ無い。
 * 台紙の上でどれも同じ大きさの白フチに収まるかを見たいので、縦横比も変える。
 */
const FIXTURES: Array<{ head: string; selfie?: string; object?: string }> = [
  { head: "珍珠奶茶", selfie: svg(120, 160, "#b07a4a") },
  { head: "夜市", object: svg(200, 120, "#d0483c") },
  { head: "腳踏車" },
  { head: "芒果", selfie: svg(140, 140, "#f5a623") },
  { head: "捷運", object: svg(110, 190, "#4a90d9") },
  { head: "雨傘" },
];

function makeSticker(f: (typeof FIXTURES)[number], i: number, day: number): StickerWithWord {
  const at = new Date(Date.now() - day * 24 * 60 * 60 * 1000).toISOString();
  return {
    id: `s${day}-${i}`,
    word_id: `w${i}`,
    caption: null,
    location_name: null,
    lat: null,
    lng: null,
    taken_at: at,
    created_at: at,
    encounter_count: 1,
    object_url: f.object ?? null,
    cutout_url: null,
    selfie_url: f.selfie ?? null,
    object_thumb_url: null,
    cutout_thumb_url: null,
    capture_type: "photo",
    placeholder_url: null,
    placeholder_credit: null,
    word: {
      headword: f.head,
      reading_zhuyin: null,
      pinyin: null,
      meaning_ja: "",
      part_of_speech: null,
      example_sentence: null,
      example_translation: null,
      level: null,
      category_key: "drink",
      silhouette_emoji: null,
      extras: null,
    },
  };
}

const today = FIXTURES.map((f, i) => makeSticker(f, i, 0));

/** 今日のアルバム。**普通の日にいちばん長く見ている面。** */
export function HomeScene({ q }: { q: URLSearchParams }) {
  const bg = q.get("bg") ?? "paper";
  return (
    <>
      <DayHeader date={new Date()} />
      <BackgroundPicker current={bg as "paper"} onChange={() => {}} />
      <ScrapbookAlbum stickers={today} bgClass={`album-bg-${bg}`} onOpen={() => {}} />
      <JournalLink />
    </>
  );
}

/**
 * まだ1枚も無い日。**入れたばかりの人が最初に見る面。**
 *
 * 台紙を選ぶ列は出さない — ルート側も、台紙が描かれていない日は出さない。
 * ここで出してしまうと、実物に無いものを検査することになる。
 */
export function HomeEmptyScene() {
  return (
    <>
      <DayHeader date={new Date()} />
      <HomeEmptyState />
    </>
  );
}

/** 過去の日。区切り線と、出し切れていないときの断り。 */
export function HomePastScene() {
  const days: Array<[string, StickerWithWord[]]> = [1, 2].map((d) => [
    new Date(Date.now() - d * 86400000).toLocaleDateString("en-CA"),
    FIXTURES.slice(0, 4).map((f, i) => makeSticker(f, i, d)),
  ]);
  return (
    <PastDays
      days={days}
      bgClass="album-bg-paper"
      onOpen={() => {}}
      truncated
      shown={1000}
      total={1342}
    />
  );
}

/** 圏外で撮って預かっている写真の帯。**オフラインでしか出ない面。** */
export function HomePendingScene({ q }: { q: URLSearchParams }) {
  // 2件目は `object_img` が空。写真が読めなかったときに WifiOff の絵に
  // 落ちる枝で、**圏外のときにだけ出る**ので今まで誰も見ていない。
  const base = { selfie_img: null, lat: null, lng: null, location_name: null };
  const pending: PendingCapture[] = [
    { ...base, id: "p1", created_at: Date.now(), object_img: svg(80, 80, "#8a7f6a") },
    { ...base, id: "p2", created_at: Date.now(), object_img: "" },
  ];
  return (
    <PendingCapturesCard
      pending={pending}
      confirming={q.get("variant") === "confirm"}
      onDiscard={() => {}}
    />
  );
}
