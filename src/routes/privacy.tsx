import { CHINESE_EXPLANATION_LANGUAGE } from "@/lib/target-lang";
import { siteUrlFor } from "@/lib/site-url";
import { createFileRoute, Link } from "@tanstack/react-router";
import { tStatic, useUiLang, useT } from "@/lib/i18n";
import { LegalLinks } from "@/components/LegalLinks";

/**
 * プライバシーポリシー。
 *
 * 法務文書は翻訳キーに刻むのではなく、言語ごとに文書そのものを持つ。
 * 条文は単語の置き換えではなく文章として成り立っていないと意味がなく、
 * `t()` で細切れにすると、後から条項を直したときに片方だけ古くなる。
 *
 * 共有用メタ文(og:description)は日本語のまま。あれは表示言語ではなく
 * 「どの市場に向けた紹介文か」の話。
 */

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: tStatic("page.privacy") },
      {
        name: "description",
        content:
          "CatchWordsのプライバシーポリシー。取得する情報、利用目的、第三者提供、位置情報・写真の取り扱い、データ削除手続きについて説明します。",
      },
      { property: "og:title", content: "プライバシーポリシー — CatchWords" },
      {
        property: "og:description",
        content:
          "CatchWordsのプライバシーポリシー。取得する情報、利用目的、第三者提供、位置情報・写真の取り扱い、データ削除手続きについて説明します。",
      },
      { property: "og:type", content: "article" },
      { property: "og:url", content: siteUrlFor("/privacy") },
    ],
    links: [{ rel: "canonical", href: siteUrlFor("/privacy") }],
  }),
  component: PrivacyPage,
});

function PrivacyJa() {
  return (
    <>
      <h1 className="mt-4 text-hero font-bold tracking-tight">プライバシーポリシー</h1>
      <p className="mt-1 text-footnote text-muted-foreground">最終更新: 2026年10月3日</p>
      <section className="prose prose-sm mt-6 max-w-none dark:prose-invert">
        <h2>1. 取得する情報</h2>
        <ul>
          <li>アカウント情報(メールアドレス、表示名、アバター画像)</li>
          <li>ユーザーが撮影した写真および自撮り画像</li>
          <li>位置情報(撮影時、ユーザーが許可した場合のみ)</li>
          <li>学習履歴・復習スコア・ストリーク等の利用統計</li>
          <li>
            アプリの利用状況(開いた日時、使った画面、撮影・スキャン・復習の回数とかかった時間)
          </li>
          <li>
            有料プランのお支払いに関する情報(決済は Stripe
            が行い、カード番号を当社が受け取ることはありません)
          </li>
          <li>広告を表示する場合、広告の配信に必要な端末の情報(広告IDなど)</li>
        </ul>

        <h2>2. 利用目的</h2>
        <ul>
          <li>本サービスの提供・運営</li>
          <li>AIによる単語カード・クイズの自動生成</li>
          <li>マップ・図鑑等の機能提供</li>
          <li>不正利用の防止</li>
          <li>
            運営者が、サービスの改善・不具合の調査・不正利用の防止のために、利用者ごとの利用状況の数値(撮影や復習の回数、利用した日、画面ごとの利用など)を閲覧・分析すること。このとき、メールアドレス、正確な位置(緯度経度)、写真、日記やひとことの本文は閲覧の対象に含めません
          </li>
          <li>
            利用者全体の統計(利用者数・継続して使う人の割合など)の作成。統計は個人を特定できない形で扱います
          </li>
          <li>有料プランの提供と、お支払いの管理</li>
        </ul>

        <h2>3. 第三者提供</h2>
        <p>法令に基づく場合を除き、ユーザーの同意なく第三者に個人情報を提供しません。</p>

        <h2>4. 外部サービス(取り扱いの委託)</h2>
        <p>
          本サービスは、次の外部サービスに、それぞれの目的に必要な情報だけを送って処理を任せています。AI
          や音声のサービスは、品質や費用に応じて運営者が切り替えることがあり、そのとき使っているものにだけ送ります。
        </p>
        <ul>
          <li>Supabase / Lovable Cloud(データベース・認証・写真の保存、サービスの配信)</li>
          <li>Lovable(エラーの記録、AI 呼び出しの中継 AI Gateway、地図の中継)</li>
          <li>
            写真と文章の AI 解析・解説の作成: Google Gemini、OpenAI、Anthropic、DeepSeek、Moonshot
            AI、OpenRouter のいずれか(撮った写真、単語、例文、日記の文、学習の目安となる設定)
          </li>
          <li>
            Jev / Typesafe AI(候補の並べ替えや報告の確認など。文字だけを送り、写真は送りません)
          </li>
          <li>
            発音の音声の作成: Google Cloud Text-to-Speech、Google Gemini、Microsoft Azure AI
            Speech、ElevenLabs、MiniMax のいずれか(読み上げる単語・例文の文字だけ)
          </li>
          <li>
            単語の画像の検索・作成: Unsplash、Wikimedia Commons、画像を作る AI(Google、OpenAI、
            OpenRouter、Higgsfield)(単語の文字だけ)
          </li>
          <li>Google Maps(地図の表示、撮影した場所の緯度経度から地名を調べる逆ジオコーディング)</li>
          <li>
            Stripe(有料プランの決済。メールアドレスと、お支払いをアカウントと結びつけるための利用者の番号)
          </li>
          <li>Tripo(写真を 3D にする機能。開発中で、いまは開発者だけが使います)</li>
          <li>Google AdMob(広告を表示する場合の広告配信。いまは広告を表示していません)</li>
        </ul>

        <h2>5. 位置情報の取り扱い</h2>
        <p>
          位置情報は撮影位置の記録のみに使用し、公開投稿の場合のみ他ユーザーに表示されます。位置情報の取得はユーザーが任意で許可・拒否できます。
        </p>

        <h2>6. データの削除</h2>
        <p>
          設定画面の「アカウントを削除」から、いつでもアカウントと関連データ(単語カード・写真・学習記録・日記など)を即時に削除できます。削除は取り消せません。システムのバックアップに残った複製も30日以内に完全に消去されます。
        </p>

        <h2>7. Cookie等</h2>
        <p>セッション維持・ログイン状態の保持のためにブラウザのローカルストレージを利用します。</p>

        <h2>8. お問い合わせ</h2>
        <p>
          本ポリシーに関するご質問は、「特定商取引法に基づく表記」に記載の連絡先までご連絡ください。
        </p>

        <h2>9. 本ポリシーの変更</h2>
        <p>
          本ポリシーを変更する場合は、アプリ内でお知らせします。利用目的を追加する重要な変更は、変更後に本サービスを利用する前に改めて同意をいただきます。
        </p>
      </section>
    </>
  );
}

function PrivacyEn() {
  return (
    <>
      <h1 className="mt-4 text-hero font-bold tracking-tight">Privacy Policy</h1>
      <p className="mt-1 text-footnote text-muted-foreground">Last updated: 3 October 2026</p>
      <section className="prose prose-sm mt-6 max-w-none dark:prose-invert">
        <h2>1. Information we collect</h2>
        <ul>
          <li>Account information (email address, display name, avatar image)</li>
          <li>Photos and selfies you take</li>
          <li>Location (recorded at capture time, only if you allow it)</li>
          <li>Usage data such as study history, review scores and streaks</li>
          <li>
            How you use the app (when you open it, which screens you use, and how many captures,
            scans and reviews you do and how long they take)
          </li>
          <li>
            Payment information for paid plans (payments are processed by Stripe; we never receive
            your card number)
          </li>
          <li>
            If ads are shown, device information needed to serve them (such as the advertising ID)
          </li>
        </ul>

        <h2>2. How we use it</h2>
        <ul>
          <li>To provide and operate the service</li>
          <li>To generate word cards and quizzes with AI</li>
          <li>To provide features such as the map and the dex</li>
          <li>To prevent abuse</li>
          <li>
            For the operator to view and analyse per-user usage figures (such as the number of
            captures and reviews, active days and screen usage) to improve the service, investigate
            bugs and prevent abuse. Your email address, exact location (coordinates), photos and the
            text of your journal entries and notes are not included
          </li>
          <li>
            To produce overall statistics (such as the number of users and how many keep using the
            app), handled in a form that does not identify individuals
          </li>
          <li>To provide paid plans and manage payments</li>
        </ul>

        <h2>3. Sharing with third parties</h2>
        <p>
          We do not provide your personal information to third parties without your consent, except
          where required by law.
        </p>

        <h2>4. External services (processors)</h2>
        <p>
          The Service sends each of the following external services only the information needed for
          its purpose. The operator may switch AI and speech providers for quality or cost; data is
          sent only to the provider in use at the time.
        </p>
        <ul>
          <li>Supabase / Lovable Cloud (database, authentication, photo storage, hosting)</li>
          <li>Lovable (error reports, the Lovable AI Gateway relay for AI calls, map relay)</li>
          <li>
            AI analysis of photos and text and writing explanations: one of Google Gemini, OpenAI,
            Anthropic, DeepSeek, Moonshot AI or OpenRouter (your photos, words, example sentences,
            journal text and level settings)
          </li>
          <li>
            Jev / Typesafe AI (ranking candidates, checking reports and similar; text only, never
            photos)
          </li>
          <li>
            Pronunciation audio: one of Google Cloud Text-to-Speech, Google Gemini, Microsoft Azure
            AI Speech, ElevenLabs or MiniMax (only the text of the word or sentence read aloud)
          </li>
          <li>
            Finding or creating word images: Unsplash, Wikimedia Commons and image-generation AI
            (Google, OpenAI, OpenRouter, Higgsfield) (only the text of the word)
          </li>
          <li>
            Google Maps (map display, and reverse geocoding of the coordinates where a photo was
            taken)
          </li>
          <li>
            Stripe (payments for paid plans: your email address and a user ID that links the payment
            to your account)
          </li>
          <li>
            Tripo (turning photos into 3D; still in development and used only by the developer)
          </li>
          <li>Google AdMob (ad delivery, if ads are shown; no ads are shown at present)</li>
        </ul>

        <h2>5. How location is handled</h2>
        <p>
          Location is used only to record where a photo was taken, and is shown to other users only
          on public posts. You can allow or refuse location access at any time.
        </p>

        <h2>6. Deleting your data</h2>
        <p>
          You can delete your account and all related data (word cards, photos, study records,
          journal entries and so on) at any time from “Delete account” in Settings. Deletion cannot
          be undone. Copies remaining in system backups are fully erased within 30 days.
        </p>

        <h2>7. Cookies and local storage</h2>
        <p>We use your browser's local storage to keep your session and signed-in state.</p>

        <h2>8. Contact</h2>
        <p>
          For questions about this policy, please use the contact details in the commerce
          disclosure.
        </p>

        <h2>9. Changes to this policy</h2>
        <p>
          We will announce changes to this policy in the app. For significant changes that add new
          purposes of use, we will ask for your consent again before you continue using the service.
        </p>
      </section>
    </>
  );
}

/**
 * 繁體中文版（2026-10-03 追加）。日本語版を正本とし、上に注記を出す（`legal.jaPrevails`）。
 * 条を直すときは3つの言語を必ず一緒に直す。
 */
function PrivacyZhTw() {
  return (
    <>
      <h1 className="mt-4 text-hero font-bold tracking-tight">隱私權政策</h1>
      <p className="mt-1 text-footnote text-muted-foreground">最後更新：2026 年 10 月 3 日</p>
      <section className="prose prose-sm mt-6 max-w-none dark:prose-invert">
        <h2>1. 我們取得的資訊</h2>
        <ul>
          <li>帳號資訊（電子郵件地址、顯示名稱、頭像圖片）</li>
          <li>使用者拍攝的照片與自拍</li>
          <li>位置資訊（僅在拍攝時、且使用者允許的情況下）</li>
          <li>學習紀錄、複習分數、連續紀錄等使用統計</li>
          <li>App 的使用狀況（開啟的時間、使用的畫面、拍攝・掃描・複習的次數與所花時間）</li>
          <li>付費方案的付款相關資訊（付款由 Stripe 處理，我們不會取得你的信用卡號碼）</li>
          <li>若顯示廣告，投放廣告所需的裝置資訊（廣告 ID 等）</li>
        </ul>

        <h2>2. 使用目的</h2>
        <ul>
          <li>提供與營運本服務</li>
          <li>以 AI 自動產生單字卡與測驗</li>
          <li>提供地圖、圖鑑等功能</li>
          <li>防止不當使用</li>
          <li>
            營運者為了改善服務、調查問題、防止不當使用，查看與分析每位使用者的使用數據（拍攝與複習的次數、使用的日子、各畫面的使用等）。此時不包含電子郵件地址、精確位置（經緯度）、照片，以及日記與短評的內文
          </li>
          <li>
            製作所有使用者的整體統計（使用者人數、持續使用的比例等），以無法識別個人的形式處理
          </li>
          <li>提供付費方案並管理付款</li>
        </ul>

        <h2>3. 提供給第三方</h2>
        <p>除法令規定的情形外，未經使用者同意，我們不會將個人資料提供給第三方。</p>

        <h2>4. 外部服務（委託處理）</h2>
        <p>
          本服務只會將各項目的所需的資訊傳送給下列外部服務處理。AI
          與語音服務可能因品質或費用由營運者切換，資料只會傳送給當時使用中的服務。
        </p>
        <ul>
          <li>Supabase / Lovable Cloud（資料庫、驗證、照片儲存、服務的託管）</li>
          <li>Lovable（錯誤紀錄、AI 呼叫的中繼 AI Gateway、地圖的中繼）</li>
          <li>
            照片與文字的 AI 分析、產生解說：Google Gemini、OpenAI、Anthropic、DeepSeek、Moonshot
            AI、OpenRouter 其中之一（拍攝的照片、單字、例句、日記內文、程度設定）
          </li>
          <li>Jev / Typesafe AI（候選排序、確認回報等；只傳送文字，不傳送照片）</li>
          <li>
            產生發音語音：Google Cloud Text-to-Speech、Google Gemini、Microsoft Azure AI
            Speech、ElevenLabs、MiniMax 其中之一（只傳送要朗讀的單字或例句文字）
          </li>
          <li>
            搜尋或產生單字圖片：Unsplash、Wikimedia Commons、圖片生成 AI（Google、OpenAI、
            OpenRouter、Higgsfield）（只傳送單字文字）
          </li>
          <li>Google Maps（顯示地圖，以及由拍攝地點的經緯度查詢地名的反向地理編碼）</li>
          <li>Stripe（付費方案的付款；電子郵件地址，以及將付款與帳號連結的使用者編號）</li>
          <li>Tripo（將照片轉為 3D 的功能；開發中，目前只有開發者使用）</li>
          <li>Google AdMob（若顯示廣告時的廣告投放；目前未顯示廣告）</li>
        </ul>

        <h2>5. 位置資訊的處理</h2>
        <p>
          位置資訊僅用於記錄拍攝地點，只有在公開貼文時才會顯示給其他使用者。是否提供位置資訊，使用者可隨時自行允許或拒絕。
        </p>

        <h2>6. 刪除資料</h2>
        <p>
          可隨時從設定畫面的「刪除帳號」立即刪除帳號與相關資料（單字卡、照片、學習紀錄、日記等）。刪除後無法復原。系統備份中留存的副本也會在
          30 天內完全刪除。
        </p>

        <h2>7. Cookie 等</h2>
        <p>為了維持工作階段與登入狀態，我們會使用瀏覽器的本機儲存空間。</p>

        <h2>8. 聯絡方式</h2>
        <p>關於本政策的問題，請透過「特定商業交易法標示」所載的聯絡方式與我們聯繫。</p>

        <h2>9. 本政策的變更</h2>
        <p>
          變更本政策時，會在 App
          內通知。新增使用目的等重要變更，會在變更後你繼續使用本服務前，再次取得你的同意。
        </p>
      </section>
    </>
  );
}

function PrivacyPage() {
  const t = useT();
  const lang = useUiLang();
  return (
    <article className="mx-auto max-w-2xl px-4 py-10">
      <Link
        to="/"
        className="inline-block py-3 -my-3 text-body text-muted-foreground hover:text-foreground"
      >
        ← {t("common.back")}
      </Link>
      {lang !== "ja" && (
        <p className="mt-4 rounded-xl bg-secondary p-3 text-footnote">{t("legal.jaPrevails")}</p>
      )}
      {lang === "ja" ? (
        <PrivacyJa />
      ) : lang === CHINESE_EXPLANATION_LANGUAGE ? (
        <PrivacyZhTw />
      ) : (
        <PrivacyEn />
      )}
      <p className="mt-8 flex flex-wrap gap-x-4 gap-y-1 text-footnote text-muted-foreground">
        <LegalLinks />
      </p>
    </article>
  );
}
