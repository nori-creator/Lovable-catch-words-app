import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { getAdConfig } from "@/lib/monetization.functions";
import { getBillingStatus } from "@/lib/billing.functions";
import { getMyProfile } from "@/lib/profile.functions";
import { DEFAULT_AD_CONFIG, type AdConfig } from "@/lib/ad-policy";
import {
  APP_OPEN_QUIET_MS,
  adsenseScriptSrc,
  shouldLoadAds,
  webPlacements,
  type AdLoadReason,
} from "@/lib/adsense";
import { isNativeShell } from "@/lib/pwa";

/**
 * **Web 版の広告を出してよいか**と、出す時の値（オーナー指示 2026-10-03）。
 * 出してよい時だけ AdSense の部品（`adsbygoogle.js`）を**1回だけ**読み込む。
 *
 * 決まりは `shouldLoadAds`（テスト済み）。ここは材料を集めるだけ:
 * 設定（`getAdConfig`）・Pro か（`getBillingStatus`。開発者も Pro 扱い）・使い始めた日と
 * 初回の案内を終えたか（プロフィール）・今の画面・アプリの殻の中か・開いてからの時間。
 *
 * 広告がオフ（既定）の間は、Pro かどうかも聞かない（問い合わせを増やさない）。
 */
export type WebAds = {
  /** 枠を描いてよいか。 */
  show: boolean;
  /** 出さない理由（開発者の確認用）。 */
  reason: AdLoadReason | null;
  cfg: AdConfig;
  /** `data-ad-client`（`ca-pub-…`）。 */
  client: string;
  placements: ReturnType<typeof webPlacements>;
};

export const NO_WEB_ADS: WebAds = {
  show: false,
  reason: "off",
  cfg: DEFAULT_AD_CONFIG,
  client: "",
  placements: { dex: false, diary: false, reviewEnd: false },
};

const SCRIPT_MARK = "data-cw-adsense";

/** AdSense の部品を1回だけ差し込む（何度呼んでも1本）。 */
export function ensureAdsenseScript(publisherId: string): void {
  if (typeof document === "undefined") return;
  if (document.querySelector(`script[${SCRIPT_MARK}]`)) return;
  const s = document.createElement("script");
  s.async = true;
  s.src = adsenseScriptSrc(publisherId);
  s.crossOrigin = "anonymous";
  s.setAttribute(SCRIPT_MARK, "");
  document.head.appendChild(s);
}

function sinceOpen(): number {
  return typeof performance === "undefined" ? 0 : performance.now();
}

export function useWebAds(): WebAds {
  const getCfg = useServerFn(getAdConfig);
  const getBilling = useServerFn(getBillingStatus);
  const getProfile = useServerFn(getMyProfile);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: cfg } = useQuery({
    queryKey: ["ad-config"],
    queryFn: () => getCfg(),
    staleTime: 60_000,
  });
  const wanted = Boolean(cfg?.enabled && cfg.adsensePublisherId);
  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: () => getProfile(),
    staleTime: 5 * 60 * 1000,
    enabled: wanted,
  });
  const { data: billing } = useQuery({
    queryKey: ["billing-status"],
    queryFn: () => getBilling(),
    staleTime: 60_000,
    enabled: wanted,
  });
  // 開いた直後は待ち、静かな時間が過ぎたら1回だけ見直す。
  const [opened, setOpened] = useState(() => sinceOpen());
  useEffect(() => {
    if (opened >= APP_OPEN_QUIET_MS) return;
    const id = setTimeout(() => setOpened(sinceOpen()), APP_OPEN_QUIET_MS - opened + 50);
    return () => clearTimeout(id);
  }, [opened]);

  const c = cfg ?? DEFAULT_AD_CONFIG;
  const p = profile as
    { id?: string; created_at?: string; onboarded?: boolean; partial?: boolean } | null | undefined;
  const createdAt = p?.created_at ? Date.parse(p.created_at) : NaN;
  const decision = shouldLoadAds({
    cfg: c,
    signedIn: Boolean(p?.id),
    // 読めていない・一部しか読めていない間は「分からない」= 出さない。
    isPro: billing ? billing.isPro : null,
    installedAt: Number.isFinite(createdAt) && !p?.partial ? createdAt : null,
    onboarded: p?.onboarded === true,
    now: Date.now(),
    pathname,
    isNative: isNativeShell(),
    sinceOpenMs: opened,
  });
  const show = decision.load;
  useEffect(() => {
    if (show) ensureAdsenseScript(c.adsensePublisherId);
  }, [show, c.adsensePublisherId]);
  return {
    show,
    reason: decision.load ? null : decision.reason,
    cfg: c,
    client: c.adsensePublisherId,
    placements: webPlacements(c),
  };
}
