/**
 * **通知バーのデザイン案**（試作・本番は未変更）。
 *
 * > オーナー指示 2026-09-27「通知バーのデザイン案を複数出して。通知バーの場所は具体的に。」
 *
 * 復習の通知（設定の「復習の通知」で予約するもの）を、**端末の上でどこに出るか**
 * ごとに見せる:
 *   ① iPhone ロック画面 … 時計の下、画面の中ほどに積まれる通知の列。
 *   ② iPhone 使用中 … 別のアプリを使っている時、画面の一番上（ダイナミック
 *      アイランドのすぐ下）から下りてくるバナー。数秒で上へ戻る。
 *   ③ Android 通知シェード … 画面の上端から指で引き下ろした一覧。使用中は同じ
 *      カードが上端に「ヘッドアップ通知」として数秒出る。
 *
 * 案（どれも入っている部品 `@capacitor/local-notifications` でできる範囲）:
 *   A 文字だけ … 今の実装。題「復習の時間です」＋語数。
 *   B 写真つき … 右に撮った写真の小さな四角。iPhone は長押しで写真が大きく開く
 *                （`attachments`）、Android は右の丸い四角（`largeIcon`）。
 *   C 1問だけ出す … 写真＋「これ、台湾華語で？」。長押し（Android は下の列）で
 *                「答えを見る / あとで」。iPhone だけは通知の中で答えを打てる（`input`）。
 *   D まとめて見せる … 忘れかけの語の意味を最大5行（Android の `inboxList`。
 *                iPhone は同じ語の通知を1つの束にまとめる `threadIdentifier`）。
 */
import { useState, type CSSProperties, type ReactNode } from "react";
import { photo } from "./peel-sticker";

type Design = "a" | "b" | "c" | "d";
type Place = "lock" | "banner" | "android";
const DESIGNS: Array<{ key: Design; label: string }> = [
  { key: "a", label: "A 文字だけ" },
  { key: "b", label: "B 写真つき" },
  { key: "c", label: "C 1問だけ" },
  { key: "d", label: "D まとめて" },
];
const PLACES: Array<{ key: Place; label: string; note: string }> = [
  {
    key: "lock",
    label: "iPhone ロック画面",
    note: "時計の下、画面の中ほど。新しい通知ほど上に積まれる。",
  },
  {
    key: "banner",
    label: "iPhone 使用中",
    note: "別のアプリを使っている時、画面の一番上（島のすぐ下）から下りてきて数秒で戻る。",
  },
  {
    key: "android",
    label: "Android 通知シェード",
    note: "上端から引き下ろした一覧。使用中は同じカードが上端に数秒出る（ヘッドアップ）。",
  },
];

const APP = "CatchWords";

function AppIcon({ size = 20 }: { size?: number }) {
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.26,
        background: "linear-gradient(145deg,#3aa0ff,#0063e6)",
        display: "inline-grid",
        placeItems: "center",
        color: "#fff",
        fontSize: size * 0.55,
        fontWeight: 800,
        flex: "none",
      }}
    >
      C
    </span>
  );
}

/** 案ごとの中身（題・本文・右の写真・下の行）。 */
function content(d: Design) {
  if (d === "a")
    return {
      title: "復習の時間です",
      body: "忘れかけの単語が5語。いまがいちばん覚え直しやすい時です",
    };
  if (d === "b")
    return {
      title: "復習の時間です",
      body: "珍珠奶茶 ほか4語が忘れかけています",
      thumb: true,
    };
  if (d === "c")
    return {
      title: "これ、台湾華語で言える？",
      body: "9月3日 · 西門町で撮った写真",
      thumb: true,
      actions: ["答えを見る", "あとで"],
    };
  return {
    title: "忘れかけの単語 5語",
    body: "",
    lines: ["タピオカミルクティー", "ストロー", "コップ", "甘さ半分", "氷少なめ"],
  };
}

function IosCard({ d, expanded = false }: { d: Design; expanded?: boolean }) {
  const c = content(d);
  return (
    <div
      style={{
        borderRadius: 22,
        padding: "11px 12px",
        background: "rgb(245 245 247 / .72)",
        backdropFilter: "blur(24px) saturate(180%)",
        WebkitBackdropFilter: "blur(24px) saturate(180%)",
        color: "#111",
        boxShadow: "0 6px 20px rgb(0 0 0 / .18)",
      }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <AppIcon size={34} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
            <p style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.25 }}>{c.title}</p>
            <span style={{ fontSize: 12, color: "#6b6b70", flex: "none" }}>今</span>
          </div>
          {c.body && <p style={{ fontSize: 14, lineHeight: 1.3, marginTop: 1 }}>{c.body}</p>}
          {c.lines && (
            <p style={{ fontSize: 14, lineHeight: 1.3, marginTop: 1 }}>
              {c.lines.slice(0, 2).join("、")} ほか{c.lines.length - 2}語
            </p>
          )}
        </div>
        {c.thumb && !expanded && (
          <img
            src={photo}
            alt=""
            style={{ width: 38, height: 38, borderRadius: 8, objectFit: "cover", flex: "none" }}
          />
        )}
      </div>
      {expanded && c.thumb && (
        <img
          src={photo}
          alt=""
          style={{
            display: "block",
            width: "100%",
            aspectRatio: "4/3",
            objectFit: "cover",
            borderRadius: 14,
            marginTop: 10,
          }}
        />
      )}
    </div>
  );
}

function IosActions({ d }: { d: Design }) {
  const c = content(d);
  if (!c.actions) return null;
  return (
    <div
      style={{
        marginTop: 8,
        borderRadius: 16,
        overflow: "hidden",
        background: "rgb(245 245 247 / .8)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
      }}
    >
      {[...c.actions, "答えを打つ…"].map((a, i) => (
        <div
          key={a}
          style={{
            padding: "11px 14px",
            fontSize: 15,
            borderTop: i ? "0.5px solid rgb(0 0 0 / .15)" : undefined,
            color: "#111",
          }}
        >
          {a}
        </div>
      ))}
    </div>
  );
}

function AndroidCard({ d, expanded = true }: { d: Design; expanded?: boolean }) {
  const c = content(d);
  return (
    <div
      style={{
        borderRadius: 24,
        padding: "12px 14px",
        background: "#f3f0f7",
        color: "#1d1b20",
      }}
    >
      <div
        style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#49454f" }}
      >
        <AppIcon size={16} />
        <span>{APP}</span>
        <span>· 今</span>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ fontSize: 15, fontWeight: 600 }}>{c.title}</p>
          {c.body && <p style={{ fontSize: 14, color: "#49454f", marginTop: 1 }}>{c.body}</p>}
          {c.lines && expanded && (
            <ul style={{ marginTop: 4, fontSize: 14, color: "#49454f", lineHeight: 1.45 }}>
              {c.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          )}
        </div>
        {c.thumb && (
          <img
            src={photo}
            alt=""
            style={{ width: 44, height: 44, borderRadius: 10, objectFit: "cover", flex: "none" }}
          />
        )}
      </div>
      {c.actions && expanded && (
        <div style={{ display: "flex", gap: 18, marginTop: 10, paddingLeft: 2 }}>
          {c.actions.map((a) => (
            <span key={a} style={{ fontSize: 14, fontWeight: 600, color: "#0b57d0" }}>
              {a}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Phone({ children, dark = true }: { children: ReactNode; dark?: boolean }) {
  return (
    <div
      style={{
        position: "relative",
        width: 300,
        height: 610,
        margin: "0 auto",
        borderRadius: 46,
        padding: 10,
        background: "#111",
        boxShadow: "0 20px 40px -20px rgb(0 0 0 / .6)",
      }}
    >
      <div
        style={{
          position: "relative",
          height: "100%",
          borderRadius: 38,
          overflow: "hidden",
          background: dark
            ? "radial-gradient(120% 80% at 30% 10%, #6f8fbf, #2c3a5c 55%, #141a2c)"
            : "#f4f6fb",
        }}
      >
        {children}
      </div>
    </div>
  );
}

const abs = (s: CSSProperties): CSSProperties => ({ position: "absolute", ...s });

/** 使用中の別アプリの画面（地図アプリのつもり）。 */
function OtherApp() {
  return (
    <div style={abs({ inset: 0, background: "#e8eef3" })}>
      <div
        style={abs({
          inset: 0,
          opacity: 0.8,
          background: "repeating-linear-gradient(35deg,#dfe7ee 0 18px,#e9eff4 18px 36px)",
        })}
      />
      <div
        style={abs({
          left: 40,
          top: 260,
          width: 220,
          height: 10,
          borderRadius: 5,
          background: "#8fb3d9",
        })}
      />
      <div
        style={abs({
          left: 120,
          top: 200,
          width: 12,
          height: 160,
          borderRadius: 6,
          background: "#f2c27a",
        })}
      />
    </div>
  );
}

function Scene({ d, place }: { d: Design; place: Place }) {
  if (place === "lock")
    return (
      <Phone>
        <div
          style={abs({
            top: 14,
            left: "50%",
            translate: "-50% 0",
            width: 96,
            height: 28,
            borderRadius: 20,
            background: "#000",
          })}
        />
        <p
          style={abs({
            top: 70,
            left: 0,
            right: 0,
            textAlign: "center",
            color: "#fff",
            fontSize: 15,
            fontWeight: 600,
          })}
        >
          9月28日 月曜日
        </p>
        <p
          style={abs({
            top: 88,
            left: 0,
            right: 0,
            textAlign: "center",
            color: "#fff",
            fontSize: 72,
            fontWeight: 700,
            letterSpacing: -2,
          })}
        >
          8:40
        </p>
        <div style={abs({ left: 10, right: 10, top: 300 })}>
          <IosCard d={d} />
          {/* 下にもう1件（ほかのアプリ）。通知は積まれて並ぶ。 */}
          <div
            style={{
              marginTop: 8,
              height: 54,
              borderRadius: 22,
              background: "rgb(245 245 247 / .5)",
              backdropFilter: "blur(20px)",
            }}
          />
        </div>
      </Phone>
    );
  if (place === "banner")
    return (
      <Phone dark={false}>
        <OtherApp />
        <div
          style={abs({
            top: 14,
            left: "50%",
            translate: "-50% 0",
            width: 96,
            height: 28,
            borderRadius: 20,
            background: "#000",
          })}
        />
        <div style={abs({ left: 8, right: 8, top: 52 })}>
          <IosCard d={d} />
        </div>
        {(d === "b" || d === "c") && (
          <div style={abs({ left: 8, right: 8, top: 170 })}>
            <p style={{ fontSize: 11, color: "#444", textAlign: "center", marginBottom: 6 }}>
              ↓ 長押しで開いた時
            </p>
            <IosCard d={d} expanded />
            <IosActions d={d} />
          </div>
        )}
      </Phone>
    );
  return (
    <Phone dark={false}>
      <div style={abs({ inset: 0, background: "#fdf8fd" })} />
      <div
        style={abs({
          top: 12,
          left: 18,
          right: 18,
          display: "flex",
          justifyContent: "space-between",
          fontSize: 12,
          color: "#1d1b20",
        })}
      >
        <span>8:40</span>
        <span>▾ 100%</span>
      </div>
      {/* 引き下ろした時の、上のクイック設定の列。 */}
      <div style={abs({ top: 40, left: 12, right: 12, display: "flex", gap: 8 })}>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 44,
              borderRadius: 22,
              background: i === 0 ? "#d3e3fd" : "#e8e1ee",
            }}
          />
        ))}
      </div>
      <div style={abs({ top: 104, left: 10, right: 10 })}>
        <AndroidCard d={d} />
        <div
          style={{
            marginTop: 6,
            height: 60,
            borderRadius: 24,
            background: "#f3f0f7",
            opacity: 0.6,
          }}
        />
      </div>
    </Phone>
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

export function NotifyBarDesignsScene({ q }: { q: URLSearchParams }) {
  const [d, setD] = useState<Design>(DESIGNS.find((x) => x.key === q.get("n"))?.key ?? "b");
  const [place, setPlace] = useState<Place>(
    PLACES.find((x) => x.key === q.get("place"))?.key ?? "lock",
  );
  const p = PLACES.find((x) => x.key === place)!;
  return (
    <div className="space-y-3 pb-28">
      <div role="radiogroup" aria-label="通知の案" className="flex flex-wrap gap-1.5">
        {DESIGNS.map((x) => (
          <button
            key={x.key}
            type="button"
            role="radio"
            aria-checked={d === x.key}
            onClick={() => setD(x.key)}
            style={pill(d === x.key)}
          >
            {x.label}
          </button>
        ))}
      </div>
      <div role="radiogroup" aria-label="出る場所" className="flex flex-wrap gap-1.5">
        {PLACES.map((x) => (
          <button
            key={x.key}
            type="button"
            role="radio"
            aria-checked={place === x.key}
            onClick={() => setPlace(x.key)}
            style={pill(place === x.key)}
          >
            {x.label}
          </button>
        ))}
      </div>
      <p className="text-caption leading-relaxed text-muted-foreground">
        <b className="text-foreground">出る場所:</b> {p.note}
      </p>
      <Scene d={d} place={place} />
    </div>
  );
}
