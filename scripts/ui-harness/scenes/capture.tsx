/**
 * 撮ったあとの面。**カメラが要るのは撮る2段だけ**で、その先は写真の
 * data URL さえあれば描ける。ここまで `capture.tsx` を丸ごと「カメラ依存」
 * として未検査にしていたが、**8段のうち6段はカメラと関係が無かった**。
 *
 * 撮っている最中の2段(`object` / `selfie`)は `<video>` を持つので、
 * 偽の映像を流す仕掛けを作るまでは入れない。
 * 映像の上に**載る操作**(前後の切替・倍率)は `scan.tsx` 側で部品にして、
 * 同じ寸法の暗い面を敷いて撮っている(`scan.tsx` の場面)。
 */
import { useState } from "react";
import {
  CaptureCardPanel,
  CaptureSavingPanel,
  OfflineSavedPanel,
  PickWordPanel,
  ReencounterPanel,
} from "@/routes/_authenticated/capture";

const shot = (w: number, h: number, c: string) =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${c}"/></svg>`,
  );

/**
 * 語を選ぶ面。**使い分けの一言が出る候補と、出ない候補を混ぜる** —
 * AIが書けなかった回は空で来るので、そのとき行がどう詰まるかも見る。
 */
export function CapturePickScene() {
  const [manual, setManual] = useState("");
  const suggestions = [
    {
      headword: "衛生紙",
      reading_zhuyin: "ㄨㄟˋ ㄕㄥ ㄓˇ",
      pinyin: "wèi shēng zhǐ",
      meaning_ja: "トイレットペーパー",
      distinction: "トイレに置く方",
      category_key: "daily",
    },
    {
      headword: "面紙",
      reading_zhuyin: "ㄇㄧㄢˋ ㄓˇ",
      pinyin: "miàn zhǐ",
      meaning_ja: "ティッシュ",
      distinction: "持ち歩く箱・ポケット",
      category_key: "daily",
    },
    {
      headword: "濕紙巾",
      reading_zhuyin: "ㄕ ㄓˇ ㄐㄧㄣ",
      pinyin: "shī zhǐ jīn",
      meaning_ja: "ウェットティッシュ",
      distinction: "水を含ませてある方",
      category_key: "daily",
    },
    {
      headword: "捲筒紙",
      reading_zhuyin: "ㄐㄩㄢˇ ㄊㄨㄥˇ ㄓˇ",
      pinyin: "juǎn tǒng zhǐ",
      meaning_ja: "ロールペーパー",
      // 一言が書けなかった回。空なら描かない。
      distinction: "",
      category_key: "daily",
    },
  ];
  return (
    <PickWordPanel
      objectImg={shot(400, 400, "#8a7f6a")}
      suggestions={suggestions}
      manualWord={manual}
      setManualWord={setManual}
      onPick={() => {}}
      onManual={() => {}}
    />
  );
}

/**
 * 同じものにもう一度出会った面。**オーナーが作らせた機能そのもの**なのに
 * 一度も撮っていなかった。保存が終わる前(何回目かがまだ出ない)と
 * 終わった後(何回目か + 写真を足した)の両方を見る。
 */
export function CaptureReunionScene({ q }: { q: URLSearchParams }) {
  const done = q.get("variant") !== "saving";
  return (
    <ReencounterPanel
      dateLocale="ja-JP"
      reenc={
        {
          sticker_id: "s1",
          headword: "珍珠奶茶",
          reading_zhuyin: "ㄓㄣ ㄓㄨ ㄋㄞˇ ㄔㄚˊ",
          pinyin: "zhēn zhū nǎi chá",
          meaning_ja: "タピオカミルクティー",
          taken_at: "2026-05-02T09:00:00Z",
          location_name: "台北駅",
          cutout_url: shot(300, 300, "#b07a4a"),
        } as never
      }
      reencResult={done ? { encounter_count: 3, photo_saved: true } : null}
      onAgain={() => {}}
      onSeeInDex={() => {}}
    />
  );
}

/**
 * 圏外で撮って端末に預かった面。**オフラインのときにしか出ない**ので、
 * 今まで誰も見ていなかった。理由が付いている回と付いていない回を撮る。
 */
export function CaptureOfflineScene({ q }: { q: URLSearchParams }) {
  return (
    <OfflineSavedPanel
      savedReason={q.get("variant") === "reason" ? "ネットワークに繋がりませんでした" : null}
      onRetry={() => {}}
      onHome={() => {}}
      onAgain={() => {}}
    />
  );
}

/**
 * 生成が終わったカードの面。**撮るたびに必ず通る。**
 * 表(切り抜き)と裏(自撮り)の両方を撮る。自撮りが無い回も見る。
 */
export function CaptureCardScene({ q }: { q: URLSearchParams }) {
  const v = q.get("variant");
  const [flipped, setFlipped] = useState(v === "back" || v === "noselfie");
  const [caption, setCaption] = useState(v === "back" ? "士林夜市で並んでいるときに" : "");
  return (
    <CaptureCardPanel
      card={
        {
          reading_zhuyin: "ㄓㄣ ㄓㄨ ㄋㄞˇ ㄔㄚˊ",
          pinyin: "zhēn zhū nǎi chá",
          meaning_ja: "タピオカミルクティー",
          part_of_speech: "N",
          level: "TOCFL-2",
          category_key: "drink",
          example_sentence: "我想喝一杯珍珠奶茶。",
          example_translation: "タピオカミルクティーを一杯飲みたい。",
        } as never
      }
      selectedHead="珍珠奶茶"
      cutoutImg={shot(400, 400, "#b07a4a")}
      objectImg={shot(400, 400, "#8a7f6a")}
      selfieImg={v === "noselfie" ? null : shot(400, 400, "#4a90d9")}
      flipped={flipped}
      setFlipped={setFlipped}
      caption={caption}
      setCaption={setCaption}
      placeName="士林夜市"
      onRedo={() => {}}
      onSave={() => {}}
    />
  );
}

/**
 * 保存中の暗転 — **撮るたびに必ず通るのに、一度も測っていなかった面。**
 *
 * 飛行の前(絵と字が見えている)と、飛行が始まった後(元の絵と字を消して
 * 上に載る層へ渡した状態)の2通りを撮る。後者は**空に見えるのが正しい姿**で、
 * 実際に飛ぶ絵は別の層(`CatchLandingOverlay`)が描く。
 */
export function CaptureSavingScene({ q }: { q: URLSearchParams }) {
  const landing = q.get("landing") === "1";
  return (
    <CaptureSavingPanel image={shot(600, 600, "#b07a4a")} headword="珍珠奶茶" landing={landing} />
  );
}
