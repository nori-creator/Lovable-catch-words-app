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
import { OnboardingScene } from "./scenes/onboarding";
import { StickerSheetScene } from "./scenes/sticker-sheet";
import { JournalResultScene, JournalScaffoldScene } from "./scenes/journal";
import { WordCandidateScene } from "./scenes/word-candidate";
import { InputCatchScene } from "./scenes/input-catch";
import { HeroPickerScene } from "./scenes/hero-picker";
import {
  CaptureCardScene,
  CaptureObjectScene,
  CaptureOfflineScene,
  CaptureSavingScene,
  CapturePickScene,
  CaptureReunionScene,
} from "./scenes/capture";
import {
  ScanCameraScene,
  ScanChipScene,
  ScanDotsScene,
  ScanFoundScene,
  ScanNothingScene,
} from "./scenes/scan";
import {
  WordbookShelfScene,
  WordbookQuizScene,
  WordbookQuizNoMeaningScene,
} from "./scenes/wordbook";
import {
  HomeEmptyScene,
  HomeLoadingScene,
  HomePastScene,
  HomePendingScene,
  HomeScene,
  HomeWritingScene,
} from "./scenes/home";
import {
  SettingsChoicesScene,
  SettingsDangerScene,
  SettingsSelectsScene,
  SettingsSourcesScene,
  SettingsTogglesScene,
} from "./scenes/settings";
import {
  StickerDetailScene,
  StickerHeroScene,
  WordCardEmptyScene,
  WordCardScene,
  WordCardEnScene,
  TocflLadderScene,
  SectionsEditorScene,
} from "./scenes/word-card";
import {
  ReviewChoiceScene,
  ReviewEndScene,
  ReviewExplainScene,
  ReviewLoadingScene,
  ReviewModeTabsScene,
  RetakeSuggestionScene,
  ReviewSayResultScene,
  ReviewSayScene,
  ReviewMemoryScene,
} from "./scenes/review";
import {
  ChunksScene,
  CurveScene,
  LoadFailedScene,
  PronunciationScene,
  ScanDetailScene,
  TokensScene,
  DexEmptyScene,
  DexNoMatchScene,
  DexFilterScene,
  VoicePlayerScene,
  PhotoHistoryScene,
  UserPanelScene,
  PlaceMemoryScene,
  RegisterMeterScene,
} from "./scenes/pieces";
import "@/styles.css";

// 値を `| undefined` にしておく。**`Record<string, T>` は「どの鍵でも在る」と
// 言う型**なので、知らない名前を弾く下のガードが型の上では死んで見え、
// 実際 tsc が「この条件は常に true」と言った(実行時には undefined になる)。
// 型に嘘をつかせない。
const SCENES: Record<string, ((p: { q: URLSearchParams }) => ReactNode) | undefined> = {
  shelf: ShelfScene,
  onboarding: OnboardingScene,
  home: HomeScene,
  "home-empty": HomeEmptyScene,
  "home-loading": HomeLoadingScene,
  "home-past": HomePastScene,
  "home-writing": HomeWritingScene,
  "wordbook-shelf": WordbookShelfScene,
  "wordbook-quiz": WordbookQuizScene,
  "wordbook-quiz-nomeaning": WordbookQuizNoMeaningScene,
  "home-pending": HomePendingScene,
  "settings-choices": SettingsChoicesScene,
  "settings-selects": SettingsSelectsScene,
  "settings-sources": SettingsSourcesScene,
  "settings-toggles": SettingsTogglesScene,
  "settings-danger": SettingsDangerScene,
  "word-card": WordCardScene,
  "word-card-en": WordCardEnScene,
  "sticker-detail": StickerDetailScene,
  "sticker-hero": StickerHeroScene,
  "sticker-sheet": StickerSheetScene,
  "capture-pick": CapturePickScene,
  "capture-reunion": CaptureReunionScene,
  "scan-chip": ScanChipScene,
  "scan-found": ScanFoundScene,
  "scan-nothing": ScanNothingScene,
  "scan-dots": ScanDotsScene,
  "capture-offline": CaptureOfflineScene,
  "capture-card": CaptureCardScene,
  "capture-object": CaptureObjectScene,
  "capture-saving": CaptureSavingScene,
  "scan-camera": ScanCameraScene,
  "journal-result": JournalResultScene,
  "journal-scaffold": JournalScaffoldScene,
  "word-candidate": WordCandidateScene,
  "input-catch": InputCatchScene,
  "hero-picker": HeroPickerScene,
  "word-card-empty": WordCardEmptyScene,
  "tocfl-ladder": TocflLadderScene,
  "sections-editor": SectionsEditorScene,
  "load-failed": LoadFailedScene,
  "dex-empty": DexEmptyScene,
  "dex-no-match": DexNoMatchScene,
  "dex-filter": DexFilterScene,
  "voice-player": VoicePlayerScene,
  "photo-history": PhotoHistoryScene,
  "user-panel": UserPanelScene,
  "place-memory": PlaceMemoryScene,
  "register-meter": RegisterMeterScene,
  chunks: ChunksScene,
  curve: CurveScene,
  pronunciation: PronunciationScene,
  "scan-detail": ScanDetailScene,
  tokens: TokensScene,
  "review-memory": ReviewMemoryScene,
  "review-loading": ReviewLoadingScene,
  "review-choice": ReviewChoiceScene,
  "review-explain": ReviewExplainScene,
  "review-end": ReviewEndScene,
  "review-say": ReviewSayScene,
  "review-say-result": ReviewSayResultScene,
  "review-mode-tabs": ReviewModeTabsScene,
  "retake-suggestion": RetakeSuggestionScene,
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
          <span className="ml-2 text-body font-semibold tracking-[-0.02em]">Catchwords</span>
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

/**
 * ## 場面の足場に Tailwind のクラスを書かない
 *
 * `styles.css` は `@source "../src"` なので、**Tailwind が走査するのは
 * `src` だけ**。雛形のファイルにしか出てこないクラスは生成されず、
 * **静かに何も起きない**。
 *
 * 実際、印を撮る場面で `h-[520px]` を書いたら箱の高さが 0 になり、
 * 撮った写真の代わりにページの白い地の上に印が乗って、白い印が
 * 「コントラスト 1.03」で16件落ちた。**地を敷いたつもりで敷けていない**、
 * この検査でいちばん危ない形そのもの。
 *
 * 場面の足場(高さ・背景・余白)は**インラインの `style`** で書く。
 * 部品を並べるときに使うクラスは `src` に在るものなので問題ない。
 *
 * 枠(上のバー・下タブ)を被せない場面。
 *
 * 全画面の面にバーと帯を足して撮ると、**実物に無いものを検査する**ことに
 * なる。逆に、バーがある画面で枠を外すと sticky の止まる位置が変わる。
 * どちらも「別の画面を見ている」なので、場面ごとに決める。
 */
const BARE = new Set(["onboarding", "sticker-sheet", "capture-saving", "scan-camera"]);

const q = new URLSearchParams(location.search);
const wanted = q.get("scene") ?? "shelf";

/**
 * 表示言語を切り替えて撮る(`?lang=zh-TW`)。
 *
 * `useUiLang` は localStorage を読むので、**React が起動する前に**書く。
 * あとから書くと初回の描画が日本語のままになり、撮った絵が実物と違う。
 */
{
  const lang = q.get("lang");
  if (lang) {
    try {
      localStorage.setItem("ui-lang-v1", lang);
    } catch {
      /* 使えない環境では既定のまま */
    }
  }
}
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
      {BARE.has(wanted) ? (
        <Scene q={q} />
      ) : (
        <Frame>
          <Scene q={q} />
        </Frame>
      )}
    </QueryClientProvider>
  ) : (
    <p>unknown scene</p>
  ),
);
