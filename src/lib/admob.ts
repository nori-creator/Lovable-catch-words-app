import { Capacitor, registerPlugin } from "@capacitor/core";

/**
 * **AdMob（Google の広告）の準備**（オーナー指示 2026-09-28「Google 広告実装の準備始めて」）。
 *
 * 広告を出す**決まり**は `ad-policy.ts`、ここは**出す手**だけ。
 *
 * ## いまの状態（正直に）
 * - 広告の部品（`@capacitor-community/admob`）は**まだアプリに入っていない**。入れるには
 *   Android の組み立てが要り、この作業環境ではできない（`docs/monetization.md` §5）。
 * - 部品が入っていない間、ここの関数は**何もしない**（`available()` が false）。画面は
 *   止まらない。部品を入れて `npx cap sync` すれば、コードを変えずにここが動き出す
 *   （`registerPlugin("AdMob")` は、入った部品の名前で自動でつながる）。
 * - 広告の枠の番号は、AdMob の管理画面で作るまで **Google の試験用の番号**を使う
 *   （Google 公式「Enable test ads」の demo ad units）。試験用の番号では、本物の広告の
 *   代わりに「Test Ad」と書かれた広告が出て、お金は動かない。
 *
 * ## 決まりと合わない所（先に言っておく）
 * - この部品が出せるのは**全画面・ごほうび・帯（バナー）**。一覧に溶け込む**ネイティブ広告は
 *   出せない**。図鑑と日記の枠（`nativeSlots` / `diarySlots`）は、別の部品を足すか、
 *   帯の広告で代える必要がある（判断はオーナー）。
 */

/** Google 公式の試験用の広告枠（Android）。本番前に自分の枠の番号へ差し替える。 */
export const TEST_AD_UNITS = {
  interstitial: "ca-app-pub-3940256099942544/1033173712",
  rewarded: "ca-app-pub-3940256099942544/5224354917",
  banner: "ca-app-pub-3940256099942544/6300978111",
  native: "ca-app-pub-3940256099942544/2247696110",
} as const;

type AdMobPlugin = {
  initialize(opts: { initializeForTesting?: boolean }): Promise<void>;
  prepareInterstitial(opts: { adId: string; isTesting?: boolean }): Promise<unknown>;
  showInterstitial(): Promise<void>;
  prepareRewardVideoAd(opts: { adId: string; isTesting?: boolean }): Promise<unknown>;
  showRewardVideoAd(): Promise<{ type: string; amount: number }>;
};

const AdMob = registerPlugin<AdMobPlugin>("AdMob");

/** 広告の部品が入ったアプリの中か。Web やまだ入っていないアプリでは false。 */
export function available(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("AdMob");
}

let ready: Promise<void> | null = null;
function init(testing: boolean): Promise<void> {
  if (!ready) ready = AdMob.initialize({ initializeForTesting: testing }).catch(() => {});
  return ready;
}

export type AdUnits = { interstitial?: string; rewarded?: string };

/** 全画面広告を1回出す。出せなければ false（画面は止めない）。 */
export async function showInterstitial(units: AdUnits = {}): Promise<boolean> {
  if (!available()) return false;
  const adId = units.interstitial || TEST_AD_UNITS.interstitial;
  const testing = adId === TEST_AD_UNITS.interstitial;
  try {
    await init(testing);
    await AdMob.prepareInterstitial({ adId, isTesting: testing });
    await AdMob.showInterstitial();
    return true;
  } catch {
    return false;
  }
}

/** ごほうび広告を1回出す。最後まで見たら true（その時だけ、ごほうびを渡す）。 */
export async function showRewarded(units: AdUnits = {}): Promise<boolean> {
  if (!available()) return false;
  const adId = units.rewarded || TEST_AD_UNITS.rewarded;
  const testing = adId === TEST_AD_UNITS.rewarded;
  try {
    await init(testing);
    await AdMob.prepareRewardVideoAd({ adId, isTesting: testing });
    const reward = await AdMob.showRewardVideoAd();
    return !!reward && reward.amount > 0;
  } catch {
    return false;
  }
}
