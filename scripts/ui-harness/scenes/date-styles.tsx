import { DateStylePicker } from "@/components/DateStylePicker";

/**
 * ホームの日付の組み方の見比べ（2026-09-24、開発者専用の設定と同じ部品）。
 * 日付は固定（2026年9月21日・月曜日）— 見本が日によって変わらないように。
 */
export function DateStylesScene() {
  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <DateStylePicker date={new Date(2026, 8, 21)} />
    </div>
  );
}
