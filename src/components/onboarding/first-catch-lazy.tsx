import { lazy, type ComponentType } from "react";
import type { FirstCatchHome as HomeT, FirstCatchShell as ShellT } from "./FirstCatchHome";
import type { FirstCatchDex as DexT, FirstCatchReview as ReviewT } from "./FirstCatchPractice";
import type { TutorialSettings as SettingsT } from "./TutorialSettings";
import type {
  CaptureAnalyzingPanel as AnalyzingT,
  CaptureCardPanel as CardT,
  CaptureObjectPanel as ObjectT,
  PickWordPanel as PickT,
} from "@/components/screens/CaptureScreen";
import type { DexSurface as DexSurfaceT } from "@/components/screens/DexScreen";
import type { StickerSheet as StickerSheetT } from "@/components/StickerSheet";
import type { CatchLandingOverlay as LandingT } from "@/components/CatchLanding";

/**
 * **チュートリアルの2画面目から先の部品は、後から読む**（2026-10-03 最初の読み込みの監査
 * 「最初の画面の前に約 514KB gz の JS」）。
 *
 * ウェルカム・質問・通知・準備の画面は軽い部品だけで描ける。ホーム・カメラ・図鑑・単語の
 * 詳細・復習は本物の画面の部品（`HomeSurface`・`DexSurface`・撮影の面…）を使うので重い。
 * それを `/welcome` の最初の塊から外し、最初の画面が出た後に裏で読む
 * （`prefetchFirstCatchStages`）。質問に答えている間に読み終わるので、ホームへ進んだ時に
 * 待つことはほぼ無い。読み終わる前に進んだ時は `FirstCatchFlow` の `Suspense` が
 * その一瞬だけ前の画面を隠す（状態は消えない）。
 *
 * 部品そのものは今までと同じ物（本物の画面とチュートリアルが同じ部品を使う約束は変えない）。
 */
const home = () => import("./FirstCatchHome");
const practice = () => import("./FirstCatchPractice");
const settings = () => import("./TutorialSettings");
const capture = () => import("@/components/screens/CaptureScreen");
const dex = () => import("@/components/screens/DexScreen");
const sheet = () => import("@/components/StickerSheet");
const landing = () => import("@/components/CatchLanding");

/** 名前で出している部品を `lazy` にする。型は呼ぶ側の `T`（元の部品の型）のまま。 */
function lazyNamed<T>(load: () => Promise<T>): T {
  return lazy(async () => ({
    default: (await load()) as unknown as ComponentType<Record<string, unknown>>,
  })) as unknown as T;
}

export const FirstCatchHome = lazyNamed<typeof HomeT>(() => home().then((m) => m.FirstCatchHome));
export const FirstCatchShell = lazyNamed<typeof ShellT>(() =>
  home().then((m) => m.FirstCatchShell),
);
export const FirstCatchDex = lazyNamed<typeof DexT>(() => practice().then((m) => m.FirstCatchDex));
export const FirstCatchReview = lazyNamed<typeof ReviewT>(() =>
  practice().then((m) => m.FirstCatchReview),
);
export const TutorialSettings = lazyNamed<typeof SettingsT>(() =>
  settings().then((m) => m.TutorialSettings),
);
export const CaptureAnalyzingPanel = lazyNamed<typeof AnalyzingT>(() =>
  capture().then((m) => m.CaptureAnalyzingPanel),
);
export const CaptureObjectPanel = lazyNamed<typeof ObjectT>(() =>
  capture().then((m) => m.CaptureObjectPanel),
);
export const CaptureCardPanel = lazyNamed<typeof CardT>(() =>
  capture().then((m) => m.CaptureCardPanel),
);
export const PickWordPanel = lazyNamed<typeof PickT>(() => capture().then((m) => m.PickWordPanel));
export const DexSurface = lazyNamed<typeof DexSurfaceT>(() => dex().then((m) => m.DexSurface));
export const StickerSheet = lazyNamed<typeof StickerSheetT>(() =>
  sheet().then((m) => m.StickerSheet),
);
export const CatchLandingOverlay = lazyNamed<typeof LandingT>(() =>
  landing().then((m) => m.CatchLandingOverlay),
);

/** 着地の演出を走らせる（演出の部品と同じ塊から読む）。 */
export async function runCatchLanding(
  ...args: Parameters<Awaited<ReturnType<typeof landing>>["runCatchLanding"]>
) {
  return (await landing()).runCatchLanding(...args);
}

/** 2画面目から先の部品を裏で読み始める。何度呼んでもよい（読み込みは1回だけ）。 */
export function prefetchFirstCatchStages(): void {
  for (const load of [home, practice, settings, capture, dex, sheet, landing])
    void load().catch(() => {
      // ここでの失敗は黙る。その画面に進んだ時の読み込みが失敗すれば、root の
      // 読み直し（`lib/chunk-reload.ts`）が今までどおり働く。
    });
}
