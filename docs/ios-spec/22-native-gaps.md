# 22. iOS でネイティブに置き換える所

Web 版が使っているブラウザ機能を1つずつ調べ、
**iPhone で挙動が変わる / 動かない**物をまとめました。

---

## ① 音声認識 — **iOS の WebView に存在しない**

これが**作り直すいちばん強い理由**です。

| | |
|---|---|
| 使っている所 | `review.tsx:1015-1075`（スピーキング復習）<br>`scan.tsx:374-416`（音声で調べる）<br>`InputCatchSheet.tsx:218-248`（耳キャッチ） |
| いまの挙動 | `SpeechRecognition` が無いので**必ず失敗**。手入力に落ちる |
| なぜ深刻か | 既定の復習モードが `speaking`。**iPhone の利用者は全員、毎回失敗するマイクに当たっている** |
| iPhone 版 | **`SFSpeechRecognizer`** |

⚠️ 3箇所が**別々に書かれています**（共通の包みが無い）。
Swift では**1つの部品にまとめること**。片方だけ直す事故を防ぐため。

⚠️ 言語の指定漏れ: `review.tsx:1040` は `"cmn-Hant-TW"` の**決め打ち**。
`InputCatchSheet.tsx:233` だけが正しく学習言語から引いています。
**Swift では必ず学習言語から。**

⚠️ `getUserMedia({audio:true})` を掴むと音声認識が止まります（`review.tsx:979-984`）。
ネイティブでも `AVAudioSession` の設定を誤ると同じ。**録音と認識を同時に掴まない。**

---

## ② 切り抜き — 端末内が速くて無料

| | いま（Web） | iPhone 版 |
|---|---|---|
| 第1候補 | remove.bg（**1枚ごとに課金**） | **Vision** `VNGenerateForegroundInstanceMaskRequest` |
| 予備 | `@imgly/background-removal` | 不要 |

いまの重さ:
- `@imgly/background-removal` 6.4MB ＋ `onnxruntime-web` 93MB
- ⚠️ **モデルの重みは同梱されておらず、実行時に `staticimgly.com` から取得**
- ⚠️ `SharedArrayBuffer` を参照するが、**COOP/COEP の設定がどこにも無い**ので
  単スレッドの WASM に落ちる（遅い）

**Vision に置き換えると**: 端末内・無料・高速・オフライン・通信ゼロ。
`removebg` の1日の上限も不要になります。**原価が下がる = 収益に直結。**

⚠️ **iOS 17 以上が必要。シミュレータでは動きません**（CPU 非対応）。実機が要ります。

---

## ③ カメラ

Web 版には**2つの撮り方**が混在:

| | 使う所 | iPhone 版 |
|---|---|---|
| `<input type="file" capture>` | 撮る経路の主役（8箇所） | `AVFoundation` / `PHPicker` |
| `getUserMedia` + canvas | かざす画面だけ | `AVFoundation` |

⚠️ **ズームの制約が WKWebView では効かない**ので、いまは常に CSS 拡大（画質が落ちる）。
`AVCaptureDevice.videoZoomFactor` で本物のズームになります。

⚠️ `capture.tsx:310-317` に**ファイル入力を自動で `.click()` する**処理があり、
コード内の注釈が既に「当てにならない」と記録しています（自撮り側は人が押す形に戻した跡）。
**ネイティブではこの問題自体が消えます。**

---

## ④ 触覚 — iOS は `navigator.vibrate` 非対応

いま**まったく効いていません**。

⚠️ しかも**7箇所が共通の包み（`src/lib/haptics.ts`）を通さず生で呼んで**います
（`ScanCatchSheet` / `StickerSheet` / `home` / `dex` / `dex.$stickerId` /
キャッチ演出4種）。利用者の「触覚を切る」設定も効きません。

iPhone 版: `UIImpactFeedbackGenerator`。**必ず1つの部品を通すこと**、
そして**設定で切れるようにすること**。

---

## ⑤ 音

| | いま | iPhone 版 |
|---|---|---|
| 発音の再生 | `new Audio()`（サーバー TTS の mp3） | `AVAudioPlayer` |
| 端末の声 | `speechSynthesis` | `AVSpeechSynthesizer` |
| UI の効果音 | Web Audio の発振器で合成 | `AVAudioEngine` か音声ファイル |

⚠️ **iOS の音の「解錠」は既に丁寧に扱われています**（`src/lib/audio.ts`）:
タップの中で無音の WAV を同期再生して解錠し、`claimAudio` / `stopOtherAudio` で
重なりを防いでいます。ネイティブでは `AVAudioSession` がこれを担うので**もっと素直**です。

⚠️ 声の選び方（`src/lib/speak.ts`）は
**同じ一覧なら必ず同じ声**を返し、**近い言語の声で埋めない**（無ければ黙る）。
iPhone 版でも同じ方針にすること。「たまに違う声がする」はオーナーが指摘した不具合です。

---

## ⑥ 保存

| | いま | iPhone 版 |
|---|---|---|
| 設定（25個ほどの鍵） | `localStorage` | `UserDefaults` |
| ログインの持続 | `localStorage` | Keychain（`supabase-swift` の既定） |
| オフラインの写真の控え | IndexedDB（**data URL のまま**） | ⚠️ **ファイル**にしてパスだけ持つ |
| 音声のキャッシュ | IndexedDB（Blob） | ファイル |
| 復習の途中経過 | `sessionStorage` | メモリ |

⚠️ **iOS の保存容量は Chrome より厳しい**。写真を data URL で持つのはやめること。

⚠️ **Service Worker は1つもありません。** いまの「オフライン」は
IndexedDB の預かりキューだけで、**画面そのものはオフラインで開きません**
（`server.url` が遠くを見ているため）。
iPhone 版は画面が端末に入るので、**ここが自然に良くなります**。

---

## ⑦ 位置情報

- `src/lib/place-reminder.ts:120` は `Capacitor.isNativePlatform()` で分岐済み
- ⚠️ しかし `scan.tsx:241-253, 479` は**生の `navigator.geolocation`** で素通し

iPhone 版は全部 `CoreLocation` に統一すること。

⚠️ 背景での地理柵（geofencing）は**いまも対象外**です。
やるなら `CLLocationManager` の `startMonitoring(for:)` で初めて可能になります
（オーナーの「場所を通ったら通知」はここで本当に実現します）。

---

## ⑧ 通知

`place-reminder.ts:171,236` が分岐済み（ネイティブなら `@capacitor/local-notifications`）。
iPhone 版は `UNUserNotificationCenter`。

⚠️ Web の分岐は iOS Safari では**ホーム画面に追加しないと通知が無い**という注記付き。
ネイティブなら普通に出せます。

---

## ⑨ 権限の説明文（Info.plist）

⚠️ **リポジトリに Info.plist がありません**（Android の manifest だけ）。
ただし**文言は下書き済み**: `docs/design/08-store-submission.md` §4。

必要なもの:
- `NSCameraUsageDescription`
- `NSMicrophoneUsageDescription`
- `NSSpeechRecognitionUsageDescription`
- `NSLocationWhenInUseUsageDescription`
- `NSPhotoLibraryUsageDescription`（写真から選ぶなら）

---

## ⑩ 使っていないので気にしなくてよい物

Web Share / クリップボード / Wake Lock / ファイルのダウンロード — **0箇所**。

⚠️ ただし**かざす画面は長時間カメラを開くのに、画面のスリープを止めていません**。
iPhone 版では `UIApplication.shared.isIdleTimerDisabled` を検討する価値があります。

---

## まとめ: ネイティブ化で本当に良くなる順

1. **音声認識** — いま動いていない物が動く
2. **切り抜き** — 速く・無料・オフラインに
3. **カメラのズーム** — 画質が上がる
4. **触覚** — いま無反応な物が効く
5. **オフラインで画面が開く** — 端末に入るので
6. **背景での場所の通知** — 初めて可能になる
