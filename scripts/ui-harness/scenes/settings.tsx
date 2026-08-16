/**
 * 設定画面の場面。**ルートに書かれている本物の部品を描く。**
 *
 * これで、ルート直書きのまま検査に入っていない画面がゼロになる。
 * この画面は切替・選択・**取り消せない操作**が集まっているので、
 * 押せる大きさと焦点の検査がいちばん効く場所でもある。
 */
import {
  AvatarRow,
  ChoiceRow,
  DangerZone,
  PhoneticRow,
  SelectRow,
  SettingsCard,
  SoundAndHapticsPanel,
  ToggleRow,
} from "@/routes/_authenticated/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";

/** 学習の設定。丸いボタンの列が2列・3列・5列で並ぶ。 */
export function SettingsChoicesScene() {
  const [mode, setMode] = useState("speaking");
  const [strict, setStrict] = useState("normal");
  const [limit, setLimit] = useState(20);
  const [focus, setFocus] = useState("all");
  return (
    <SettingsCard title="学習">
      <div className="space-y-3">
        <ChoiceRow
          cols={2}
          label="復習の型"
          hint="話して答えるか、4つから選ぶか。"
          value={mode}
          onChange={setMode}
          options={[
            { value: "speaking", label: "話す" },
            { value: "choice", label: "4択" },
          ]}
        />
        <ChoiceRow
          cols={3}
          label="発音の厳しさ"
          value={strict}
          onChange={setStrict}
          options={[
            { value: "easy", label: "やさしい" },
            { value: "normal", label: "ふつう" },
            { value: "strict", label: "きびしい" },
          ]}
        />
        {/* 5列は**いちばん狭い**。390px の画面で 5 つの丸を並べるので、
            ここが押せる大きさと文字の収まりの下限になる。 */}
        <ChoiceRow
          cols={5}
          label="1日の復習"
          hint="ここで決めた数で今日ぶんが終わります。"
          value={limit}
          onChange={setLimit}
          options={[
            { value: 10, label: "10" },
            { value: 20, label: "20" },
            { value: 30, label: "30" },
            { value: 50, label: "50" },
            { value: 0, label: "上限なし" },
          ]}
        />
        <ChoiceRow
          cols={3}
          label="重点"
          hint="苦手なものから出すか、新しいものから出すか。"
          value={focus}
          onChange={setFocus}
          options={[
            { value: "all", label: "ぜんぶ" },
            { value: "weak", label: "苦手" },
            { value: "new", label: "新しい" },
          ]}
        />
      </div>
    </SettingsCard>
  );
}

/** 言語の設定。選択肢と、発音表記の列。 */
export function SettingsSelectsScene() {
  const [target, setTarget] = useState("zh-TW");
  const [level, setLevel] = useState("TOCFL-2");
  return (
    <SettingsCard title="言語">
      <div className="space-y-3">
        <SelectRow
          id="s-target"
          label="学ぶ言語"
          value={target}
          onChange={setTarget}
          options={[
            { value: "zh-TW", label: "台湾華語" },
            { value: "en", label: "English" },
          ]}
        />
        <SelectRow
          id="s-level"
          label="いまの級"
          hint="いまの級に合わせて、出てくる語の難しさが変わります。"
          value={level}
          onChange={setLevel}
          options={[1, 2, 3, 4, 5, 6].map((n) => ({
            value: `TOCFL-${n}`,
            label: `TOCFL Level ${n}`,
          }))}
        />
        <PhoneticRow />
      </div>
    </SettingsCard>
  );
}

/** スイッチと、名前・顔写真。プロフィールは読み込み中の面になる。 */
export function SettingsTogglesScene() {
  const [a, setA] = useState(true);
  const [b, setB] = useState(false);
  return (
    <div className="space-y-4">
      <SettingsCard title="プロフィール">
        <div className="space-y-3">
          <AvatarRow />
          <div>
            <Label htmlFor="s-dn">表示名</Label>
            <Input id="s-dn" defaultValue="のり" />
          </div>
        </div>
      </SettingsCard>
      <SettingsCard title="手ざわり">
        <div className="space-y-4">
          <ToggleRow
            label="復習を動画で残す"
            hint="話しているところを端末の中だけに残します。"
            value={a}
            onChange={setA}
          />
          <ToggleRow
            label="場所で思い出す"
            hint="撮った場所の近くに来たら知らせます。"
            value={b}
            onChange={setB}
          />
        </div>
      </SettingsCard>
      <SoundAndHapticsPanel />
    </div>
  );
}

/**
 * 取り消せない操作。**開いた状態と、確認語を入れて武装した状態**の両方。
 * 閉じたままでは中身が一度も描かれないので、`open` を付けて撮る。
 */
export function SettingsDangerScene({ q }: { q: URLSearchParams }) {
  const armed = q.get("variant") === "armed";
  return (
    <div className="space-y-4">
      <Button className="w-full">保存する</Button>
      <Button variant="outline" className="w-full">
        サインアウト
      </Button>
      <DangerZone defaultOpen defaultConfirmText={armed ? "削除" : ""} />
    </div>
  );
}
