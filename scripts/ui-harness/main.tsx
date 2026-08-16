/**
 * 画面の検査用ハーネス — **本物のコンポーネントを描く**。
 *
 * ## なぜ作り替えたか
 * 以前この検査は、棚のHTMLを手書きで複製していた。つまり
 * **コンポーネントを直しても画像は変わらない**。検査が合格しても、
 * 実物が同じように描かれている保証がどこにも無かった
 * (独立監査の指摘)。実際、空の棚の実レイアウトは一度も写っていなかった。
 *
 * ここでは本物を import して描く。画像は data: URL を渡す —
 * `CachedImg` は署名URLの形でないものはそのまま `<img src>` に流すので、
 * ブラウザ内では実物と同じ経路で表示される。
 *
 * 場面はURLの検索文字列で切り替える(`?scene=shelf&material=oak&count=0`)。
 */
import { createRoot } from "react-dom/client";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ShelfScene } from "./scenes/shelf";
import { HomeEmptyScene, HomePastScene, HomePendingScene, HomeScene } from "./scenes/home";
import {
  ReviewChoiceScene,
  ReviewEndScene,
  ReviewExplainScene,
  ReviewMemoryScene,
} from "./scenes/review";
import {
  ChunksScene,
  CurveScene,
  LoadFailedScene,
  PronunciationScene,
  ScanDetailScene,
  ShelfOptionsScene,
  TokensScene,
} from "./scenes/pieces";
import "@/styles.css";

// 値を `| undefined` にしておく。**`Record<string, T>` は「どの鍵でも在る」と
// 言う型**なので、知らない名前を弾く下のガードが型の上では死んで見え、
// 実際 tsc が「この条件は常に true」と言った(実行時には undefined になる)。
// 型に嘘をつかせない。
const SCENES: Record<string, ((p: { q: URLSearchParams }) => ReactNode) | undefined> = {
  shelf: ShelfScene,
  home: HomeScene,
  "home-empty": HomeEmptyScene,
  "home-past": HomePastScene,
  "home-pending": HomePendingScene,
  "load-failed": LoadFailedScene,
  "shelf-options": ShelfOptionsScene,
  chunks: ChunksScene,
  curve: CurveScene,
  pronunciation: PronunciationScene,
  "scan-detail": ScanDetailScene,
  tokens: TokensScene,
  "review-memory": ReviewMemoryScene,
  "review-choice": ReviewChoiceScene,
  "review-explain": ReviewExplainScene,
  "review-end": ReviewEndScene,
};

/**
 * 上のバーも置く。**置かないと嘘になる。**
 * 図鑑の部屋見出しは `top: var(--app-header-h)` の sticky なので、バーが無い
 * ページでは**先頭の見出しがその分だけ下にずれて、自分の中身に重なる**。
 * 実際、最初に撮った画像では一番上の「空いている棚 — 押すと開きます」が
 * 見出しの下敷きになって消えていた。実物と同じ箱を置いて初めて、
 * sticky の止まる位置が実物と同じになる。
 */
function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="scroll-edge sticky top-0 z-30 bg-background/70 pt-[env(safe-area-inset-top)] backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex min-h-[var(--app-header-h)] max-w-3xl items-center px-4 py-3">
          <div className="h-8 w-8 rounded-xl bg-primary" />
          <span className="ml-2 text-base font-semibold tracking-[-0.02em]">Catchwords</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-4">{children}</main>
      {/* 下のタブ帯も置く。**置かないと嘘になる。**
          答え合わせの面は画面下端に貼り付いて、この帯のぶんだけ上に浮く。
          帯が無いページで撮ると浮く位置が変わり、何が覆われるかも変わる。 */}
      <nav className="app-sheet fixed inset-x-0 bottom-0 z-40 h-[calc(4.5rem+env(safe-area-inset-bottom))]" />
    </div>
  );
}

const q = new URLSearchParams(location.search);
const wanted = q.get("scene") ?? "shelf";
const Scene = SCENES[wanted];
// 知らない場面は**印を残して落とす**。以前は静かに `unknown scene` と
// 描くだけだったので、一覧の綴りを間違えると「文字も押せるものも無い
// 真っ白なページ」を検査して、指摘0で緑になっていた。
document.documentElement.dataset.scene = Scene ? wanted : "";
// 再試行で待ち時間が伸びると、撮る面が場面ごとにばらつく。1回で止める。
const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
/**
 * 最初の描画が終わった時刻に印を打つ(性能の計測用)。
 *
 * `first-paint` は「何か1画素でも塗った時刻」なので、束の読み込みと
 * React の起動が支配的で、**画面外の棚を描くかどうかの差がほとんど出ない**。
 * レイアウトまで終わった時刻を自分で記録して、そちらを比べる。
 */
requestAnimationFrame(() =>
  requestAnimationFrame(() => {
    void document.documentElement.scrollHeight; // レイアウトを確定させてから
    performance.mark("harness-painted");
  }),
);

createRoot(document.getElementById("root")!).render(
  Scene ? (
    <QueryClientProvider client={qc}>
      <Frame>
        <Scene q={q} />
      </Frame>
    </QueryClientProvider>
  ) : (
    <p>unknown scene</p>
  ),
);
