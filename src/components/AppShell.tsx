import { Link, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Home, BookOpen, Settings, Sparkles, Camera } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { logAppEvent } from "@/lib/metrics.functions";
import { getMyProfile } from "@/lib/profile.functions";
import { getMyStats, type UserStats } from "@/lib/stats.functions";
import { formatCount } from "@/lib/count";
import { localeOf, useT, useUiLang } from "@/lib/i18n";
import { useLanguagePrefsSync, useRefreshOnTargetLanguage } from "@/lib/use-language-prefs";
import { unlockAudio, Sound } from "@/lib/sound-engine";
import { haptic } from "@/lib/haptics";
import { PlaceMemoryWatcher } from "@/components/PlaceMemory";
import { useScrolled } from "@/hooks/use-scrolled";
import { useSwipeBack, useTabSwipe } from "@/hooks/use-tab-swipe";
import { TabBar } from "@/components/TabBar";
import { playCameraLaunch } from "@/lib/camera-launch";
import { useWarmCamera } from "@/hooks/use-warm-camera";

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

export function AppShell({
  children,
  title,
  fixedViewport = false,
  bare = false,
  surface = "app",
}: {
  children: ReactNode;
  title?: string;
  /** 復習など、1画面の中ですべてを見せる場面ではページ自体を動かさない。 */
  fixedViewport?: boolean;
  /**
   * 上の帯を出さない（オーナー指示 2026-09-16「カメラのとき、上の
   * 集めるの余白いらない。すべてカメラ画面でいい」）。
   *
   * カメラは**世界を覗く**画面なので、上に半透明の帯が乗ると映像が
   * その高さぶん削られる。しかも帯に出る名前は下の撮り方の帯が
   * すでに言っている。下のタブ帯は残す — カメラから出る道が要る。
   */
  bare?: boolean;
  /**
   * 画面の地（オーナー指示 2026-09-17「本物のアルバムや雑誌の雰囲気を
   * 作り上げて」）。
   *
   * ホームは**1冊の雑誌のページ**なので、紙が画面いっぱいに在ってほしい。
   * ここを既定の `--background`（アプリの青みがかった地）のままにすると、
   * 紙がその上に浮いた1枚の板に見えて、雑誌ではなく管理画面に戻る。
   *
   * 上の帯は半透明のまま（`material-thin`）なので、紙の上を中身が潜る。
   */
  surface?: "app" | "paper";
}) {
  const logEvent = useServerFn(logAppEvent);
  const t = useT();
  const scrolled = useScrolled();
  const navigate = useNavigate();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  /**
   * 横スワイプで隣の画面へ(オーナー指示 2026-09-13)。
   *
   * 下のバーの5つ**そのものが並び順**。ここで別の配列を書くと、
   * バーの順とスワイプの順がずれる — このアプリで何度もやっている
   * 「同じことを2箇所に書いて片方だけ直す」形になる。
   *
   * タブ以外の画面(単語の詳細など)は右へスワイプで**戻る**。
   */
  /**
   * いまその行き先に居るか。**判定はここ1箇所**。
   *
   * 末尾の `/` が付くことがある（`/capture` と `/capture/` の両方が来る）。
   * 並びの番号を出す所だけがそれを見ていて、**押した時の判定と、カメラの丸の
   * 色の判定は素の `===` のまま**だった。だからカメラの画面に居るのに
   * 「居ない」と判断され、押すたびに演出がもう一度走っていた
   * （オーナー報告 2026-09-15「2回目カメラボタン押した時にすでに表示されて
   * いるのにもう1回重ねてカメラのアニメーションが表示されてる」）。
   * 同じことを3箇所に書けば、いつか2箇所だけ直る。
   */
  const atPath = (to: string) => pathname === to || pathname === `${to}/`;
  const tabIndex = items.findIndex((i) => atPath(i.to));
  /**
   * いま**カメラの機械の中に居るか**。帯の色と、横払いの持ち主を決める
   * （オーナー指示 2026-09-16「下のバーも撮影モードのときはこのような
   *  色にして」）。撮る・調べる・読み取るは同じ一台の3つのモード。
   */
  const onCameraScreen = atPath("/capture") || atPath("/scan");
  const { progress } = useTabSwipe({
    /**
     * **カメラの中では、横に払うのはタブの切り替えではない。**（オーナー指示
     * 2026-09-16「スライドしたら検索、スキャンに変更できる」）
     *
     * カメラの画面では横払いが**撮り方の帯**の物になる。両方が同じ指の
     * 動きを取ると、撮り方を変えたつもりで復習の画面へ飛ぶ。
     */
    enabled: !onCameraScreen,
    index: tabIndex,
    count: items.length,
    onCommit: (n) => {
      const next = items[n];
      if (!next) return;
      Sound.pageSnap();
      haptic("selection");
      void navigate({ to: next.to });
    },
  });
  useSwipeBack({ enabled: tabIndex < 0, onBack: () => router.history.back() });
  // 指の位置(小数)。バーの印と色はこれ1つから決まる。
  const cursor = tabIndex < 0 ? -1 : tabIndex + progress;
  /**
   * **カメラの升目には印を乗せない**（オーナー指示 2026-09-15
   * 「青いバブルで囲うのではなく、カメラのアイコンの中の色を変えてほしい」）。
   *
   * 出す・消すの2値にしない。指で払っている最中はカメラの上を**通過する**
   * ので、2値だと真ん中で印がぱっと消えてぱっと戻る。近づくほど薄れ、
   * 離れるほど戻る濃さで渡せば、通り過ぎる動き自体は途切れない。
   * 0.85 升ぶん手前から薄れ始める。
   */
  const cameraIndex = items.findIndex((i) => i.to === "/capture");
  const indicatorOpacity = cursor < 0 ? 0 : Math.min(1, Math.abs(cursor - cameraIndex) / 0.85);

  /**
   * **プロフィールの言語設定を端末に写す。**
   *
   * ここでやるのは、`AppShell` が全画面の親だから。設定画面だけの責任に
   * すると、**設定を一度も開かない人には学習言語が伝わらない** —
   * それで「英語を選んだのに台湾華語しか出ない」が起きていた。
   */
  /**
   * **撮る画面を、暇なうちに取っておく**（`hooks/use-warm-camera.ts`）。
   * 押してから取りに行くと、着くまで前の画面が出たままになる（実測5秒）。
   */
  useWarmCamera();

  useLanguagePrefsSync();
  // 学習言語を切り替えたら、その言語で絞っている一覧を全部読み直す
  // (アルバム・図鑑・復習・記憶・単語帳)。判断は1箇所。
  useRefreshOnTargetLanguage();

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
    <div
      className={
        fixedViewport
          ? `h-dvh overflow-hidden ${surface === "paper" ? "app-paper" : "bg-background"}`
          : `min-h-screen pb-[calc(6rem+env(safe-area-inset-bottom))] ${
              surface === "paper" ? "app-paper" : "bg-background"
            }`
      }
    >
      {/* Top chrome — a translucent material the content scrolls under (§12).
          区切り線は常設しない: 中身が実際に下に潜り込んだときだけ、柔らかい
          縁がふわっと出る。何も潜っていないうちは境目そのものが無い。 */}
      {!bare && (
        <header
          data-scrolled={scrolled ? "true" : undefined}
          className="scroll-edge sticky top-0 z-30 material-thin pt-[env(safe-area-inset-top)]"
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
      )}

      <main
        className={
          bare
            ? "h-dvh"
            : fixedViewport
              ? "mx-auto flex h-[calc(100dvh-var(--app-header-h)-env(safe-area-inset-top)-6rem-env(safe-area-inset-bottom))] max-w-3xl flex-col overflow-hidden px-4 py-2"
              : "mx-auto max-w-3xl px-4 py-4"
        }
      >
        {children}
      </main>

      {/* 場所による思い出し。どの画面にいても効くよう、殻の側に置く。
          設定でONにした人だけ動く(既定はOFF)。 */}
      <PlaceMemoryWatcher />

      <TabBar cursor={cursor} indicatorOpacity={indicatorOpacity} onCamera={onCameraScreen}>
        {items.map(({ to, labelKey, icon: Icon }, i) => {
          const label = t(labelKey);
          const isScan = to === "/capture";
          /**
           * いま**カメラの機械の中に居るか**。カメラの丸を下から消すのに使う。
           *
           * 「このタブの行き先に居るか」ではない。撮る・調べる・読み取るは
           * 同じ一台の3つのモードで、`/scan` は行き先が別なだけ。行き先で
           * 判定すると、読み取り中だけ丸が下に戻ってきて**シャッターと
           * 下の丸が同時に在る**ことになる（オーナー報告 2026-09-16
           * 「スキャンのとき、検索のときも下のバーのカメラあいこん
           * ひょうじしなくていい。カメラのとき同じように」）。
           * 調べるは `/capture?mode=search` なので、道が同じここで一緒に片付く。
           *
           * 並びの番号(`tabIndex`)と指で払う順は**5つの行き先のまま**にする。
           * `/scan` はタブではないので、そこへ混ぜると順が狂う。
           */
          const isCurrent = isScan ? onCameraScreen : atPath(to);
          // 近いほど主色に寄る。指の途中でも色が「移っている」ように見える。
          const weight = cursor < 0 ? 0 : Math.max(0, 1 - Math.abs(i - cursor));
          return (
            <li key={to} className="flex-1">
              <Link
                to={to}
                data-nav={to}
                onClick={(event) => {
                  // §13 multimodal feedback on the causal event; the camera
                  // entrance also primes audio for the scan/catch chimes.
                  if (isScan) {
                    /**
                     * **押した瞬間に画面を変える。**（オーナー指摘 2026-09-15
                     * 「カメラの遅延も改善して」）
                     *
                     * 以前はここで `event.preventDefault()` して
                     * `setTimeout(…, 520)` を待ってから移っていた。つまり
                     * **押してから半秒、何も起きない**。しかも「動きを減らす」
                     * 設定を見ていないので、その設定の人は演出だけ 220ms に
                     * 縮んで、待ち時間 520ms だけが残っていた。
                     *
                     * Apple の指針（WWDC18 *Designing Fluid Interfaces*）は
                     * 逆で、**応答は押した瞬間に始め、演出は移動と同時に走らせる**。
                     * レンズが開く絵はそのまま出すが、遷移は止めない —
                     * `camera-launch` は `position: fixed` の覆いなので、
                     * 画面が変わっても上に残って開ききる。
                     */
                    /**
                     * **演出は React の外で出す**（`lib/camera-launch.ts`）。
                     * ここで状態に持つと、画面が入れ替わった瞬間に
                     * `AppShell` ごと消えて演出が道連れになる — オーナー指摘
                     * 「最初だけで2回目とか押すと表示されなくなる」の正体。
                     *
                     * **入れ替えの頃合いは演出側が決める**（オーナー報告
                     * 2026-09-16「カメラの黒い画面に移行し、その上から同じ
                     * 画面のアニメーションが出て2重になってる。今開いてる
                     * 画面からカメラのアニメーションが出るようにして」）。
                     *
                     * 行き先を先に温めてある（`useWarmCamera`）ので、押した
                     * 瞬間に移ると**まだ小さい板の後ろに行き先の黒い面が出る**。
                     * 板が画面の真ん中を覆うまで待ってから入れ替えれば、
                     * 押した画面の上で育つ絵になる。待ちは 320ms だが、
                     * 動き自体は押した瞬間に始まっているので「無反応の半秒」
                     * には戻らない。
                     */
                    if (!isCurrent) {
                      event.preventDefault();
                      playCameraLaunch(() => void navigate({ to }));
                    }
                    unlockAudio();
                    Sound.tap();
                    haptic("medium");
                  } else {
                    Sound.pageSnap();
                    haptic("selection");
                  }
                }}
                // §1 Response: react on press, not release.
                className="tabbar__cell group w-full rounded-full text-caption text-muted-foreground transition-colors"
                // **`text-primary` ではなく `text-primary-ink`。**
                // 11px の字は 4.5:1 が要る。主色そのものは白地の上で
                // 3.69:1 しか無く、印のカプセルが乗ると 3.18:1 まで落ちた
                // (絵の検査の実測)。`--primary-ink` は主色に前景色を
                // 混ぜた「字用の主色」で、この用途のために在る。
                activeProps={{ className: "text-primary-ink" }}
                style={
                  weight > 0 && !isScan
                    ? {
                        color: `color-mix(in oklab, var(--primary-ink) ${Math.round(weight * 100)}%, var(--muted-foreground))`,
                      }
                    : undefined
                }
              >
                {isScan && !isCurrent ? (
                  /**
                   * **カメラは印で囲わない。中の色が変わる。**
                   * （オーナー指示 2026-09-15「カメラのアイコンの色を変化して
                   * 欲しいんじゃなくて、…青いバブルで囲うのではなく、カメラの
                   * アイコンの中の色を変えてほしい」）
                   *
                   * 前の版は丸の白さを 70% → 100% に上げるだけだった。
                   * **同じ白の濃淡は「色が変わった」と読まれない** — 並べて
                   * 撮ると差が分からない。丸の**中身を入れ替える**:
                   *   ・居ないとき … 主色の丸 ＋ 白い絵
                   *   ・居るとき   … 白い丸 ＋ 主色の絵（＋主色の輪）
                   * 見分けは色そのもので付き、字とのコントラストは
                   * 入れ替えても同じ比のまま落ちない。
                   */
                  <span className="tabbar__lens-slot">
                    {/*
                      **カメラの画面に居る間、この丸は下に居ない。**
                      （オーナー指示 2026-09-16「下のカメラのアイコンが
                       そのままシャッターボタンになるようにして。つまり
                       下のカメラのアイコンが上に移動し下にはカメラの
                       アイコンなくなる」）

                      丸はシャッターへ移った、という筋を通す。両方に在ると
                      「同じ物が2つある」ことになり、上へ動いた意味が消える。
                      押す所そのものは升目が持っているので、カメラから
                      出られなくなることはない。
                    */}
                    <span className="tabbar__lens bg-primary text-primary-foreground shadow-lg shadow-primary/40">
                      <Icon className="h-6 w-6" />
                    </span>
                  </span>
                ) : (
                  /**
                   * カメラの機械に居る間、この升目は**ふつうの絵に戻る**
                   * （オーナー指示 2026-09-16、参考画像のとおり）。
                   *
                   * 丸はシャッターへ移っているので、下に丸は要らない。
                   * ただし**絵まで消すと、どこに居るかが帯から読めない** —
                   * 前の版は丸ごと隠していて、カメラの升目だけ空白だった。
                   * 選ばれている升目として、主色の絵と字を出す。
                   */
                  <Icon
                    className={`h-5 w-5 transition-transform duration-150 group-active:scale-90 ${
                      isScan && isCurrent ? "text-primary" : ""
                    }`}
                  />
                )}
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </TabBar>
    </div>
  );
}

// Legacy re-export kept so any dead references still compile.
export { BookOpen };
