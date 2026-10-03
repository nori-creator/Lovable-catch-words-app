/**
 * **Web 版の広告の枠（AdSense）の見た目**（2026-10-03）。
 *
 * 本物の部品（`WebAdUnit`）を、AdSense を読まない見本の形（`preview`）で描く。
 * - `?scene=web-ads`（既定）: 復習の束の区切りの画面の下の枠。
 * - `?scene=web-ads&variant=feed`: 一覧の途中に挟まる枠。
 * 言語は `&lang=en` / `&lang=zh-TW`。
 */
import { WebAdUnit } from "@/components/WebAdSlot";
import { DoneState } from "@/routes/_authenticated/review";

const PREVIEW = { client: "ca-pub-0000000000000000", slot: "0000000000" };

export function WebAdsScene({ q }: { q: URLSearchParams }) {
  if (q.get("variant") === "feed") {
    return (
      <div className="mx-auto max-w-md px-4 py-6">
        <ul className="overflow-hidden rounded-3xl border border-border bg-card">
          {["一", "二", "三"].map((w) => (
            <li key={w} className="border-t border-border p-4 first:border-t-0">
              {w}
            </li>
          ))}
        </ul>
        <WebAdUnit {...PREVIEW} preview />
        <ul className="overflow-hidden rounded-3xl border border-border bg-card">
          {["四", "五"].map((w) => (
            <li key={w} className="border-t border-border p-4 first:border-t-0">
              {w}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <DoneState
        onAgain={() => {}}
        answered={10}
        correct={8}
        batch={{ limit: 0, doneToday: 10, dueRemaining: 0 }}
      />
      <WebAdUnit {...PREVIEW} preview className="mt-10" />
    </div>
  );
}
