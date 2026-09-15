/**
 * 動きを見せるかの決め方。**「スマホだけアニメーションが全部消える」への答え。**
 *
 * オーナー報告 2026-09-15:
 * > 「パソコンで開くとアニメーションがあるんだけど、アンドロイドのスマホや
 * >  ダウンロードしたアプリだと、それらのアニメーションが**全て消える**」
 *
 * 原因は端末の `prefers-reduced-motion: reduce`（省電力モード / ユーザー補助の
 * 「アニメーションを削除」/ iOS の「視差効果を減らす」）。アプリはその返事を
 * 全部の動きへ効かせていたので、同時に全部消えた。
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MOTION,
  motionDiagnosisKey,
  parseMotionChoice,
  resolveMotion,
} from "./motion-pref";

describe("端末の設定と、本人の選択の混ぜ方", () => {
  /**
   * **既定は「常に見せる」**（オーナー指示 2026-09-15「アニメーションの
   * 設定の欄は削除して、全てのユーザーをアニメーションありにして」）。
   *
   * もとは `system`（端末に従う）だった。**これは端末の
   * `prefers-reduced-motion` を尊重しない、ということ。** あの設定は
   * 前庭障害のある人のために在り、大きく動く絵は実害になりうる。
   * 2度お伝えしたうえでの決定なので、そのとおりにしてある。
   * 戻すのはここを `"system"` に戻すだけ（仕組みは丸ごと残してある）。
   */
  it("**既定は常に見せる**（端末の設定を見ない、というオーナー決定）", () => {
    expect(DEFAULT_MOTION).toBe("full");
    // 混ぜ方そのものは残してある。戻すときはここがそのまま効く。
    expect(resolveMotion("system", true)).toBe("reduce");
    expect(resolveMotion("system", false)).toBe("full");
  });

  it("**本人が「見せる」を選んだら、端末より優先する**（これが今回の直しの本体）", () => {
    // 端末が reduce を返していても出す。「見せて」と言った人に見せないのは、
    // 設定が仕事をしていないのと同じ。
    expect(resolveMotion("full", true)).toBe("full");
  });

  it("本人が「減らす」を選んだら、端末が許していても減らす", () => {
    expect(resolveMotion("reduce", false)).toBe("reduce");
  });
});

describe("保存された値の読み方", () => {
  it("知らない値・空・壊れた値はすべて既定へ倒す（`localStorage` は人が触れる）", () => {
    for (const bad of [null, undefined, "", "yes", 1, {}, "FULL"]) {
      expect(parseMotionChoice(bad)).toBe(DEFAULT_MOTION);
    }
  });

  it("3つの正しい値はそのまま通る", () => {
    expect(parseMotionChoice("system")).toBe("system");
    expect(parseMotionChoice("full")).toBe("full");
    expect(parseMotionChoice("reduce")).toBe("reduce");
  });
});

describe("**なぜ消えているのかを画面に出す**", () => {
  /**
   * 選択肢を並べるだけでは、自分で入れた覚えのない人には何も伝わらない。
   * 端末がいま何を返しているかをそのまま見せて、初めて原因に辿り着ける。
   */
  it("端末に従っていて、端末が減らしているときだけ『端末が原因』と言う", () => {
    expect(motionDiagnosisKey("system", true)).toBe("settings.motion.osReduces");
    expect(motionDiagnosisKey("system", false)).toBe("settings.motion.osAllows");
  });

  it("本人が選んでいるときは、端末の話をしない（選択が効いていることだけ言う）", () => {
    expect(motionDiagnosisKey("full", true)).toBe("settings.motion.forcedFull");
    expect(motionDiagnosisKey("full", false)).toBe("settings.motion.forcedFull");
    expect(motionDiagnosisKey("reduce", true)).toBe("settings.motion.forcedReduce");
    expect(motionDiagnosisKey("reduce", false)).toBe("settings.motion.forcedReduce");
  });
});
