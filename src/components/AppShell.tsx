import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Home, BookOpen, Settings, Sparkles, Camera } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { logAppEvent } from "@/lib/metrics.functions";
import { getMyProfile } from "@/lib/profile.functions";
import { getMyStats, type UserStats } from "@/lib/stats.functions";
import { formatCount } from "@/lib/count";
import { localeOf, useT, useUiLang } from "@/lib/i18n";
import { useLanguagePrefsSync } from "@/lib/use-language-prefs";
import { unlockAudio, Sound } from "@/lib/sound-engine";
import { haptic } from "@/lib/haptics";
import { PlaceMemoryWatcher } from "@/components/PlaceMemory";
import { useScrolled } from "@/hooks/use-scrolled";

type Item = {
  to: "/home" | "/dex" | "/capture" | "/review" | "/settings";
  labelKey: string;
  icon: typeof Home;
};

// 5-item bottom nav (roadmap B5): the center slot is the one big camera
// entrance.
// 2026-08-03 NORI指定で**カメラのフロー(/capture)に戻した**。撮る→自撮り→
// 候補→切り抜き→図鑑にドン、という一本道がこのアプリの体験そのものだから。
// かざして調べるスキャン(/scan)はカメラ画面の中から開ける。
const items: Item[] = [
  { to: "/home", labelKey: "nav.home", icon: Home },
  { to: "/dex", labelKey: "nav.dex", icon: BookOpen },
  { to: "/capture", labelKey: "nav.camera", icon: Camera },
  { to: "/review", labelKey: "nav.review", icon: Sparkles },
  { to: "/settings", labelKey: "nav.settings", icon: Settings },
];

/**
 * ヘッダーの丸アイコンそのもの。設定で顔写真を登録していればそれを出す。
 * 「自分の写真が毎画面にいる」ほうがアプリに愛着が湧く(NORI指定)。
 * 未設定のうちは従来のマークに落ちるので、写真が無くても崩れない。
 */
function BrandMark({ avatar }: { avatar?: string | null }) {
  if (avatar) {
    return (
      <img
        src={avatar}
        alt=""
        width={32}
        height={32}
        className="h-7 w-7 shrink-0 rounded-lg object-cover ring-1 ring-black/5"
      />
    );
  }
  return (
    // **道標であって主役ではない。** 塗りの青丸 + 影 + 太い欧文の組で、
    // 全画面を通していちばん強い視覚要素になっていた(独立監査)。
    // 視線の起点に最も強いものを置くと、その画面の主役がそこを取れない。
    // 面は薄く、字は主色に。押せることは色で分かる。
    <div className="grid h-7 w-7 place-items-center rounded-lg bg-primary/12 text-footnote font-bold text-primary-ink">
      C
    </div>
  );
}

/**
 * アイコンを押すと出る、自分の記録。
 *
 * ## なぜ要るか
 * `getMyStats`(連続日数・集めた数・レベル・今日の復習)は**書いてあるのに
 * どの画面からも呼ばれていなかった**。数えているのに誰にも見えない。
 * オーナー指摘「アイコンをタップするとそのユーザー情報が出る。ストリークとか。
 * 段階的に友達機能や投稿機能のときに使える」。
 *
 * 描く所だけを外に出して、検査の雛形から本物の見た目を撮れるようにする
 * (通信を持ったままだと雛形に載せられない)。
 */
export function UserPanel({
  name,
  avatar,
  stats,
  onClose,
}: {
  name: string;
  avatar?: string | null;
  /** まだ届いていない間は null。数字の代わりに「—」を出す。 */
  stats: UserStats | null;
  onClose: () => void;
}) {
  const t = useT();
  const uiLocale = localeOf(useUiLang());
  /**
   * まだ届いていない欄。
   *
   * **助数詞は数と一緒でなければ付けない。** 最初 `—日` と出していたが、
   * 和文では長音符・ダッシュと漢数字の一が見分けられず、
   * **「一日」と読めてしまう**(検査の絵で気づいた)。
   * 待っていることを表す記号に、意味のある値を読ませてはいけない。
   */
  const DASH = "—";
  const num = (v: number) => formatCount(v, uiLocale);
  const days = (v: number) => t("me.days", { n: num(v) });
  const rows: Array<{ key: string; label: string; value: string }> = [
    // **連続日数を先頭に置く。** 続いていること自体が戻ってくる理由になる。
    //
    // 撮った連続と復習した連続は**別の数**。先週はここに撮ったほうだけを
    // 「続いている」と出していたが、要望の「連続何日」は復習のほうだった。
    // どちらが何なのか、名前で分かるようにする。
    {
      key: "capture-streak",
      label: t("me.captureStreak"),
      value: stats ? days(stats.capture_streak) : DASH,
    },
    {
      key: "review-streak",
      label: t("me.reviewStreak"),
      value: stats ? days(stats.review_streak) : DASH,
    },
    { key: "captured", label: t("me.captured"), value: stats ? num(stats.captured_total) : DASH },
    { key: "level", label: t("me.level"), value: stats ? num(stats.level) : DASH },
    // **「今日の復習」と書いて残りの数を出していた。** 読んだ人は
    // 「今日8回やった」と読む。やった数と待っている数は別なので、別の行にする。
    {
      key: "done-today",
      label: t("me.doneToday"),
      value: stats ? num(stats.reviews_done_today) : DASH,
    },
    { key: "due", label: t("me.due"), value: stats ? num(stats.reviews_due) : DASH },
  ];
  return (
    <div className="w-64 rounded-2xl border border-border bg-card p-3 shadow-xl">
      <div className="flex items-center gap-2.5">
        <BrandMark avatar={avatar} />
        <span className="min-w-0 flex-1 truncate text-body font-semibold">{name}</span>
      </div>
      <dl className="mt-3 space-y-1.5">
        {rows.map((r) => (
          <div key={r.key} className="flex items-baseline justify-between gap-3">
            <dt className="text-footnote text-muted-foreground">{r.label}</dt>
            <dd className="text-body font-semibold tabular-nums">{r.value}</dd>
          </div>
        ))}
      </dl>
      <Link
        to="/settings"
        onClick={onClose}
        className="mt-3 grid min-h-11 w-full place-items-center rounded-full bg-secondary text-footnote font-medium"
      >
        {t("nav.settings")}
      </Link>
    </div>
  );
}

/** アイコン + 押したときに開く記録。状態と通信はここが持つ。 */
function BrandMenu() {
  const t = useT();
  const fetchProfile = useServerFn(getMyProfile);
  const fetchStats = useServerFn(getMyStats);
  const [open, setOpen] = useState(false);
  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: () => fetchProfile(),
    staleTime: 5 * 60 * 1000,
  });
  // **開くまで数えない。** どの画面にも出るヘッダーなので、
  // 常に取りに行くと全画面が1本ずつ余計な問い合わせを持つことになる。
  const { data: stats } = useQuery({
    queryKey: ["my-stats"],
    queryFn: () => fetchStats(),
    enabled: open,
    staleTime: 60_000,
  });
  const p = profile as { avatar_url?: string | null; display_name?: string | null } | undefined;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={t("me.open")}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-xl active:scale-95 motion-reduce:active:scale-100"
      >
        <BrandMark avatar={p?.avatar_url} />
      </button>
      {open && (
        <>
          {/* 外を触ったら閉じる。読み上げには出さない(閉じる手立ては
              下のボタンではなく Esc と外側の指なので、名前を付けても
              たどり着けるものが増えない)。 */}
          <div className="fixed inset-0 z-40" aria-hidden="true" onClick={() => setOpen(false)} />
          <div className="absolute left-3 top-[calc(100%+0.25rem)] z-50">
            <UserPanel
              name={p?.display_name || t("me.you")}
              avatar={p?.avatar_url}
              stats={(stats as UserStats | undefined) ?? null}
              onClose={() => setOpen(false)}
            />
          </div>
        </>
      )}
    </>
  );
}

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const logEvent = useServerFn(logAppEvent);
  const t = useT();
  const scrolled = useScrolled();

  /**
   * **プロフィールの言語設定を端末に写す。**
   *
   * ここでやるのは、`AppShell` が全画面の親だから。設定画面だけの責任に
   * すると、**設定を一度も開かない人には学習言語が伝わらない** —
   * それで「英語を選んだのに台湾華語しか出ない」が起きていた。
   */
  useLanguagePrefsSync();

  // KPI (roadmap §3): one app_open per local day → D1/D7 retention source.
  useEffect(() => {
    try {
      const today = new Date().toLocaleDateString("en-CA");
      if (localStorage.getItem("kpi-app-open") !== today) {
        localStorage.setItem("kpi-app-open", today);
        void logEvent({ data: { kind: "app_open" } }).catch(() => {});
      }
    } catch {
      /* storage unavailable */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-background pb-[calc(6rem+env(safe-area-inset-bottom))]">
      {/* Top chrome — a translucent material the content scrolls under (§12).
          区切り線は常設しない: 中身が実際に下に潜り込んだときだけ、柔らかい
          縁がふわっと出る。何も潜っていないうちは境目そのものが無い。 */}
      <header
        data-scrolled={scrolled ? "true" : undefined}
        className="scroll-edge sticky top-0 z-30 bg-background/70 backdrop-blur-xl backdrop-saturate-150 pt-[env(safe-area-inset-top)]"
      >
        {/* 高さは `--app-header-h` に固定する。図鑑の部屋見出しがこの下端で
            止まる約束になっているので、ここが伸び縮みすると見出しが裏に潜る。 */}
        {/* `relative` は開いた記録の錨。ヘッダーの行の下にぶら下げる。 */}
        <div className="relative mx-auto flex min-h-[var(--app-header-h)] max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            {/* **アイコンはホームへの近道ではなく、自分の記録の入口。**
                以前はアイコンごと `/home` の Link に入れていたが、
                押せるものの中に押せるものを入れることになるうえ、
                アイコンを押した人は必ずホームへ飛ばされていた。
                行き先は名前のほうが持つ。 */}
            <BrandMenu />
            <Link to="/home" className="transition-transform duration-150 active:scale-95">
              {/* §15: app title is a small headline — tight tracking, no wrapping.
                  **ここは h1 にしない。** 一度 h1 にしたが、ホーム・復習・
                  単語カードにはすでに h1 があるので、**全ページが h1 を2つ
                  持つ**ことになった — 直そうとした階層をむしろ壊していた。
                  これはどの画面にも出るアプリ名(道標)であって、その画面の
                  見出しではない。h1 は各画面が自分で持つ。 */}
              <span className="text-body font-medium tracking-[-0.01em] text-muted-foreground">
                {title ?? "Catchwords"}
              </span>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-4">{children}</main>

      {/* 場所による思い出し。どの画面にいても効くよう、殻の側に置く。
          設定でONにした人だけ動く(既定はOFF)。 */}
      <PlaceMemoryWatcher />

      {/* 下のタブ帯。**後ろは透けない(NORI指定)。** `.app-sheet` は上端の
          明るい線と上向きの影だけを持つ不透明な面で、浮いていることは
          縁と影で伝える。 */}
      <nav className="app-sheet fixed inset-x-0 bottom-0 z-40 pb-[env(safe-area-inset-bottom)]">
        <ul className="mx-auto flex max-w-3xl items-stretch justify-between px-2 py-2">
          {items.map(({ to, labelKey, icon: Icon }) => {
            const label = t(labelKey);
            const isScan = to === "/capture";
            return (
              <li key={to} className="flex-1">
                <Link
                  to={to}
                  data-nav={to}
                  onClick={() => {
                    // §13 multimodal feedback on the causal event; the camera
                    // entrance also primes audio for the scan/catch chimes.
                    if (isScan) {
                      unlockAudio();
                      Sound.tap();
                      haptic("medium");
                    } else {
                      Sound.pageSnap();
                      haptic("selection");
                    }
                  }}
                  // §1 Response: react on press, not release.
                  className="group flex flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-caption text-muted-foreground transition-colors"
                  activeProps={{ className: "text-primary" }}
                >
                  {isScan ? (
                    // **主色そのもの(NORI指定)。** 以前は右下へ向かって
                    // 22% の黒を混ぜるグラデーションで、丸の下半分が沈んで
                    // 設定の青より暗く見えていた。同じ画面に同じ青が2種類
                    // 並ぶのをやめる。白のアイコンは主色の上の文字と同じ
                    // 組み合わせになるので、読みやすさは主色の側で保証される。
                    <span className="-mt-7 grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/40 ring-4 ring-background transition-transform duration-150 [transition-timing-function:var(--spring-bounce)] group-active:scale-90">
                      <Icon className="h-6 w-6" />
                    </span>
                  ) : (
                    <Icon className="h-5 w-5 transition-transform duration-150 group-active:scale-90" />
                  )}
                  <span>{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

// Legacy re-export kept so any dead references still compile.
export { BookOpen };
