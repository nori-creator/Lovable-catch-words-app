import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { DEFAULT_TARGET_LANGUAGE, TARGET_LANGUAGES } from "@/lib/target-lang";
import { setTargetLang, storedTargetLang } from "@/lib/target-lang-pref";
import {
  getStoredReviewMode,
  setStoredReviewMode,
  resolveReviewMode,
} from "@/lib/review-mode-pref";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { LoadFailed } from "@/components/LoadFailed";
import {
  clearMyAvatar,
  deleteMyAccount,
  getMyProfile,
  setMyAvatar,
  updateMyProfile,
} from "@/lib/profile.functions";
import { getMyScanMetrics } from "@/lib/metrics.functions";
import { checkIsAdmin } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useTheme } from "@/components/theme-provider";
import { useReadingPref, setReadingPref, readingLabelKey } from "@/lib/phonetic";
import { targetProfile } from "@/lib/target-profile";
import { levelOptions, restoreLevel } from "@/lib/level-scale";
import { UI_LANGS, UI_LANG_LABEL_KEYS, TARGET_LANG_LABEL_KEYS, normalizeUiLang } from "@/lib/i18n";
import { useT, setUiLang, storedUiLang } from "@/lib/i18n";
import { reconcileLanguage } from "@/lib/language-sync";
import { storedLevels, setStoredLevels } from "@/lib/level-pref";
import { restoreSettings } from "@/lib/settings-restore";
import { normalizeReviewMode, type ReviewModePref } from "@/lib/review-format";
import { getPhotoPref, setPhotoPref, type PhotoPref } from "@/lib/photo-pref";
import {
  clearCatchTimings,
  getCatchSpeed,
  readCatchTimings,
  setCatchSpeed,
  summarizeCatchTimings,
  type CatchSpeed,
  type CatchTimingSummary,
} from "@/lib/catch-speed";
import { pickL1 } from "@/lib/l1";
import { readerL1 } from "@/lib/reader-language";
import { UI_THEMES, getUiTheme, setUiTheme, type UiThemeId } from "@/lib/ui-theme";
import {
  isPlaceReminderEnabled,
  setPlaceReminderEnabled,
  requestNotificationPermissionDetailed,
} from "@/lib/place-reminder";
import { getAiModelConfig, setAiModelConfig } from "@/lib/admin.functions";
import { downscaleDataUrl } from "@/lib/cutout";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, Loader2, Trash2, User } from "lucide-react";
import { tStatic } from "@/lib/i18n";
import {
  Sound,
  getLevel,
  setLevel,
  unlockAudio,
  type Level as SoundLevel,
} from "@/lib/sound-engine";
import { areHapticsEnabled, setHapticsEnabled, haptic } from "@/lib/haptics";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: tStatic("page.settings") }] }),
  component: SettingsPage,
});

// ============================================================================
// 設定画面の組み立て部品
//
// この画面は「見出し付きの箱」「丸いボタンの列」「選択肢」の3つの形しか
// 使っていないのに、**同じ markup が7回ずつ書き写されていた**。
// 書き写しは静かにずれる(実際、余白と補足文の有無が箇所ごとに違っていた)。
// 部品にして、検査のハーネスからも本物のまま描けるようにする。
// ============================================================================

/** 見出し付きの箱。設定はこの箱の連なりでできている。 */
export function SettingsCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    /* **章題は札の外・小さく置く。**
     *
     * これまで章題は札の中にあり、`text-body`(15px)の灰色。中の行の見出しも
     * 同じ `text-body`(15px)だが**黒**なので、束ねる側が束ねられる側より
     * 弱く見えていた(独立監査が2周続けて指摘した親子の逆転)。
     *
     * 純正の設定は章題を「小さい・灰色・札の外」に置く。大きさと位置の
     * 両方で「これは見出しである」と言うので、色だけに頼らない。
     * 6段の階調は既にあったので、footnote(13px)を当てるだけで足りる。 */
    <section>
      <h3 className="mb-1.5 px-1 text-footnote font-semibold text-muted-foreground">{title}</h3>
      <div className="rounded-2xl border border-border bg-card p-4">{children}</div>
    </section>
  );
}

// **並びの数は数え上げで書く。** `grid-cols-${n}` のように実行時に組み立てた
// 名前は Tailwind から見えず、その CSS は生成されない(同じ穴を凡例の点で
// 一度踏んだ)。
const CHOICE_COLS = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  // **文字で書く。** `grid-cols-${n}` のように組み立てると Tailwind が
  // その名前を見つけられず、そのクラスだけ生成されない。
  4: "grid-cols-4",
  5: "grid-cols-5",
} as const;

/**
 * 丸いボタンで1つ選ぶ列。復習の型・厳しさ・1日の量・重点・見た目・
 * 発音表記・音量 — この画面の選択はすべてこの形。
 *
 * `aria-pressed` ではなく `role="radiogroup"` + `aria-checked` にした。
 * 押しっぱなしのボタンが並んでいるのではなく、**どれか1つを選ぶ**ものなので、
 * 読み上げも「3つのうち2番目」と言えるほうが正しい。
 */
export function ChoiceRow<T extends string | number>({
  label,
  options,
  value,
  onChange,
  cols,
}: {
  label: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  cols: keyof typeof CHOICE_COLS;
}) {
  // 見出しの id はラベルの文字から作らない。同じ語が2箇所に出た瞬間に
  // id が重複して、読み上げがどちらを指すか決まらなくなる。
  const labelId = useId();
  return (
    <div>
      <Label id={labelId}>{label}</Label>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className={`mt-1 grid gap-2 ${CHOICE_COLS[cols]}`}
      >
        {options.map((o) => (
          <button
            key={String(o.value)}
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            // 5列は 390px の画面で1つ約59px。**折り返させない** —
            // 折り返すと丸が縦長の楕円になり、隣の丸と形が揃わなくなる
            // (雛形の「上限なし」でそうなっていた)。訳語が伸びる言語も
            // あるので、収まらないときは折らずに字を詰める。
            className={`min-h-11 truncate rounded-full border px-1 py-2.5 text-body ${
              value === o.value
                ? "border-primary bg-primary font-semibold text-primary-foreground"
                : "border-border bg-background"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * 級の6段階。「いまの級」と「目標の級」で**同じ一覧**を使う。
 * 以前は片方が `.replace()` で作った表記、もう片方が手書きの6行で、
 * どちらも同じ文字列を別々に作っていた(ずれても誰も気づかない形)。
 *
 * 2026-08-24: `TOCFL-${n}` の決め打ちをやめ、学習言語の目盛りから作る。
 * 2026-08-25: **学習言語ごとに切り替える。** 英語を選べるようにした日
 * (第4段)から、この一覧が固定だと英語の学習者に**TOCFL 準備級**が
 * 並ぶ。台湾華語の級で英語の学習者の目標を測ることになるので、
 * 級の物差しは学習言語から引く(台湾華語=TOCFL / 英語=CEFR)。
 */
export function levelOptionsFor(targetLanguage: string | null | undefined) {
  return levelOptions(targetProfile(targetLanguage).levels);
}

/** 検査の足場と、まだ学習言語を知らない所のための既定。 */
export const LEVEL_OPTIONS = levelOptionsFor(null);

/**
 * プロフィールが届く前に置いておく級。
 * **`"TOCFL-1"` と直に書かない** — 目盛りの表記を知っているのは
 * `level-scale.ts` で、ここに写しを置くと表記を変えた日にずれる。
 */
const LEVEL_SCALE_DEFAULT = {
  current: restoreLevel(targetProfile(null).levels, null, 1),
  goal: restoreLevel(targetProfile(null).levels, null, 2),
};

/** 選択肢の一覧から1つ選ぶ(選択肢が多いものは丸いボタンでは入らない)。 */
export function SelectRow({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        className="mt-1 min-h-11 w-full rounded-md border border-input bg-background px-3 py-2.5 text-body"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function SettingsPage() {
  const t = useT();
  const queryClient = useQueryClient();
  const router = useRouter();
  const navigate = useNavigate();
  const fetchProfile = useServerFn(getMyProfile);
  const updateProfile = useServerFn(updateMyProfile);
  const {
    data: profile,
    isLoading: profileLoading,
    isError: profileFailed,
    isFetching: profileFetching,
    refetch: refetchProfile,
  } = useQuery({ queryKey: ["profile"], queryFn: () => fetchProfile() });
  const { theme, setTheme } = useTheme();
  const [displayName, setDisplayName] = useState("");
  /**
   * 統合前に保存されていた母語。**画面には出さない**(行は消した)が、
   * 「表示言語=学習言語」のときの手掛かりとして持ち回り、
   * 保存のときにそのまま書き戻す。捨てると、その人の母語の情報が
   * 一度の保存で消える。
   */
  const [nativeLanguage, setNativeLanguage] = useState("ja");
  const [uiLanguage, setUiLanguage] = useState("ja");
  const [targetLanguage, setTargetLanguage] = useState<string>(DEFAULT_TARGET_LANGUAGE);
  const [levelGoal, setLevelGoal] = useState(() => LEVEL_SCALE_DEFAULT.goal);
  const [currentLevel, setCurrentLevel] = useState(() => LEVEL_SCALE_DEFAULT.current);
  /** 級の一覧は**学習言語で変わる**(台湾華語=TOCFL / 英語=CEFR)。 */
  const levelChoices = levelOptionsFor(targetLanguage);

  /**
   * 学習言語を選び直したら、級の表記も載せ替える。
   *
   * **ここを繋がないと選択が空に見える。** 英語に切り替えた瞬間、
   * 一覧は CEFR(A1〜C2)になるのに、選ばれている値は `"TOCFL-2"` の
   * ままで一覧に無い。段(1〜6)だけ引き継いで表記を作り直す。
   */
  /**
   * **母語を選んだ瞬間に画面を切り替える**（オーナー指示 2026-08-26
   * 「母語の選択をしたら設定の保存を押さなくても、すぐにアプリ内の
   * 表示言語を変更して」）。
   *
   * 学習言語（すぐ下の `pickTargetLanguage`）は前からそうなっていた。
   * 母語だけ「保存を押すまで効かない」ままで、**同じ束に並ぶ2つの選択が
   * 別の効き方をしていた** — 押した人には片方が壊れて見える。
   */
  const pickUiLanguage = (next: string) => {
    const normalized = normalizeUiLang(next);
    setUiLanguage(normalized);
    setUiLang(normalized);
  };

  const pickTargetLanguage = (next: string) => {
    const scale = targetProfile(next).levels;
    setTargetLanguage(next);
    // **選んだ瞬間に効かせる。** 保存を押す前に撮りに行く人が居るので、
    // 保存のときだけ写すと「設定では英語なのに撮ると台湾華語」になる。
    setTargetLang(next);
    // **その言語で前に選んだ級が在ればそれを出す。** 無ければ今の段を
    // 載せ替える(台湾華語の2級 → 英語の A2)。
    const saved = storedLevels(next);
    setCurrentLevel((prev) => restoreLevel(scale, saved.current ?? prev, 1));
    setLevelGoal((prev) => restoreLevel(scale, saved.goal ?? prev, 2));
  };
  const [strictness, setStrictness] = useState<"easy" | "normal" | "strict">("normal");
  const [reviewMode, setReviewMode] = useState<ReviewModePref>("speaking");
  const [photoPref, setPhotoPrefState] = useState<PhotoPref>("auto");
  const [catchSpeed, setCatchSpeedState] = useState<CatchSpeed>("detail");
  const [reviewLimit, setReviewLimit] = useState<number>(20);
  const [reviewFocus, setReviewFocus] = useState<"all" | "weak" | "new">("all");
  const [saving, setSaving] = useState(false);
  // 端末ごとの設定なので、プロフィールの到着を待たずに読む
  // (`localStorage` はサーバ側では読めないので、描いた後に一度だけ)。
  useEffect(() => {
    setPhotoPrefState(getPhotoPref());
    setCatchSpeedState(getCatchSpeed());
    /**
     * **選んだ値を、プロフィールを待たずに画面へ戻す**(オーナー報告
     * 2026-08-26、3度目「一度保存しても、ほかのページ移ってから設定の
     * ページに行くと…すぐに学習言語台湾華語、表示言語日本語、今のレベル1、
     * 目標はレベル2に戻る」)。
     *
     * ## これが3度目の報告の本体
     * 前の直しは下の `profile` の effect に入っていて、そこには
     * 「私用の列が読めなかった行で上書きしない」ための
     * **`partial` なら丸ごと戻る**分岐がある。戻ると何が起きるかというと、
     * 画面の状態は `useState` の初期値のまま残る —
     * つまり `"ja"` / `DEFAULT_TARGET_LANGUAGE` / 級は1と2。
     * **報告の4つの値と1つ残らず同じ。** 端末の写しを守っておきながら、
     * 画面はその写しを一度も読んでいなかった。
     *
     * だから、プロフィールとは関係なく、**開いた時点で端末の写しを載せる**。
     * サーバの値はこの後の effect が突き合わせに来る。
     */
    const lang = storedTargetLang();
    const ui = storedUiLang();
    if (ui) {
      const nextUi = normalizeUiLang(ui);
      setUiLanguage(nextUi);
      setUiLang(nextUi);
    }
    const scaleLang = lang ?? DEFAULT_TARGET_LANGUAGE;
    if (lang) setTargetLanguage(lang);
    const scale = targetProfile(scaleLang).levels;
    const saved = storedLevels(scaleLang);
    if (saved.current) setCurrentLevel(restoreLevel(scale, saved.current, 1));
    if (saved.goal) setLevelGoal(restoreLevel(scale, saved.goal, 2));
  }, []);
  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.display_name ?? "");
    /**
     * **私用の列が読めなかった行で、言語と級を上書きしない。**
     *
     * オーナー報告 2026-08-26:
     * > 「学習言語を英語、表示言語を台湾華語にすると、設定のページを
     * >  触ると勝手に学習言語が台湾華語、表示言語が日本語に戻る」
     *
     * `getMyProfile` は私用の列が読めなかったとき `partial: true` を
     * 付けて**置き場所の値**(既定の台湾華語 / 日本語)を返す。
     * `use-language-prefs.ts` はそれを見て写しを止めているのに、
     * **この画面だけ見ていなかった**。だから設定を開いた瞬間に
     * 既定の表示言語と既定の学習言語が端末の写しへ書き戻され、
     * 選んだ設定が消えていた。
     *
     * 名前・見た目の設定はそのまま読んでよい(置き場所の値ではない)。
     * 戻すのは**言語と、言語で決まる級**だけ。
     */
    /**
     * **私用の列が読めなかった行の値を「その人の設定」として扱わない。**
     *
     * `getMyProfile` はその場合 `partial: true` を付けて**置き場所の値**
     * (既定の台湾華語 / 日本語 / 2級)を返す。以前はここで `return` して
     * いたが、それだと画面が `useState` の初期値のまま据え置かれ、
     * **守ったはずの端末の写しを一度も読まないまま既定が見える**
     * (オーナー報告 3度目)。戻るのではなく、**サーバ側を「無い」として
     * 突き合わせる** — 端末に選択が在ればそれが勝つ。
     */
    const partial = !!(profile as { partial?: boolean }).partial;

    /**
     * **一度選んだ言語を、開き直しただけで失わない**(オーナー報告
     * 2026-08-26、2度目)。
     *
     * 前の直しは「サーバに正しい値が入っている」ことを前提にしていた。
     * 実際にはこちらから見えない理由で保存が届かないことがあり、
     * そのときは開くたびにサーバの古い値で端末が塗り替えられる。
     *
     * **端末に選択が在るならそちらが正**(`language-sync.ts`)。
     * 違っていればサーバへ書き戻して揃える。
     */
    /**
     * **突き合わせの規則は `settings-restore.ts` ただ1つ。**
     * ここに書くと、直ったかどうかを絵でしか確かめられない
     * （同じ報告が3度来た理由。あちらの注に書いた）。
     */
    const storedTarget = storedTargetLang();
    const savedLevels = storedLevels(storedTarget ?? DEFAULT_TARGET_LANGUAGE);
    const picked = restoreSettings({
      device: {
        uiLanguage: storedUiLang(),
        targetLanguage: storedTarget,
        currentLevel: savedLevels.current,
        levelGoal: savedLevels.goal,
      },
      server: {
        uiLanguage: profile.ui_language,
        targetLanguage: profile.target_language,
        currentLevel: (profile as { current_level?: string | null }).current_level ?? null,
        levelGoal: profile.level_goal,
        partial,
      },
    });
    const targetPick = { value: picked.targetLanguage };
    // **読めなかった行へ書き戻さない。** 読めないのは権限の話なので、
    // 書きに行っても通らないし、通ったとしても比べた相手が置き場所の値。
    if (picked.pushToServer) {
      // **待たない。** 画面を描くのを止めてまで揃える話ではない。
      // 落ちてもこの端末の選択はそのまま効く。
      void updateProfile({
        data: {
          ui_language: picked.uiLanguage,
          target_language: picked.targetLanguage,
        },
      }).catch(() => {
        /* 端末の選択が正なので、書き戻せなくても画面は壊れない */
      });
    }
    // **一覧に無い値をそのまま渡さない。** 母語を12から3に絞ったので
    // (オーナー決定 2026-08-25)、`ko` を選んでいた人の値は一覧に無い。
    // 渡すと「どれも選ばれていない」見た目になり、保存もできない。
    setNativeLanguage(pickL1(profile.native_language, targetPick.value));
    // **知らない値をそのまま渡さない。** 一覧に無い値だと選択が空に見える。
    const nextUi = normalizeUiLang(picked.uiLanguage);
    setUiLanguage(nextUi);
    setUiLang(nextUi);
    // **級より先に学習言語を読む。** 級の表記はその言語の目盛りで決まる。
    setTargetLanguage(targetPick.value);
    // **端末にも写す。** 撮る道（スキャン・文字入力・保存）はプロフィールの
    // 到着を待たずに動くので、localStorage の写しから読む
    // (`target-lang-pref.ts`。表示言語と同じ形)。
    setTargetLang(targetPick.value);
    // 保存されている級を**その言語の表記に載せ替える**。台湾華語で
    // 2級だった人が英語に切り替えていれば `"TOCFL-2"` が残っているので、
    // そのまま渡すと CEFR の一覧に無い値になり、選択が空に見える。
    setLevelGoal(picked.levelGoal);
    setCurrentLevel(picked.currentLevel);
    setStrictness(profile.pronunciation_strictness as "easy" | "normal" | "strict");
    // **この端末で選んだ値が勝つ**(`src/lib/review-mode-pref.ts`)。
    // DB の列に 'hybrid' を許す移行が当たっていないと保存が落ちるので、
    // DB は他の端末へ持っていくための控えでしかない。
    setReviewMode(
      resolveReviewMode(getStoredReviewMode(), (profile as { review_mode?: string }).review_mode),
    );
    const p = profile as { review_daily_limit?: number | null; review_stage_focus?: string | null };
    setReviewLimit(typeof p.review_daily_limit === "number" ? p.review_daily_limit : 20);
    setReviewFocus(
      p.review_stage_focus === "weak" || p.review_stage_focus === "new"
        ? p.review_stage_focus
        : "all",
    );
  }, [profile]);

  async function handleSave() {
    setSaving(true);
    try {
      /**
       * **言語だけを先に、単独で送る**(オーナー報告 2026-08-26
       * 「設定のページを触ると勝手に学習言語が台湾華語、表示言語が
       * 日本語に戻る」)。
       *
       * 設定はこれまで1回の UPDATE でまとめて送っていた。この形だと
       * **どれか1列が値を撥ねられただけで、言語もまとめて保存されない**。
       * 画面には選んだ値が残るので保存できたように見え、次に開いたとき
       * 既定へ戻る — それが報告の姿。
       *
       * すぐ下の出題形式には既に同じ注が書いてある。言語は出題形式より
       * 重い設定(撮る・解説・復習の全部がこれで決まる)なので、
       * **こちらこそ単独で送るべきだった。**
       */
      await updateProfile({
        data: {
          // **母語は表示言語から決まる。** 列は残すので、統合後も
          // 食い違わないように同じ値の側から書く(`reader-language.ts`)。
          native_language: readerL1({
            uiLanguage,
            nativeLanguage,
            targetLanguage,
          }),
          ui_language: uiLanguage,
          target_language: targetLanguage,
        },
      });
      /**
       * **級も端末に憶えさせる**(オーナー報告 2026-08-26、3度目)。
       *
       * すぐ上の言語と同じ理由。`current_level` の列がまだ無い環境では
       * `updateMyProfile` がその名前を黙って落として保存し直すので、
       * サーバだけを頼りにすると**選んだのに保存されない**。
       * 送るのは送る(解説の難しさは server 側が読む)が、
       * 画面に戻す値の出所は端末にする。
       */
      setStoredLevels(targetLanguage, { current: currentLevel, goal: levelGoal });
      await updateProfile({
        data: {
          // Only send a non-empty name: the server rejects "" (min length 1),
          // which would otherwise fail the whole save (theme/level too)
          // for anyone whose display name is blank.
          ...(displayName.trim() ? { display_name: displayName.trim() } : {}),
          level_goal: levelGoal,
          current_level: currentLevel,
          pronunciation_strictness: strictness,
          review_daily_limit: reviewLimit,
          review_stage_focus: reviewFocus,
        },
      });
      // **出題形式は別に送る。** 同じ payload に混ぜると、この1列の制約違反で
      // 名前も言語もレベルも**まとめて保存されない**。端末には既に書いて
      // あるので、ここが落ちてもその端末では選んだ形が効く。
      await updateProfile({ data: { review_mode: reviewMode } }).catch(() =>
        toast(t("review.modeLocalOnly")),
      );
      // **ここで "ja" に落とさない。** 繁體中文を選んだ人が保存するたびに
      // 日本語へ戻ってしまう（型でもビルドでも落ちない）。
      setUiLang(normalizeUiLang(uiLanguage));
      // 学習言語も端末に憶えさせる。ここを忘れると、設定では英語なのに
      // 撮る道だけ台湾華語のまま、という食い違いが残る。
      setTargetLang(targetLanguage);
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success(t("settings.saved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("settings.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  // 設定が読めていないときに**フォームを出してはいけない**。
  //
  // 各入力の初期値は「日本語 / TOCFL-1 / ふつう」のような既定値で、
  // プロフィールが届いてから上書きされる。届かないまま画面を出すと、
  // 本当の設定ではなく既定値が並び、「保存」を押した人は自分の設定を
  // **既定値で上書きする**。読み込み失敗が、黙ってデータを壊す操作に
  // すり替わっていた(§8: 空とエラーを同じ絵で描かない)。
  if (profileLoading || profileFailed) {
    return (
      <AppShell title={t("title.settings")}>
        {profileFailed ? (
          <LoadFailed
            onRetry={() => void refetchProfile()}
            retrying={profileFetching}
            what={t("err.whatSettings")}
          />
        ) : (
          <div className="space-y-4" role="status" aria-label={t("common.loading")}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-40 animate-pulse rounded-2xl bg-secondary" />
            ))}
          </div>
        )}
      </AppShell>
    );
  }

  return (
    <AppShell title={t("title.settings")}>
      {/* 束どうしは行どうし(12px)より**はっきり**離す。16px では 1.33 倍しか
          差が無く、4つの設定がひと続きの壁に見えていた(近いものほど近く)。 */}
      <div className="space-y-7">
        <SettingsCard title={t("settings.profile")}>
          <div className="space-y-3">
            <AvatarRow />
            <div>
              <Label htmlFor="dn">{t("settings.displayName")}</Label>
              <Input id="dn" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
          </div>
        </SettingsCard>

        <SettingsCard title={t("settings.language")}>
          <div className="space-y-3">
            <SelectRow
              id="lang-target"
              label={t("settings.targetLang")}
              value={targetLanguage}
              onChange={pickTargetLanguage}
              // **一覧を書き並べない。** `TARGET_LANGUAGES` を回す —
              // ここに手書きの写しを置くと、言語を足したときにここだけ
              // 増えない(または、外したのにここだけ残る)。
              options={TARGET_LANGUAGES.map((code) => ({
                value: code,
                label: t(TARGET_LANG_LABEL_KEYS[code]),
              }))}
            />
            <SelectRow
              id="lang-cur"
              label={t("settings.currentLevel")}
              value={currentLevel}
              onChange={setCurrentLevel}
              options={levelChoices}
            />
            {/* 説明は**2つ揃ってから**出す。「今のレベル〜目標レベル」と
                書いてあるのに、以前は1つ目の下に置いていたので、まだ見て
                いない言葉を指して説明していた。 */}
            <SelectRow
              id="lang-level"
              label={t("settings.levelGoal")}
              value={levelGoal}
              onChange={setLevelGoal}
              options={levelChoices}
            />
            {/* **学習言語を渡す。** 渡していなかったので既定(台湾華語)で
                考え、**英語を学ぶ人にも注音・拼音の選択が出ていた**
                (オーナー指摘「学習言語が英語のときピンイン・注音の設定を
                消して」)。英語では米式/英式の IPA の選択になる。 */}
            <PhoneticRow lang={targetLanguage} />
            {/* **母語の行は消した。** オーナー指示「母語と表示言語を統合して、
                日本語、英語、台湾華語にして」。ほとんどの人にとって
                「画面を読む言語」と「母語」は同じ物で、2つ選ばせる理由が無い。
                発音のコツをどの母語向けに書くかは `reader-language.ts` が
                表示言語から決める。DB の `native_language` の列は残す。 */}
            <SelectRow
              id="lang-ui"
              label={t("settings.uiLang")}
              value={uiLanguage}
              onChange={pickUiLanguage}
              // **一覧を書き並べない。** `UI_LANGS` を回す — 言語を足したときに
              // ここを直し忘れると、訳したのに選べない状態になる。
              options={UI_LANGS.map((code) => ({
                value: code,
                label: t(UI_LANG_LABEL_KEYS[code]),
              }))}
            />
          </div>
        </SettingsCard>

        <SettingsCard title={t("settings.study")}>
          <div className="space-y-3">
            {/* 「AIが選ぶ」は記憶の段階で形を変える(`lib/review-format.ts`)。
                既定は従来どおり「発話」— 黙って人の画面を変えない。 */}
            <ChoiceRow
              cols={3}
              label={t("settings.reviewMode")}
              value={reviewMode}
              onChange={(v) => {
                const next = normalizeReviewMode(v);
                setReviewMode(next);
                // 押した瞬間に端末へ。保存を押し忘れても、選んだ形は効く。
                setStoredReviewMode(next);
              }}
              options={[
                { value: "hybrid", label: t("settings.modeHybrid") },
                { value: "speaking", label: t("settings.modeSpeaking") },
                { value: "choice", label: t("settings.modeChoice") },
              ]}
            />
            {/* 要望 #16「表示画像(切り抜き/元画像/自撮り)を設定から選べる」。
                端末ごとの設定にしてある(理由は `lib/photo-pref.ts`)ので、
                保存はここで即座に効く — サーバへは行かない。 */}
            {/* **「画面ごと」の札は消した**(オーナー指示 2026-08-26)。
                何が出るのかを画面に委ねる選択肢は、選んだ人から見ると
                「選んでいない」のと区別が付かない。

                **値そのものは残す**(`photo-pref.ts` の `auto`)。
                既に `auto` のまま使っている人の見え方を、設定を開いた
                だけで変えないため — その人にはどれも選ばれていない
                状態で出て、押したときに初めて決まる。 */}
            <ChoiceRow
              cols={3}
              label={t("settings.photoPref")}
              value={photoPref}
              onChange={(v) => {
                setPhotoPrefState(v);
                setPhotoPref(v);
              }}
              options={[
                { value: "object", label: t("settings.photoObject") },
                { value: "cutout", label: t("settings.photoCutout") },
                { value: "selfie", label: t("settings.photoSelfie") },
              ]}
            />
            {/* 要望 #18「キャッチ時に切り抜きするしない」。
                **既定は今まで通り「丁寧」** — 速さのために見た目を落とすかは
                人が決めることで、黙って切り替えるものではない。 */}
            <ChoiceRow
              cols={2}
              label={t("settings.catchSpeed")}
              value={catchSpeed}
              onChange={(v) => {
                setCatchSpeedState(v);
                setCatchSpeed(v);
              }}
              options={[
                { value: "detail", label: t("settings.speedDetail") },
                { value: "fast", label: t("settings.speedFast") },
              ]}
            />
            {/* **発音判定の厳しさの欄は消した**(オーナー指示 2026-08-26)。
                列(`pronunciation_strictness`)は残す — 既に選んである人の
                値を保存のたびに書き戻して、消さないため。 */}
            {/* 1日の復習量。既定を決めておかないと「開くたびに新しい単語が
                無限に出てくる」状態になり、終わりが見えない(NORI指摘)。 */}
            <ChoiceRow
              cols={5}
              label={t("settings.reviewLimit")}
              value={reviewLimit}
              onChange={setReviewLimit}
              options={[
                { value: 10, label: "10" },
                { value: 20, label: "20" },
                { value: 30, label: "30" },
                { value: 50, label: "50" },
                { value: 0, label: t("settings.reviewLimitNone") },
              ]}
            />
            {/* **優先する記憶段階の欄も消した**(同上)。列は残す。 */}
          </div>
          <VideoRecordingToggle />
          <PlaceReminderToggle />
        </SettingsCard>

        <SettingsCard title={t("settings.appearance")}>
          <ChoiceRow
            cols={3}
            label={t("settings.theme")}
            value={theme}
            onChange={setTheme}
            options={[
              { value: "light", label: t("settings.light") },
              { value: "dark", label: t("settings.dark") },
              { value: "system", label: t("settings.system") },
            ]}
          />
        </SettingsCard>

        <SoundAndHapticsPanel />

        <Button className="w-full" onClick={handleSave} disabled={saving}>
          {saving ? t("settings.saving") : t("settings.save")}
        </Button>

        <AdminOnlySection />
        <AdminOnlyDeveloperPanel />

        <Button
          variant="outline"
          className="w-full"
          onClick={async () => {
            try {
              await queryClient.cancelQueries();
              await supabase.auth.signOut();
            } catch {
              // Network hiccup: fall through and still send them to /auth. The
              // local session is cleared below so the app treats them as signed
              // out; a stale server token expires on its own.
            } finally {
              queryClient.clear();
              await router.invalidate();
              navigate({ to: "/auth", replace: true, search: { next: "" } });
            }
          }}
        >
          <LogOut className="mr-2 h-4 w-4" /> {t("settings.signout")}
        </Button>

        <DangerZone />
      </div>
    </AppShell>
  );
}

/**
 * データの出典。
 *
 * **これは飾りではなく、利用の条件。** CEFR-J は商用可だが
 * **出典明記が条件**で、README に書くだけでは足りない — 条件は
 * 利用者に見える所に要る。中身は `src/lib/data-sources.ts`。
 *
 * リンクは新しいタブで開く。`noopener` を付けるのは、開いた先から
 * こちらの窓を触られないようにするため。
 */
/**
 * 読みの表記: その言語の書き方のうち**どれか一方だけ**を全画面で表示する。
 *
 * 台湾華語は注音と拼音、英語は米式と英式の IPA。並びは
 * `target-profile.ts` が持っていて、ここは**それを回すだけ**。
 * 2つを直に書くと、英語版でこの関数の中に分岐が生える。
 */
export function PhoneticRow({ lang }: { lang?: string } = {}) {
  const t = useT();
  const profile = targetProfile(lang);
  const pref = useReadingPref(profile);
  // 列は 2〜5 しか用意がない。読みの数をそのまま渡すと、1つしか無い言語を
  // 足した日に**クラス名が undefined になって並びが崩れる**。挟んでおく。
  const cols = Math.min(5, Math.max(2, profile.readings.length)) as keyof typeof CHOICE_COLS;
  // **選ぶものが無いなら行ごと出さない。** 読みが1つしか無い言語を足した日に
  // 「選択肢が1つだけのボタンの列」が残るのは、設定として意味が無い。
  if (profile.readings.length < 2) return null;
  return (
    <ChoiceRow
      cols={cols}
      label={t("settings.phonetic")}
      value={pref}
      onChange={(k) => setReadingPref(profile, k)}
      options={profile.readings.map((k) => ({ value: k, label: t(readingLabelKey(k)) }))}
    />
  );
}

/**
 * Permanent account deletion (privacy policy §6 / store review requirement).
 * Two-step: open the panel, then type 「削除」 to arm the button — the server
 * re-checks the same string, so nothing short of both steps can wipe data.
 */
export function DangerZone({
  // 既定は「畳んだ・空」で、実際の画面はそのまま。開いた状態と、確認語を
  // 入れて赤いボタンが効くようになった状態は**押さないと一度も描かれない**
  // ので、検査から名指しで出せるようにしておく。
  defaultOpen = false,
  defaultConfirmText = "",
}: {
  defaultOpen?: boolean;
  defaultConfirmText?: string;
} = {}) {
  const t = useT();
  const deleteFn = useServerFn(deleteMyAccount);
  const queryClient = useQueryClient();
  const router = useRouter();
  const navigate = useNavigate();
  const [confirmText, setConfirmText] = useState(defaultConfirmText);
  const [deleting, setDeleting] = useState(false);
  // 退会の確認語。英語表示の人に日本語入力を強いると操作できないので、
  // どちらの言語でも通す(表示は今の言語のものだけ)。
  const armed = ["削除", "DELETE"].includes(confirmText.trim().toUpperCase());

  async function handleDelete() {
    if (!armed || deleting) return;
    setDeleting(true);
    try {
      await deleteFn({ data: { confirm: "削除" } }); // サーバー側の合図は固定
      await queryClient.cancelQueries();
      queryClient.clear();
      await supabase.auth.signOut().catch(() => {}); // user is already gone server-side
      toast.success(t("settings.deleteDone"));
      await router.invalidate();
      navigate({ to: "/auth", replace: true, search: { next: "" } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("settings.deleteFailed"));
      setDeleting(false);
    }
  }

  return (
    <details
      open={defaultOpen}
      className="group rounded-2xl border border-destructive/30 bg-card p-4"
    >
      <summary className="cursor-pointer list-none text-body font-semibold text-destructive-ink [&::-webkit-details-marker]:hidden">
        {t("settings.deleteAccount")}
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-footnote text-muted-foreground">{t("settings.deleteWarn")}</p>
        <div>
          <Label htmlFor="del-confirm">{t("settings.deleteTypeLabel")}</Label>
          <Input
            id="del-confirm"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={t("set.deleteWord")}
            autoComplete="off"
          />
        </div>
        <Button
          variant="destructive"
          className="w-full"
          disabled={!armed || deleting}
          onClick={handleDelete}
        >
          {deleting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("settings.deleting")}
            </>
          ) : (
            <>
              <Trash2 className="mr-2 h-4 w-4" /> {t("settings.deleteButton")}
            </>
          )}
        </Button>
      </div>
    </details>
  );
}

/**
 * 開発者パネルは管理者だけに見せる(一般ユーザーには計測値は無意味で、
 * 「遅い」という印象だけが残る)。admin判定が返るまでは何も描かない。
 */
function AdminOnlyDeveloperPanel() {
  const adminFn = useServerFn(checkIsAdmin);
  const { data: adm } = useQuery({
    queryKey: ["is-admin"],
    queryFn: () => adminFn(),
    staleTime: 300_000,
  });
  if (!adm?.isAdmin) return null;
  return <DeveloperPanel />;
}

/**
 * 「切り抜きあり/なし」の1行(要望 #73)。
 * **件数を必ず添える** — 1件の中央値と20件の中央値を同じ顔で出さない。
 */
function CatchTimingRow({ label, median, n }: { label: string; median: number | null; n: number }) {
  const t = useT();
  return (
    <div className="flex items-center justify-between text-footnote">
      <span className="text-muted-foreground">{label}</span>
      <span className={median == null ? "text-muted-foreground" : "font-semibold"}>
        {median == null ? t("settings.metricNone") : `${(median / 1000).toFixed(2)}s`}
        <span className="ml-1 font-normal text-muted-foreground">
          ({t("set.catchSpeedN", { n: String(n) })})
        </span>
      </span>
    </div>
  );
}

/** §7: median speeds over the last 20 scans vs. the spec targets. */
function DeveloperPanel() {
  const t = useT();
  const metricsFn = useServerFn(getMyScanMetrics);
  const adminFn = useServerFn(checkIsAdmin);
  const { data: m } = useQuery({
    queryKey: ["scan-metrics"],
    queryFn: () => metricsFn(),
    staleTime: 60_000,
  });
  const { data: adm } = useQuery({
    queryKey: ["is-admin"],
    queryFn: () => adminFn(),
    staleTime: 300_000,
  });
  // 端末の記録なので、描いたあとに読む(サーバ側では localStorage が無い)。
  const [timings, setTimings] = useState<CatchTimingSummary>(() => summarizeCatchTimings([]));
  useEffect(() => {
    setTimings(summarizeCatchTimings(readCatchTimings()));
  }, []);

  const row = (label: string, value: number | null | undefined, targetMs: number) => {
    const ok = value != null && value <= targetMs;
    return (
      <div className="flex items-center justify-between text-footnote">
        <span className="text-muted-foreground">{label}</span>
        <span
          className={
            value == null
              ? "text-muted-foreground"
              : ok
                ? "font-semibold text-ok-ink"
                : "font-semibold text-bad-ink"
          }
        >
          {value == null ? t("settings.metricNone") : `${(value / 1000).toFixed(2)}s`}
          <span className="ml-1 font-normal text-muted-foreground">
            / {t("settings.metricTarget")} {(targetMs / 1000).toFixed(1)}s
          </span>
        </span>
      </div>
    );
  };

  return (
    <details className="group rounded-2xl border border-border bg-card p-4">
      <summary className="cursor-pointer list-none text-body font-semibold text-muted-foreground [&::-webkit-details-marker]:hidden">
        {t("settings.devMetrics")}
      </summary>
      <div className="mt-3 space-y-2">
        {row(t("settings.metricDetect"), m?.detect_ms_median, 1200)}
        {row(t("settings.metricAudio"), m?.tap_to_audio_ms_median, 400)}
        <p className="text-caption text-muted-foreground">
          {t("set.qualitySamples", { n: m?.samples ?? 0 })}
        </p>

        {/* 要望 #73「切り抜きあり/なし・ファストモードの時間を計測して比較」。
            端末に貯めた記録から出す(理由は `lib/catch-speed.ts`)。
            **記録が無い側は「—」** — 0 と書くと「0秒で終わった」と読める。 */}
        <div className="border-t border-border pt-2">
          <p className="mb-1 text-caption font-semibold label-caps text-muted-foreground">
            {t("set.catchSpeedMetrics")}
          </p>
          <CatchTimingRow
            label={t("settings.speedDetail")}
            median={timings.detail.median}
            n={timings.detail.n}
          />
          <CatchTimingRow
            label={t("settings.speedFast")}
            median={timings.fast.median}
            n={timings.fast.n}
          />
          {timings.detail.n + timings.fast.n > 0 && (
            <button
              onClick={() => {
                clearCatchTimings();
                setTimings(summarizeCatchTimings(readCatchTimings()));
              }}
              className="mt-1 min-h-11 text-footnote text-muted-foreground underline"
            >
              {t("set.catchSpeedClear")}
            </button>
          )}
        </div>
        {adm?.isAdmin && (
          <Link to="/admin/metrics" className="block text-footnote text-primary underline">
            {t("settings.kpiLink")}
          </Link>
        )}
      </div>
    </details>
  );
}

// Review-mode itself is saved to profiles.review_mode (above); this
// device-local toggle only covers the camera recording, which is a
// per-device preference (main branch's VIDEO_KEY, read by review.tsx).
const VIDEO_KEY = "review-video-v1";

/**
 * プロフィール写真。登録するとヘッダーの丸アイコンが「C」から自分の顔になる。
 * 保存前に 256px まで縮めてから送る(ヘッダーは 32px 表示なので十分で、
 * 通信もストレージも軽い)。
 */
export function AvatarRow() {
  const t = useT();
  const qc = useQueryClient();
  const fetchProfile = useServerFn(getMyProfile);
  const setAvatar = useServerFn(setMyAvatar);
  const clearAvatar = useServerFn(clearMyAvatar);
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => fetchProfile() });
  const avatar = (profile as { avatar_url?: string | null } | undefined)?.avatar_url ?? null;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  async function pick(file: File) {
    setBusy(true);
    try {
      const raw: string = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.onerror = () => rej(new Error("read failed"));
        r.readAsDataURL(file);
      });
      const small = await downscaleDataUrl(raw, 256, 0.85);
      await setAvatar({ data: { dataUrl: small } });
      await qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success(t("settings.avatarSaved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("settings.avatarFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Label>{t("settings.avatar")}</Label>
      <div className="mt-1 flex items-center gap-3">
        {avatar ? (
          <img
            src={avatar}
            alt=""
            className="h-14 w-14 shrink-0 rounded-2xl object-cover ring-1 ring-border"
          />
        ) : (
          // 顔写真がまだ無いとき。
          //
          // ここは「C」の一文字をブランド色のグラデーションに載せていた。
          // 二重に良くない: ①これは**本人**の顔写真の枠なのに、出るのは
          // アプリの頭文字。②グラデーションの終点だけ番号直書きで、
          // トークンより明るいので白文字が **3.49:1** になっていた
          // (主色の白文字は測って直したのに、手描きのグラデーションは
          //  その外に居たので置き去りだった)。
          // 人の形の印にして、色はトークンの対で置く。
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <User aria-label={t("settings.avatarNone")} className="h-7 w-7" />
          </div>
        )}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="press-in min-h-11 rounded-full border border-border bg-background px-4 text-body font-medium disabled:opacity-60"
        >
          {busy
            ? t("settings.avatarSaving")
            : avatar
              ? t("settings.avatarChange")
              : t("settings.avatarPick")}
        </button>
        {avatar && !busy && (
          <button
            type="button"
            onClick={async () => {
              await clearAvatar();
              await qc.invalidateQueries({ queryKey: ["profile"] });
            }}
            className="press-in min-h-11 rounded-full px-3 text-body text-muted-foreground"
          >
            {t("settings.avatarClear")}
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])}
        />
      </div>
    </div>
  );
}

export function VideoRecordingToggle() {
  const t = useT();
  const [video, setVideo] = useState(false);
  useEffect(() => {
    setVideo(localStorage.getItem(VIDEO_KEY) === "1");
  }, []);
  function toggle(val: boolean) {
    setVideo(val);
    localStorage.setItem(VIDEO_KEY, val ? "1" : "0");
  }
  return (
    <div className="mt-4 border-t border-border pt-3">
      <ToggleRow label={t("settings.videoLabel")} value={video} onChange={toggle} />
    </div>
  );
}

/**
 * 場所による思い出しのスイッチ。
 *
 * 既定はOFF。位置情報は**本人が明示的にONにしたときだけ**取りに行く。
 * ONにした瞬間に通知の許可も求める(後から別の画面で聞かれるより分かりやすい)。
 * 許可されなければスイッチは自動でOFFに戻す — 「ONなのに鳴らない」が
 * 一番わかりにくい壊れ方なので、状態が嘘をつかないようにする。
 */
export function PlaceReminderToggle() {
  const t = useT();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  // オンにできなかった理由。黙ってスイッチが戻るだけだと、利用者には
  // 「壊れている」としか見えない(apple-design §8)。
  const [blocked, setBlocked] = useState<null | "unsupported" | "denied" | "dismissed" | "error">(
    null,
  );
  useEffect(() => {
    setOn(isPlaceReminderEnabled());
  }, []);
  async function toggle(val: boolean) {
    if (!val) {
      setOn(false);
      setBlocked(null);
      setPlaceReminderEnabled(false);
      return;
    }
    setBusy(true);
    const res = await requestNotificationPermissionDetailed();
    setBusy(false);
    setOn(res.ok);
    setPlaceReminderEnabled(res.ok);
    setBlocked(res.ok || res.reason === "granted" ? null : res.reason);
  }
  return (
    <div className="mt-4 border-t border-border pt-3">
      <ToggleRow
        // **解説は消した**(オーナー指示「設定のボタンの下の解説を全部消す」)。
        // 確認中は札そのものを変えて知らせる — 下に一行足すのではなく。
        label={busy ? t("set.placeChecking") : t("set.placeLabel")}
        value={on}
        onChange={(v) => void toggle(v)}
      />
      {blocked && (
        <p className="mt-2 rounded-xl bg-amber-50 p-2 text-caption leading-relaxed text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          {blocked === "unsupported"
            ? t("set.placeUnsupported")
            : blocked === "denied"
              ? t("set.placeDenied")
              : blocked === "dismissed"
                ? t("set.placeDismissed")
                : t("set.placeError")}
        </p>
      )}
    </div>
  );
}

/**
 * 音と手ざわり。
 *
 * ## なぜ要るか
 * `setLevel` / `setHapticsEnabled` は前から実装されていたのに、**呼び出し元が
 * 1つも無かった**。つまりこのアプリの音と振動は、切る手段が無いまま鳴っていた。
 * 図書館でも電車でも同じ音量で「キャッチ!」が鳴る。
 *
 * ここは端末ごとの設定なので localStorage に即保存する — 下の「保存」を
 * 押さなくても効く。押さないと効かないものと混ざると分からなくなるので、
 * その旨を書いておく。選んだその場で音を鳴らして、選んだ結果を耳で返す。
 */
export function SoundAndHapticsPanel() {
  const t = useT();
  const [level, setLevelState] = useState<SoundLevel>("subtle");
  const [haptics, setHaptics] = useState(true);

  // localStorage はサーバー側に無い。読み出しはマウント後に。
  useEffect(() => {
    setLevelState(getLevel());
    setHaptics(areHapticsEnabled());
  }, []);

  function pickLevel(v: SoundLevel) {
    setLevel(v);
    setLevelState(v);
    // 選んだ音量で実際に鳴らす。「控えめ」がどのくらい控えめかは、
    // 言葉で説明するより一度鳴らしたほうが早い。
    if (v !== "off") {
      unlockAudio();
      Sound.shelfLand();
    }
  }

  function toggleHaptics(v: boolean) {
    setHapticsEnabled(v);
    setHaptics(v);
    if (v) haptic("medium"); // 入れた瞬間に手ざわりを返す
  }

  return (
    <SettingsCard title={t("settings.feel")}>
      <ChoiceRow
        cols={3}
        label={t("settings.soundLevel")}
        value={level}
        onChange={pickLevel}
        options={[
          { value: "off", label: t("settings.soundOff") },
          { value: "subtle", label: t("settings.soundSubtle") },
          { value: "full", label: t("settings.soundFull") },
        ]}
      />

      <div className="mt-4">
        <ToggleRow label={t("settings.haptics")} value={haptics} onChange={toggleHaptics} />
      </div>
    </SettingsCard>
  );
}

export function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-body font-medium">{label}</div>
      </div>
      {/* §11: the switch is 24px tall but the tap target is padded to 44px. */}
      <button
        onClick={() => onChange(!value)}
        role="switch"
        aria-checked={value}
        aria-label={label}
        className="grid h-11 w-11 shrink-0 place-items-center"
      >
        {/* ## 消えている側も**見えていなければならない**
            つまみは常に白だった。ONのときは青い溝の上なのではっきり見えるが、
            OFFのときは `bg-secondary`(ほぼ白)の溝に白いつまみで、
            **どちらの端に寄っているか分からない**。このスイッチの意味は
            全部この図形が運んでいるので、見えないなら状態が伝わっていない
            (WCAG 1.4.11 は意味を持つ図形に 3:1 を求める)。
            溝に輪郭を付け、OFF のつまみは濃い側の色にする(Material 3 と同じ、
            「消えているときは輪郭の色のつまみ」)。 */}
        <span
          className={`relative block h-6 w-11 rounded-full border transition-colors ${
            value ? "border-primary bg-primary" : "border-border bg-secondary"
          }`}
        >
          <span
            className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full shadow transition-transform ${
              value ? "translate-x-5 bg-primary-foreground" : "translate-x-0 bg-muted-foreground"
            } motion-reduce:transition-none`}
          />
        </span>
      </button>
    </div>
  );
}

// ============================================================================
// 開発者(admin)専用セクション — 一般ユーザーには一切見えない。
//  1. UIテーマの比較(現行は必ず残す)
//  2. キャッチの決め台詞ボイス(追加・削除・試聴)
//  3. AIモデルの切替(Gemini/ChatGPT/Claude/DeepSeek/Kimi)
// ============================================================================
function AdminOnlySection() {
  const t = useT();
  const adminFn = useServerFn(checkIsAdmin);
  const { data: adm } = useQuery({
    queryKey: ["is-admin"],
    queryFn: () => adminFn(),
    staleTime: 300_000,
  });
  if (!adm?.isAdmin) return null;
  return (
    <div className="space-y-4 rounded-2xl border-2 border-dashed border-primary/30 bg-primary/[0.03] p-3">
      <p className="text-caption font-semibold label-caps text-primary">{t("settings.devOnly")}</p>
      {/* **「見た目を比べる」と「エフェクトラボ」は消した**(オーナー指示
          2026-08-26)。どちらも作っている最中の道具で、
          設定に置いておく理由がもう無い。 */}
      <UiThemePicker />
      <AiModelPanel />
    </div>
  );
}

/**
 * UIテーマの比較。現行(default)は削除・変更しない前提で先頭に固定。
 *
 * **既定は畳んでおく**(オーナー指示 2026-08-26「UIテーマをすべてを
 * 表示しないで畳んで」)。色見本が開いたまま並ぶと、開発者用の箱が
 * この画面でいちばん高い塊になる。
 */
function UiThemePicker() {
  const t = useT();
  const [theme, setTheme] = useState<UiThemeId>("default");
  useEffect(() => {
    setTheme(getUiTheme());
  }, []);
  function pick(id: UiThemeId) {
    setTheme(id);
    setUiTheme(id);
  }
  return (
    <details className="rounded-2xl border border-border bg-card p-4">
      <summary className="cursor-pointer list-none text-body font-semibold [&::-webkit-details-marker]:hidden">
        {t("settings.themeCompare")}{" "}
        <span className="ml-1 text-caption font-normal text-muted-foreground">
          ({UI_THEMES.length})
        </span>
      </summary>
      <ul className="mt-3 space-y-1.5">
        {UI_THEMES.map((themeMeta) => (
          <li key={themeMeta.id}>
            <button
              onClick={() => pick(themeMeta.id)}
              aria-pressed={theme === themeMeta.id}
              className={`flex w-full items-center gap-3 rounded-xl border p-2 text-left transition ${
                theme === themeMeta.id
                  ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                  : "border-border"
              }`}
            >
              <span className="flex shrink-0 overflow-hidden rounded-lg ring-1 ring-black/10">
                {themeMeta.swatch.map((c) => (
                  <span key={c} className="block h-9 w-4" style={{ background: c }} />
                ))}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-body font-medium">
                  {themeMeta.name}
                  {themeMeta.id === "default" && (
                    <span className="ml-1.5 rounded-full bg-secondary px-1.5 py-0.5 text-caption text-muted-foreground">
                      {t("settings.themeKeep")}
                    </span>
                  )}
                </span>
                <span className="block text-caption leading-snug text-muted-foreground">
                  {themeMeta.concept}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** AIモデルの切替。鍵は環境変数のまま、モデル名と提供元だけを差し替える。 */
function AiModelPanel() {
  const t = useT();
  const getFn = useServerFn(getAiModelConfig);
  const setFn = useServerFn(setAiModelConfig);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["ai-model-config"],
    queryFn: () => getFn(),
    staleTime: 30_000,
  });
  const [provider, setProvider] = useState("");
  const [fast, setFast] = useState("");
  const [rich, setRich] = useState("");
  const [premium, setPremium] = useState("");
  const [features, setFeatures] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setProvider(data.config.provider ?? "");
    setFast(data.config.fast ?? "");
    setRich(data.config.rich ?? "");
    setPremium(data.config.rich_premium ?? "");
    setFeatures({ ...(data.config.features ?? {}) });
  }, [data]);

  async function save() {
    setSaving(true);
    try {
      await setFn({ data: { config: { provider, fast, rich, rich_premium: premium, features } } });
      await qc.invalidateQueries({ queryKey: ["ai-model-config"] });
      toast.success(t("settings.aiApplied"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("settings.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className="rounded-2xl border border-border bg-card p-4">
      <summary className="cursor-pointer list-none text-body font-semibold [&::-webkit-details-marker]:hidden">
        {t("settings.aiSwitch")}
      </summary>

      {data?.effective && (
        <div className="mt-2 rounded-xl bg-secondary/60 p-2 text-caption leading-relaxed">
          <div className="font-semibold">{t("settings.aiRunning")}</div>
          <div className="text-muted-foreground">
            {t("set.aiEffective", {
              p: data.effective.provider,
              f: data.effective.fast,
              r: data.effective.rich,
            })}
            {" / "}Pro {data.effective.rich_premium}
          </div>
        </div>
      )}

      {/* 診断: 障害(2026-07-28のスキャン全滅)の原因はキー未設定だった。
          「どのキーが実際に見えているか」を最初に出す。 */}
      <div className="mt-2 rounded-xl border border-border p-2 text-caption leading-relaxed">
        <div className="font-semibold">{t("settings.aiKeys")}</div>
        <ul className="mt-1 space-y-0.5">
          {(data?.presets ?? []).map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2">
              <span className="truncate">{p.label}</span>
              <span className={p.key_present ? "text-ok-ink" : "text-muted-foreground"}>
                {p.key_present
                  ? `✅ ${p.key_env_found} ${t("settings.aiKeyFound")}`
                  : `— ${p.api_key_env} ${t("settings.aiKeyMissing")}`}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-caption text-muted-foreground">{t("settings.aiKeysHint")}</p>
        {data?.keyError && (
          <p className="mt-1 rounded-lg bg-destructive/10 p-1.5 text-caption text-destructive-ink">
            {data.keyError}
          </p>
        )}
      </div>

      <div className="mt-3 space-y-2">
        <div>
          <Label className="text-footnote">{t("settings.aiProvider")}</Label>
          <select
            aria-label={t("set.aiProviderAria")}
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-md border border-input bg-background px-3 text-body"
          >
            <option value="">{t("settings.aiEnvDefault")}</option>
            {(data?.presets ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
                {p.key_present ? "" : t("set.keyMissing", { env: p.api_key_env })}
              </option>
            ))}
          </select>
          <p className="mt-1 text-caption text-muted-foreground">{t("settings.aiKeyNote")}</p>
        </div>
        <div>
          <Label className="text-footnote">{t("settings.aiFast")}</Label>
          <Input
            value={fast}
            onChange={(e) => setFast(e.target.value)}
            placeholder="gemini-2.5-flash"
          />
        </div>
        <div>
          <Label className="text-footnote">{t("settings.aiRich")}</Label>
          <Input
            value={rich}
            onChange={(e) => setRich(e.target.value)}
            placeholder="gemini-2.5-flash"
          />
        </div>
        <div>
          <Label className="text-footnote">{t("settings.aiPremium")}</Label>
          <Input
            value={premium}
            onChange={(e) => setPremium(e.target.value)}
            placeholder="gemini-2.5-pro"
          />
        </div>

        {/* βテスト〜ローンチで「機能ごとに別のAI」を試せるようにする。 */}
        <div className="rounded-xl border border-border p-2">
          <div className="text-footnote font-semibold">{t("settings.aiPerFeature")}</div>
          <div className="mt-2 space-y-2">
            {(data?.features ?? []).map((f) => (
              <div key={f.id}>
                <Label className="text-caption">{t(`settings.aiFeature.${f.id}`)}</Label>
                <Input
                  value={features[f.id] ?? ""}
                  onChange={(e) => setFeatures((prev) => ({ ...prev, [f.id]: e.target.value }))}
                  placeholder={t("settings.aiEnvDefault")}
                />
              </div>
            ))}
          </div>
          <p className="mt-2 text-caption text-muted-foreground">
            {t("settings.aiPerFeatureHint")}
          </p>
        </div>

        <Button className="w-full" onClick={save} disabled={saving}>
          {saving ? t("settings.saving") : t("settings.aiApply")}
        </Button>
        <p className="text-caption text-muted-foreground">{t("settings.aiModelNote")}</p>
      </div>
    </details>
  );
}
