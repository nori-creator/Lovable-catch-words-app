/**
 * **誌面の並べ替え（編集中）を、下へ送った所で見る**（オーナー報告 2026-10-09「ホーム画面で
 * 文字を長押しすると青く文字のコピーになって文字を移動しにくい。また編集の完了ボタンが
 * 必ず表示されるようにして」）。
 *
 * 本番と同じく、今日の誌面は表紙が開く動き（`.album-open`）の中に居て、札が多くて縦に長い。
 * 前は「完了」が `position: fixed` でも誌面（`translate` が残る）に貼り付き、下へ送ると
 * 画面の外へ出ていた。開いた直後に下へ送るので、**完了が画面の下（下のバーの上）に
 * 見えていれば直っている**。誌面の字を長押ししても、青い選択・コピーの吹き出しは出ない。
 */
import { useEffect } from "react";
import { AppShellFrame } from "@/components/AppShell";
import { AppNavigation } from "@/components/AppNavigation";
import { DayCollage, DiaryDate } from "@/components/screens/HomeScreen";
import { wallClass } from "@/lib/wallpaper";
import { FIXTURES, makeSticker } from "./home";

/** 1日に 24 枚（字だけの札と写真の札）。誌面が画面より長くなる。 */
const MANY = Array.from({ length: 24 }, (_, i) => {
  const f = FIXTURES[i % FIXTURES.length];
  const s = makeSticker({ ...f, at: [8 + (i % 12), (i * 7) % 60] }, 700 + i, 0);
  return i % 3 === 1 ? { ...s, object_url: null, selfie_url: null, placeholder_url: null } : s;
});

export function HomeEditScene({ q }: { q: URLSearchParams }) {
  const scrollTo = Number(q.get("scroll") ?? 900);
  useEffect(() => {
    // 開いて少し待ってから下へ送る（並べ替えの途中で下の札を触っている形）。
    const id = window.setTimeout(() => {
      const root = document.querySelector<HTMLElement>("[data-app-shell]");
      window.scrollTo(0, scrollTo);
      if (root && root.scrollHeight > root.clientHeight) root.scrollTop = scrollTo;
    }, 600);
    return () => window.clearTimeout(id);
  }, [scrollTo]);
  return (
    <AppShellFrame
      navigation={
        <AppNavigation
          cursor={0}
          renderLink={(item, _i, props) => <button type="button" data-nav={item.to} {...props} />}
        />
      }
    >
      <div className="home-scene">
        {/* 本番では誌面の上に本棚（と昔の1枚の札）が在る。その高さぶん誌面が下にずれる。 */}
        <div aria-hidden className="home-shelf__box" />
        <DayCollage
          stickers={MANY}
          surface={wallClass("paper")}
          heading={<DiaryDate date={new Date()} />}
          opening
          startEditing={q.get("edit") !== "0"}
          onOpen={() => {}}
        />
      </div>
    </AppShellFrame>
  );
}
