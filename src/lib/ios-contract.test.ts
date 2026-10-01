import { describe, expect, it } from "vitest";
import { NATIVE_FNS } from "./native-fn";

/**
 * **iOS 版が呼んでいるサーバ関数**（iOS リポジトリ nori-creator/rork-catchwords-728 の
 * `NativeAPI.call("…")` から書き出した一覧。2026-10-01）。
 *
 * ここに載っている関数を `NATIVE_FNS` から外したり、関数そのものを消したり名前を変えたりすると、
 * iOS 版のボタンが**黙って何もしなくなる**（iOS は失敗を画面に出さない所が多い）。
 * Web 版で要らなくなった画面を消すときも、ここにある関数は残すこと。
 *
 * 消してよいのは、iOS 版でその呼び出しを先に消した後だけ。iOS 側にも同じ確認がある
 * （iOS リポジトリの `scripts/check_native_contract.py`、毎日 Web の main に対して走る）。
 */
export const IOS_REQUIRED_FNS = [
  "attachStickerCutout",
  "checkOwnedWord",
  "correctMyJournal",
  "deleteMyAccount",
  "deleteMyCategory",
  "deleteSticker",
  "detectScan",
  "extractWordbook",
  "generateCard",
  "getJournalPrompts",
  "getMyStats",
  "getReaderMeanings",
  "getScanContext",
  "getWordExplanation",
  "gradeReview",
  "listAlbumHidden",
  "listJournal",
  "listStickerPhotos",
  "markScanCaught",
  "markScanTap",
  "rankScanCandidates",
  "recordEncounter",
  "regenerateCardSection",
  "replaceStickerPhoto",
  "reportAndFixSection",
  "saveAlbumLayout",
  "saveMyCategory",
  "saveSticker",
  "searchImageCandidates",
  "setAlbumHidden",
  "setStickerCategory",
  "setStickerHeadword",
  "setStickerHeroRole",
  "setStickerPlaceholder",
  "suggestWordCandidates",
  "suggestWords",
  "synthesizeSpeech",
  "updateStickerCaption",
  "updateWordExtras",
] as const;

describe("iOS 版との約束", () => {
  it("iOS 版が呼ぶ関数は全部 NATIVE_FNS に載っている", () => {
    const missing = IOS_REQUIRED_FNS.filter(
      (n) => !Object.prototype.hasOwnProperty.call(NATIVE_FNS, n),
    );
    expect(missing).toEqual([]);
  });

  it("載っている関数は実際に読み込めて、関数として在る", async () => {
    const broken: string[] = [];
    for (const name of IOS_REQUIRED_FNS) {
      try {
        const fn = await NATIVE_FNS[name]();
        if (typeof fn !== "function") broken.push(name);
      } catch {
        broken.push(name);
      }
    }
    expect(broken).toEqual([]);
  }, 60_000);
});
