import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { DexCalendar } from "@/components/DexCalendar";
import { stickerDayKey } from "@/lib/dex-filter";
import { stickerPhotoUrl } from "@/lib/sticker-photo";
import { monthCells } from "@/lib/day-timeline";
import { FIXTURES, makeSticker } from "./home";

/**
 * **図鑑の地図の「暦」のデザイン案**（オーナー指示 2026-09-27「図鑑マップの
 * カレンダーのデザイン案を複数出して」）。
 *
 * どれも「日を選ぶと、地図がその日の立ち寄りに替わる」ための暦。地図の上に
 * 下から出る形で並べる（後ろの地図が見えているかも比べどころ）。
 *
 *  A 今の形 … 月の升に写真
 *  B 週の帯 … 地図をほぼ隠さない。横に払って前後の週へ
 *  C 丸い写真の月 … 撮った日だけ丸い写真、枚数の小さな数字
 *  D 1年の点 … 撮った量を色の濃さで。長く続けた人ほど見て楽しい
 */
const DAYS: Array<[number, number[]]> = [
  [0, [0, 1, 2, 3, 4, 5]],
  [1, [2]],
  [3, [1, 4]],
  [4, [5]],
  [7, [0, 3, 6]],
  [9, [2]],
  [12, [1, 5]],
  [20, [3]],
  [33, [0, 2]],
  [41, [4]],
];
const VARIANTS = [
  { key: "a", label: "A 今の形" },
  { key: "b", label: "B 週の帯" },
  { key: "c", label: "C 丸い写真" },
  { key: "d", label: "D 1年の点" },
] as const;
type Key = (typeof VARIANTS)[number]["key"];

const blue = "#0a84ff";
const ink = "#0b1220";
const sub = "#6b7280";
const sheet: CSSProperties = {
  position: "absolute",
  insetInline: 0,
  bottom: 0,
  borderRadius: "24px 24px 0 0",
  background: "rgba(255,255,255,0.94)",
  backdropFilter: "blur(18px)",
  boxShadow: "0 -10px 30px rgba(0,0,0,0.12)",
  padding: "14px 16px 28px",
  color: ink,
};

function FakeMap() {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        background:
          "linear-gradient(90deg, transparent 48%, #fff 48%, #fff 52%, transparent 52%), linear-gradient(0deg, transparent 58%, #fff 58%, #fff 61%, transparent 61%), linear-gradient(30deg, transparent 70%, #fdf6e3 70%, #fdf6e3 73%, transparent 73%), #e8ecef",
      }}
    >
      {[
        [30, 22],
        [62, 35],
        [45, 55],
      ].map(([x, y], i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            left: `${x}%`,
            top: `${y}%`,
            width: 44,
            height: 44,
            borderRadius: 999,
            border: `3px solid ${blue}`,
            background: "#cbd5e1",
          }}
        />
      ))}
    </div>
  );
}

export function MapCalendarDesignsScene({ q }: { q: URLSearchParams }) {
  const [v, setV] = useState<Key>(VARIANTS.find((o) => o.key === q.get("v"))?.key ?? "b");
  const stickers = useMemo(
    () =>
      DAYS.flatMap(([day, idx]) =>
        idx.filter((i) => FIXTURES[i]).map((i) => makeSticker(FIXTURES[i], i, day)),
      ),
    [],
  );
  const byDay = useMemo(() => {
    const m = new Map<string, typeof stickers>();
    for (const s of stickers) {
      const k = stickerDayKey(s.created_at);
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    return m;
  }, [stickers]);
  const today = stickerDayKey(new Date().toISOString());
  const [picked, setPicked] = useState(today);
  const photoOf = (k: string) => {
    const s = byDay.get(k)?.[0];
    return s ? stickerPhotoUrl(s, { thumb: true }) : null;
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1, overflow: "hidden" }}>
      <FakeMap />
      <div
        role="radiogroup"
        aria-label="暦の案"
        style={{
          position: "absolute",
          top: 72,
          left: 12,
          right: 12,
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          zIndex: 5,
        }}
      >
        {VARIANTS.map((o) => (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={v === o.key}
            onClick={() => setV(o.key)}
            style={{
              minHeight: 44,
              padding: "0 14px",
              borderRadius: 999,
              border: "1px solid rgba(0,0,0,0.12)",
              background: v === o.key ? blue : "rgba(255,255,255,0.92)",
              color: v === o.key ? "#fff" : ink,
              fontWeight: 600,
            }}
          >
            {o.label}
          </button>
        ))}
      </div>

      {v === "a" && (
        <div style={{ ...sheet, maxHeight: "78vh", overflowY: "auto" }}>
          <DexCalendar
            stickers={stickers}
            onOpen={() => {}}
            todayKey={today}
            onPickDay={setPicked}
          />
        </div>
      )}

      {v === "b" && (
        <WeekStrip
          byDay={byDay}
          today={today}
          picked={picked}
          onPick={setPicked}
          photoOf={photoOf}
        />
      )}
      {v === "c" && (
        <PhotoMonth
          byDay={byDay}
          today={today}
          picked={picked}
          onPick={setPicked}
          photoOf={photoOf}
        />
      )}
      {v === "d" && <YearDots byDay={byDay} today={today} picked={picked} onPick={setPicked} />}
    </div>
  );
}

type DayProps = {
  byDay: Map<string, unknown[]>;
  today: string;
  picked: string;
  onPick: (k: string) => void;
  photoOf: (k: string) => string | null;
};

const keyOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** B: 週の帯。地図を9割見せたまま、横に払って日を選ぶ。 */
function WeekStrip({ byDay, today, picked, onPick, photoOf }: DayProps) {
  // 今日（右端）から見せる。
  const strip = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (strip.current) strip.current.scrollLeft = strip.current.scrollWidth;
  }, []);
  const days = Array.from({ length: 21 }, (_, i) => {
    const d = new Date(`${today}T00:00:00`);
    d.setDate(d.getDate() - 20 + i);
    return d;
  });
  return (
    <div style={{ ...sheet, padding: "12px 0 26px" }}>
      <p style={{ padding: "0 16px", fontWeight: 700 }}>
        {new Date(`${picked}T00:00:00`).toLocaleDateString("ja-JP", {
          month: "long",
          day: "numeric",
          weekday: "short",
        })}
        <span style={{ color: sub, fontWeight: 500, marginLeft: 8, fontSize: 13 }}>
          {byDay.get(picked)?.length ?? 0}枚
        </span>
      </p>
      <div
        ref={strip}
        style={{
          display: "flex",
          gap: 8,
          overflowX: "auto",
          padding: "10px 16px 0",
          scrollSnapType: "x mandatory",
        }}
      >
        {days.map((d) => {
          const k = keyOf(d);
          const on = k === picked;
          const photo = photoOf(k);
          return (
            <button
              key={k}
              type="button"
              onClick={() => onPick(k)}
              style={{
                flex: "0 0 52px",
                scrollSnapAlign: "center",
                display: "grid",
                justifyItems: "center",
                gap: 4,
                padding: "6px 0",
                borderRadius: 16,
                border: 0,
                background: on ? blue : "transparent",
                color: on ? "#fff" : ink,
              }}
            >
              <span style={{ fontSize: 11, opacity: 0.75 }}>
                {d.toLocaleDateString("ja-JP", { weekday: "narrow" })}
              </span>
              <span style={{ fontWeight: 700 }}>{d.getDate()}</span>
              {photo ? (
                <img
                  src={photo}
                  alt=""
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 999,
                    objectFit: "cover",
                    border: "2px solid #fff",
                  }}
                />
              ) : (
                <span style={{ width: 30, height: 30 }} />
              )}
              {k === today && !on && (
                <span style={{ width: 5, height: 5, borderRadius: 9, background: blue }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** C: 丸い写真の月。撮った日だけが写真の丸、枚数は右上の小さな数字。 */
function PhotoMonth({ byDay, today, picked, onPick, photoOf }: DayProps) {
  const d0 = new Date(`${today}T00:00:00`);
  const [ym, setYm] = useState({ y: d0.getFullYear(), m: d0.getMonth() });
  const cells = monthCells(ym.y, ym.m);
  const shift = (n: number) =>
    setYm((c) => {
      const d = new Date(c.y, c.m + n, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  return (
    <div style={sheet}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button type="button" onClick={() => shift(-1)} style={navBtn}>
          ‹
        </button>
        <p style={{ fontWeight: 700, fontSize: 18 }}>
          {ym.y}年{ym.m + 1}月
        </p>
        <button type="button" onClick={() => shift(1)} style={navBtn}>
          ›
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginTop: 8 }}>
        {["日", "月", "火", "水", "木", "金", "土"].map((w) => (
          <span key={w} style={{ textAlign: "center", fontSize: 11, color: sub }}>
            {w}
          </span>
        ))}
        {cells.map((c, i) => {
          if (!c) return <span key={i} />;
          const k = keyOf(new Date(ym.y, ym.m, c));
          const n = byDay.get(k)?.length ?? 0;
          const photo = n ? photoOf(k) : null;
          const on = k === picked;
          const dayNum = Number(k.slice(8));
          return (
            <button
              key={k}
              type="button"
              disabled={!n}
              onClick={() => onPick(k)}
              style={{
                position: "relative",
                aspectRatio: "1",
                borderRadius: 999,
                border: on ? `3px solid ${blue}` : k === today ? `2px solid ${blue}55` : "0",
                padding: 0,
                background: photo ? `center / cover url("${photo}")` : "transparent",
                color: photo ? "#fff" : n ? ink : "#9ca3af",
                fontWeight: 700,
                textShadow: photo ? "0 1px 3px rgba(0,0,0,.6)" : "none",
              }}
            >
              {dayNum}
              {n > 1 && (
                <span
                  style={{
                    position: "absolute",
                    top: -4,
                    right: -4,
                    minWidth: 18,
                    height: 18,
                    borderRadius: 9,
                    background: blue,
                    color: "#fff",
                    fontSize: 11,
                    lineHeight: "18px",
                    textShadow: "none",
                  }}
                >
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
const navBtn: CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 999,
  border: 0,
  background: "rgba(0,0,0,0.05)",
  fontSize: 22,
};

/** D: 1年の点。撮った量ほど濃い青。続けた日々が一目で分かる。 */
function YearDots({ byDay, today, picked, onPick }: Omit<DayProps, "photoOf">) {
  const end = new Date(`${today}T00:00:00`);
  const weeks = 18;
  // 日曜始まりの列に揃える（今日が入る列が右端）。
  const start = new Date(end);
  start.setDate(start.getDate() - weeks * 7);
  start.setDate(start.getDate() - start.getDay());
  const cols = Array.from({ length: weeks + 1 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const x = new Date(start);
      x.setDate(start.getDate() + w * 7 + d);
      return x;
    }),
  );
  const shade = (n: number) =>
    n === 0 ? "#e5e7eb" : n === 1 ? "#bfdbfe" : n <= 2 ? "#60a5fa" : n <= 4 ? "#2563eb" : "#1e3a8a";
  const total = [...byDay.values()].reduce((a, l) => a + l.length, 0);
  return (
    <div style={sheet}>
      <p style={{ fontWeight: 700 }}>
        この{weeks}週で {total}語
        <span style={{ color: sub, fontWeight: 500, fontSize: 13, marginLeft: 8 }}>
          {byDay.size}日撮った
        </span>
      </p>
      <div style={{ display: "flex", gap: 3, marginTop: 10, overflowX: "auto" }}>
        {cols.map((col, i) => (
          <div key={i} style={{ display: "grid", gap: 3 }}>
            {col.map((d) => {
              const k = keyOf(d);
              if (d > end) return <span key={k} style={{ width: 14, height: 14 }} />;
              const n = byDay.get(k)?.length ?? 0;
              return (
                <button
                  key={k}
                  type="button"
                  aria-label={`${k} ${n}枚`}
                  disabled={!n}
                  onClick={() => onPick(k)}
                  style={{
                    width: 14,
                    height: 14,
                    padding: 0,
                    border: k === picked ? `2px solid ${ink}` : 0,
                    borderRadius: 4,
                    background: shade(n),
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
      <p style={{ marginTop: 10, fontSize: 13, color: sub }}>
        選んだ日: {picked.slice(5).replace("-", "/")}（{byDay.get(picked)?.length ?? 0}枚）
      </p>
    </div>
  );
}
