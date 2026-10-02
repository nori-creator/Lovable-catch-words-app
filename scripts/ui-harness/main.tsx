import { FirstCatchScene, TutorialHarnessFrame, embedsTutorial } from "./scenes/first-catch";
import {
  RECOMMENDED_WELCOME_LAYOUT,
  setWelcomeLayoutPreview,
  WELCOME_LAYOUTS,
  type WelcomeLayout,
} from "@/components/onboarding/FirstCatchPages";
import { HomeShelfScene } from "./scenes/home-shelf";
import { InstallAppScene } from "./scenes/install-app";
import { ChunkDesignsScene } from "./scenes/chunk-designs";
import { PeelStickerScene } from "./scenes/peel-sticker";
import { MemoryDesignsScene } from "./scenes/memory-designs";
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
import { CandidatePickerScene } from "./scenes/candidate-picker";
import { ImageSettingsScene } from "./scenes/image-settings";
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
import { CategorySheetScene } from "./scenes/category-sheet";
import { CategoryMembersScene } from "./scenes/category-members";
import { PlaceNotifyDesignsScene } from "./scenes/place-notify-designs";
import { RegenMagicScene } from "./scenes/regen-magic";
import { AnalyzingDesignsScene } from "./scenes/analyzing-designs";
import { Shelf3DScene } from "./scenes/shelf-3d";
import { BookAlbumEditScene, BookPageScene, HomeVsBookScene } from "./scenes/book-page";
import { ThreeFxScene } from "./scenes/three-fx";
import { Object3DScene } from "./scenes/object-3d";
import { DiaryPencilScene } from "./scenes/diary-pencil";
import { MotionCompareScene } from "./scenes/motion-compare";
import { LaunchIntroScene } from "./scenes/launch-intro";
import { VoiceFaceScene } from "./scenes/voice-face";
import { CinemaFxScene } from "./scenes/cinema-fx";
import { PromoFilmScene } from "./scenes/promo-film";
import { ScanPickDesignsScene } from "./scenes/scan-pick-designs";
import { NotifyBarDesignsScene } from "./scenes/notify-bar-designs";
import { AdminUsersScene } from "./scenes/admin-users";
import { MonetizationDesignsScene } from "./scenes/monetization-designs";
import { FxLabScene } from "./scenes/fx-lab";
import { WordDetailDesignsScene } from "./scenes/word-detail-designs";
import { WordDetailRefineScene } from "./scenes/word-detail-refine";
import { MapCalendarDesignsScene } from "./scenes/map-calendar-designs";
import { ScanResultScene } from "./scenes/scan-result";
import { DexCalendarScene } from "./scenes/dex-calendar";
import { DexCardsScene } from "./scenes/dex-cards";
import { DexDragScene } from "./scenes/dex-drag";
import { TtsVoicesScene } from "./scenes/tts-voices";
import { CatchSoundScene } from "./scenes/catch-sound";
import { DexMapScene } from "./scenes/dex-map";
import { ScanCameraScene, ScanChipScene, ScanDotsScene, ScanNothingScene } from "./scenes/scan";
import { AuthScene, ResetPasswordScene } from "./scenes/auth";
import {
  HomeAlbumScene,
  HomeMemorialScene,
  HomeEmptyScene,
  HomeLoadingScene,
  HomePastScene,
  HomePendingScene,
  HomeScene,
  WallpaperPickerScene,
  HomeTapScene,
} from "./scenes/home";
import {
  SettingsPolishScene,
  SettingsChoicesScene,
  SettingsDangerScene,
  SettingsNotifyScene,
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
  SectionsEditorScene,
  SectionsPanelScene,
} from "./scenes/word-card";
import {
  ReviewChoiceScene,
  ReviewEndScene,
  ReviewExplainScene,
  ReviewHeaderScene,
  ReviewLoadingScene,
  ReviewMemoryScene,
  ReviewMemoryListScene,
  MemoryCurveScene,
  MemoryOverallScene,
} from "./scenes/review";
import {
  ChunksScene,
  CurveScene,
  LoadFailedScene,
  TokensScene,
  DexEmptyScene,
  DexNoMatchScene,
  DexFilterScene,
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
  "regen-magic": RegenMagicScene,
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
  "reset-password": ResetPasswordScene,
  home: HomeScene,
  "home-shelf": HomeShelfScene,
  "install-app": InstallAppScene,
  "home-album": HomeAlbumScene,
  "home-memorial": HomeMemorialScene,
  "home-tap": HomeTapScene,
  "home-empty": HomeEmptyScene,
  "home-loading": HomeLoadingScene,
  "home-past": HomePastScene,
  "home-pending": HomePendingScene,
  "settings-polish": SettingsPolishScene,
  "settings-choices": SettingsChoicesScene,
  "settings-selects": SettingsSelectsScene,
  "settings-sources": SettingsSourcesScene,
  "settings-toggles": SettingsTogglesScene,
  "settings-danger": SettingsDangerScene,
  "settings-notify": SettingsNotifyScene,
  "word-card": WordCardScene,
  "word-card-en": WordCardEnScene,
  "sticker-detail": StickerDetailScene,
  "category-sheet": CategorySheetScene,
  "category-members": CategoryMembersScene,
  "place-notify-designs": PlaceNotifyDesignsScene,
  "analyzing-designs": AnalyzingDesignsScene,
  "shelf-3d": Shelf3DScene,
  "book-page": BookPageScene,
  "home-vs-book": HomeVsBookScene,
  "book-album-edit": BookAlbumEditScene,
  "three-fx": ThreeFxScene,
  "object-3d": Object3DScene,
  "diary-pencil": DiaryPencilScene,
  "motion-compare": MotionCompareScene,
  "launch-intro": LaunchIntroScene,
  "voice-face": VoiceFaceScene,
  "cinema-fx": CinemaFxScene,
  "promo-film": PromoFilmScene,
  "scan-pick-designs": ScanPickDesignsScene,
  "notify-bar-designs": NotifyBarDesignsScene,
  "admin-users": AdminUsersScene,
  "monetization-designs": MonetizationDesignsScene,
  "fx-lab": FxLabScene,
  "word-detail-designs": WordDetailDesignsScene,
  "word-detail-refine": WordDetailRefineScene,
  "map-calendar-designs": MapCalendarDesignsScene,
  "sticker-hero": StickerHeroScene,
  "sticker-sheet": StickerSheetScene,
  "capture-pick": CapturePickScene,
  "capture-reunion": CaptureReunionScene,
  "scan-chip": ScanChipScene,
  "scan-found": ScanResultScene,
  "dex-calendar": DexCalendarScene,
  "dex-cards": DexCardsScene,
  "dex-drag": DexDragScene,
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
  "candidate-picker": CandidatePickerScene,
  "image-settings": ImageSettingsScene,
  "hero-picker": HeroPickerScene,
  "reward-catch": RewardCatchScene,
  "word-card-empty": WordCardEmptyScene,
  "sections-editor": SectionsEditorScene,
  "sections-panel": SectionsPanelScene,
  "load-failed": LoadFailedScene,
  "dex-empty": DexEmptyScene,
  "dex-no-match": DexNoMatchScene,
  "dex-filter": DexFilterScene,
  "photo-history": PhotoHistoryScene,
  "user-panel": UserPanelScene,
  "place-memory": PlaceMemoryScene,
  "register-meter": RegisterMeterScene,
  chunks: ChunksScene,
  curve: CurveScene,
  tokens: TokensScene,
  "review-memory": ReviewMemoryScene,
  "review-memory-list": ReviewMemoryListScene,
  "memory-curve": MemoryCurveScene,
  "memory-overall": MemoryOverallScene,
  // 復習タブの上部そのもの（本番の `ReviewSessionHeader`。2026-10-02 の改良）。
  "review-header": ReviewHeaderScene,
  // 記憶の状態のデザイン案（現在 + A〜D）。場面の中に切り替えがある。
  "memory-designs": MemoryDesignsScene,
  "review-loading": ReviewLoadingScene,
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
function Frame({ children, immersive = false }: { children: ReactNode; immersive?: boolean }) {
  return (
    // 実物の `AppShell` と同じ印（図鑑のスライドが地を透かす目印）。
    <div data-app-shell="" className="min-h-screen bg-background">
      {/* 図鑑は本番で上の帯を出さない（`AppShell immersive`）。ここで帯を置くと、札の位置が
          本番より 72px 下にずれて「下の写真の列がバーに被る」かを正しく測れない（R17）。 */}
      {!immersive && (
        <header className="scroll-edge sticky top-0 z-30 bg-background/70 pt-[env(safe-area-inset-top)] backdrop-blur-xl backdrop-saturate-150">
          <div className="mx-auto flex min-h-[var(--app-header-h)] max-w-3xl items-center px-4 py-3">
            <div className="h-8 w-8 rounded-xl bg-primary" />
            <span className="ml-2 text-body font-semibold tracking-[-0.02em]">CatchWords</span>
          </div>
        </header>
      )}
      <main className={immersive ? "mx-auto max-w-3xl px-4" : "mx-auto max-w-3xl px-4 py-4"}>
        {children}
      </main>
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
/** 本番で上の帯を出さない画面（`AppShell immersive`）。 */
const IMMERSIVE = new Set(["dex-cards", "dex-drag"]);

const BARE = new Set([
  "first-catch",
  "auth",
  "reset-password",
  "sticker-peel",
  "onboarding",
  "sticker-sheet",
  "capture-saving",
  "scan-camera",
  "scan-bottom",
  "camera-strip",
  // 撮る画面は画面いっぱい（`.capture-viewfinder` が `fixed inset-0`）。
  // 枠の上のバーを敷くと、実物では**映像に覆われて見えない**物の
  // 読みやすさを測ることになる（実際、枠の「CatchWords」が
  // 地＝黒い映像で 1.12 と出た）。
  "capture-object",
  "reward-catch",
  // 押した札から詳細が広がる絵。全画面の面なので枠は要らない。
  "home-tap",
  // 本の左ページを長押しして開く面は全画面。
  "book-album-edit",
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
  // 2026-10-02「ウェルカム画面の画像の配置を美しくして。デザイン案を私に。縦横無機質には
  // 並べないで」「はじめる…ログインが近いから少しだけ離して」。上の帯で C〜F を切り替えられる。
  { scene: "first-catch&layout=scatter", label: "ウェルカム D 散らす（おすすめ）" },
  { scene: "first-catch&layout=hero", label: "ウェルカム E 主役" },
  { scene: "first-catch&layout=cascade", label: "ウェルカム F 流れ" },
  { scene: "first-catch&layout=bouquet", label: "ウェルカム C 今の本番（比べる用）" },
  { scene: "first-catch&layout=scatter&theme=dark", label: "ウェルカム D（暗いテーマ）" },
  { scene: "first-catch&fail=start", label: "ウェルカム: 保存できない時の一言（はじめるを押す）" },
  // 2026-10-02「カメラの許可の画面がダサい…iPhone でも Android でもブラウザからでも
  // どこからでも、登録前に体験できるように」。ブラウザ自身の許可の画面は変えられないので、
  // その前に出すアプリの一枚（A/B/C は右上で切り替え）と、スマホのカメラで撮る道。
  { scene: "first-catch&step=camera&cam=prompt", label: "カメラの許可の前の一枚（B に決定）" },
  { scene: "first-catch&step=camera&cam=denied", label: "カメラを断った時（iPhone）" },
  { scene: "first-catch&step=camera&cam=android", label: "カメラを断った時（Android）" },
  { scene: "first-catch&step=camera&cam=brave", label: "カメラを断った時（Brave）" },
  { scene: "first-catch&step=camera&cam=line", label: "LINE の中で開いた時" },
  // 2026-10-02「チュートリアルの青の囲う枠をもう少し正確に、時間をコマ割りをしっかり。
  // 説明をもっと正確に簡潔に…便利さを伝えて。流れを確認して完成度を上げて」。
  // 右上で章を選べる・「もう一度」で同じ章を流し直せる。
  { scene: "first-catch&step=home&tour=1", label: "チュートリアル（最初から・章を選べる）" },
  { scene: "first-catch&step=home&tour=1&lang=en", label: "チュートリアル（英語）" },
  { scene: "first-catch&step=home&tour=1&lang=zh-TW", label: "チュートリアル（繁體中文）" },
  { scene: "first-catch&step=pick", label: "チュートリアル: 撮った後の候補" },
  { scene: "first-catch&step=review", label: "チュートリアル: 自分の写真で復習" },
];

/**
 * **カメラが使えない端末を見本で再現する**（`?cam=denied` / `?cam=line`）。
 * 見本の環境にはカメラが無いか、あっても許可の状態を選べないので、
 * 端末の答えを差し替える。本番のコードには何も足さない。
 */
{
  const cam =
    new URLSearchParams(location.search).get("cam") ??
    (location.search ? null : (REVIEW_SCENES[0].scene.match(/cam=([\w-]+)/)?.[1] ?? null));
  const iphone =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
  const android =
    "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36";
  /**
   * 端末の名乗り・許可の状態・カメラの答え（2026-10-02 撮る前の一枚）。
   * - `prompt*` … まだ許可していない。撮る前の一枚が出て、「カメラを使う」で見本の景色が映る
   * - `denied` / `android` / `brave` … 断ってある（iPhone の Safari・Android の Chrome・Brave）
   * - `line` / `android-app` … アプリ内ブラウザでカメラの仕組みが無い
   */
  const agents: Record<
    string,
    { ua: string; state: "prompt" | "denied"; camera: "fake" | "deny" | "none"; brave?: true }
  > = {
    prompt: { ua: iphone, state: "prompt", camera: "fake" },
    "prompt-android": { ua: android, state: "prompt", camera: "fake" },
    denied: { ua: iphone, state: "denied", camera: "deny" },
    android: { ua: android, state: "denied", camera: "deny" },
    brave: { ua: android, state: "denied", camera: "deny", brave: true },
    line: {
      ua: `${iphone.replace(" Version/17.5", "")} Line/14.9.0`,
      state: "prompt",
      camera: "none",
    },
    // Android の Google アプリの中のブラウザ（WebView は「; wv)」を名乗る）。
    "android-app": {
      ua: `${android.replace("SM-S911B)", "SM-S911B; wv)")} GSA/15.20`,
      state: "prompt",
      camera: "none",
    },
  };
  const emu = cam ? agents[cam] : undefined;
  if (emu) {
    try {
      Object.defineProperty(navigator, "userAgent", { get: () => emu.ua });
      if (emu.brave) Object.defineProperty(navigator, "brave", { value: {}, configurable: true });
    } catch {
      /* 差し替えられないブラウザでは、端末そのままの手順が出る。 */
    }
    let state: string = emu.state;
    const permissions = navigator.permissions;
    if (permissions?.query) {
      const query = permissions.query.bind(permissions);
      permissions.query = (desc: PermissionDescriptor) =>
        desc.name === ("camera" as PermissionName)
          ? Promise.resolve({
              get state() {
                return state;
              },
              addEventListener() {},
              removeEventListener() {},
            } as unknown as PermissionStatus)
          : query(desc);
    }
    const md = navigator.mediaDevices;
    if (md && emu.camera === "deny")
      md.getUserMedia = () => Promise.reject(new DOMException("preview", "NotAllowedError"));
    if (md && emu.camera === "none")
      Object.defineProperty(md, "getUserMedia", { value: undefined, configurable: true });
    if (md && emu.camera === "fake")
      // 見本の景色（生成したカフェの写真）を縦 3:4 の映像にして流す。
      md.getUserMedia = async () => {
        const c = document.createElement("canvas");
        c.width = 1080;
        c.height = 1440;
        const img = new Image();
        img.src = "/first-catch-cafe.webp";
        await img.decode().catch(() => {});
        const g = c.getContext("2d")!;
        const draw = () => {
          const s = Math.max(c.width / (img.width || 1), c.height / (img.height || 1));
          g.drawImage(
            img,
            (c.width - img.width * s) / 2,
            (c.height - img.height * s) / 2,
            img.width * s,
            img.height * s,
          );
        };
        draw();
        window.setInterval(draw, 500);
        state = "granted";
        return c.captureStream(2);
      };
  }
}

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
/**
 * **何も付けずに開いた時は、先頭の見比べの場面を開く。** 先頭には `dex-cards&n=24&at=3` の
 * ように条件が付くことがある。前はこれを丸ごと場面の名前として探していたので、
 * 「unknown scene」だけの白い画面になっていた（オーナー報告 2026-09-29「netlify の画面が
 * 見れない」）。名前と条件に分け、条件は `q` に足す（自分で付けた条件が優先）。
 */
if (!explicitScene) {
  new URLSearchParams(`scene=${REVIEW_SCENES[0].scene}`).forEach((v, k) => {
    if (!q.has(k)) q.set(k, v);
  });
}
const wanted = q.get("scene") ?? "";
/**
 * **最初の画面の並べ方を、画面の上の帯で選ぶ**（2026-10-02 オーナー指示「デザイン案を私に」）。
 * 見比べの帯から開いた最初の画面（`first-catch` の intro）にだけ出す。名指しの検査では出さない。
 */
const showWelcomeLayoutBar =
  showReviewBar &&
  (wanted === "first-catch" || wanted === "onboarding") &&
  (q.get("step") ?? "intro") === "intro";
const WELCOME_LAYOUT_BAR_PX = 44;
document.documentElement.style.setProperty(
  "--first-viewport-height",
  showReviewBar
    ? `calc(100dvh - 42px${showWelcomeLayoutBar ? ` - ${WELCOME_LAYOUT_BAR_PX}px` : ""})`
    : "100dvh",
);

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
/**
 * 暗いテーマで見る(`?theme=dark`)。本番は `__root.tsx` が `<html>` に `.dark` を付ける。
 * 端末の設定を変えずに、Deploy Preview の帯から明るい・暗いを見比べられるようにする
 * （2026-10-02 管理画面のグラフ。色はトークンだけなので、両方で読めるかを目で確かめる）。
 */
if (q.get("theme") === "dark") document.documentElement.classList.add("dark");
/**
 * 単語の詳細で、既定では畳んである節を先頭に出して撮る(`?show=real_usage`)。
 * 節の並びと表示は localStorage から読むので、これも React の前に書く。
 */
{
  const show = q.get("show");
  if (show) {
    try {
      localStorage.setItem("wordcard-prefs-v6", JSON.stringify({ order: [show], hidden: [] }));
    } catch {
      /* 使えない環境では既定のまま */
    }
  }
}
/**
 * 最初の画面の4枚の並べ方を見比べる（`?layout=bouquet|scatter|hero|cascade|mosaic|frame`）。
 * 付けずに開いたら、2026-10-02 の新しい案のおすすめ（`RECOMMENDED_WELCOME_LAYOUT`）を見せる
 * — 本番の並べ方（`DEFAULT_WELCOME_LAYOUT`）はオーナーが選ぶまで変えない。
 */
const welcomeLayout: WelcomeLayout = (WELCOME_LAYOUTS as readonly string[]).includes(
  q.get("layout") ?? "",
)
  ? (q.get("layout") as WelcomeLayout)
  : RECOMMENDED_WELCOME_LAYOUT;
setWelcomeLayoutPreview(welcomeLayout);
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
        // 場面は `scene&step=…` のように条件付きで並べる。名前で選ばれているかを決める。
        const [name, ...conds] = r.scene.split("&");
        const on =
          name === wanted &&
          conds.every((kv) => {
            const [k, v = ""] = kv.split("=");
            return q.get(k) === v;
          });
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
    </div>
  );
}

/** 見比べる並べ方。C は今の本番、D・E・F は 2026-10-02 の新しい案。 */
const WELCOME_LAYOUT_CHOICES: Array<{ layout: WelcomeLayout; label: string }> = [
  { layout: "bouquet", label: "C 今の本番" },
  { layout: "scatter", label: "D 散らす" },
  { layout: "hero", label: "E 主役" },
  { layout: "cascade", label: "F 流れ" },
];
function WelcomeLayoutBar() {
  return (
    <div
      role="group"
      aria-label="最初の画面の写真の並べ方"
      style={{
        height: WELCOME_LAYOUT_BAR_PX,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "0 10px",
        overflowX: "auto",
        whiteSpace: "nowrap",
        background: "#1e293b",
        color: "#fff",
        fontSize: 12,
      }}
    >
      <span style={{ opacity: 0.75, marginRight: 2 }}>並べ方</span>
      {WELCOME_LAYOUT_CHOICES.map(({ layout, label }) => {
        const next = new URLSearchParams(location.search);
        next.set("layout", layout);
        next.set("review", "1");
        const on = layout === welcomeLayout;
        return (
          <a
            key={layout}
            href={`?${next.toString()}`}
            aria-current={on ? "true" : undefined}
            style={{
              padding: "6px 10px",
              borderRadius: 999,
              background: on ? "#f59e0b" : "rgba(255,255,255,0.14)",
              color: on ? "#111827" : "#fff",
              textDecoration: "none",
              fontWeight: on ? 700 : 500,
            }}
          >
            {label}
            {layout === RECOMMENDED_WELCOME_LAYOUT ? " ★" : ""}
          </a>
        );
      })}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  // チュートリアルは帯の下の iframe で開く（帯が案内を隠さない。`TutorialHarnessFrame`）。
  Scene && embedsTutorial(q, wanted, showReviewBar) ? (
    <TutorialHarnessFrame q={q} bar={showReviewBar ? <ReviewBar /> : null} />
  ) : Scene ? (
    <QueryClientProvider client={qc}>
      {showReviewBar && <ReviewBar />}
      {showWelcomeLayoutBar && <WelcomeLayoutBar />}
      {BARE.has(wanted) ? (
        <Scene q={q} />
      ) : (
        <Frame immersive={IMMERSIVE.has(wanted)}>
          <Scene q={q} />
        </Frame>
      )}
    </QueryClientProvider>
  ) : (
    <p>unknown scene</p>
  ),
);
