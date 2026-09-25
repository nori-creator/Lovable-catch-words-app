import { FirstCatchScene } from "./scenes/first-catch";
import { ChunkDesignsScene } from "./scenes/chunk-designs";
import { PeelStickerScene } from "./scenes/peel-sticker";
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
import { GalleryScene } from "./scenes/gallery";
import { TabBarScene } from "./scenes/tabbar";
import { OnboardingScene } from "./scenes/onboarding";
import { StickerSheetScene } from "./scenes/sticker-sheet";
import { JournalResultScene, JournalScaffoldScene } from "./scenes/journal";
import { WordCandidateScene } from "./scenes/word-candidate";
import { InputCatchScene } from "./scenes/input-catch";
import { HeroPickerScene } from "./scenes/hero-picker";
import { CameraStripScene } from "./scenes/camera-strip";
import { RewardCatchScene } from "./scenes/reward-catch";
import {
  CaptureCardScene,
  CaptureObjectScene,
  CaptureOfflineScene,
  CaptureSavingScene,
  CapturePickScene,
  CaptureReunionScene,
} from "./scenes/capture";
import { ScanBottomScene } from "./scenes/scan-bottom";
import { ScanResultScene } from "./scenes/scan-result";
import { DexCalendarScene } from "./scenes/dex-calendar";
import { DexCardsScene } from "./scenes/dex-cards";
import { TtsVoicesScene } from "./scenes/tts-voices";
import { CatchSoundScene } from "./scenes/catch-sound";
import { AiModelsScene } from "./scenes/ai-models";
import { DexMapScene } from "./scenes/dex-map";
import { ScanCameraScene, ScanChipScene, ScanDotsScene, ScanNothingScene } from "./scenes/scan";
import {
  WordbookShelfScene,
  WordbookQuizScene,
  WordbookQuizNoMeaningScene,
} from "./scenes/wordbook";
import { AuthScene } from "./scenes/auth";
import {
  HomeAlbumScene,
  HomeEmptyScene,
  HomeLoadingScene,
  HomePastScene,
  HomePendingScene,
  HomeScene,
  WallpaperPickerScene,
  HomeTapScene,
  HomeWritingScene,
} from "./scenes/home";
import {
  SettingsPolishScene,
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
  SectionsPanelScene,
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
  ReviewMemoryListScene,
  MemoryCurveScene,
  MemoryOverallScene,
} from "./scenes/review";
import {
  ChunksScene,
  CurveScene,
  LoadFailedScene,
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
// **見た目パックのCSSも読む。** 実物(`src/routes/__root.tsx`)は両方読んで
// いるのに、雛形は `styles.css` だけだった。つまり16パック(約3000行)は
// **一度も絵に映っていない**。`PackGallery` を描いても下地の規則しか
// 当たらず、無スタイルの絵を「実物が壊れている」と読み違える。
// 規則はほぼ全部 `[data-ui-pack]` の下にあるので、属性を付けない
// 既定(origin)の場面には影響しない。
import "@/pack-styles.css";

// 値を `| undefined` にしておく。**`Record<string, T>` は「どの鍵でも在る」と
// 言う型**なので、知らない名前を弾く下のガードが型の上では死んで見え、
// 実際 tsc が「この条件は常に true」と言った(実行時には undefined になる)。
// 型に嘘をつかせない。
const SCENES: Record<string, ((p: { q: URLSearchParams }) => ReactNode) | undefined> = {
  // `auth` は下の `AuthScene`（作り直した迎える面まるごと）。main に在った
  // 「ボタン2つだけ」の場面は、同じ鍵で実物より狭い面を撮ることになるので外した。
  "sticker-peel": PeelStickerScene,
  shelf: ShelfScene,
  gallery: GalleryScene,
  tabbar: TabBarScene,
  onboarding: OnboardingScene,
  "first-catch": FirstCatchScene,
  "chunk-designs": ChunkDesignsScene,
  auth: AuthScene,
  home: HomeScene,
  "home-album": HomeAlbumScene,
  "home-tap": HomeTapScene,
  "home-empty": HomeEmptyScene,
  "home-loading": HomeLoadingScene,
  "home-past": HomePastScene,
  "home-writing": HomeWritingScene,
  "wordbook-shelf": WordbookShelfScene,
  "wordbook-quiz": WordbookQuizScene,
  "wordbook-quiz-nomeaning": WordbookQuizNoMeaningScene,
  "home-pending": HomePendingScene,
  "settings-polish": SettingsPolishScene,
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
  "scan-found": ScanResultScene,
  "dex-calendar": DexCalendarScene,
  "dex-cards": DexCardsScene,
  "ai-models": AiModelsScene,
  "tts-voices": TtsVoicesScene,
  "catch-sound": CatchSoundScene,
  "dex-map": DexMapScene,
  wallpapers: WallpaperPickerScene,
  "scan-nothing": ScanNothingScene,
  "scan-dots": ScanDotsScene,
  "capture-offline": CaptureOfflineScene,
  "capture-card": CaptureCardScene,
  "capture-object": CaptureObjectScene,
  "capture-saving": CaptureSavingScene,
  "scan-camera": ScanCameraScene,
  "scan-bottom": ScanBottomScene,
  "camera-strip": CameraStripScene,
  "journal-result": JournalResultScene,
  "journal-scaffold": JournalScaffoldScene,
  "word-candidate": WordCandidateScene,
  "input-catch": InputCatchScene,
  "hero-picker": HeroPickerScene,
  "reward-catch": RewardCatchScene,
  "word-card-empty": WordCardEmptyScene,
  "tocfl-ladder": TocflLadderScene,
  "sections-editor": SectionsEditorScene,
  "sections-panel": SectionsPanelScene,
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
  "scan-detail": ScanDetailScene,
  tokens: TokensScene,
  "review-memory": ReviewMemoryScene,
  "review-memory-list": ReviewMemoryListScene,
  "memory-curve": MemoryCurveScene,
  "memory-overall": MemoryOverallScene,
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
      {/* 下のタブ帯の**占める高さ**も置く。**置かないと嘘になる。**
          答え合わせの面は画面下端に貼り付いて、この帯のぶんだけ上に浮く。
          帯が無いページで撮ると浮く位置が変わり、何が覆われるかも変わる。

          **地は塗らない。** 帯は画面いっぱいの板ではなく、幅 87.6% の
          浮くカプセルになった（`components/TabBar.tsx`）。ここに不透明な
          板を敷くと、実物では**見えている**下端の左右が絵の上では隠れ、
          そこにある物の読みやすさを一度も測らないことになる。
          高さは実物と同じ 63px（帯 55 + 下の余白 8）。
          帯そのものの絵は `?scene=tabbar` が本物で撮る。

          **指も通す。** 実物の `.tabbar-dock` は `pointer-events: none` で、
          押せるのはカプセルだけ。ここを素通しにしないと、`elementFromPoint`
          で見る検査が「下端の押せる物が下敷きになっている」と言う
          （実際そう出た）。場所だけを取って、当たり判定は持たない。 */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40"
        style={{ height: "calc(63px + env(safe-area-inset-bottom, 0px))" }}
      />
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
const BARE = new Set([
  "first-catch",
  "auth",
  "sticker-peel",
  "onboarding",
  "sticker-sheet",
  "capture-saving",
  "scan-camera",
  "scan-bottom",
  "camera-strip",
  // 撮る画面は画面いっぱい（`.capture-viewfinder` が `fixed inset-0`）。
  // 枠の上のバーを敷くと、実物では**映像に覆われて見えない**物の
  // 読みやすさを測ることになる（実際、枠の「Catchwords」が
  // 地＝黒い映像で 1.12 と出た）。
  "capture-object",
  "reward-catch",
  // 押した札から詳細が広がる絵。全画面の面なので枠は要らない。
  "home-tap",
]);

const q = new URLSearchParams(location.search);

/**
 * **この作業で変わった画面**（`AGENTS.md`「UI / UX preview workflow」）。
 *
 * > Make the UI harness open the primary screen changed by the task by default
 * > whenever practical. Do not require the user to discover or manually type a
 * > `?scene=...` query parameter just to see the change.
 *
 * Netlify の Deploy Preview を開いた人が、**何も打たずに**最初の1つを見られる
 * ようにする。2つ以上変わったときは上の帯から選べる。
 *
 * **作業ごとに書き換える。** 古いままにすると、直していない画面を
 * 「これを見てください」と差し出すことになる。
 */
const REVIEW_SCENES: Array<{ scene: string; label: string }> = [
  // 2026-09-25 の依頼で触った面だけ。**毎回ここを入れ替える**
  // — 前の依頼の面は残さない（オーナー指示「過去のものは全て削除して」）。
  { scene: "chunk-designs", label: "チャンクの形 A〜F" },
  { scene: "word-card", label: "単語の詳細（青い発音）" },
  { scene: "review-explain", label: "復習の解説" },
  { scene: "first-catch&step=camera&fail=guest", label: "登録前の体験（見本で続ける）" },
  // ガラスの試作。`&glass=1` で `html[data-glass="on"]` になる。帯の右端の
  // 「ガラス案」で同じ画面の今の形と見比べられる。
  { scene: "tabbar&glass=1", label: "ガラス案: 下のバー" },
  { scene: "settings-polish&glass=1", label: "ガラス案: 設定" },
  { scene: "capture-object&glass=1", label: "ガラス案: カメラ" },
  { scene: "review-choice&glass=1", label: "ガラス案: 復習の4択" },
];

const explicitScene = q.get("scene");
/**
 * 見比べの帯を出すか。
 *
 * **`?scene=` を名指しで渡された回は出さない。** 絵の検査(`ui-audit`)は
 * 必ず名指しで開くので、帯が写り込んで**実物に無い物を測る**ことになる。
 * 何も付けずに開いた回（＝人が Deploy Preview を見に来た回）だけ出す。
 */
// **何も付けずに開いた人（Deploy Preview を見に来た人）には帯を出す** —
// 帯が無いと先頭の1画面しか見られない（オーナー報告 2026-09-24「netlify が
// 見れない」）。名指しの `?scene=` は検査用なので出さない（帯を測らない）。
const showReviewBar = q.get("review") === "1" || !explicitScene;
const wanted = explicitScene ?? REVIEW_SCENES[0].scene;

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
// ガラスの試作（2026-09-25）。本番には無い印。
if (q.get("glass") === "1") document.documentElement.dataset.glass = "on";
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

/**
 * 見比べの帯。**検査の対象ではない**ので、素の `style` で書く
 * （`styles.css` の `@source` は `src` しか見ないため、ここに Tailwind の
 * クラスを書いても生成されない）。
 */
function ReviewBar() {
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        display: "flex",
        // 1行で横に送る。折り返すと、項目が多い回は帯が画面を覆う。
        flexWrap: "nowrap",
        overflowX: "auto",
        whiteSpace: "nowrap",
        gap: 6,
        padding: "8px 10px",
        background: "#0b1020",
        color: "#fff",
        fontSize: 12,
        lineHeight: 1.2,
      }}
    >
      {REVIEW_SCENES.map((r) => {
        // 場面は `scene&step=…&glass=1` のように条件付きで並べる。いま開いている
        // 場面の名前と、ガラスの有無が同じものを「選ばれている」とする。
        const [name] = r.scene.split("&");
        const on = name === wanted && r.scene.includes("glass=1") === (q.get("glass") === "1");
        return (
          <a
            key={r.scene}
            href={`?scene=${r.scene}&review=1`}
            style={{
              padding: "6px 10px",
              borderRadius: 999,
              background: on ? "#2563eb" : "rgba(255,255,255,0.12)",
              color: "#fff",
              textDecoration: "none",
              fontWeight: on ? 700 : 400,
            }}
          >
            {r.label}
          </a>
        );
      })}
      <a
        href={(() => {
          const next = new URLSearchParams(location.search);
          if (next.get("glass") === "1") next.delete("glass");
          else next.set("glass", "1");
          next.set("review", "1");
          if (!next.get("scene")) next.set("scene", wanted);
          return `?${next.toString()}`;
        })()}
        style={{
          padding: "6px 10px",
          borderRadius: 999,
          background: q.get("glass") === "1" ? "#0ea5e9" : "rgba(255,255,255,0.12)",
          color: "#fff",
          textDecoration: "none",
          fontWeight: 700,
        }}
      >
        {q.get("glass") === "1" ? "ガラス案 ON（押すと今の形）" : "ガラス案 OFF（押すとガラス）"}
      </a>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  Scene ? (
    <QueryClientProvider client={qc}>
      {showReviewBar && <ReviewBar />}
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
