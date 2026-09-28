import { useState, type CSSProperties, type ReactNode } from "react";
import { photo } from "./peel-sticker";

/**
 * **場所の知らせのデザイン案**（オーナー指示 2026-09-27「場所のリマインダーの
 * 通知デザイン/UIの案を複数出して」）。
 *
 * 上が**ロック画面に届く通知**、下が**アプリを開いたときの知らせ**。
 * 通知の見た目（角・字体・並び）は端末が決めるので、こちらが選べるのは
 * 「題・本文・写真・押せるボタン」だけ。その範囲で4案を並べる。
 *
 * どの案も、鳴るのは**同じ場所で1日1回・1日3回まで**（この回で入れた上限）。
 */
const VARIANTS = [
  { key: "a", label: "A 今の形" },
  { key: "b", label: "B 写真を大きく" },
  { key: "c", label: "C その場で4択" },
  { key: "d", label: "D 1日1回のまとめ" },
] as const;
type Key = (typeof VARIANTS)[number]["key"];

const ink = "#0b1220";
const sub = "#5b6475";
const blue = "#0a84ff";

function LockScreen({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        borderRadius: 28,
        padding: "22px 12px 16px",
        background: "linear-gradient(160deg, #2b3a55, #111827 70%)",
        color: "#fff",
      }}
    >
      <p style={{ textAlign: "center", fontSize: 44, fontWeight: 200, lineHeight: 1 }}>9:41</p>
      <p style={{ textAlign: "center", fontSize: 13, opacity: 0.8, marginTop: 4 }}>
        9月27日 土曜日
      </p>
      <div style={{ marginTop: 18 }}>{children}</div>
    </div>
  );
}

const notif: CSSProperties = {
  borderRadius: 20,
  padding: 12,
  background: "rgba(245,245,247,0.82)",
  backdropFilter: "blur(20px)",
  color: ink,
};

function NotifHead() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: sub }}>
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: 5,
          background: blue,
          display: "inline-block",
        }}
      />
      <span style={{ fontWeight: 600, letterSpacing: 0.3 }}>CATCHWORDS</span>
      <span style={{ marginLeft: "auto" }}>今</span>
    </div>
  );
}

function Thumb({ size = 44, radius = 10 }: { size?: number; radius?: number }) {
  return (
    <img
      src={photo}
      alt=""
      style={{ width: size, height: size, borderRadius: radius, objectFit: "cover", flex: "none" }}
    />
  );
}

function Lock({ v }: { v: Key }) {
  if (v === "a")
    return (
      <div style={notif}>
        <NotifHead />
        <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 600 }}>「タピオカミルクティー」覚えてる？</p>
            <p style={{ fontSize: 14 }}>8月1日に士林夜市で撮ったね</p>
          </div>
          <Thumb />
        </div>
      </div>
    );
  if (v === "b")
    return (
      <div style={notif}>
        <NotifHead />
        <img
          src={photo}
          alt=""
          style={{
            width: "100%",
            aspectRatio: "4 / 3",
            objectFit: "cover",
            borderRadius: 14,
            marginTop: 8,
          }}
        />
        <p style={{ fontWeight: 700, marginTop: 8 }}>ここで撮った、これ。中国語で言える？</p>
        <p style={{ fontSize: 14, color: sub }}>士林夜市 · 8月1日</p>
      </div>
    );
  if (v === "c")
    return (
      <div style={notif}>
        <NotifHead />
        <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 600 }}>士林夜市で撮った「タピオカミルクティー」は？</p>
            <p style={{ fontSize: 14 }}>長押しで答えを選べます</p>
          </div>
          <Thumb />
        </div>
        <div
          style={{ display: "grid", gap: 1, marginTop: 10, borderRadius: 12, overflow: "hidden" }}
        >
          {["珍珠奶茶", "芒果冰", "豆花"].map((w) => (
            <span
              key={w}
              style={{
                padding: "10px 12px",
                background: "rgba(255,255,255,0.75)",
                color: blue,
                fontWeight: 600,
              }}
            >
              {w}
            </span>
          ))}
        </div>
      </div>
    );
  return (
    <div style={notif}>
      <NotifHead />
      <p style={{ fontWeight: 600, marginTop: 6 }}>士林夜市で撮った言葉が3つあります</p>
      <p style={{ fontSize: 14 }}>1分で思い出そう</p>
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <Thumb size={52} />
        <Thumb size={52} />
        <Thumb size={52} />
      </div>
    </div>
  );
}

const card: CSSProperties = {
  borderRadius: 28,
  padding: 16,
  background: "#fff",
  color: ink,
  boxShadow: "0 14px 50px #147bc522",
  border: "1px solid rgba(0,0,0,0.06)",
};
const primaryBtn: CSSProperties = {
  minHeight: 44,
  borderRadius: 999,
  padding: "0 18px",
  background: blue,
  color: "#fff",
  fontWeight: 700,
  border: 0,
};

function InApp({ v }: { v: Key }) {
  const [picked, setPicked] = useState<string | null>(null);
  if (v === "a")
    return (
      <div style={{ ...card, display: "flex", alignItems: "center", gap: 12 }}>
        <Thumb size={48} radius={12} />
        <div style={{ flex: 1 }}>
          <p style={{ fontWeight: 600 }}>「タピオカミルクティー」覚えてる？</p>
          <p style={{ fontSize: 13, color: sub }}>8月1日に撮ったね</p>
        </div>
        <span style={{ color: sub, fontSize: 18 }}>×</span>
      </div>
    );
  if (v === "b")
    return (
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <img
          src={photo}
          alt=""
          style={{ width: "100%", aspectRatio: "16 / 10", objectFit: "cover" }}
        />
        <div style={{ padding: 16 }}>
          <p style={{ fontSize: 13, color: sub }}>士林夜市 · 8月1日</p>
          <p style={{ fontWeight: 700, fontSize: 18, marginTop: 2 }}>
            ここで撮った、これ。言える？
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button type="button" style={primaryBtn}>
              思い出す
            </button>
            <button
              type="button"
              style={{ ...primaryBtn, background: "rgba(0,0,0,0.05)", color: ink }}
            >
              あとで
            </button>
          </div>
        </div>
      </div>
    );
  if (v === "c")
    return (
      <div style={card}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Thumb size={56} radius={14} />
          <div>
            <p style={{ fontSize: 13, color: sub }}>士林夜市で撮ったね</p>
            <p style={{ fontWeight: 700 }}>「タピオカミルクティー」は？</p>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
          {["珍珠奶茶", "芒果冰", "豆花", "雞排"].map((w) => {
            const right = w === "珍珠奶茶";
            const on = picked === w;
            return (
              <button
                key={w}
                type="button"
                onClick={() => setPicked(w)}
                style={{
                  minHeight: 48,
                  borderRadius: 14,
                  border: `1.5px solid ${on ? (right ? "#16a34a" : "#dc2626") : "rgba(0,0,0,0.1)"}`,
                  background: on ? (right ? "#dcfce7" : "#fee2e2") : "#f8fafc",
                  fontSize: 18,
                  fontWeight: 600,
                }}
              >
                {w}
              </button>
            );
          })}
        </div>
      </div>
    );
  return (
    <div style={card}>
      <p style={{ fontSize: 13, color: sub }}>今日のこの場所</p>
      <p style={{ fontWeight: 700, fontSize: 18 }}>士林夜市で撮った言葉が3つ</p>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ flex: 1 }}>
            <img
              src={photo}
              alt=""
              style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 14 }}
            />
          </div>
        ))}
      </div>
      <button type="button" style={{ ...primaryBtn, width: "100%", marginTop: 12 }}>
        3つまとめて思い出す（約1分）
      </button>
    </div>
  );
}

export function PlaceNotifyDesignsScene({ q }: { q: URLSearchParams }) {
  const [v, setV] = useState<Key>(VARIANTS.find((o) => o.key === q.get("v"))?.key ?? "a");
  return (
    <div style={{ padding: "8px 16px 120px", display: "grid", gap: 14 }}>
      <div
        role="radiogroup"
        aria-label="通知の案"
        style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
      >
        {VARIANTS.map((o) => (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={v === o.key}
            onClick={() => setV(o.key)}
            style={{
              flex: "0 0 auto",
              minHeight: 44,
              padding: "0 14px",
              borderRadius: 999,
              border: "1px solid rgba(0,0,0,0.12)",
              background: v === o.key ? blue : "#fff",
              color: v === o.key ? "#fff" : ink,
              fontWeight: 600,
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p style={{ fontSize: 13, color: sub }}>ロック画面に届く通知</p>
      <LockScreen>
        <Lock v={v} />
      </LockScreen>
      <p style={{ fontSize: 13, color: sub }}>アプリを開いたときの知らせ</p>
      <InApp key={v} v={v} />
      <p style={{ fontSize: 12, color: sub, lineHeight: 1.6 }}>
        どの案も、鳴るのは同じ場所で1日1回・1日3回まで。C の「長押しで答える」は iPhone
        の通知の操作ボタン（最大4つ）を使うので、ストアのアプリ版でだけ出せます（Web
        では押すとアプリが開くだけ）。
      </p>
    </div>
  );
}
