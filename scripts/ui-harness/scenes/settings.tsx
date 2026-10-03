/**
 * 設定画面の場面。**ルートに書かれている本物の部品を、本物の文言で描く。**
 *
 * これで、ルート直書きのまま検査に入っていない画面がゼロになる。
 * この画面は切替・選択・**取り消せない操作**が集まっているので、
 * 押せる大きさと焦点の検査がいちばん効く場所でもある。
 *
 * ## 文言を書き写さない
 * 部品を本物にしても、**入れる文字が別物なら別の画面を見ている**。
 * 手で書いた「上限なし」を置いていたせいで、独立監査が「丸が縦長に
 * 崩れて『上限な/し』と割れる」と指摘した — 実物は「無制限」で、
 * 割れていたのは雛形だけだった。
 *
 * その教訓を書いた後も、**直したのは4つの場面のうち1つだけ**だった。
 * 残りは「学ぶ言語」「いまの級」「保存する」を撮り続けていた —
 * 実物は「学習言語」「今のレベル」「保存」。長さも改行位置も別物なので、
 * 収まりの検査は何も保証していなかった。全部 `t()` で引く。
 *
 * ## 並びも書き写さない
 * 束の中身と順番も実物に合わせる。言語の束は選択が**5つ**あるのに
 * 2つしか撮っていなかったし、学習の束の末尾にある2つのスイッチは
 * どこにも無かった(雛形では別の「手ざわり」の束をでっち上げていて、
 * `SoundAndHapticsPanel` が持つ同名の見出しと二重になっていた)。
 */
import { DataSourcesList } from "@/components/DataSourcesList";
import { MotionProvider } from "@/components/motion-provider";
import {
  CatchAnimationRow,
  MotionToggleRow,
  ToggleRow,
  AvatarRow,
  ChoiceRow,
  DangerZone,
  PhoneticRow,
  PhotoLibrarySyncToggle,
  PlaceReminderToggle,
  ReviewReminderSettings,
  SettingsCard,
  SoundAndHapticsPanel,
  LEVEL_OPTIONS,
} from "@/components/screens/SettingsScreen";
import { PickerRow } from "@/components/PickerRow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UI_LANGS, UI_LANG_LABEL_KEYS, getUiLang, tStatic as t } from "@/lib/i18n";
import { LogOut } from "lucide-react";
import { useState } from "react";

/**
 * 学習の束。**本番の並びと同じ**（2026-10-03 全画面の点検で直した）:
 * 表示する写真（2列）→ 1日の復習量（5列）→ 区切り線 → 撮影後に自撮り → 写真の同期。
 *
 * 前はここに、本番から消えた「発音判定の厳しさ」「優先する記憶段階」（期限順など）の
 * 列が残っていて、本番に無い「By due d…」の切れを検査していた。場所の通知は本番では
 * 通知の束にある（`SettingsNotifyScene`）。
 */
export function SettingsChoicesScene() {
  const [photo, setPhoto] = useState("object");
  const [limit, setLimit] = useState(20);
  const [selfie, setSelfie] = useState(true);
  return (
    <SettingsCard title={t("settings.study")}>
      <div className="space-y-3">
        <ChoiceRow
          cols={2}
          label={t("settings.photoPref")}
          value={photo}
          onChange={setPhoto}
          options={[
            { value: "object", label: t("settings.photoObject") },
            { value: "selfie", label: t("settings.photoSelfie") },
          ]}
        />
        {/* 5列は**いちばん狭い**。390px の画面で 5 つの丸を並べるので、
            ここが押せる大きさと文字の収まりの下限になる。 */}
        <ChoiceRow
          cols={5}
          label={t("settings.reviewLimit")}
          value={limit}
          onChange={setLimit}
          options={[
            { value: 10, label: "10" },
            { value: 20, label: "20" },
            { value: 30, label: "30" },
            { value: 50, label: "50" },
            { value: 0, label: t("settings.reviewLimitNone") },
          ]}
        />
      </div>
      <div className="mt-4 border-t border-border pt-3">
        <ToggleRow
          label={t("settings.selfieMode")}
          description={t("settings.selfieModeDesc")}
          value={selfie}
          onChange={setSelfie}
        />
      </div>
      <PhotoLibrarySyncToggle />
    </SettingsCard>
  );
}

/**
 * 言語の束。**輪が4つ縦に積む**、この画面でいちばん密な所
 * （2026-09-15 に `<select>` から `WheelPicker` へ替えた）。
 * 「今のレベル」と「目標レベル」は同じ一覧を使うので、見分けは
 * ラベルだけが頼りになる。2つしか撮っていなかった間は、その密度も
 * 見分けにくさも一度も測られていなかった。
 */
export function SettingsSelectsScene() {
  // `?target=en` … 英語を学んでいる人の束（発音表記の行が出ないこと）。
  const [target, setTarget] = useState(
    () => new URLSearchParams(location.search).get("target") ?? "zh-TW",
  );
  const [cur, setCur] = useState("TOCFL-2");
  const [goal, setGoal] = useState("TOCFL-4");
  const [ui, setUi] = useState<string>(() => getUiLang());
  return (
    <SettingsCard title={t("settings.language")}>
      <div className="space-y-3">
        {/* 母語がいちばん上（実物と同じ。オーナー指示 2026-09-23）。 */}
        {/* **母語の行は本物と一緒に消した。** ここに写しを残すと、
            設定から消したのに絵にだけ残り、翻訳キーが生のまま写る
            (実際そうなって、検査はそれでも合格していた)。 */}
        <PickerRow
          id="lang-ui"
          label={t("settings.uiLang")}
          value={ui}
          onChange={setUi}
          options={UI_LANGS.map((code) => ({ value: code, label: t(UI_LANG_LABEL_KEYS[code]) }))}
        />
        <PickerRow
          id="lang-target"
          label={t("settings.targetLang")}
          value={target}
          onChange={setTarget}
          options={[
            { value: "zh-TW", label: t("settings.langZhTw") },
            { value: "en", label: t("settings.langEn") },
          ]}
        />
        <PickerRow
          id="lang-cur"
          label={t("settings.currentLevel")}
          value={cur}
          onChange={setCur}
          options={LEVEL_OPTIONS}
        />
        <PickerRow
          id="lang-level"
          label={t("settings.levelGoal")}
          value={goal}
          onChange={setGoal}
          options={LEVEL_OPTIONS}
        />
        {/* **本物と同じく学習言語を渡す。** ここだけ渡さないと、
            英語を選んだ絵にも注音・拼音が写る(実物と違う絵を検査する)。 */}
        <PhoneticRow lang={target} />
      </div>
    </SettingsCard>
  );
}

/**
 * 名前と顔写真・外観・手ざわり。実物の並び(プロフィール → … → 外観 →
 * 手ざわり)のうち、言語と学習を別の場面に譲った残り。
 *
 * **外観の束は今まで一度も撮っていなかった。** 明暗を選ぶのはこの束
 * なので、検査が6面を回る根拠そのものがここに在る。
 */
/**
 * データの出典。**利用の条件**なので、絵に入れて見えることを確かめる
 * （CEFR-J は商用可だが出典明記が条件）。
 */
export function SettingsSourcesScene() {
  return <DataSourcesList />;
}

export function SettingsTogglesScene() {
  const [theme, setTheme] = useState("system");
  return (
    <div className="space-y-7">
      <SettingsCard title={t("settings.profile")}>
        <div className="space-y-3">
          <AvatarRow />
          <div>
            <Label htmlFor="dn">{t("settings.displayName")}</Label>
            <Input id="dn" defaultValue="のり" />
          </div>
        </div>
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
        {/* アニメーションはオン・オフのスイッチ（オーナー指示 2026-10-02）。
            実物と同じ部品を、実物と同じ保存の仕組みの中で動かす。 */}
        <MotionProvider>
          <MotionToggleRow />
        </MotionProvider>
        {/* キャッチの演出（しっかり・短く・オフ）。本番では動きのスイッチのすぐ下。 */}
        <CatchAnimationRow />
      </SettingsCard>

      <SoundAndHapticsPanel />
    </div>
  );
}

/**
 * 画面のいちばん下。サインアウト・**取り消せない操作**。
 * 消去は開いた状態と、確認語を入れて武装した状態の両方を撮る
 * (閉じたままでは中身が一度も描かれない)。
 *
 * **保存の釦は無い**（本番から消えた。オーナー指示 2026-09-23「変更したら即適用して」）。
 * 前はここにだけ残っていて、本番に無い釦を検査していた（2026-10-03 全画面の点検）。
 */
export function SettingsDangerScene({ q }: { q: URLSearchParams }) {
  const variant = q.get("variant");
  return (
    <div className="space-y-7">
      <Button variant="outline" className="w-full">
        <LogOut className="mr-2 h-4 w-4" /> {t("settings.signout")}
      </Button>
      <DangerZone defaultOpen defaultConfirmText={variant === "armed" ? "削除" : ""} />
    </div>
  );
}

/**
 * 設定の上半分を本番の順で（言語 → 学習 → 通知）。前は学習の束が2回出ていた。
 */
export function SettingsPolishScene() {
  // 保存ボタンは無い（オーナー指示 2026-09-23「変更したら即適用して」）。
  return (
    <div className="settings-page space-y-7 pb-24">
      <SettingsSelectsScene />
      <SettingsChoicesScene />
      <SettingsCard title={t("settings.notifications")}>
        <ReviewReminderSettings />
        <PlaceReminderToggle />
      </SettingsCard>
    </div>
  );
}

/**
 * **通知**（オーナー指示 2026-09-27「チュートリアル中に通知の時刻を設定できる
 * ようにしてるんだけど、それを設定の項目に追加して実装して」）。
 *
 * `?mode=custom|ai|off`（既定は「おまかせ」）。昨日 8:15 に開いた記録を置いて、
 * 「次の通知」がどう決まるかを見せる。
 */
export function SettingsNotifyScene({ q }: { q: URLSearchParams }) {
  useState(() => {
    const mode = q.get("mode") ?? "ai";
    try {
      localStorage.setItem(
        "review-reminder-prefs-v1",
        JSON.stringify({ mode, times: ["08:30", "21:00"], ai: { srs: true, habit: true } }),
      );
      const y = new Date();
      y.setDate(y.getDate() - 1);
      y.setHours(8, 15, 0, 0);
      localStorage.setItem("app-opens-v1", JSON.stringify([y.toISOString()]));
    } catch {
      /* 使えない環境では既定のまま */
    }
    return null;
  });
  return (
    <div className="space-y-7">
      <SettingsCard title={t("settings.notifications")}>
        <ReviewReminderSettings />
        <PlaceReminderToggle />
      </SettingsCard>
    </div>
  );
}
