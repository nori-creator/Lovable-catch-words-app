import { photo } from "./peel-sticker";
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
import { readySpeech } from "../speech";

/** 候補の発音ボタンを撮るために、支度が済んだことにする(上の注と同じ)。 */
readySpeech(["衛生紙", "面紙", "濕紙巾", "捲筒紙", "珍珠奶茶"]);

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { useT } from "@/lib/i18n";
import {
  CaptureCardPanel,
  CaptureObjectPanel,
  CaptureSavingPanel,
  OfflineSavedPanel,
  PickWordPanel,
  ReencounterPanel,
} from "@/routes/_authenticated/capture";
import { CameraModeStrip, CameraShutter } from "@/components/CameraChrome";

const shot = (w: number, h: number, c: string) =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${c}"/></svg>`,
  );

/**
 * 語を選ぶ面。**使い分けの一言が出る候補と、出ない候補を混ぜる** —
 * AIが書けなかった回は空で来るので、そのとき行がどう詰まるかも見る。
 */
export function CapturePickScene({ q }: { q: URLSearchParams }) {
  const [manual, setManual] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  /**
   * 既定は**写真に物が3つ写った回**（オーナー指示 2026-09-27 の2段の選び方）。
   * 柚子はほかの言い方が2つ（押すと2段目）、桌子は1つだけ（押すとそのまま進む）。
   * `?set=tissue` は番号の無い古い返事（今までどおりの1列）。
   */
  const grouped = [
    {
      headword: "文旦",
      reading_zhuyin: "ㄨㄣˊ ㄉㄢˋ",
      pinyin: "wén dàn",
      meaning_ja: "文旦（品種の名前）",
      distinction: "中秋節の贈り物の箱に書かれる名前",
      category_key: "fruit",
      register: "specific" as const,
      group: 0,
    },
    {
      headword: "柚子",
      reading_zhuyin: "ㄧㄡˋ ㄗ˙",
      pinyin: "yòu zi",
      meaning_ja:
        "ぶんたん・ザボン。台湾では中秋節に食べる大きな柑橘で、皮で帽子を作って子どもにかぶせる習慣もある",
      category_key: "fruit",
      register: "common" as const,
      group: 0,
    },
    {
      headword: "桌子",
      reading_zhuyin: "ㄓㄨㄛ ㄗ˙",
      pinyin: "zhuō zi",
      meaning_ja: "机・テーブル",
      category_key: "furniture",
      register: "common" as const,
      group: 1,
    },
    {
      headword: "麻豆文旦",
      reading_zhuyin: "ㄇㄚˊ ㄉㄡˋ ㄨㄣˊ ㄉㄢˋ",
      pinyin: "má dòu wén dàn",
      meaning_ja: "麻豆産の文旦",
      category_key: "fruit",
      register: "proper" as const,
      group: 0,
    },
    {
      headword: "盤子",
      reading_zhuyin: "ㄆㄢˊ ㄗ˙",
      pinyin: "pán zi",
      meaning_ja: "皿",
      category_key: "daily",
      register: "common" as const,
      group: 2,
    },
    {
      headword: "瓷盤",
      reading_zhuyin: "ㄘˊ ㄆㄢˊ",
      pinyin: "cí pán",
      meaning_ja: "陶磁器の皿",
      distinction: "焼き物だと分かる時",
      category_key: "daily",
      register: "specific" as const,
      group: 2,
    },
  ];
  const tissue = [
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
  const suggestions = q.get("set") === "tissue" ? tissue : grouped;
  // 発音の丸は**鳴らせるようになってから出る**。確認用ページでは音を先に用意する。
  readySpeech(suggestions.map((s) => s.headword));
  return (
    <>
      <PickWordPanel
        targetLanguage="zh-TW"
        objectImg={shot(400, 400, "#8a7f6a")}
        suggestions={suggestions}
        manualWord={manual}
        setManualWord={setManual}
        onPick={(s) => setPicked(s.headword)}
        onManual={() => {}}
      />
      {picked && (
        <p role="status" className="mt-3 text-footnote text-muted-foreground">
          選んだ語: {picked}
        </p>
      )}
    </>
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
      photo={photo}
      // 実物と同じく剥がす札で出す（オーナー指示 2026-09-23）。
      onPeel={() => {}}
      failed={q.get("variant") === "error"}
      onRetry={() => {}}
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
 * 撮る前の画面。**このアプリで最初に見る面**なのに、長らく雛形に
 * 場面が無く、一度も機械の目に映っていなかった。
 *
 * 見るのは3通り:
 * - 既定 … 撮る所・検索の欄・かざして調べる
 * - `typed` … 打ち込んだ状態(調べるボタンが効く形になっているか)
 * - `retake` … 復習の「もう一度撮ってみる?」から来たとき
 */
/**
 * **確認用ページのカメラに、決まった景色を流す**（2026-09-27 の画角の直し）。
 * 本物のカメラは使わない — 誰が開いても同じ絵で、枠に映像が「全部」入って
 * いるか（切れていないか）を見比べられる。縦 3:4（多くの端末のカメラ）で描く。
 */
let fakeCameraOn = false;
function useFakeCamera() {
  useState(() => {
    const md = navigator.mediaDevices;
    if (fakeCameraOn || !md || typeof HTMLCanvasElement.prototype.captureStream !== "function")
      return;
    fakeCameraOn = true;
    md.getUserMedia = async () => {
      const c = document.createElement("canvas");
      c.width = 1440;
      c.height = 1920;
      const img = new Image();
      img.src = photo;
      await img.decode().catch(() => {});
      const ctx = c.getContext("2d")!;
      const draw = () => {
        const s = Math.max(c.width / (img.width || 1), c.height / (img.height || 1));
        const w = (img.width || 1) * s;
        const h = (img.height || 1) * s;
        ctx.drawImage(img, (c.width - w) / 2, (c.height - h) / 2, w, h);
      };
      draw();
      window.setInterval(draw, 500);
      const stream = c.captureStream(2);
      /**
       * **押してピントを合わせる（R25）の見本。** 絵から作った映像にはピントが無いので、
       * ピント合わせを持つ端末（Android の Chrome など）と同じ返事をする。
       * 印の出方を見るためだけの物で、本物の端末が持っているかどうかとは関係ない。
       */
      const track = stream.getVideoTracks()[0];
      if (track) {
        const caps = track.getCapabilities?.bind(track);
        track.getCapabilities = () =>
          ({
            ...(caps?.() ?? {}),
            focusMode: ["continuous", "single-shot"],
            exposureMode: ["continuous"],
          }) as MediaTrackCapabilities;
        track.applyConstraints = async () => {};
      }
      return stream;
    };
    const supported = md.getSupportedConstraints?.bind(md);
    md.getSupportedConstraints = () =>
      ({ ...(supported?.() ?? {}), pointsOfInterest: true }) as MediaTrackSupportedConstraints;
    return true;
  });
}

export function CaptureObjectScene({ q }: { q: URLSearchParams }) {
  const v = q.get("variant");
  const [typedWord, setTypedWord] = useState(v === "typed" ? "腳踏車" : "");
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  useFakeCamera();
  /**
   * **払って「スキャン」へ行けること**を確認用ページでも見せる（オーナー指摘
   * 2026-09-27「カメラはスキャンにスライドできない」）。本物はスキャンの画面
   * （別の道筋）へ渡すが、ここには道筋が無いので、同じ帯を持つ暗い面に
   * 切り替える。戻る向きに払うと撮る画面に帰る。
   */
  const [scan, setScan] = useState(false);
  const [back, setBack] = useState<"photo" | "search">(
    q.get("mode") === "search" ? "search" : "photo",
  );
  if (scan) {
    return (
      <div
        style={{
          position: "relative",
          height: "100vh",
          background: "#111318",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: "0 20px 120px",
          gap: 12,
        }}
      >
        <CameraModeStrip
          mode="scan"
          onChange={(m) => {
            setBack(m === "search" ? "search" : "photo");
            setScan(false);
          }}
        />
        <div className="capture-actions">
          <span />
          <CameraShutter mode="scan" label="スキャン" onPress={() => {}} />
          <span />
        </div>
      </div>
    );
  }
  return (
    <CaptureObjectPanel
      key={back}
      initialMode={back}
      retakeWord={v === "retake" ? "珍珠奶茶" : null}
      cameraInputRef={cameraInputRef}
      onObjectFile={() => {}}
      typedWord={typedWord}
      setTypedWord={setTypedWord}
      onSearch={() => {}}
      onOpenScan={() => setScan(true)}
      error={v === "error" ? "写真を読み込めませんでした" : null}
    />
  );
}

/**
 * 生成が終わったカードの面。**撮るたびに必ず通る。**
 * 表(写真)と裏(自撮り)の両方を撮る。自撮りが無い回も見る。
 */
export function CaptureCardScene({ q }: { q: URLSearchParams }) {
  return q.get("variant") === "not-target" ? (
    <CaptureCardNotTargetScene />
  ) : (
    <CaptureCardDefaultScene q={q} />
  );
}

function CaptureCardDefaultScene({ q }: { q: URLSearchParams }) {
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

/**
 * **学習言語の語でない見出しを保存しようとした時**（オーナー報告 2026-10-02
 * 「英語の図鑑にノートが入っている」）。英語を学ぶ人のカードの見出しが
 * カタカナの「ノート」のまま「図鑑に追加」を押した所。本番の
 * `handleSave` は保存せずにこの文（`err.notTargetLanguage`）を出す。
 * サーバの関所（`upsertWord`）が止めた時も、同じ文が出る（`errors.ts`）。
 *
 * 見本には通知の層（`Toaster`）が無いので、ここで置く。開いた時に1度出し、
 * 「図鑑に追加」を押すともう1度出る。
 */
function CaptureCardNotTargetScene() {
  const t = useT();
  const [flipped, setFlipped] = useState(false);
  const [caption, setCaption] = useState("");
  // 同じ印（id）で出し直す — 表示言語が読み込まれて `t` が変わったら、その言語の文に替わる
  // （最初の描画の `t` を握ったままだと、英語の画面に日本語の文が残る）。
  const say = () => toast.error(t("err.notTargetLanguage"), { id: "not-target", duration: 60_000 });
  useEffect(() => {
    const id = window.setTimeout(say, 300);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);
  return (
    <>
      <Toaster position="top-center" richColors />
      <CaptureCardPanel
        card={
          {
            reading_zhuyin: "",
            pinyin: "",
            meaning_ja: "書き込み用の紙を綴じたもの。手帳。",
            part_of_speech: "n",
            level: "A1",
            category_key: "stationery",
            example_sentence: "",
            example_translation: "",
          } as never
        }
        selectedHead="ノート"
        objectImg={shot(400, 400, "#c9b48a")}
        selfieImg={null}
        flipped={flipped}
        setFlipped={setFlipped}
        caption={caption}
        setCaption={setCaption}
        placeName="台北"
        onRedo={() => {}}
        onSave={say}
      />
    </>
  );
}
