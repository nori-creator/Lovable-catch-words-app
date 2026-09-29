/**
 * **サブスクと広告の設計**（見本・本番は未実装）。
 *
 * > オーナー指示 2026-09-27「このアプリにサブスクや Google 広告をつけるようにしたい。
 * > Google 広告はどのタイミングで広告を表示したり、どんな頻度で広告を表示するか考えて。
 * > …サブスクは何をサブスクにするのかを一緒に考えたい。」
 *
 * 上の切り替え: ①無料と Pro の分け方（案）②広告が出る所（3か所）。
 * 広告の決まりは `src/lib/ad-policy.ts`、考え方と手順は `docs/monetization.md`。
 */
import { useState, type CSSProperties } from "react";
import { Check, Crown, Gift, Lock, Minus, Play, Sparkles, X } from "lucide-react";
import { photo } from "./peel-sticker";

type View = "plans" | "review-end" | "dex" | "rewarded";
const VIEWS: Array<{ key: View; label: string }> = [
  { key: "plans", label: "① 無料と Pro" },
  { key: "review-end", label: "② 復習の区切りの広告" },
  { key: "dex", label: "③ 図鑑の一覧の広告" },
  { key: "rewarded", label: "④ ごほうび広告" },
];

/** オーナーの候補①〜⑨を、無料 / Pro にどう分けるかの案。 */
const ROWS: Array<{
  no: string;
  name: string;
  free: string | boolean;
  pro: string | boolean;
  note?: string;
}> = [
  {
    no: "—",
    name: "撮る・スキャン・検索",
    free: "1日20語まで",
    pro: "無制限",
    note: "③ 学ぶ入口は無料のまま（止めない）",
  },
  {
    no: "—",
    name: "復習・記憶のグラフ",
    free: true,
    pro: true,
    note: "続ける理由そのもの。課金の壁を置かない",
  },
  {
    no: "①",
    name: "切り抜き（シール）",
    free: "1日3枚",
    pro: "無制限",
    note: "1枚ごとに外部の費用がかかる",
  },
  {
    no: "②",
    name: "解説の作り直し",
    free: "報告の直しだけ",
    pro: "無制限",
    note: "誤りの直しは全員（品質の約束）",
  },
  { no: "④", name: "高性能な AI", free: false, pro: true, note: "解説・例文をより自然に" },
  {
    no: "⑤",
    name: "日記の添削・スピーキング",
    free: false,
    pro: "（作ったら）",
    note: "未実装。作ったら Pro の目玉に",
  },
  { no: "⑥", name: "複数の学習言語", free: "1つ", pro: "いくつでも" },
  { no: "⑦", name: "単語帳の読み込み", free: "1冊", pro: "無制限" },
  {
    no: "⑧",
    name: "アルバムの編集",
    free: "書き込み",
    pro: "本棚の表紙・書き出し",
    note: "書き込みは続ける動機なので無料に残す",
  },
  { no: "⑨", name: "広告なし", free: false, pro: true },
];

function Cell({ v }: { v: string | boolean }) {
  if (v === true) return <Check className="mx-auto h-4 w-4 text-primary" aria-label="あり" />;
  if (v === false)
    return <Minus className="mx-auto h-4 w-4 text-muted-foreground" aria-label="なし" />;
  return <span className="text-caption">{v}</span>;
}

const GRID: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 76px 84px" };

function Plans() {
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div
          className="items-center gap-1 border-b border-border px-3 py-2 text-caption font-semibold"
          style={GRID}
        >
          <span>機能</span>
          <span className="text-center">無料</span>
          <span className="flex items-center justify-center gap-1 text-primary">
            <Crown className="h-3.5 w-3.5" /> Pro
          </span>
        </div>
        {ROWS.map((r) => (
          <div
            key={r.name}
            className="items-center gap-1 border-b border-border/60 px-3 py-2 last:border-0"
            style={GRID}
          >
            <span>
              <span className="text-footnote font-semibold">
                <span className="mr-1 text-muted-foreground">{r.no}</span>
                {r.name}
              </span>
              {r.note && <span className="block text-caption text-muted-foreground">{r.note}</span>}
            </span>
            <span className="text-center">
              <Cell v={r.free} />
            </span>
            <span className="text-center">
              <Cell v={r.pro} />
            </span>
          </div>
        ))}
      </div>
      {/* 課金の画面の見本（押すと Apple / Google の購入画面が出る所）。 */}
      <div
        className="rounded-3xl p-5 text-white shadow-lg"
        style={{ background: "linear-gradient(#0a84ff, #0062d1)" }}
      >
        <p className="flex items-center gap-2 text-headline font-bold">
          <Sparkles className="h-5 w-5" /> CatchWords Pro
        </p>
        <p className="mt-1 text-footnote opacity-90">撮った言葉を、もっと深く・もっと自由に。</p>
        <ul className="mt-3 space-y-1.5 text-footnote">
          {[
            "広告なし",
            "切り抜き・解説の作り直しが無制限",
            "高性能な AI の解説",
            "学習言語をいくつでも",
          ].map((x) => (
            <li key={x} className="flex items-center gap-2">
              <Check className="h-4 w-4" /> {x}
            </li>
          ))}
        </ul>
        <div className="mt-4" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div
            className="rounded-2xl p-3 text-center"
            style={{ background: "rgb(255 255 255 / .15)" }}
          >
            <p className="text-caption opacity-90">月ごと</p>
            <p className="text-headline font-bold">¥—</p>
          </div>
          <div
            className="rounded-2xl p-3 text-center"
            style={{ background: "#fff", color: "#0a84ff" }}
          >
            <p className="text-caption font-semibold">年ごと（おすすめ）</p>
            <p className="text-headline font-bold">¥—</p>
          </div>
        </div>
        <p className="mt-3 text-center text-caption opacity-80">
          値段は未定（下の注）。7日間の無料体験・いつでも解約、を想定。
        </p>
      </div>
    </div>
  );
}

const phone: CSSProperties = {
  position: "relative",
  width: 300,
  height: 600,
  margin: "0 auto",
  borderRadius: 40,
  padding: 10,
  background: "#111",
};

function ReviewEnd() {
  return (
    <div style={phone}>
      <div className="relative h-full overflow-hidden bg-background" style={{ borderRadius: 32 }}>
        <div className="p-5 pt-12 text-center">
          <p className="text-title font-bold">今日の復習 10語 おわり</p>
          <p className="mt-1 text-footnote text-muted-foreground">正解 8 / 10</p>
        </div>
        {/* 全画面の広告（3回に1回・10分以上あけて・1日3回まで）。 */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            padding: 16,
            background: "rgb(0 0 0 / .7)",
          }}
        >
          <div className="w-full rounded-2xl bg-white p-3 text-black">
            <div className="flex items-center justify-between text-caption text-neutral-500">
              <span
                style={{
                  borderRadius: 4,
                  background: "#e5e5e5",
                  padding: "0 6px",
                  fontWeight: 600,
                }}
              >
                広告
              </span>
              <span className="flex items-center gap-1">
                5秒後に閉じられます <X className="h-4 w-4" />
              </span>
            </div>
            <div
              style={{
                marginTop: 8,
                height: 224,
                display: "grid",
                placeItems: "center",
                borderRadius: 12,
                background: "#f1f1f1",
                color: "#999",
              }}
            >
              （広告の中身）
            </div>
          </div>
        </div>
      </div>
      <p className="mt-2 text-center text-caption text-muted-foreground">
        復習を3回終えた区切りで1回。撮る・スキャン・保存の最中は出さない
      </p>
    </div>
  );
}

function Dex() {
  const cell = (i: number) => (
    <div key={i} className="overflow-hidden rounded-xl bg-card shadow-sm">
      <img src={photo} alt="" className="aspect-square w-full object-cover" />
      <p lang="zh-Hant" className="py-1 text-center text-caption font-semibold">
        {["珍珠奶茶", "夜市", "芒果", "捷運", "雨傘", "咖啡"][i % 6]}
      </p>
    </div>
  );
  return (
    <div style={phone}>
      <div className="h-full overflow-hidden bg-background p-3 pt-10" style={{ borderRadius: 32 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {[0, 1, 2, 3, 4, 5].map(cell)}
          {/* 一覧に溶け込む広告（12枚ごとに1枠。最初の8枚の中には置かない）。 */}
          <div
            className="flex items-center gap-2 rounded-xl border border-border bg-card p-2"
            style={{ gridColumn: "1 / -1" }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                flex: "none",
                borderRadius: 8,
                background: "#e5e5e5",
              }}
            />
            <div className="min-w-0 flex-1">
              <p className="text-caption">
                <span className="mr-1 rounded bg-neutral-200 px-1 font-semibold text-neutral-600">
                  広告
                </span>
                （広告の題）
              </p>
              <p className="truncate text-caption text-muted-foreground">（広告の説明）</p>
            </div>
          </div>
          {[6, 7, 8].map(cell)}
        </div>
      </div>
      <p className="mt-2 text-center text-caption text-muted-foreground">
        札と同じ形の1枠。「広告」の印を必ず付ける
      </p>
    </div>
  );
}

function Rewarded() {
  return (
    <div style={phone}>
      <div className="h-full overflow-hidden bg-background p-4 pt-12" style={{ borderRadius: 32 }}>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-footnote font-semibold">例文</p>
          <p lang="zh-Hant" className="mt-1 text-body">
            我每天早上都喝一杯珍珠奶茶。
          </p>
          <button
            type="button"
            className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-border text-footnote font-semibold"
          >
            <Lock className="h-4 w-4" /> 作り直す（Pro）
          </button>
          <button
            type="button"
            className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-full text-footnote font-bold text-white"
            style={{ background: "#ff9f0a" }}
          >
            <Play className="h-4 w-4" /> 広告を見て1回作り直す
          </button>
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-caption text-muted-foreground">
          <Gift className="mt-0.5 h-4 w-4 shrink-0" /> 本人が押した時だけ。無理に見せない
        </p>
      </div>
    </div>
  );
}

const pill = (on: boolean): CSSProperties => ({
  minHeight: 44,
  padding: "0 12px",
  borderRadius: 999,
  border: "1px solid var(--border)",
  background: on ? "var(--primary)" : "var(--card)",
  color: on ? "var(--primary-foreground)" : "var(--foreground)",
  fontWeight: 600,
  fontSize: 13,
});

export function MonetizationDesignsScene({ q }: { q: URLSearchParams }) {
  const [v, setV] = useState<View>(VIEWS.find((x) => x.key === q.get("v"))?.key ?? "plans");
  return (
    <div className="space-y-3 pb-28">
      <div role="radiogroup" aria-label="見る所" className="flex flex-wrap gap-1.5">
        {VIEWS.map((x) => (
          <button
            key={x.key}
            type="button"
            role="radio"
            aria-checked={v === x.key}
            onClick={() => setV(x.key)}
            style={pill(v === x.key)}
          >
            {x.label}
          </button>
        ))}
      </div>
      {v === "plans" && <Plans />}
      {v === "review-end" && <ReviewEnd />}
      {v === "dex" && <Dex />}
      {v === "rewarded" && <Rewarded />}
    </div>
  );
}
