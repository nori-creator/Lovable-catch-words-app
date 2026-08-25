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
import {
  AvatarRow,
  ChoiceRow,
  DangerZone,
  DataSourcesCard,
  PhoneticRow,
  PlaceReminderToggle,
  SelectRow,
  SettingsCard,
  SoundAndHapticsPanel,
  LEVEL_OPTIONS,
  VideoRecordingToggle,
} from "@/routes/_authenticated/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { L1_TABLE, l1ChoicesFor } from "@/lib/l1";
import { UI_LANGS, UI_LANG_LABEL_KEYS, getUiLang, tStatic as t } from "@/lib/i18n";
import { LogOut } from "lucide-react";
import { useState } from "react";

/**
 * 学習の束。丸いボタンの列が2列・3列・5列で並び、末尾にスイッチが2つ付く。
 */
export function SettingsChoicesScene() {
  const [mode, setMode] = useState("hybrid");
  const [photo, setPhoto] = useState("auto");
  const [speed, setSpeed] = useState("detail");
  const [strict, setStrict] = useState("normal");
  const [limit, setLimit] = useState(20);
  const [focus, setFocus] = useState("all");
  return (
    <SettingsCard title={t("settings.study")}>
      <div className="space-y-3">
        {/* **実物と同じ3択にする。**
            3つ目を足したとき、ここは2択のまま写しが残っていて、
            下の説明文だけが3択を語る絵になっていた
            (検査の絵で気づいた)。選択肢を手で写している限り、
            実物が変わっても絵は変わらない — このハーネスが避けようとして
            いる形そのものなので、写しは増やさず本物と同じ並びを保つ。 */}
        <ChoiceRow
          cols={3}
          label={t("settings.reviewMode")}
          hint={t("settings.reviewModeHint")}
          value={mode}
          onChange={setMode}
          options={[
            { value: "hybrid", label: t("settings.modeHybrid") },
            { value: "speaking", label: t("settings.modeSpeaking") },
            { value: "choice", label: t("settings.modeChoice") },
          ]}
        />
        {/* 要望 #16 の設定。**4つ並ぶ**ので、狭い画面で札が潰れないかを見る。 */}
        <ChoiceRow
          cols={4}
          label={t("settings.photoPref")}
          hint={t("settings.photoPrefHint")}
          value={photo}
          onChange={setPhoto}
          options={[
            { value: "auto", label: t("settings.photoAuto") },
            { value: "object", label: t("settings.photoObject") },
            { value: "cutout", label: t("settings.photoCutout") },
            { value: "selfie", label: t("settings.photoSelfie") },
          ]}
        />
        {/* 要望 #18 の速さのつまみ。 */}
        <ChoiceRow
          cols={2}
          label={t("settings.catchSpeed")}
          hint={t("settings.catchSpeedHint")}
          value={speed}
          onChange={setSpeed}
          options={[
            { value: "detail", label: t("settings.speedDetail") },
            { value: "fast", label: t("settings.speedFast") },
          ]}
        />
        <ChoiceRow
          cols={3}
          label={t("settings.strictness")}
          value={strict}
          onChange={setStrict}
          options={[
            { value: "easy", label: t("settings.easy") },
            { value: "normal", label: t("settings.normal") },
            { value: "strict", label: t("settings.strict") },
          ]}
        />
        {/* 5列は**いちばん狭い**。390px の画面で 5 つの丸を並べるので、
            ここが押せる大きさと文字の収まりの下限になる。 */}
        <ChoiceRow
          cols={5}
          label={t("settings.reviewLimit")}
          hint={t("settings.reviewLimitHint")}
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
        <ChoiceRow
          cols={3}
          label={t("settings.reviewFocus")}
          hint={t("settings.reviewFocusHint")}
          value={focus}
          onChange={setFocus}
          options={[
            { value: "all", label: t("settings.focusAll") },
            { value: "weak", label: t("settings.focusWeak") },
            { value: "new", label: t("settings.focusNew") },
          ]}
        />
      </div>
      {/* 束の**中**に入る。丸い列の下に区切り線で足されるので、
          外に出すと区切り線の位置も余白も別物になる。 */}
      <VideoRecordingToggle />
      <PlaceReminderToggle />
    </SettingsCard>
  );
}

/**
 * 言語の束。**選択が5つ縦に積む**、この画面でいちばん密な所。
 * 「今のレベル」と「目標レベル」は同じ一覧を使うので、見分けは
 * ラベルだけが頼りになる。2つしか撮っていなかった間は、その密度も
 * 見分けにくさも一度も測られていなかった。
 */
export function SettingsSelectsScene() {
  const [target, setTarget] = useState("zh-TW");
  const [cur, setCur] = useState("TOCFL-2");
  const [goal, setGoal] = useState("TOCFL-4");
  const [native, setNative] = useState("ja");
  const [ui, setUi] = useState<string>(() => getUiLang());
  return (
    <SettingsCard title={t("settings.language")}>
      <div className="space-y-3">
        <SelectRow
          id="lang-target"
          label={t("settings.targetLang")}
          value={target}
          onChange={setTarget}
          options={[
            { value: "zh-TW", label: t("settings.langZhTw") },
            { value: "en", label: t("settings.langEn") },
          ]}
        />
        <SelectRow
          id="lang-cur"
          label={t("settings.currentLevel")}
          value={cur}
          onChange={setCur}
          options={LEVEL_OPTIONS}
        />
        <SelectRow
          id="lang-level"
          label={t("settings.levelGoal")}
          hint={t("settings.levelHint")}
          value={goal}
          onChange={setGoal}
          options={LEVEL_OPTIONS}
        />
        <PhoneticRow />
        <SelectRow
          id="lang-native"
          label={t("settings.nativeLang")}
          hint={t("settings.nativeLangHint")}
          value={native}
          onChange={setNative}
          options={l1ChoicesFor(target).map((code) => ({
            value: code,
            // **本物と同じ選び方にする。** ここだけ `labelJa` に決め打つと、
            // 繁體中文の画面を撮っても日本語の言語名が写り、実物と違う絵を
            // 検査することになる（この app が繰り返してきた形）。
            label: ui === "ja" ? L1_TABLE[code].labelJa : L1_TABLE[code].labelEn,
          }))}
        />
        <SelectRow
          id="lang-ui"
          label={t("settings.uiLang")}
          value={ui}
          onChange={setUi}
          options={UI_LANGS.map((code) => ({ value: code, label: t(UI_LANG_LABEL_KEYS[code]) }))}
        />
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
  return <DataSourcesCard />;
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
      </SettingsCard>

      <SoundAndHapticsPanel />
    </div>
  );
}

/**
 * 画面のいちばん下。保存・サインアウト・**取り消せない操作**。
 * 消去は開いた状態と、確認語を入れて武装した状態の両方を撮る
 * (閉じたままでは中身が一度も描かれない)。
 */
export function SettingsDangerScene({ q }: { q: URLSearchParams }) {
  const variant = q.get("variant");
  const saving = variant === "saving";
  return (
    <div className="space-y-7">
      {/* 保存中は文字が「保存」→「保存中...」に伸びて、押せなくなる。
          伸びた側と沈んだ色を撮らないと、待っている間の面が未検査になる。 */}
      <Button className="w-full" disabled={saving}>
        {saving ? t("settings.saving") : t("settings.save")}
      </Button>
      <Button variant="outline" className="w-full">
        <LogOut className="mr-2 h-4 w-4" /> {t("settings.signout")}
      </Button>
      <DangerZone defaultOpen defaultConfirmText={variant === "armed" ? "削除" : ""} />
    </div>
  );
}
