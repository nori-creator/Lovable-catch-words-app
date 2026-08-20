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
  HomeLoading,
  JournalLink,
  PastDays,
  PendingCapturesCard,
  ScrapbookAlbum,
} from "@/routes/_authenticated/home";
import { JournalWritingPage } from "@/components/JournalWritingPage";
import { JournalComposer } from "@/components/JournalComposer";
import { groupBySpan, localDayKey, type AlbumSpan } from "@/lib/album-span";
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

/**
 * 読み込み中。**起動するたびに必ず通る面**。
 * 上のバーと日付は先に出ているので、その下に台紙だけが空いている絵になる。
 */
export function HomeLoadingScene() {
  return (
    <>
      <DayHeader date={new Date()} />
      <HomeLoading />
    </>
  );
}

/**
 * 過去の日。区切り線と、出し切れていないときの断り。
 *
 * **日記の在る日と無い日を1枚に入れる**(要望 #22)。
 * 無い日に空の枠が並んでいないか、在る日が写真のページと
 * 向かい合って見えるか — どちらも絵でしか分からない。
 */
export function HomePastScene({ q }: { q: URLSearchParams }) {
  // 束ね方(オーナー指摘⑪)。日以外では**日記の紙を出さない**ので、
  // その3通りを1つの場面で撮り分ける。
  const raw = q.get("span") ?? "day";
  const span: AlbumSpan = raw === "week" || raw === "month" ? raw : "day";
  // **本物と同じ束ね方で作る。** ここで日ごとの塊を手で並べて見出しだけ
  // 週にすると、重なった範囲(「8/19–8/25」と「8/18–8/24」)が並ぶ、
  // 実際には起こらない絵になる。束ねるのはルートと同じ `groupBySpan`。
  const shots = [1, 2, 9, 40].flatMap((d) =>
    FIXTURES.slice(0, 4).map((f, i) => makeSticker(f, i, d)),
  );
  const days = groupBySpan(shots, (s) => new Date(s.created_at), span);
  // いちばん新しい束の1日目にだけ日記を置く。ほかは**何も出ないのが正しい姿**。
  const first = days[0];
  const journals = new Map([
    [
      // 日記は**地方時の**日付を鍵に持つ。`created_at` は UTC の文字列
      // なので、頭10文字を切ると UTC より西の人で1日ずれる。
      localDayKey(new Date(first[1][0].created_at)),
      {
        body: "今天在士林夜市喝了珍珠奶茶。天氣很熱,所以我點了少冰。老闆問我要不要加珍珠,我說要。",
        note: "「去」の後ろに「了」を入れると、行った動作が完了したことがはっきりします。",
        used_sticker_ids: [first[1][0].id, first[1][2].id],
      },
    ],
  ]);
  return (
    <PastDays
      days={days}
      bgClass="album-bg-paper"
      onOpen={() => {}}
      truncated
      shown={1000}
      total={1342}
      journals={journals}
      span={span}
      onSpan={() => {}}
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
      onCancelDiscard={() => {}}
    />
  );
}

/**
 * 日記を**書く**ときの見開き(オーナー指摘)。
 *
 * 左(上)に今日の写真、右(下)に書く紙。読む側の `DayJournalPage` と
 * **同じ紙・同じ綴じ目**になっているかは、並べた絵でしか分からない。
 * `JournalComposer` は問い合わせが空のまま描かれる — それでも
 * 「白紙・足場・ボタン」の配置は本物と同じ。
 */
export function HomeWritingScene() {
  return (
    <>
      <DayHeader date={new Date()} />
      <ScrapbookAlbum stickers={today} bgClass="album-bg-paper" onOpen={() => {}} />
      <JournalWritingPage onClose={() => {}}>
        <JournalComposer showHeading={false} />
      </JournalWritingPage>
    </>
  );
}
