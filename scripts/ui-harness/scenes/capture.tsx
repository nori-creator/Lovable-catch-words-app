/**
 * 撮ったあとの面。**カメラが要るのは撮る2段だけ**で、その先は写真の
 * data URL さえあれば描ける。ここまで `capture.tsx` を丸ごと「カメラ依存」
 * として未検査にしていたが、**8段のうち6段はカメラと関係が無かった**。
 *
 * 撮っている最中の2段(`object` / `selfie`)は `<video>` を持つので、
 * 偽の映像を流す仕掛けを作るまでは入れない。一覧に書いておく。
 */
import { useState } from "react";
import { PickWordPanel, ReencounterPanel } from "@/routes/_authenticated/capture";

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
