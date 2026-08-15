# 画面を端末に同梱する方式へ移るには

いまスマホアプリは `capacitor.config.ts` の `server.url` で
**公開中のサイトをそのまま表示**している。殻の中のブラウザが外を見に行く形。

これを「画面のファイルを端末に入れて、そこから開く」方式へ移す話。
**設定を1行変えるだけでは動かない。** その理由と、必要な手順を書いておく。

## なぜ1行では済まないか

このアプリはサーバー側で動く処理(AIの呼び出し・DBアクセス・署名URLの発行)を
サーバー関数として持っている。その呼び先は **ビルド時に相対パスとして
焼き込まれる**:

```js
// node_modules/@tanstack/start-client-core/dist/esm/client-rpc/createClientRpc.js
const url = process.env.TSS_SERVER_FN_BASE + functionId; // → "/_serverFn/…"
```

`TSS_SERVER_FN_BASE` は `createServerFnBasePath()` が必ず `/` 始まりに
正規化するので、絶対URLを設定に入れて逃げることはできない。

同梱すると画面は `capacitor://localhost`(iOS)や `https://localhost`(Android)
から開かれる。そこから `/_serverFn/…` を叩けば
`capacitor://localhost/_serverFn/…` になり、**そこには何も無い**。
AIも図鑑も復習も、全部動かない。

## 手順

### 1. 呼び先を付け替える(**実装済み・いまは無効**)

`src/lib/server-origin.ts` と `src/start.ts` の `serverFns.fetch`。
`VITE_SERVER_ORIGIN` が設定されているときだけ、相対パスの呼び先を
そのドメインへ付け替える。未設定なら素の fetch と同じなので、
いまのブラウザ版の挙動は変わらない。

```
VITE_SERVER_ORIGIN=https://<公開先のドメイン>
```

`resolveServerFnUrl` は単体テスト済み(`src/lib/server-origin.test.ts`)。

### 2. サーバー側で CORS を許可する(**未実施・要確認**)

別のドメインへ投げることになるので、サーバーが許可を返す必要がある。

- `Access-Control-Allow-Origin`: `capacitor://localhost` と `https://localhost`
- `Access-Control-Allow-Headers`: `Authorization`, `Content-Type`
- `Access-Control-Allow-Methods`: `GET`, `POST`, `OPTIONS`
- プリフライト(`OPTIONS`)に応答すること

**認証は Cookie ではないので、ここは比較的やさしい。** このアプリは
`src/integrations/supabase/auth-attacher.ts` が `Authorization: Bearer …` を
付けている。Cookie なら SameSite の面倒が出るところだった。

### 3. `server.url` を外す

```ts
// capacitor.config.ts
// server: { url: … } を削除。webDir: ".output/public" はそのまま。
```

### 4. 確かめる(**実機が要る**)

- アプリを機内モードで開く → 画面は出るか(同梱できているか)
- 機内モードを解除 → 図鑑が読めるか(呼び先の付け替えとCORSが効いているか)
- キャッチを一度通す(AI・保存・署名URL・切り抜きが全部通る経路)
- ログインし直す(トークンの付け替えが効いているか)

## いまの状態

| 手順 | 状態 |
|---|---|
| 1. 呼び先の付け替え | ✅ 実装済み(`VITE_SERVER_ORIGIN` 未設定なので無効) |
| 2. CORS | ❌ 未実施 |
| 3. `server.url` を外す | ❌ 未実施 |
| 4. 実機確認 | ❌ できない(実機が無い) |

**2〜4 を私の側で確かめる方法が無いので、そこは進めていない。**
確かめられないまま `server.url` を外すと、アプリが起動しても何も動かない
状態で気づかれないまま出ていくことになる。1 だけを先に入れてあるのは、
それが**入れても何も壊れない**部分だから。

## 審査との関係

Apple の審査には「ただサイトを表示するだけのアプリ」を弾く項目(4.2)が
あるので、iOS を本審査に出すなら同梱方式へ移る必要が出る可能性が高い。
Android のベータ配布では通常問題にならない。
