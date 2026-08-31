# 01. ログイン

正: `src/routes/auth.tsx` / `src/routes/reset-password.tsx` /
`src/integrations/supabase/auth-middleware.ts`

---

## 入り方は3つ

| | いま（Web） | iPhone 版 |
|---|---|---|
| メール＋パスワード | `supabase.auth.signInWithPassword` | `supabase-swift` で**そのまま** |
| Google | ⚠️ `oauth.lovable.app` 経由 | Supabase 標準の OAuth に付け替え |
| Apple | ⚠️ `oauth.lovable.app` 経由 | **`Sign in with Apple`（ネイティブ）** |

現在の利用者4人の内訳（実データ）:

| 誰 | 入り方 | ユーザーID |
|---|---|---|
| `nori0122hiroshima@gmail.com` | Google | `21b1c42a-9456-4a58-8624-46aa3abb632f` |
| `nori0122hiroshimacarp@yahoo.co.jp` | Apple | `5387ac46-…` |
| `qa.tester...@example.com` | メール | `31fd7714-…` |
| `nori0122taiwan@gmail.com` | メール | `39e76378-…` |

---

## ⚠️ 引っ越しでいちばん危ない所

**写真はログイン方法ではなく、ユーザーID（UUID）に紐づいています。**

- 写真の保存パス: `{ユーザーUUID}/{日時}-{種類}.jpg`（`src/lib/sticker-upload.ts:39`）
- テーブル: `stickers.user_id`、RLS は `auth.uid() = user_id`

だから引っ越しでは **`auth.users` を UUID ごと持ち込む**のが本体です。
別のメアドで新規登録すると**別人**になり、写真は1枚も繋がりません。

### OAuth の再接続、難易度の差

| | 移行後 |
|---|---|
| **Google** | 識別子（`117239533525913442841`）はアカウント固有なので引き継げる見込み |
| **Apple** | ⚠️ 識別子は**開発者チームごとに変わる**。Lovable のチームから自分のチームへ移ると別の値になる |

**対策: 移行と同時に、同じ UUID のまま自分のアカウントにパスワードを設定する。**
メール＋パスワードで必ず入れるので、OAuth の再接続に失敗しても写真ごと締め出されません。

---

## iPhone 版での作り

- **`Sign in with Apple` は iOS では必須級**です。
  ⚠️ App Store のガイドラインは「他の SNS ログインを出すなら Apple も出す」と定めています。
  Google を出すなら Apple も要ります
- Apple のネイティブ実装は `AuthenticationServices` の `ASAuthorizationAppleIDProvider`。
  受け取った `identityToken` を `supabase-swift` の `signInWithIdToken` に渡す
- Google はネイティブの `GoogleSignIn` SDK か、`ASWebAuthenticationSession`

---

## セッションの扱い

- Web 版は `localStorage` に置いています
  （`src/integrations/supabase/previewAuthStorage.ts` — Lovable プレビュー用の
  分岐が入っていますが、**iPhone 版では不要**）
- iPhone 版は `supabase-swift` の既定（Keychain）に任せる。
  ⚠️ Keychain はアプリを消しても残る設定があるので、
  「ログアウトしたのに入れてしまう」にならないよう挙動を確認すること

## ⚠️ 電波が悪いときの見せ方（実際に壊れていた所）

`src/routes/_authenticated/route.tsx` の注記:

> セッションの確認には**失敗も遅延もある**。以前はここに `.catch` も時間切れも無く、
> 失敗すると**文字も無いスピナーが回り続けるだけ**だった —
> 地下鉄でアプリを開くと必ずこれになる。

いまは **8秒で時間切れ**にし、何が起きているか言い、やり直させます。
**iPhone 版でも同じにすること。** 電波の悪い場所は日常です。

---

## サーバー側の検証

`src/integrations/supabase/auth-middleware.ts`:

- `Authorization: Bearer <token>` が無ければ拒否
- `Bearer ` 以外の形式も拒否
- トークンからその人の権限で動く Supabase クライアントを作る
- `context.userId` を各処理に渡す

**Cookie を使っていません。** iPhone 版から呼ぶときも同じヘッダを付けるだけです。

---

## 確認項目

- [ ] メール＋パスワードで入れる
- [ ] Apple でサインインできる（ネイティブの並び）
- [ ] Google でサインインできる
- [ ] **同じ UUID に入り、311枚の写真が見える**
- [ ] 機内モードでアプリを開く → 8秒以内に理由が出る（無言のスピナーにならない）
- [ ] ログアウト → 本当に入れなくなる
