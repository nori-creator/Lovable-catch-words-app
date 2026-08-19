/**
 * 入れて最初に見る画面。**枠を被せない場面**。
 *
 * この画面は上のバーも下タブも無い全画面(`grid min-h-screen`)なので、
 * 他の場面と同じ枠に入れて撮ると**実物に無いバーと帯が写る**。
 * 枠を被せるかどうかは場面ごとに決める(`main.tsx` の `BARE`)。
 */
import { OnboardingCard } from "@/routes/_authenticated/onboarding";

export function OnboardingScene({ q }: { q: URLSearchParams }) {
  // 押した後は文字も色も変わらず、**沈むだけ**。押せたのか分からない面が
  // 残っていないかを見るために、その側も撮る。
  return <OnboardingCard starting={q.get("variant") === "starting"} onStart={() => {}} />;
}
