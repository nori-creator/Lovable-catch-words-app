# 03. かざす（ライブカメラ）

正: `src/routes/_authenticated/scan.tsx`（1,484行）

カメラを景色にかざすと、**その場で単語の札が浮かぶ**画面。撮らずに調べられる入口です。

---

## 段階（`scanStage`）

```
idle → sensing → reading → matching → （札が出る）
```

段階を分けているのは、**待ち時間に何が起きているかを言うため**です。
無言のスピナーにしない、というこのアプリ全体の方針。

---

## 流れ

1. カメラを開く（`getUserMedia` → iPhone 版は `AVFoundation`）
2. 1コマを切り出す（canvas → `toDataURL("image/jpeg", 0.82)`）
3. `/api/v1/scan/frame` に送る → 単語候補と**画面上の位置**が返る
4. 位置に札を浮かべる
5. 札を押す → 意味と発音を出す（`ScanCatchSheet`）
6. 「キャッチする」で図鑑に入る

⚠️ **候補を押した時は、意味と発音だけを出します**（オーナー指示）。
進捗表示や例文は出しません。押した人が知りたいのは「これ何？」だけ。

---

## 位置情報の先取り

`scan.tsx:241-253` で画面を開いた瞬間に `watchPosition` を始めます。
撮る瞬間に取り始めると GPS の初回取得（数秒〜十数秒）を待たせるため。

⚠️ ここは **Capacitor のプラグインを通していません**（生の `navigator.geolocation`）。
iPhone 版では `CoreLocation` に置き換えます。
`src/lib/place-reminder.ts:120` は分岐しているのに、ここだけ素通しでした。

---

## ズーム

`scan.tsx:290-302` は `track.getCapabilities().zoom` を見て、
使えなければ **CSS の拡大**に落ちます。

⚠️ **WKWebView ではズームの制約が効かない**ので、いまの iPhone は常に CSS 側です
（画質が落ちる）。iPhone 版は `AVCaptureDevice.videoZoomFactor` で
**本物の光学/デジタルズーム**になります。ここはネイティブ化の分かりやすい利得。

---

## 音声で調べる

`scan.tsx:374-416` の `toggleVoice`。

⚠️ **`SpeechRecognition` は iOS の WebView に存在しません。**
いまは `scan.noVoice` のメッセージを出して、手入力に誘導しています。

iPhone 版では `SFSpeechRecognizer` が使えるので、**初めてちゃんと動きます**。

⚠️ 注意（`review.tsx:979-984` の注記）:
`getUserMedia({audio:true})` を掴むと **音声認識が止まります**（Android Chrome / iOS Safari 共通）。
ネイティブでも `AVAudioSession` のカテゴリ設定を誤ると同じことが起きます。
**録音と音声認識を同時に掴まないこと。**

---

## カメラの前後切替

`facing: "environment" | "user"`。オーナー指摘で足したもの。

⚠️ 過去に2回、**「自撮りする」を押してもインカメラにならない**不具合が出ています
（指摘⑧・#64）。iPhone 版では `AVCaptureDevice` の指定なので確実ですが、
**切替後に実際に前面が映ることを実機で確認**してください。

---

## 辞書の先読み

検出した語は `dictionary_entries`（32,878行）から引きます。
**AI を待たずに意味と発音が出る**のはこれのおかげです（`entries` の状態）。

iPhone 版でも同じ順序を守ること:

```
辞書に在る → 即座に出す（~50ms）
辞書に無い → AI に訊く（数秒）
```

---

## 計測

`detectMs` / `lookupMs` / `tapToAudioMs` を測って `scan_events` に記録しています。
目標は `tap_to_audio_ms ≤ 1000ms`（`scan.tsx:1150`）。

**iPhone 版でも同じ3つを測ること。** ネイティブ化の効果を数字で言えるようにするため。

---

## ⚠️ 削除済み: 「細かく」ボタン

2026-08-27 ⑱ で**削除**されました。部品の細分化検出（`SubItem` / `expandParts`）は
まるごと消えています。**iPhone 版で復活させないこと。**

---

## 確認項目

- [ ] カメラが開き、札が浮かぶ
- [ ] 札を押すと**意味と発音だけ**出る（進捗表示なし）
- [ ] 前後の切替で**本当に前面が映る**
- [ ] ズームが本物のズームになっている（CSS 拡大ではない）
- [ ] 音声で調べられる（`SFSpeechRecognizer`）
- [ ] 録音中に音声認識が止まらない
- [ ] 辞書に在る語は AI を待たずに出る
- [ ] タップ → 音声が 1 秒以内
- [ ] 「細かく」ボタンが**無い**
