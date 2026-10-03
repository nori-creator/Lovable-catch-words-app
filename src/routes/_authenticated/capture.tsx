import { createFileRoute } from "@tanstack/react-router";
import { tStatic } from "@/lib/i18n";
import { CapturePage } from "@/components/screens/CaptureScreen";

/**
 * 画面の中身は `components/screens/CaptureScreen.tsx`。**このファイルからは `Route` 以外を出さない** —
 * 出すと TanStack の分割が効かず、画面の部品が最初に読む塊（entry）に入る（2026-10-03
 * 最初の読み込みの監査。`admin.users.tsx` と同じ形）。
 */
export const Route = createFileRoute("/_authenticated/capture")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { word?: string; pending?: string; retake?: string; mode?: "search" | "photo" } => {
    const out: { word?: string; pending?: string; retake?: string; mode?: "search" | "photo" } = {};
    /**
     * どの撮り方で着くか。**スキャンから「検索」を選んで来たときに、
     * 着いた先が「写真を撮る」だと、選んだ物と違う所に出る。**
     * 「スキャン」はこの画面ではないので受け取らない。
     */
    if (search.mode === "search" || search.mode === "photo") out.mode = search.mode;
    // 派生キャッチ: /capture?word=咖啡 で文字入力フローを自動実行
    if (typeof search.word === "string" && search.word) out.word = search.word;
    // オフラインキューからの復元: /capture?pending=<id>
    if (typeof search.pending === "string" && search.pending) out.pending = search.pending;
    // 撮り直しの提案から来たとき: /capture?retake=雨傘
    // **文字入力は走らせない** — 目的はカメラで撮り直すことなので、
    // 「何を撮りに来たか」を思い出させる一行を出すだけにする。
    if (typeof search.retake === "string" && search.retake) out.retake = search.retake;
    return out;
  },
  head: () => ({
    meta: [
      { title: tStatic("page.capture") },
      { name: "description", content: "写真でも文字入力でも、見つけた言葉をすぐに図鑑へ。" },
    ],
  }),
  component: CapturePage,
});
