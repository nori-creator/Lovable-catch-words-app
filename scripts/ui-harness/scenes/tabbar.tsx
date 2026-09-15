/**
 * 下のタブ帯。**本物の `TabBar` を描く。**
 *
 * 以前ここは `AppShell` の `<nav>` を手で写していた。写しは必ずずれる —
 * 実物の帯を浮くカプセルに作り替えたとき、この場面だけ古い帯のままだった。
 * いまは枠と印を持つ `TabBar` を本物から読み込み、ここは**升目の中身**
 * （アイコンと文字、カメラの丸）だけを実物と同じ形で置く。
 *
 * 伸びは時間の中でしか見えないので、静止画を1枚撮っても意味がない。
 * 「押したら `index` が変わる」所まで用意して、検査の側が連続で撮れるようにする。
 */
import { useState } from "react";
import { BookOpen, Camera, Home, Settings, Sparkles } from "lucide-react";
import { TabBar } from "@/components/TabBar";

const ITEMS = [
  { label: "ホーム", icon: Home },
  { label: "図鑑", icon: BookOpen },
  { label: "撮る", icon: Camera, lens: true },
  { label: "復習", icon: Sparkles },
  { label: "設定", icon: Settings },
];

const CAMERA = ITEMS.findIndex((i) => i.lens);

export function TabBarScene() {
  const [index, setIndex] = useState(0);
  /**
   * **画面が入れ替わったことにする。**
   *
   * 実物はタブを押すと画面ごと入れ替わり、`AppShell` = 帯ごと作り直される
   * （16画面が各自 `<AppShell>` を持っているため）。作り直されると印のばねも
   * 生まれ直すので、**押したときだけ尾が出ない**という形で出ていた
   * （オーナー指摘 2026-09-15）。
   *
   * `key` を変えると React は同じことをする。ここを押せば、検査の側から
   * 実物と同じ「作り直し」を起こせる。
   */
  const [generation, setGeneration] = useState(0);
  // 実物と同じ式。カメラに近いほど印を薄くする。
  const indicatorOpacity = Math.min(1, Math.abs(index - CAMERA) / 0.85);
  return (
    <>
      {/* **行き先を変えずに作り直すだけ**の引き金。実物では画面の入れ替わりが
          読み込みの段ごとに何回も起きるので、滑っている最中の作り直しを
          検査から起こせるようにしておく。 */}
      <button data-remount-only onClick={() => setGeneration((g) => g + 1)} className="sr-only">
        remount
      </button>
      <TabBar key={generation} cursor={index} indicatorOpacity={indicatorOpacity}>
        {ITEMS.map(({ label, icon: Icon, lens }, i) => (
          <li key={label} className="flex-1">
            <button
              data-tab={i}
              data-remount={i}
              onClick={() => {
                setIndex(i);
                // 実物と同じく、押すと帯ごと作り直される。
                setGeneration((g) => g + 1);
              }}
              className={`tabbar__cell group w-full rounded-full text-caption ${
                i === index ? "text-primary-ink" : "text-muted-foreground"
              }`}
            >
              {lens ? (
                <span className="tabbar__lens-slot">
                  <span
                    className={
                      i === index
                        ? "tabbar__lens bg-primary-foreground text-primary shadow-lg shadow-primary/30 ring-2 ring-primary"
                        : "tabbar__lens bg-primary text-primary-foreground shadow-lg shadow-primary/40"
                    }
                  >
                    <Icon className="h-6 w-6" />
                  </span>
                </span>
              ) : (
                <Icon className="h-5 w-5" />
              )}
              <span>{label}</span>
            </button>
          </li>
        ))}
      </TabBar>
    </>
  );
}
