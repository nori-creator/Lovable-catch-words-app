/**
 * ホーム画面の場面。**ルートに書かれている本物のコンポーネントを描く。**
 *
 * ホームは起動して最初に見る面なのに、中身がルートのファイルに直書きで、
 * **一度も機械で見ていなかった**。復習と同じやり方でルート側に `export` を
 * 足し、ここからそのまま描く。HTMLをこちらに書き写すことはしない —
 * それをやると「直しても画像が変わらない検査」に戻る。
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { StickerSheet } from "@/components/StickerSheet";
import type { HeroOrigin as FlightOrigin } from "@/components/use-hero-reveal";
import { DEFAULT_TARGET_LANGUAGE } from "@/lib/target-lang";
import {
  DiaryDate,
  dayTagline,
  HomeEmptyState,
  HomeLoading,
  JournalLink,
  PastDays,
  PendingCapturesCard,
  DayCollage,
} from "@/routes/_authenticated/home";
import { JournalWritingPage } from "@/components/JournalWritingPage";
import { JournalComposer } from "@/components/JournalComposer";
import { groupBySpan, type AlbumSpan } from "@/lib/album-span";
import type { StickerWithWord } from "@/lib/stickers.functions";
import type { PendingCapture } from "@/lib/offline-queue";
import { tStatic } from "@/lib/i18n";
import { parseWallpaper, wallClass } from "@/lib/wallpaper";
import { WallpaperPicker } from "@/components/WallpaperPicker";

const svg = (w: number, h: number, color: string) =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="4" fill="${color}"/></svg>`,
  );

/**
 * アルバムに並ぶ4通り: ①自撮りがある ②モノの写真だけ ③画像がまだ無い
 * ④**ネットの絵しか無い**(文字キャッチの語)。
 * 台紙の上でどれも同じ大きさの白フチに収まるかを見たいので、縦横比も変える。
 *
 * ④が要る理由(オーナー指摘 2026-08-21): 文字で入れた語はアルバムに
 * **字だけ**で並ぶ。詳細を開くとネットの絵が見出しに入るので、その絵が
 * アルバム側へ回り込んでいないかは**絵でしか確かめられない**。
 */
/**
 * 時刻・書いた1言・場所も入れる(オーナー指示 2026-09-17)。
 * ホームは**撮った時刻の道順**になったので、時刻がばらけていない
 * 作り物では「朝から夜へ辿る」という肝心の所が一度も撮れない。
 * 1言の無い札・場所の無い札も混ぜる — 無い日に空の紙が挟まらないかを見る。
 */
export const FIXTURES: Array<{
  head: string;
  gloss?: string;
  selfie?: string;
  object?: string;
  net?: string;
  /** その日の何時何分に撮ったか。 */
  at: [number, number];
  caption?: string;
  place?: string;
}> = [
  {
    head: "珍珠奶茶",
    gloss: "タピオカミルクティー",
    selfie: svg(120, 160, "#b07a4a"),
    at: [9, 20],
    caption: "朝いちばんの一杯。氷少なめでと言えた。",
    place: "台北駅 地下街",
  },
  { head: "夜市", gloss: "夜市", object: svg(200, 120, "#d0483c"), at: [11, 5] },
  { head: "腳踏車", gloss: "自転車", at: [12, 40], caption: "看板の字だけ拾った。" },
  {
    head: "芒果",
    gloss: "マンゴー",
    selfie: svg(140, 140, "#f5a623"),
    at: [14, 10],
    place: "永康街",
  },
  {
    head: "捷運",
    gloss: "MRT",
    object: svg(110, 190, "#4a90d9"),
    at: [17, 45],
    caption: "改札の上の表示。読めた!",
    place: "中山駅",
  },
  { head: "雨傘", gloss: "傘", at: [19, 2] },
  { head: "獎學金", gloss: "奨学金", net: svg(160, 160, "#2f8f5b"), at: [21, 30] },
];

export function makeSticker(f: (typeof FIXTURES)[number], i: number, day: number): StickerWithWord {
  const d = new Date(Date.now() - day * 24 * 60 * 60 * 1000);
  d.setHours(f.at[0], f.at[1], 0, 0);
  const at = d.toISOString();
  return {
    id: `s${day}-${i}`,
    word_id: `w${i}`,
    caption: f.caption ?? null,
    location_name: f.place ?? null,
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
    placeholder_url: f.net ?? null,
    placeholder_credit: null,
    word: {
      language: DEFAULT_TARGET_LANGUAGE,
      headword: f.head,
      reading_zhuyin: null,
      pinyin: null,
      meaning_ja: f.gloss ?? "",
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
  // `?wall=cork` などで壁紙を替えて撮る（オーナー指示 2026-09-23）。
  const wall = parseWallpaper(q.get("wall"));
  return (
    <>
      <DayCollage
        stickers={today}
        opening
        onOpen={() => {}}
        surface={wallClass(wall)}
        heading={<DiaryDate date={new Date()} />}
      />
    </>
  );
}

/** 設定の「ホームの壁紙」。5つの見本の札（実物と同じ留め方）。 */
export function WallpaperPickerScene() {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <WallpaperPicker value="cork" />
    </div>
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
      <HomeEmptyState message={tStatic("home.blankStreak", { n: 3 })} />
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
      <DiaryDate date={new Date()} />
      <HomeLoading />
    </>
  );
}

/**
 * 過去の日。区切り線と、出し切れていないときの断り。
 *
 * **日記は出さない**（オーナー指示 2026-09-22「ホームの日記は消して」）。
 */
export function HomePastScene({ q }: { q: URLSearchParams }) {
  // 束ね方(オーナー指摘⑪)。日以外では**日記の紙を出さない**ので、
  // その3通りを1つの場面で撮り分ける。
  // 束ね方は消した(オーナー指示「ホームの画面の日、週、月のボタンを消して」)。
  // 過去は**日ごとに並べて、下へスクロールする**だけ。
  const span: AlbumSpan = "day";
  // **本物と同じ束ね方で作る。** ここで日ごとの塊を手で並べて見出しだけ
  // 週にすると、重なった範囲(「8/19–8/25」と「8/18–8/24」)が並ぶ、
  // 実際には起こらない絵になる。束ねるのはルートと同じ `groupBySpan`。
  const shots = [1, 2, 9, 40].flatMap((d) =>
    FIXTURES.slice(0, 4).map((f, i) => makeSticker(f, i, d)),
  );
  const days = groupBySpan(shots, (s) => new Date(s.created_at), span);
  return <PastDays days={days} onOpen={() => {}} truncated shown={1000} total={1342} />;
}

/**
 * **指で自由に置く誌面(`DayCollage`)だけを見る場面。**
 *
 * ホームそのもの（`HomeScene`）は表紙も過去の日も付くので、
 * 置き方・重なり・時刻の出方だけを見たいときはこちらを開く。
 */
export function HomeAlbumScene() {
  return <DayCollage stickers={today} onOpen={() => {}} />;
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
      <DayCollage
        stickers={today}
        opening
        onOpen={() => {}}
        heading={<DiaryDate date={new Date()} />}
      />
      <JournalWritingPage onClose={() => {}}>
        <JournalComposer showHeading={false} />
      </JournalWritingPage>
    </>
  );
}

/**
 * 本棚と見開き(オーナー指摘 2026-08-21 ⑬⑭)。
 *
 * **束ね方を3通りとも撮る。** 週と月は「小さく・多く」が注文なので、
 * 実際に小さくなって多く並んでいるかは絵でしか分からない。
 * 1枚選んだ形(左に絵・右に日記)も別に撮る。
 */

/**
 * **押してから詳細が開くまでの道を、そのまま通す場面。**
 *
 * ## なぜ足したか（オーナー報告 4回目 2026-09-16
 * 「いまだに、ホームの画像を押したあとに単語の詳細にいくアニメーションが変」）
 *
 * ここまで `HomeScene` は `onOpen={() => {}}` で、**押した先が繋がって
 * いなかった**。飛ぶ絵の部品（`hero-flight` の場面）だけは測っていたので
 * 「部品は動く・実物は動かない」がずっと見えなかった。
 *
 * この場面は本物の誌面（`DayCollage`）を描き、押したときに
 * `flightFrom` が何を返したかを**画面に出す**。飛ぶ元が取れていなければ、
 * その時点で `null` と出る — どこで切れているかが一目で分かる。
 */
export function HomeTapScene() {
  const [got, setGot] = useState<string>("まだ押していない");
  const [openId, setOpenId] = useState<string | null>(null);
  const [openFrom, setOpenFrom] = useState<FlightOrigin | null>(null);
  /**
   * 面は本物の `StickerSheet`。サーバは無いので、一覧の種
   * (`seedStickerFromList` が読む `["stickers"]`) を先に置いておく。
   * 実物でもこの種から組み上がるので、道は同じ。
   */
  const qc = useQueryClient();
  if (!qc.getQueryData(["stickers", "harness"])) {
    qc.setQueryData(["stickers", "harness"], { items: today });
  }
  return (
    <>
      <p
        data-flight-origin={got}
        style={{
          padding: "8px 12px",
          borderRadius: 12,
          background: got.startsWith("{") ? "#dcfce7" : "#fee2e2",
          fontFamily: "ui-monospace, monospace",
          fontSize: 12,
          wordBreak: "break-all",
        }}
      >
        飛ぶ元: {got}
      </p>
      <DayCollage
        stickers={today}
        onOpen={(id, from) => {
          setGot(
            from
              ? JSON.stringify({
                  id,
                  x: Math.round(from.x),
                  y: Math.round(from.y),
                  w: Math.round(from.w),
                  h: Math.round(from.h),
                  url: from.url.slice(0, 24),
                })
              : `null（${id}）`,
          );
          setOpenId(id);
          setOpenFrom(from ?? null);
        }}
      />
      {/* **押した先まで繋ぐ。** ここを `() => {}` にしていたせいで、
          「部品は動くのに実物は動かない」がずっと見えていなかった。 */}
      <StickerSheet
        stickerId={openId}
        from={openFrom}
        onClose={() => {
          setOpenId(null);
          setOpenFrom(null);
        }}
      />
    </>
  );
}
