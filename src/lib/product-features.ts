/**
 * 復習の練習（4択・発話・作文）を出すか。
 *
 * 2026-09-19 に `false` で入り、**復習の画面から出題が丸ごと消えていた**
 * （`docs/changes/2026-09-19-capture-polish.md`「Review quizzes and wordbooks
 * are disabled through feature flags」）。オーナー報告 2026-09-22
 * 「単語の復習の4択が消えてる。元に戻して。」により戻す。
 *
 * この旗は4択だけでなく**出題の流れ全部**（進み具合の帯・形の切り替え・
 * 設定の「復習の形」の欄）を止める。だから戻すのも全部まとめて。
 */
export const REVIEW_PRACTICE_ENABLED: boolean = true;
export const WORDBOOKS_ENABLED: boolean = false;

/**
 * 復習の**形を選ぶ欄**（AIが選ぶ／話す／4択）を出すか。
 *
 * オーナー指示 2026-09-23「復習モードは一旦設定を含むアプリから削除して。
 * あとで追加できるようにコードとしては残して」。設定の「復習モード」の欄と、
 * 復習の画面の右上の切り替えを**両方**止める。
 *
 * 止めるのは**選ぶ所だけ**。出題そのもの（`REVIEW_PRACTICE_ENABLED`）は残し、
 * 形は端末に保存されている値のまま（黙って人の出題の形を変えない）。
 * 戻すときはここを `true` にするだけ。
 */
export const REVIEW_MODE_CHOICE_ENABLED: boolean = false;
export function selfieCaptureEnabled() {
  try {
    return localStorage.getItem("cw-selfie-capture") !== "0";
  } catch {
    return true;
  }
}
export function setSelfieCaptureEnabled(on: boolean) {
  try {
    localStorage.setItem("cw-selfie-capture", on ? "1" : "0");
  } catch {
    /* Preference remains active for this session. */
  }
}
