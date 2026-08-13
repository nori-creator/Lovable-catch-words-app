import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
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
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useTheme } from "@/components/theme-provider";
import { usePhoneticPref, setPhoneticPref } from "@/lib/phonetic";
import { useT, setUiLang } from "@/lib/i18n";
import { L1_ORDER, L1_TABLE } from "@/lib/l1";
import { UI_THEMES, getUiTheme, setUiTheme, type UiThemeId } from "@/lib/ui-theme";
import { ThemeLabButton } from "@/components/ThemeLab";
import { EffectLabButton } from "@/components/EffectLab";
import {
  isPlaceReminderEnabled,
  setPlaceReminderEnabled,
  requestNotificationPermissionDetailed,
} from "@/lib/place-reminder";
import { getAiModelConfig, setAiModelConfig } from "@/lib/admin.functions";
import { downscaleDataUrl } from "@/lib/cutout";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, Loader2, Trash2 } from "lucide-react";
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
  const [nativeLanguage, setNativeLanguage] = useState("ja");
  const [uiLanguage, setUiLanguage] = useState("ja");
  const [targetLanguage, setTargetLanguage] = useState("zh-TW");
  const [levelGoal, setLevelGoal] = useState("TOCFL-2");
  const [currentLevel, setCurrentLevel] = useState("TOCFL-1");
  const [strictness, setStrictness] = useState<"easy" | "normal" | "strict">("normal");
  const [reviewMode, setReviewMode] = useState<"speaking" | "choice">("speaking");
  const [reviewLimit, setReviewLimit] = useState<number>(20);
  const [reviewFocus, setReviewFocus] = useState<"all" | "weak" | "new">("all");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.display_name ?? "");
    setNativeLanguage(profile.native_language);
    setUiLanguage(profile.ui_language);
    setUiLang(profile.ui_language === "en" ? "en" : "ja");
    setTargetLanguage(profile.target_language);
    setLevelGoal(profile.level_goal);
    setCurrentLevel(
      ((profile as { current_level?: string | null }).current_level ?? "") || "TOCFL-1",
    );
    setStrictness(profile.pronunciation_strictness as "easy" | "normal" | "strict");
    setReviewMode(
      ((profile as { review_mode?: string }).review_mode as "speaking" | "choice") ?? "speaking",
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
      await updateProfile({
        data: {
          // Only send a non-empty name: the server rejects "" (min length 1),
          // which would otherwise fail the whole save (theme/level/language too)
          // for anyone whose display name is blank.
          ...(displayName.trim() ? { display_name: displayName.trim() } : {}),
          native_language: nativeLanguage,
          ui_language: uiLanguage,
          target_language: targetLanguage,
          level_goal: levelGoal,
          current_level: currentLevel,
          pronunciation_strictness: strictness,
          review_mode: reviewMode,
          review_daily_limit: reviewLimit,
          review_stage_focus: reviewFocus,
        },
      });
      setUiLang(uiLanguage === "en" ? "en" : "ja");
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
          <LoadFailed onRetry={() => void refetchProfile()} retrying={profileFetching} />
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
      <div className="space-y-4">
        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
            {t("settings.profile")}
          </h3>
          <div className="space-y-3">
            <AvatarRow />
            <div>
              <Label htmlFor="dn">{t("settings.displayName")}</Label>
              <Input id="dn" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
            {t("settings.language")}
          </h3>
          <div className="space-y-3">
            <div>
              <Label htmlFor="lang-target">{t("settings.targetLang")}</Label>
              <select
                id="lang-target"
                aria-label={t("set.targetLangAria")}
                className="mt-1 min-h-11 w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
                value={targetLanguage}
                onChange={(e) => setTargetLanguage(e.target.value)}
              >
                <option value="zh-TW">{t("settings.langZhTw")}</option>
                <option value="en">{t("settings.langEn")}</option>
              </select>
            </div>
            <div>
              <Label htmlFor="lang-cur">{t("settings.currentLevel")}</Label>
              <select
                id="lang-cur"
                aria-label={t("settings.currentLevel")}
                className="mt-1 min-h-11 w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
                value={currentLevel}
                onChange={(e) => setCurrentLevel(e.target.value)}
              >
                {["TOCFL-1", "TOCFL-2", "TOCFL-3", "TOCFL-4", "TOCFL-5", "TOCFL-6"].map((lv) => (
                  <option key={lv} value={lv}>
                    {lv.replace("TOCFL-", "TOCFL Level ")}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-muted-foreground">{t("settings.levelHint")}</p>
            </div>
            <div>
              <Label htmlFor="lang-level">{t("settings.levelGoal")}</Label>
              <select
                id="lang-level"
                aria-label={t("set.levelGoalAria")}
                className="mt-1 min-h-11 w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
                value={levelGoal}
                onChange={(e) => setLevelGoal(e.target.value)}
              >
                <option value="TOCFL-1">TOCFL Level 1</option>
                <option value="TOCFL-2">TOCFL Level 2</option>
                <option value="TOCFL-3">TOCFL Level 3</option>
                <option value="TOCFL-4">TOCFL Level 4</option>
                <option value="TOCFL-5">TOCFL Level 5</option>
                <option value="TOCFL-6">TOCFL Level 6</option>
              </select>
            </div>
            <PhoneticRow />
            <div>
              <Label htmlFor="lang-native">{t("settings.nativeLang")}</Label>
              {/* 母語は「表示言語」とは別物。台湾華語のどこで転ぶかは母語で
                  変わるので、発音のコツ・添削の解説をこれで最適化する。 */}
              <select
                id="lang-native"
                aria-label={t("set.nativeAria")}
                className="mt-1 min-h-11 w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
                value={nativeLanguage}
                onChange={(e) => setNativeLanguage(e.target.value)}
              >
                {L1_ORDER.map((code) => (
                  <option key={code} value={code}>
                    {uiLanguage === "en" ? L1_TABLE[code].labelEn : L1_TABLE[code].labelJa}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {t("settings.nativeLangHint")}
              </p>
            </div>
            <div>
              <Label htmlFor="lang-ui">{t("settings.uiLang")}</Label>
              <select
                id="lang-ui"
                aria-label={t("set.uiLangAria")}
                className="mt-1 min-h-11 w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
                value={uiLanguage}
                onChange={(e) => setUiLanguage(e.target.value)}
              >
                <option value="ja">{t("settings.langJa")}</option>
                <option value="en">{t("settings.langEn")}</option>
              </select>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
            {t("settings.study")}
          </h3>
          <Label>{t("settings.reviewMode")}</Label>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {(["speaking", "choice"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setReviewMode(v)}
                aria-pressed={reviewMode === v}
                className={`min-h-11 rounded-full border py-2.5 text-sm ${reviewMode === v ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`}
              >
                {v === "speaking" ? t("settings.modeSpeaking") : t("settings.modeChoice")}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">{t("settings.reviewModeHint")}</p>
          <div className="mt-3">
            <Label>{t("settings.strictness")}</Label>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {(["easy", "normal", "strict"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setStrictness(v)}
                  aria-pressed={strictness === v}
                  className={`min-h-11 rounded-full border py-2.5 text-sm ${strictness === v ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`}
                >
                  {v === "easy"
                    ? t("settings.easy")
                    : v === "normal"
                      ? t("settings.normal")
                      : t("settings.strict")}
                </button>
              ))}
            </div>
          </div>
          {/* 1日の復習量。既定を決めておかないと「開くたびに新しい単語が
              無限に出てくる」状態になり、終わりが見えない(NORI指摘)。 */}
          <div className="mt-3">
            <Label>{t("settings.reviewLimit")}</Label>
            <div className="mt-1 grid grid-cols-5 gap-2">
              {([10, 20, 30, 50, 0] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setReviewLimit(v)}
                  aria-pressed={reviewLimit === v}
                  className={`min-h-11 rounded-full border py-2.5 text-sm ${reviewLimit === v ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`}
                >
                  {v === 0 ? t("settings.reviewLimitNone") : v}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t("settings.reviewLimitHint")}
            </p>
          </div>

          <div className="mt-3">
            <Label>{t("settings.reviewFocus")}</Label>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {(["all", "weak", "new"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setReviewFocus(v)}
                  aria-pressed={reviewFocus === v}
                  className={`min-h-11 rounded-full border py-2.5 text-sm ${reviewFocus === v ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`}
                >
                  {v === "all"
                    ? t("settings.focusAll")
                    : v === "weak"
                      ? t("settings.focusWeak")
                      : t("settings.focusNew")}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t("settings.reviewFocusHint")}
            </p>
          </div>

          <VideoRecordingToggle />
          <PlaceReminderToggle />
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
            {t("settings.appearance")}
          </h3>
          <Label>{t("settings.theme")}</Label>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {(["light", "dark", "system"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setTheme(v)}
                aria-pressed={theme === v}
                className={`min-h-11 rounded-full border py-2.5 text-sm ${theme === v ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`}
              >
                {v === "light"
                  ? t("settings.light")
                  : v === "dark"
                    ? t("settings.dark")
                    : t("settings.system")}
              </button>
            ))}
          </div>
        </div>

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

/** 発音表記: 注音かピンインのどちらか一方だけを全画面で表示する。 */
function PhoneticRow() {
  const t = useT();
  const pref = usePhoneticPref();
  return (
    <div>
      <Label>{t("settings.phonetic")}</Label>
      <div className="mt-1 grid grid-cols-2 gap-2">
        {(
          [
            ["zhuyin", t("settings.zhuyin")],
            ["pinyin", t("settings.pinyin")],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            onClick={() => setPhoneticPref(v)}
            aria-pressed={pref === v}
            className={`min-h-11 rounded-full border py-2.5 text-sm ${pref === v ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{t("settings.phoneticHint")}</p>
    </div>
  );
}

/**
 * Permanent account deletion (privacy policy §6 / store review requirement).
 * Two-step: open the panel, then type 「削除」 to arm the button — the server
 * re-checks the same string, so nothing short of both steps can wipe data.
 */
function DangerZone() {
  const t = useT();
  const deleteFn = useServerFn(deleteMyAccount);
  const queryClient = useQueryClient();
  const router = useRouter();
  const navigate = useNavigate();
  const [confirmText, setConfirmText] = useState("");
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
    <details className="group rounded-2xl border border-destructive/30 bg-card p-4">
      <summary className="cursor-pointer list-none text-sm font-semibold text-destructive [&::-webkit-details-marker]:hidden">
        {t("settings.deleteAccount")}
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs text-muted-foreground">{t("settings.deleteWarn")}</p>
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

  const row = (label: string, value: number | null | undefined, targetMs: number) => {
    const ok = value != null && value <= targetMs;
    return (
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span
          className={
            value == null
              ? "text-muted-foreground"
              : ok
                ? "font-semibold text-emerald-600"
                : "font-semibold text-red-600"
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
      <summary className="cursor-pointer list-none text-sm font-semibold text-muted-foreground [&::-webkit-details-marker]:hidden">
        {t("settings.devMetrics")}
      </summary>
      <div className="mt-3 space-y-2">
        {row(t("settings.metricDetect"), m?.detect_ms_median, 1200)}
        {row(t("settings.metricAudio"), m?.tap_to_audio_ms_median, 400)}
        <p className="text-[10px] text-muted-foreground">
          {t("set.qualitySamples", { n: m?.samples ?? 0 })}
        </p>
        {adm?.isAdmin && (
          <Link to="/admin/metrics" className="block text-xs text-primary underline">
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
function AvatarRow() {
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
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary to-[oklch(0.72_0.18_240)] text-base font-bold text-primary-foreground">
            C
          </div>
        )}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="press-in min-h-11 rounded-full border border-border bg-background px-4 text-sm font-medium disabled:opacity-60"
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
            className="press-in min-h-11 rounded-full px-3 text-sm text-muted-foreground"
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
      <p className="mt-1 text-[11px] text-muted-foreground">{t("settings.avatarHint")}</p>
    </div>
  );
}

function VideoRecordingToggle() {
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
      <ToggleRow
        label={t("settings.videoLabel")}
        hint={t("settings.videoHint")}
        value={video}
        onChange={toggle}
      />
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
function PlaceReminderToggle() {
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
        label={t("set.placeLabel")}
        hint={busy ? t("set.placeChecking") : t("set.placeHint")}
        value={on}
        onChange={(v) => void toggle(v)}
      />
      {blocked && (
        <p className="mt-2 rounded-xl bg-amber-50 p-2 text-[11px] leading-relaxed text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
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
function SoundAndHapticsPanel() {
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
    <div className="rounded-2xl border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold text-muted-foreground">{t("settings.feel")}</h3>

      <Label>{t("settings.soundLevel")}</Label>
      <div className="mt-1 grid grid-cols-3 gap-2">
        {(["off", "subtle", "full"] as const).map((v) => (
          <button
            key={v}
            onClick={() => pickLevel(v)}
            aria-pressed={level === v}
            className={`min-h-11 rounded-full border py-2.5 text-sm ${level === v ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`}
          >
            {v === "off"
              ? t("settings.soundOff")
              : v === "subtle"
                ? t("settings.soundSubtle")
                : t("settings.soundFull")}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <ToggleRow
          label={t("settings.haptics")}
          hint={t("settings.hapticsHint")}
          value={haptics}
          onChange={toggleHaptics}
        />
      </div>

      <p className="mt-3 text-[11px] text-muted-foreground">{t("settings.feelInstantHint")}</p>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-[11px] text-muted-foreground">{hint}</div>
      </div>
      {/* §11: the switch is 24px tall but the tap target is padded to 44px. */}
      <button
        onClick={() => onChange(!value)}
        role="switch"
        aria-checked={value}
        aria-label={label}
        className="grid h-11 w-11 shrink-0 place-items-center"
      >
        <span
          className={`relative block h-6 w-11 rounded-full transition-colors ${value ? "bg-primary" : "bg-secondary"}`}
        >
          <span
            className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${value ? "translate-x-5" : "translate-x-0"} motion-reduce:transition-none`}
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
      <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
        {t("settings.devOnly")}
      </p>
      <ThemeLabButton />
      <EffectLabButton />
      <UiThemePicker />
      <AiModelPanel />
    </div>
  );
}

/** UIテーマの比較。現行(default)は削除・変更しない前提で先頭に固定。 */
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
    <details className="rounded-2xl border border-border bg-card p-4" open>
      <summary className="cursor-pointer list-none text-sm font-semibold [&::-webkit-details-marker]:hidden">
        {t("settings.themeCompare")}{" "}
        <span className="ml-1 text-[11px] font-normal text-muted-foreground">
          ({UI_THEMES.length})
        </span>
      </summary>
      <p className="mt-1 text-[11px] text-muted-foreground">{t("settings.themeHint")}</p>
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
                <span className="block text-sm font-medium">
                  {themeMeta.name}
                  {themeMeta.id === "default" && (
                    <span className="ml-1.5 rounded-full bg-secondary px-1.5 py-0.5 text-[9px] text-muted-foreground">
                      {t("settings.themeKeep")}
                    </span>
                  )}
                </span>
                <span className="block text-[11px] leading-snug text-muted-foreground">
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
      <summary className="cursor-pointer list-none text-sm font-semibold [&::-webkit-details-marker]:hidden">
        {t("settings.aiSwitch")}
      </summary>

      {data?.effective && (
        <div className="mt-2 rounded-xl bg-secondary/60 p-2 text-[11px] leading-relaxed">
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
      <div className="mt-2 rounded-xl border border-border p-2 text-[11px] leading-relaxed">
        <div className="font-semibold">{t("settings.aiKeys")}</div>
        <ul className="mt-1 space-y-0.5">
          {(data?.presets ?? []).map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2">
              <span className="truncate">{p.label}</span>
              <span className={p.key_present ? "text-emerald-600" : "text-muted-foreground"}>
                {p.key_present
                  ? `✅ ${p.key_env_found} ${t("settings.aiKeyFound")}`
                  : `— ${p.api_key_env} ${t("settings.aiKeyMissing")}`}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-[10px] text-muted-foreground">{t("settings.aiKeysHint")}</p>
        {data?.keyError && (
          <p className="mt-1 rounded-lg bg-destructive/10 p-1.5 text-[10px] text-destructive">
            {data.keyError}
          </p>
        )}
      </div>

      <div className="mt-3 space-y-2">
        <div>
          <Label className="text-xs">{t("settings.aiProvider")}</Label>
          <select
            aria-label={t("set.aiProviderAria")}
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">{t("settings.aiEnvDefault")}</option>
            {(data?.presets ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
                {p.key_present ? "" : t("set.keyMissing", { env: p.api_key_env })}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[10px] text-muted-foreground">{t("settings.aiKeyNote")}</p>
        </div>
        <div>
          <Label className="text-xs">{t("settings.aiFast")}</Label>
          <Input
            value={fast}
            onChange={(e) => setFast(e.target.value)}
            placeholder="gemini-2.5-flash"
          />
        </div>
        <div>
          <Label className="text-xs">{t("settings.aiRich")}</Label>
          <Input
            value={rich}
            onChange={(e) => setRich(e.target.value)}
            placeholder="gemini-2.5-flash"
          />
        </div>
        <div>
          <Label className="text-xs">{t("settings.aiPremium")}</Label>
          <Input
            value={premium}
            onChange={(e) => setPremium(e.target.value)}
            placeholder="gemini-2.5-pro"
          />
        </div>

        {/* βテスト〜ローンチで「機能ごとに別のAI」を試せるようにする。 */}
        <div className="rounded-xl border border-border p-2">
          <div className="text-xs font-semibold">{t("settings.aiPerFeature")}</div>
          <div className="mt-2 space-y-2">
            {(data?.features ?? []).map((f) => (
              <div key={f.id}>
                <Label className="text-[11px]">{t(`settings.aiFeature.${f.id}`)}</Label>
                <Input
                  value={features[f.id] ?? ""}
                  onChange={(e) => setFeatures((prev) => ({ ...prev, [f.id]: e.target.value }))}
                  placeholder={t("settings.aiEnvDefault")}
                />
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">{t("settings.aiPerFeatureHint")}</p>
        </div>

        <Button className="w-full" onClick={save} disabled={saving}>
          {saving ? t("settings.saving") : t("settings.aiApply")}
        </Button>
        <p className="text-[10px] text-muted-foreground">{t("settings.aiModelNote")}</p>
      </div>
    </details>
  );
}
