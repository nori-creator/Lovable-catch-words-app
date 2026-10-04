# 23. 外部 AI への送信の同意（サーバ記録・iOS 連携）

2026-10-03。App Store Review Guideline 5.1.2(i) と個人情報保護法 28 条（外国にある第三者への提供）
のため、写真・語・文を外部の AI へ送る関数は、**サーバに記録された同意**が無ければ断る。
決まりの本体は `src/lib/ai-consent.ts`（版・関数の一覧）と `src/lib/ai-consent.server.ts`（DB）。

## 版

- 今の版: `1`（Web `AI_CONSENT_VERSION` = iOS `AIConsent.currentVersion`）。送る物・送り先を
  変えたら両方を同時に上げる。古い版の同意は「同意なし」として扱われる。

## iOS から呼ぶ関数（`POST /api/native-fn`、いつもの `Authorization: Bearer <access token>`）

### 同意を記録する / 取り消す — `recordAiConsent`

```http
POST /api/native-fn
Authorization: Bearer <Supabase access token>
Content-Type: application/json
AI-Consent-Version: 1

{"fn":"recordAiConsent","data":{"version":1,"agreed":true}}
```

- `version`（整数 1〜1000、必須）: 画面で見せた同意の版。
- `agreed`（真偽、必須）: `true` = 「同意して始める」、`false` = 「同意しない」/ 設定で取り消し。
- `source` は省略可（native-fn から来た物はサーバが `"ios"` として記録する）。

成功（200）:

```json
{"result":{"agreed":true,"version":1,"agreedAt":"2026-10-03T09:12:34.567Z","revokedAt":null,"currentVersion":1}}
```

取り消し（`agreed:false`）の成功:

```json
{"result":{"agreed":false,"version":1,"agreedAt":"2026-10-03T09:12:34.567Z","revokedAt":"2026-10-05T01:00:00.000Z","currentVersion":1}}
```

（一度も同意していない人の `agreed:false` は何も書かず、`version`・`agreedAt`・`revokedAt` が `null`。）

失敗:

| 状態 | 本文 | 意味 |
|---|---|---|
| 400 | `{"error":"送った内容の形が違います。アプリを最新にしてください。"}` | `version` / `agreed` が無い・型違い |
| 401 | `{"error":"Unauthorized: ..."}` | トークン切れ（いつもどおり更新してやり直す） |
| 403 | `{"error":"AI_CONSENT_REQUIRED: 同意の内容が新しくなりました。…"}` | `agreed:true` で `version` が今の版より古い（画面を新しい版で見せ直す） |
| 503 | `{"error":"AI_CONSENT_CHECK_FAILED: ..."}` | DB に書けなかった（少し待ってやり直す。端末の同意は保ったまま、次の起動で送り直す） |

### 今の状態を読む — `getAiConsent`

```http
POST /api/native-fn
{"fn":"getAiConsent","data":{}}
```

```json
{"result":{"agreed":true,"version":1,"agreedAt":"2026-10-03T09:12:34.567Z","revokedAt":null,"currentVersion":1,"recorded":true}}
```

`recorded:false` はサーバに表がまだ無い（移行待ち）。その間サーバは同意を確かめない。

## サーバが断る時（AI の関数）

同意が無いと、AI の関数（`suggestWords` `detectScan` `suggestWordCandidates` `generateCard`
`generatePhraseCard` `regenerateCardSection` `reportAndFixSection` `correctMyJournal` `detectParts`
`extractWordbook`）は **403** と `{"error":"AI_CONSENT_REQUIRED: AI を使う機能は、AI へのデータ送信に同意すると使えます。"}`
を返す。何も外へ送っていない。iOS は `APIError.aiConsentRequired` と同じ扱い（同意の画面を出す）にする。
`rankScanCandidates` は断らずに並べ替えなし（`order:null`）、`getJournalPrompts` は `null` を返す（どちらもおまけ）。

## 古い iOS を壊さない決まり（移行期間）

`/api/native-fn` から来た呼び出しは、次のどちらかの時だけサーバで同意を確かめる:

1. 見出し **`AI-Consent-Version: <版>`** が付いている（`ai_consent_version` の綴りも受けるが、
   下線入りの見出しは途中の機械に落とされることがあるので `AI-Consent-Version` を使う）。
2. サーバの環境変数 **`AI_CONSENT_ENFORCE_NATIVE=true`** が立っている（締め切り後にオーナーが立てる）。

どちらも無い（＝同意をサーバに送らない古い iOS）なら、今までどおり通す。古い iOS も端末の中で
同意を確かめてから送っている（`NativeAPI.call` の `AIConsent.aiFunctions`）。
Web の画面からの呼び出しはいつも確かめる。

## iOS 側でやること

1. `NativeAPI.call` で、**すべての呼び出しに** `AI-Consent-Version: \(AIConsent.currentVersion)` を付ける。
2. `AIConsent.grant()` / `decline()` の後に `recordAiConsent`（`agreed: true/false`）を送る。
   送れなかったら端末に「未送信」を覚え、次の起動・ログインで送り直す。
3. ログインした後に `getAiConsent` を読み、
   - サーバ `agreed:true` → 端末も同意済みにする（別の端末・Web で同意した人に聞き直さない）。
   - サーバ `agreed:false` で端末が同意済み（この変更より前に iPhone で同意した人）→ その同意を
     `recordAiConsent(agreed:true, version: 端末の版)` で送る（本人が前に明示的に同意した記録の写し）。
     端末の版が古ければ送らず、同意の画面を出し直す。
   - サーバに `revokedAt` があり端末が同意済み → Web 等で取り消した。端末も取り消す。
4. AI の関数が 403 `AI_CONSENT_REQUIRED` を返したら、同意の画面を出す。
5. 全員がこの版に上がったら、オーナーが `AI_CONSENT_ENFORCE_NATIVE=true` を立てる。
