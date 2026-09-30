/**
 * **iOS 版から Web 版のサーバ関数をそのまま呼ぶための一覧**（`/api/native-fn`）。
 *
 * iOS 版が候補の出し方・カードの作り方・保存・発音・復習の採点を Swift で
 * 書き直すと、Lovable で決めた細かい約束（辞書での照合、レベル、台湾での
 * 使われ方、1日の上限、保存の手順…）が必ずずれていく。そこで iOS 版は
 * **Web 版と同じ関数を同じ入力で呼ぶ**。Web 版で直せば iOS 版も直る。
 *
 * - ここに載っている関数だけを呼べる（管理者向けの関数は載せない）。
 * - 本人確認は各関数の `requireSupabaseAuth` がそのまま行う（iOS は
 *   `Authorization: Bearer <Supabase のアクセストークン>` を付けて呼ぶ）。
 * - ここに載せる関数は、Web の画面からもすでに同じ本人確認で呼べる物だけ。
 *   新しく外へ開く入口は増えない。
 */

type ServerFn = (opts: { data?: unknown }) => Promise<unknown>;
type Loader = () => Promise<ServerFn>;

const ai = () => import("./ai.functions");
const scan = () => import("./scan.functions");
const stickers = () => import("./stickers.functions");
const encounters = () => import("./encounters.functions");
const tts = () => import("./tts.functions");
const reviews = () => import("./reviews.functions");
const profile = () => import("./profile.functions");
const explanation = () => import("./word-explanation.functions");
const categories = () => import("./categories.functions");

function from<M>(mod: () => Promise<M>, name: keyof M & string): Loader {
  return async () => (await mod())[name] as unknown as ServerFn;
}

export const NATIVE_FNS: Record<string, Loader> = {
  // 候補・カード
  suggestWords: from(ai, "suggestWords"),
  suggestWordCandidates: from(ai, "suggestWordCandidates"),
  generateCard: from(ai, "generateCard"),
  generatePhraseCard: from(ai, "generatePhraseCard"),
  regenerateCardSection: from(ai, "regenerateCardSection"),
  reportAndFixSection: from(ai, "reportAndFixSection"),
  // スキャン
  detectScan: from(scan, "detectScan"),
  detectParts: from(scan, "detectParts"),
  lookupHeadwords: from(scan, "lookupHeadwords"),
  getScanContext: from(scan, "getScanContext"),
  markScanTap: from(scan, "markScanTap"),
  markScanCaught: from(scan, "markScanCaught"),
  // 保存・図鑑
  saveSticker: from(stickers, "saveSticker"),
  getSticker: from(stickers, "getSticker"),
  listMyStickers: from(stickers, "listMyStickers"),
  listMyShelves: from(stickers, "listMyShelves"),
  deleteSticker: from(stickers, "deleteSticker"),
  attachStickerCutout: from(stickers, "attachStickerCutout"),
  attachStickerSelfie: from(stickers, "attachStickerSelfie"),
  replaceStickerPhoto: from(stickers, "replaceStickerPhoto"),
  setStickerHeadword: from(stickers, "setStickerHeadword"),
  setStickerHeroRole: from(stickers, "setStickerHeroRole"),
  setStickerVoiceVideo: from(stickers, "setStickerVoiceVideo"),
  updateStickerCaption: from(stickers, "updateStickerCaption"),
  updateWordExtras: from(stickers, "updateWordExtras"),
  reportWordIssue: from(stickers, "reportWordIssue"),
  checkOwnedWord: from(encounters, "checkOwnedWord"),
  recordEncounter: from(encounters, "recordEncounter"),
  listStickerPhotos: from(encounters, "listStickerPhotos"),
  // 発音
  synthesizeSpeech: from(tts, "synthesizeSpeech"),
  getTtsVoiceTags: from(tts, "getTtsVoiceTags"),
  // 復習
  getDueReviews: from(reviews, "getDueReviews"),
  gradeReview: from(reviews, "gradeReview"),
  getSpeakingFeedback: from(reviews, "getSpeakingFeedback"),
  getSpeakingScaffold: from(reviews, "getSpeakingScaffold"),
  getMemoryOverview: from(reviews, "getMemoryOverview"),
  getOverallMemoryStats: from(reviews, "getOverallMemoryStats"),
  getReviewCapState: from(reviews, "getReviewCapState"),
  getStickerMemoryHistory: from(reviews, "getStickerMemoryHistory"),
  getUpcomingDueTimes: from(reviews, "getUpcomingDueTimes"),
  // 棚（自分の棚・語の置き場所）
  setStickerCategory: from(categories, "setStickerCategory"),
  setStickersCategory: from(categories, "setStickersCategory"),
  saveMyCategory: from(categories, "saveMyCategory"),
  deleteMyCategory: from(categories, "deleteMyCategory"),
  // 利用者
  getMyProfile: from(profile, "getMyProfile"),
  updateMyProfile: from(profile, "updateMyProfile"),
  deleteMyAccount: from(profile, "deleteMyAccount"),
  getWordExplanation: from(explanation, "getWordExplanation"),
  getReaderMeanings: from(explanation, "getReaderMeanings"),
};

/** 失敗の中身から、iOS に返す状態コードを決める。 */
export function statusForError(e: unknown): number {
  const name = (e as { name?: string })?.name ?? "";
  const msg = e instanceof Error ? e.message : String(e ?? "");
  if (msg.startsWith("Unauthorized")) return 401;
  if (msg.includes("1日の利用上限")) return 429;
  if (name === "ZodError") return 400;
  return 500;
}

/** 利用者に見せてよい長さに丸める（スタックや長い JSON をそのまま返さない）。 */
export function publicMessage(e: unknown): string {
  const name = (e as { name?: string })?.name ?? "";
  if (name === "ZodError") return "送った内容の形が違います。アプリを最新にしてください。";
  const msg = e instanceof Error ? e.message : String(e ?? "");
  return msg.slice(0, 300) || "サーバで失敗しました。";
}
