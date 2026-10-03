import { AppShellFrame } from "../AppShell";
import { useOpenTutorialSettings } from "./tutorial-settings-context";
import { AppNavigation } from "../AppNavigation";
import type { ReactNode } from "react";
import { HomeSurface } from "@/components/screens/HomeScreen";
import { firstCatchSticker, type FirstCatch } from "@/lib/first-catch";
import { useT } from "@/lib/i18n";
import { useTargetLang } from "@/lib/target-lang-pref";
import { sampleStickers } from "./first-catch-samples";

export { sampleStickers };

export function FirstCatchShell({
  children,
  tab = 0,
  camera = false,
  fixedViewport = tab === 3,
  onTab,
}: {
  children: ReactNode;
  tab?: number;
  camera?: boolean;
  fixedViewport?: boolean;
  onTab?: (index: number) => void;
}) {
  // 「設定」のタブはチュートリアル用の設定（言語・最初に戻る）を開く。
  const openMenu = useOpenTutorialSettings();
  return (
    <AppShellFrame
      bare={camera}
      immersive={tab === 1}
      headerless={tab === 3}
      fixedViewport={fixedViewport}
      navigation={
        <div inert={!onTab && !openMenu}>
          <AppNavigation
            cursor={tab}
            onCamera={camera}
            renderLink={(item, index, props) => (
              <button
                type="button"
                {...props}
                data-tour-escape={item.to === "/settings" && openMenu ? "" : undefined}
                onClick={() => {
                  if (item.to === "/settings" && openMenu) openMenu();
                  else onTab?.(index);
                }}
              />
            )}
          />
        </div>
      }
    >
      {children}
    </AppShellFrame>
  );
}
/**
 * **本物のホームの画面（`HomeSurface`）そのもの**に、見本の写真か撮った1枚を載せる。
 *
 * 今日の誌面・壁の続きまで本物と同じ部品なので、ホームを直すとここも同じ
 * ビルドで変わる（オーナー指示 2026-09-29「アプリ本体をアップデートしたら自動的に
 * 変化するように」）。一番上の 3D の本棚だけは省く（`shelf={false}`、オーナー指示
 * 2026-10-03）— 最初の1コマからアルバムを見せ、登録前の日記も端末の外へ出さない。
 */
export function FirstCatchHome({
  draft,
  animated = false,
  onCamera,
}: {
  draft: FirstCatch | null;
  animated?: boolean;
  onCamera?: () => void;
}) {
  const t = useT();
  const target = useTargetLang();
  const sticker = draft && firstCatchSticker(draft);
  const samples = sampleStickers(draft, t, target);
  const items = sticker ? [sticker] : samples;
  return (
    <FirstCatchShell onTab={onCamera ? (index) => index === 2 && onCamera() : undefined}>
      <section data-tour="home">
        <div inert={!sticker}>
          <HomeSurface
            albumItems={items}
            today={new Date(items[0]?.created_at ?? SAMPLE_DAY)}
            surfaceClass="album-bg-paper"
            opening={animated && !sticker}
            onOpen={() => {}}
            // 本棚は出さない — 最初の1コマからアルバムだけ（本棚が一瞬映って巻き取られない）。
            shelf={false}
          />
        </div>
      </section>
    </FirstCatchShell>
  );
}

const SAMPLE_DAY = "2026-09-23T09:00:00.000Z";
