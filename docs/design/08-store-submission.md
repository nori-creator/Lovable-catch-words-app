# Catchwords ストア申請ドキュメント v1(docs/design/08-store-submission.md)

> 目的: Phase B-3(法務・ストア要件)のうち、**申告書類と文言を先に確定**しておく。
> Capacitor化の後、Apple App Store / Google Play Console のフォームにここから転記するだけにする。
> 実装と申告がズレると審査リジェクト・最悪アカウント停止につながるため、**データの扱いを変えたら必ず本書も更新する**こと。

---

## 1. このアプリが実際に集めるデータ(申告の根拠・実装と1:1対応)

| データ | 保存先 | 目的 | 紐付け | 削除 |
|---|---|---|---|---|
| メールアドレス | Supabase Auth | ログイン | ユーザーに紐付く | アカウント削除で即時 |
| 表示名・学習設定 | profiles | アプリ機能 | 紐付く | 同上 |
| 撮影した写真 | stickers バケット(非公開、署名URL) | 単語カード作成 | 紐付く | 同上 |
| 撮影位置(任意許可) | stickers.lat/lng、scan_events | 「どこで覚えたか」の記録・地図表示 | 紐付く | 同上 |
| スキャンした語・学習履歴 | scan_events, reviews, review_history | SRS復習・KPI | 紐付く | 同上 |
| 日記本文 | journal_entries | AI添削 | 紐付く | 同上 |
| 利用回数(種類と時刻のみ) | usage_events | コスト管理・不正防止 | 紐付く | 同上 |
| AIへ送る画像・文章 | Lovable AI Gateway / Google Gemini へ送信(処理のみ、学習利用なし設定) | 単語検出・添削・音声合成 | 送信時のみ | 保存しない |

**集めていないもの(申告で「収集しない」と答えてよい)**: 連絡先、健康、金融情報、閲覧履歴(アプリ外)、広告ID、正確な位置の常時追跡(撮影時の1点のみ)。トラッキング(ATT対象の横断追跡)は**一切なし** → App Tracking Transparency は不要。

## 2. Apple「App のプライバシー」申告(App Store Connect)

- **収集するデータ**
  - 連絡先情報 > メールアドレス — アプリ機能 / ユーザーに紐付く / トラッキングなし
  - ユーザーコンテンツ > 写真またはビデオ — アプリ機能 / 紐付く / なし
  - ユーザーコンテンツ > その他のユーザーコンテンツ(日記・発話テキスト) — アプリ機能 / 紐付く / なし
  - 位置情報 > おおよその位置情報(撮影時のみ・任意) — アプリ機能 / 紐付く / なし
  - 使用状況データ > 製品の操作(スキャン回数等) — 分析・アプリ機能 / 紐付く / なし
- **申告しないでよいもの**: 診断データ(クラッシュSDK未導入のため。導入したら追加)
- **アカウント削除**: 「設定 → アカウントを削除」でアプリ内完結(実装済み・PR #6)。審査ノートにも明記する

## 3. Google Play「データセーフティ」フォーム

- データ収集: あり / 暗号化して送信: **はい(全通信HTTPS)** / 削除リクエスト: **はい(アプリ内で即時)**
- 項目(目的はすべて「アプリの機能」、使用状況のみ+「分析」):
  - 個人情報 > メールアドレス(必須)
  - 写真と動画 > 写真(必須・単語カード用)
  - 位置情報 > おおよその位置(任意・撮影時のみ)
  - アプリのアクティビティ > アプリ内の操作(スキャン/復習回数)
  - メッセージ > その他(日記テキスト。AI添削のため処理)
- 第三者への共有: **「共有なし」と申告できるか要注意** — AI処理のためのGoogle Gemini送信は「サービスプロバイダーとしての処理」扱いが原則だが、フォーム上は「データを第三者と共有していますか」で **プロバイダー処理=共有に該当しない**(Google自身のガイダンス)。ただしプライバシーポリシーには明記済みであること(§4に記載済み)を維持する

## 4. 権限リクエスト文言(Capacitor化の際にそのまま使う)

### iOS Info.plist
| キー | 文言 |
|---|---|
| NSCameraUsageDescription | 目の前のものにカメラをかざすと、台湾華語の単語と発音をその場でお教えします。 |
| NSMicrophoneUsageDescription | 発音の練習を録音してAIが添削するために使います。録音はあなたの学習にのみ使われます。 |
| NSLocationWhenInUseUsageDescription | 「どこでこの単語を覚えたか」を単語カードに記録するために、撮影時だけ位置を使います(任意)。 |
| NSPhotoLibraryAddUsageDescription | 作成した単語カードの画像を保存するために使います。 |
| NSSpeechRecognitionUsageDescription | 話した台湾華語を文字にしてAIが添削するために使います。 |

### Android(権限ダイアログ前のアプリ内説明=Play審査で推奨)
- カメラ: 「かざすだけで単語がわかる」ためにカメラを使います
- マイク: スピーキング復習の録音・文字起こしに使います
- 位置情報(ACCESS_COARSE_LOCATION で足りる想定): 撮影場所をカードに記録します(許可しなくても全機能使えます)

原則: **権限は使う瞬間に、理由1行つきでリクエスト**(オンボーディングで一括要求しない)。位置情報は拒否されても機能が欠けないことをコードで保証済み(lat/lng nullable)。

## 5. 審査ノート(Review Notes)下書き

> Catchwords is a Taiwanese Mandarin (zh-TW) learning app for Japanese residents in Taiwan. Point the camera at objects/text to get instant vocabulary + native pronunciation; save words as photo flashcards with spaced-repetition review.
> - Demo account: (審査用に捨てアカウントを作って記載)
> - Account deletion: Settings → アカウントを削除 (type 削除 to confirm) — deletes all user data immediately.
> - Location is optional and only captured at photo time to tag where a word was learned.
> - AI features (word detection, correction, TTS) process user photos/text via Google Gemini as a service provider; nothing is used for advertising or cross-app tracking.

## 6. 残タスク(このドキュメントの外)

1. Capacitor化(Phase B-1)— この際に§4の文言を実装に載せる
2. 利用規約ページ(/terms)の整備状況の確認(プライバシーポリシーは実装済み)
3. Apple Developer($99/年)/ Google Play($25)登録 → TestFlight/内部テストへβ移行
4. クラッシュレポートSDKを入れる場合は§2/§3に「診断データ」を追記
