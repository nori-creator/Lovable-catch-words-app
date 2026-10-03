/**
 * **設定の保存の状態**（ARCHITECTURE「Preferences」: UI changes should autosave and expose
 * lightweight saved/error state）。
 *
 * 設定は変えた瞬間に保存する（ボタンは無い）。前は成功しても黙っていたので、
 * 保存されたのか分からなかった。いまは成功したら小さく「保存しました」を出し、
 * 2秒で引っ込める。失敗は今までどおりトースト（`sonner`）で理由と一緒に言う。
 *
 * サーバへ送る設定（プロフィール）も、端末に残す設定（`localStorage`）も同じ口を使う。
 * 画面の外（React の外）からも呼べるよう、小さな店にしてある。
 */

export type SaveState = "idle" | "saving" | "saved" | "error";

/** 「保存しました」を出しておく長さ。 */
export const SAVED_VISIBLE_MS = 2000;

type Listener = () => void;

export function createSaveStatus(visibleMs = SAVED_VISIBLE_MS) {
  let state: SaveState = "idle";
  /** 保存中の数（名前を打ちながら別の欄も変えた時、先に終わった方で「保存しました」を出さない）。 */
  let pending = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<Listener>();
  const set = (next: SaveState) => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    state = next;
    if (next === "saved") {
      timer = setTimeout(() => {
        timer = null;
        state = "idle";
        listeners.forEach((l) => l());
      }, visibleMs);
    }
    listeners.forEach((l) => l());
  };
  return {
    get: (): SaveState => state,
    subscribe(l: Listener): () => void {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    /** 送り始めた。 */
    saving(): void {
      pending += 1;
      set("saving");
    },
    /**
     * 保存できた。送っていた物が残っていればまだ「保存中」のまま。
     * 端末だけの設定（送らない物）はいきなりこれを呼ぶ。
     */
    saved(): void {
      pending = Math.max(0, pending - 1);
      if (pending === 0) set("saved");
    },
    /** 失敗した（理由はトーストで言う。ここでは札を引っ込めるだけ）。 */
    failed(): void {
      pending = Math.max(0, pending - 1);
      set(pending === 0 ? "error" : "saving");
    },
    /** 一部だけ保存できた（トーストで名指しする）。「保存しました」とは言わない。 */
    settled(): void {
      pending = Math.max(0, pending - 1);
      if (pending === 0) set("idle");
    },
  };
}

/** アプリで1つの店（設定画面の札と、各欄の保存がこれを共有する）。 */
export const settingsSaveStatus = createSaveStatus();
