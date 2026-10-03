import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useT } from "@/lib/i18n";
import { isNativeShell } from "@/lib/pwa";
import { getAdConfig } from "@/lib/monetization.functions";
import { getMyProfile } from "@/lib/profile.functions";
import { readAdSenseEnv, webAdBlockReason, type WebAdPlacement } from "@/lib/web-ads";
import type { AdConfig } from "@/lib/ad-policy";

/**
 * **Web 版の広告の枠（Google AdSense）**（オーナー指示 2026-10-03）。
 *
 * 出してよいかは `lib/web-ads.ts`（`webAdBlockReason`）が決める。ここは描くだけ:
 * - 画面に近づくまで AdSense の部品（`adsbygoogle.js`）を**読まない**（最初の表示を遅くしない）。
 * - 枠の高さを先に取っておく（広告が来た時に下の物がずれない）。
 * - 読めない・広告が来ない（広告ブロッカー・在庫なし）時は**黙って消える**。
 * - 「広告」と書く（AdSense の決まり。英語は「Advertisements」）。ボタンから離して置く。
 */

const ENV = readAdSenseEnv(import.meta.env as unknown as Record<string, unknown>);
const SCRIPT_TIMEOUT_MS = 10_000;
let scriptPromise: Promise<boolean> | null = null;

/** AdSense の部品を1回だけ読む。失敗しても投げない（false を返す）。 */
function loadAdSense(client: string): Promise<boolean> {
  if (typeof document === "undefined") return Promise.resolve(false);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<boolean>((resolve) => {
    try {
      const s = document.createElement("script");
      s.async = true;
      s.crossOrigin = "anonymous";
      s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
      const timer = window.setTimeout(() => resolve(false), SCRIPT_TIMEOUT_MS);
      s.onload = () => {
        window.clearTimeout(timer);
        resolve(true);
      };
      s.onerror = () => {
        window.clearTimeout(timer);
        resolve(false);
      };
      document.head.appendChild(s);
    } catch {
      resolve(false);
    }
  });
  return scriptPromise;
}

type Profile = { plan?: string; created_at?: string; partial?: boolean } | null | undefined;

export type WebAdTarget = {
  client: string;
  slot: string;
  cfg: AdConfig;
  /** アカウントを作った時刻（ms）。ここに来た時点で Pro ではない・最初の数日は過ぎている。 */
  accountCreatedAt: number;
};

/** その場所に枠を出すなら AdSense の番号と設定、出さないなら null。 */
export function useWebAdSlot(placement: WebAdPlacement): WebAdTarget | null {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const native = mounted ? isNativeShell() : true;
  // 番号が無い・アプリの中なら、設定もプランも読みに行かない。
  const possible = mounted && !native && !!ENV.client && !!ENV.slots[placement];
  const getCfg = useServerFn(getAdConfig);
  const getProfile = useServerFn(getMyProfile);
  const { data: cfg } = useQuery<AdConfig>({
    queryKey: ["ad-config"],
    queryFn: () => getCfg(),
    staleTime: 60_000,
    enabled: possible,
  });
  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: () => getProfile(),
    enabled: possible,
  });
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (!possible) return null;
  const p = profile as Profile;
  const planKnown = !!p && !p.partial && typeof p.plan === "string";
  const created = p?.created_at ? Date.parse(p.created_at) : NaN;
  const reason = webAdBlockReason({
    placement,
    env: ENV,
    cfg: cfg ?? null,
    isPro: planKnown ? p!.plan === "pro" : null,
    accountCreatedAt: Number.isFinite(created) ? created : null,
    now: Date.now(),
    native,
    pathname,
  });
  if (reason || !cfg) return null;
  return {
    client: ENV.client!,
    slot: ENV.slots[placement]!,
    cfg,
    accountCreatedAt: created,
  };
}

/** 広告の高さの取り置き（px）。AdSense の自動の大きさはスマホで 250〜280 前後が多い。 */
const RESERVE_PX = 250;

/**
 * 広告の枠。`show` が false なら何も描かない（復習の区切りの「何束ごと」の判断を呼ぶ側が持つ）。
 */
export function WebAdSlot({
  placement,
  show = true,
  className = "",
}: {
  placement: WebAdPlacement;
  show?: boolean;
  className?: string;
}) {
  const ad = useWebAdSlot(placement);
  if (!ad || !show) return null;
  return <WebAdUnit client={ad.client} slot={ad.slot} className={className} />;
}

/** 番号が決まった後の枠そのもの（一覧に挟む時は、呼ぶ側が `useWebAdSlot` を1回だけ呼ぶ）。 */
export function WebAdUnit({
  client,
  slot,
  className,
  preview = false,
}: {
  client: string;
  slot: string;
  className?: string;
  /** 確認用ページ（`scripts/ui-harness`）だけ: AdSense を読まず、灰色の見本を置く。 */
  preview?: boolean;
}) {
  const t = useT();
  const boxRef = useRef<HTMLElement | null>(null);
  const insRef = useRef<HTMLModElement | null>(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const box = boxRef.current;
    const ins = insRef.current;
    if (preview || !box || !ins) return;
    let cancelled = false;
    let pushed = false;
    // 「在庫なし」は AdSense が `data-ad-status="unfilled"` を付けて知らせる → 枠ごと消す。
    const mo = new MutationObserver(() => {
      if (ins.getAttribute("data-ad-status") === "unfilled") setGone(true);
    });
    mo.observe(ins, { attributes: true, attributeFilter: ["data-ad-status"] });
    const start = () => {
      if (pushed) return;
      pushed = true;
      void loadAdSense(client).then((ok) => {
        if (cancelled) return;
        if (!ok) {
          setGone(true);
          return;
        }
        try {
          // 同じ枠に2回頼まない（AdSense が「もう広告が入っている」と怒る）。
          if (ins.getAttribute("data-adsbygoogle-status")) return;
          const w = window as unknown as { adsbygoogle?: unknown[] };
          (w.adsbygoogle = w.adsbygoogle || []).push({});
        } catch {
          setGone(true);
        }
      });
    };
    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver === "undefined") start();
    else {
      io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            io?.disconnect();
            start();
          }
        },
        { rootMargin: "600px 0px" },
      );
      io.observe(box);
    }
    return () => {
      cancelled = true;
      io?.disconnect();
      mo.disconnect();
    };
  }, [client, slot, preview]);

  if (gone) return null;
  return (
    <aside
      ref={boxRef}
      aria-label={t("ads.label")}
      data-web-ad
      className={`my-8 overflow-hidden rounded-2xl border border-border bg-card px-3 pb-3 pt-2 ${className ?? ""}`}
    >
      <p className="mb-1 text-caption text-muted-foreground">{t("ads.label")}</p>
      {preview ? (
        <div
          className="grid place-items-center rounded-xl bg-secondary text-caption text-muted-foreground"
          style={{ minHeight: RESERVE_PX }}
        >
          AdSense
        </div>
      ) : (
        <ins
          ref={insRef}
          className="adsbygoogle"
          style={{ display: "block", minHeight: RESERVE_PX }}
          data-ad-client={client}
          data-ad-slot={slot}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      )}
    </aside>
  );
}
