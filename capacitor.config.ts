import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor の設定 — Webアプリの中身をそのまま使い、外側だけスマホアプリの
 * 殻をかぶせるための設定ファイル。
 *
 * ## なぜ server.url を使うのか
 * このアプリは「サーバー側で動く処理」(AIの呼び出し・DBアクセス・署名URLの
 * 発行など)を持っているので、画面のファイルだけを端末に詰めても動かない。
 * そこで**アプリの中に埋め込んだブラウザが、公開中のサイトを表示する**形にする。
 * これなら中身の更新はサーバー側を更新するだけで全端末に届く(再提出が不要)。
 *
 * ## この方式の注意点(先に知っておくこと)
 * Apple の審査には「ただサイトを表示するだけのアプリ」を弾く項目(4.2)がある。
 * Android のベータ配布ではまず問題にならないが、**iOS を本審査に出す前には
 * 画面を端末に同梱する方式へ切り替える**必要が出る可能性が高い。
 * その判断は Mac が届いてからで間に合う。
 *
 * ## 表示先の切り替え
 * CAP_SERVER_URL を指定すればそちらを見る。自前のドメインへ引っ越したら
 * ここを変えるだけでよい。
 */
const config: CapacitorConfig = {
  /**
   * アプリの識別子。ストアで一意である必要があり、**公開後は変更できない**。
   * 逆さドメイン形式(自分の持つドメインを逆から書く)が慣習。
   */
  appId: "app.catchwords.taiwan",
  /** ホーム画面のアイコンの下に出る名前。 */
  appName: "Catchwords",
  /**
   * server.url を使う場合でも、殻の中に置く「万一のときの画面」が要る。
   * ビルド成果物の公開ディレクトリを指す。
   */
  webDir: ".output/public",
  server: {
    url: process.env.CAP_SERVER_URL ?? "https://word-snap-journey.lovable.app",
    /** 平文HTTPは許可しない(盗み見を防ぐため)。 */
    cleartext: false,
  },
  android: {
    /**
     * カメラのプレビューを画面いっぱいに出すため、WebView の背景を黒にする。
     * 既定の白のままだと、カメラ起動の一瞬だけ白く光る。
     */
    backgroundColor: "#000000",
  },
};

export default config;
