import { useEffect, useRef, useState } from "react";
import { decideInterstitial } from "@/lib/ad-policy";
import {
  EMPTY_AD_HISTORY,
  afterReviewEnd,
  rollAdHistory,
  type StoredAdHistory,
} from "@/lib/adsense";
import type { WebAds } from "@/hooks/use-web-ads";
import { AdCard } from "./AdCard";

/**
 * **復習の区切りの広告**（Web 版）。終わりの画面（`DoneState`）の**下に置く札**で、
 * 全画面にはしない（Web の全画面広告はゲーム専用。`lib/adsense.ts` の注）。
 *
 * 回数の決まりは全画面と同じ `decideInterstitial`（`batchesPerInterstitial` 回ごと・
 * 前回から `minGapMin` 分・1日 `maxPerDay` 回まで）。数はこの端末に覚える
 * （覚えられない端末では、毎回「初めての束」として数える = 出にくい側に倒れる）。
 * 区切り1回につき1回だけ数える（描き直しや StrictMode で二重に数えない）。
 */
const KEY = "cw:ads:review-end";

function today(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function readHistory(): StoredAdHistory {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<StoredAdHistory> | null;
    if (!raw || typeof raw !== "object") return EMPTY_AD_HISTORY;
    return {
      day: typeof raw.day === "string" ? raw.day : "",
      lastShownAt: typeof raw.lastShownAt === "number" ? raw.lastShownAt : null,
      shownToday: Number(raw.shownToday) || 0,
      batchesSinceLast: Number(raw.batchesSinceLast) || 0,
    };
  } catch {
    return EMPTY_AD_HISTORY;
  }
}

function writeHistory(h: StoredAdHistory) {
  try {
    localStorage.setItem(KEY, JSON.stringify(h));
  } catch {
    // 覚えられない端末: 次の区切りも「まだ」になるだけ（広告が増える側には倒れない）。
  }
}

export function ReviewEndAd({ ads }: { ads: WebAds }) {
  const decided = useRef(false);
  const [show, setShow] = useState(false);
  const active = ads.show && ads.placements.reviewEnd;
  useEffect(() => {
    if (!active || decided.current) return;
    decided.current = true;
    const now = Date.now();
    const history = rollAdHistory(readHistory(), today(now));
    const d = decideInterstitial({
      moment: "review_batch_end",
      cfg: ads.cfg,
      // Pro・使い始めの日数は `useWebAds` が確かめ済み（ここに来るのは出してよい人だけ）。
      isPro: false,
      installedAt: 0,
      now,
      history,
    });
    writeHistory(afterReviewEnd(history, d.show, now));
    setShow(d.show);
  }, [active, ads.cfg]);
  if (!active || !show) return null;
  return <ReviewEndAdCard client={ads.client} slot={ads.cfg.slotReviewEnd} />;
}

/**
 * 終わりの画面の下の広告の札。終わりの画面の札（ボタンは札の内側、余白 32px）から
 * さらに 24px 離す — 「続ける」「図鑑へ」を押すつもりで広告に触れない距離。
 */
export function ReviewEndAdCard({ client, slot }: { client: string; slot: string }) {
  return <AdCard client={client} slot={slot} minHeight={250} className="mt-6" />;
}
