import { Home, BookOpen, Settings, Sparkles, Camera } from "lucide-react";
import type { ReactNode, CSSProperties } from "react";
import { useT } from "@/lib/i18n";
import { TabBar } from "./TabBar";
import { AppTabContent } from "./AppTabContent";
export type AppNavItem = {
  to: "/home" | "/dex" | "/capture" | "/review" | "/settings";
  labelKey: string;
  icon: typeof Home;
};

// 5-item bottom nav (roadmap B5): the center slot is the one big camera
// entrance.
// 2026-08-03 NORI指定で**カメラのフロー(/capture)に戻した**。撮る→自撮り→
// 候補→切り抜き→図鑑にドン、という一本道がこのアプリの体験そのものだから。
// かざして調べるスキャン(/scan)はカメラ画面の中から開ける。
export const APP_NAV_ITEMS: AppNavItem[] = [
  { to: "/home", labelKey: "nav.home", icon: Home },
  { to: "/dex", labelKey: "nav.dex", icon: BookOpen },
  { to: "/capture", labelKey: "nav.camera", icon: Camera },
  { to: "/review", labelKey: "nav.review", icon: Sparkles },
  { to: "/settings", labelKey: "nav.settings", icon: Settings },
];

const CAMERA_INDEX = APP_NAV_ITEMS.findIndex((i) => i.to === "/capture");

/** The router and the local first-catch controller provide destinations, never markup. */
export function AppNavigation({
  cursor,
  indicatorOpacity = 1,
  onCamera = false,
  renderLink,
}: {
  cursor: number;
  indicatorOpacity?: number;
  onCamera?: boolean;
  renderLink: (
    item: AppNavItem,
    index: number,
    props: {
      className: string;
      style?: CSSProperties;
      children: ReactNode;
      "data-tour": string;
      "aria-current"?: "page";
    },
  ) => ReactNode;
}) {
  const t = useT();
  /**
   * **カメラの升目には印を乗せない**（オーナー指示 2026-09-15「青いバブルで囲うのではなく、
   * カメラのアイコンの中の色を変えてほしい」）。決まりはここ1箇所 — 前は `AppShell` だけが
   * 薄めていて、チュートリアルの殻は「撮っている面」の間しか薄めていなかった。だから撮った後の
   * 失敗の面（カメラの升目に居る）で、前の画面から滑ってきた印が図鑑とカメラの間に残っていた
   * （2026-10-03 画面の監査）。
   *
   * 出す・消すの2値にしない — 払っている最中はカメラの上を通過するので、2値だと真ん中で
   * 印がぱっと消えてぱっと戻る。近づくほど薄れ、0.85 升ぶん手前から薄れ始める。
   */
  const cameraFade = cursor < 0 ? 0 : Math.min(1, Math.abs(cursor - CAMERA_INDEX) / 0.85);
  return (
    <TabBar
      cursor={cursor}
      indicatorOpacity={Math.min(indicatorOpacity, cameraFade)}
      onCamera={onCamera}
    >
      {APP_NAV_ITEMS.map((item, i) => {
        const camera = item.to === "/capture";
        const current = i === Math.round(cursor) || (camera && onCamera);
        const weight = cursor < 0 ? 0 : Math.max(0, 1 - Math.abs(i - cursor));
        return (
          <li key={item.to} className="flex-1">
            {renderLink(item, i, {
              "data-tour": `tab-${camera ? "camera" : item.to.slice(1)}`,
              "aria-current": current ? "page" : undefined,
              className:
                "tabbar__cell group w-full rounded-full text-caption text-muted-foreground transition-colors",
              style:
                weight > 0 && !camera
                  ? {
                      color: `color-mix(in oklab, var(--primary-ink) ${Math.round(weight * 100)}%, var(--muted-foreground))`,
                    }
                  : undefined,
              children: (
                <AppTabContent
                  icon={item.icon}
                  label={t(item.labelKey)}
                  camera={camera}
                  current={current}
                />
              ),
            })}
          </li>
        );
      })}
    </TabBar>
  );
}
