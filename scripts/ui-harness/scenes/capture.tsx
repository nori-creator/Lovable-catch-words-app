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

import { useRef, useState } from "react";
import type { RecordedNote } from "@/components/VoiceCaptionButton";
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
      targetLanguage="zh-TW"
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
      return c.captureStream(2);
    };
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
      onOpenLibrary={() => {}}
      error={v === "error" ? "写真を読み込めませんでした" : null}
    />
  );
}

/**
 * 生成が終わったカードの面。**撮るたびに必ず通る。**
 * 表(切り抜き)と裏(自撮り)の両方を撮る。自撮りが無い回も見る。
 */
/**
 * 物が写真の下と右で切れている切り抜き（透明な地に、縁まで続く茶色の杯）。
 * `variant=clipped` で「シールでも切れます」の知らせを見る（2026-09-27）。
 */
const CLIPPED_CUTOUT =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><path d="M150 60 L400 90 L400 400 L190 400 Z" fill="#b07a4a"/><ellipse cx="275" cy="75" rx="130" ry="26" fill="#e8d5b5"/></svg>`,
  );

export function CaptureCardScene({ q }: { q: URLSearchParams }) {
  const v = q.get("variant");
  const [flipped, setFlipped] = useState(v === "back" || v === "noselfie");
  const [caption, setCaption] = useState(v === "back" ? "士林夜市で並んでいるときに" : "");
  // 声で吹き込んだ一言の**録れた後**も撮る(オーナー指示 2026-08-26)。
  // 録っている最中はマイクが要るので足場からは出せない。
  const [voiceNote, setVoiceNote] = useState<RecordedNote | null>(
    v === "voice" ? { blob: new Blob([]), mime: "audio/webm" } : null,
  );
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
      cutoutImg={v === "clipped" ? CLIPPED_CUTOUT : shot(400, 400, "#b07a4a")}
      objectImg={shot(400, 400, "#8a7f6a")}
      selfieImg={v === "noselfie" ? null : shot(400, 400, "#4a90d9")}
      flipped={flipped}
      setFlipped={setFlipped}
      caption={caption}
      setCaption={setCaption}
      voiceNote={voiceNote}
      setVoiceNote={setVoiceNote}
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
