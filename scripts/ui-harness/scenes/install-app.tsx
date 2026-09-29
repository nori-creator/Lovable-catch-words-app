/**
 * **スマホにアプリとして入れる案内**（オーナー指示 2026-09-29「Android と iPhone でこの URL を
 * 開いて使用でき、またアプリとしてスマホ上にインストールできるようにして」）。
 *
 * 本物の部品（`InstallBanner` / `InstallAppCard`）を、端末ごとの形で並べる:
 * iPhone（共有ボタン → ホーム画面に追加）・Android（釦1つ）・Android（合図がまだの時の手順）・
 * LINE の中（Safari で開き直す）。本物のホームでは下のバーの上に1度だけ浮かぶ。
 */
import { InstallAppCard, InstallBanner } from "@/components/InstallApp";
import type { InstallState } from "@/lib/pwa";

const CASES: Array<{ label: string; state: InstallState }> = [
  { label: "iPhone（Safari）", state: { installed: false, canPrompt: false, platform: "ios" } },
  { label: "Android（Chrome）", state: { installed: false, canPrompt: true, platform: "android" } },
  {
    label: "Android（案内がまだ出ない時）",
    state: { installed: false, canPrompt: false, platform: "android" },
  },
  {
    label: "LINE などのアプリの中",
    state: { installed: false, canPrompt: false, platform: "in-app" },
  },
];

export function InstallAppScene() {
  return (
    <div style={{ display: "grid", gap: 16, padding: "12px 0 96px" }}>
      {CASES.map((c) => (
        <section key={c.label}>
          <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 700, color: "#5b6472" }}>
            ホームに出る案内: {c.label}
          </p>
          <InstallBanner inline state={c.state} />
        </section>
      ))}
      <section className="rounded-2xl border border-border bg-card p-4">
        <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700, color: "#5b6472" }}>
          設定 → 見た目 の中の欄（iPhone の場合）
        </p>
        <InstallAppCard state={CASES[0].state} />
      </section>
    </div>
  );
}
