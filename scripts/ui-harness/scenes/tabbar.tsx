/**
 * 下のタブの印。**本物の `TabIndicator` を描く。**
 *
 * 伸びは時間の中でしか見えないので、静止画を1枚撮っても意味がない。
 * ここは「押したら `cursor` が変わる」所までを本物と同じ形で用意して、
 * 検査の側が連続で撮れるようにするための足場。
 *
 * 並びは実物の `AppShell` と同じ — `relative` な `<ul>`、`flex-1` の `<li>` 5つ、
 * 印は `<ul>` の最初の子。ここがずれると、撮った絵は実物の絵ではなくなる。
 */
import { useState } from "react";
import { BookOpen, Camera, Home, Settings, Sparkles } from "lucide-react";
import { TabIndicator } from "@/components/TabIndicator";

const ITEMS = [
  { label: "ホーム", icon: Home },
  { label: "図鑑", icon: BookOpen },
  { label: "撮る", icon: Camera },
  { label: "復習", icon: Sparkles },
  { label: "設定", icon: Settings },
];

export function TabBarScene() {
  const [index, setIndex] = useState(0);
  return (
    <div className="fixed inset-x-0 bottom-0">
      <nav className="app-sheet pb-[env(safe-area-inset-bottom)]">
        <ul className="relative mx-auto flex max-w-3xl items-stretch justify-between px-2 py-2">
          <TabIndicator cursor={index} count={ITEMS.length} />
          {ITEMS.map(({ label, icon: Icon }, i) => (
            <li key={label} className="flex-1">
              <button
                data-tab={i}
                onClick={() => setIndex(i)}
                className={`group flex w-full flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-caption ${
                  i === index ? "text-primary-ink" : "text-muted-foreground"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span>{label}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
