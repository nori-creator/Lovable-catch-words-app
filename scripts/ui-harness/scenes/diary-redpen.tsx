/**
 * **日記の赤ペン**（オーナー指示 2026-10-01「日記を書いたら AI が赤ペン先生のように添削」）。
 *
 * 本番の `DiaryWriteSheet` / `RedPenSummarySheet` をそのまま描く。AI の代わりに決まった答えを
 * 返すので、欄に文を打って「。」を押すと、その場で赤ペンが入る流れも試せる（見本にない文は
 * 「直す所なし」の花丸が付く）。
 *
 * - `?design=a|b|c` … 見た目の案（a 余白に赤ペン / b ノートの見出し / c 先生の吹き出し）
 * - `?state=summary` … 書き終わった後のまとめ（言いたかったこと・模範解答・今日覚える物）
 * - `?state=loading` … まとめを作っている間
 * - `?ui=en` などの表示言語は帯の切り替えに従う（赤ペンの中身は日本語の見本）。
 */
import { useState } from "react";
import { DiaryWriteSheet, RedPenSummarySheet, type RedPenDesign } from "@/components/DiaryRedPen";
import { redPenKey, type RedPenLine, type RedPenSummary } from "@/lib/red-pen";

export const REDPEN_DIARY =
  "今天我去了夜市。我吃很多的雞排，很好吃。人很多，我覺得很累但是開心。明日も行きたい。";

export const REDPEN_LINES: Record<string, RedPenLine> = {
  "今天我去了夜市。": {
    verdict: "good",
    corrected: "今天我去了夜市。",
    marks: [],
    note: "「去了」で「行った」。終わった出来事は「了」で言える",
  },
  "我吃很多的雞排，很好吃。": {
    verdict: "fix",
    corrected: "我吃了很多雞排，真的很好吃。",
    marks: [{ wrong: "吃很多的雞排", right: "吃了很多雞排", why: "量の前に「的」は付けない" }],
    note: "気持ちを込めるなら「很好吃」より「真的很好吃」",
  },
  "人很多，我覺得很累但是開心。": {
    verdict: "better",
    corrected: "人好多，雖然很累，但是很開心。",
    marks: [
      { wrong: "我覺得很累但是開心", right: "雖然很累，但是很開心", why: "「雖然〜但是〜」の型で" },
    ],
    note: "「但是」の後の形容詞にも「很」を付ける",
  },
  "明日も行きたい。": {
    verdict: "say",
    corrected: "明天還想再去。",
    marks: [],
    note: "「また〜したい」は「還想再＋動詞」",
  },
};

export const REDPEN_SUMMARY: RedPenSummary = {
  intent:
    "夜市で雞排をたくさん食べて、疲れたけれど楽しかった、明日もまた行きたいという気持ちを伝えたかったようです。",
  correction:
    "今天我去了夜市。我吃了很多雞排，真的很好吃。人好多，雖然很累，但是很開心。明天還想再去。",
  model_answer:
    "今天晚上我去逛夜市，吃了一大塊雞排，又香又脆，真的好好吃！人超多的，雖然走得很累，但是心情很好。明天還想再去一次。",
  model_answer_translation:
    "今夜は夜市を歩いて、大きな雞排を食べた。香ばしくてサクサクで本当においしかった！人がすごく多くて歩き疲れたけど、気分はよかった。明日もまた行きたい。",
  learn: [
    {
      kind: "pattern",
      text: "雖然A，但是B",
      reading: "ㄙㄨㄟ ㄖㄢˊ … ㄉㄢˋ ㄕˋ",
      meaning: "Aだけど、B",
      note: "「疲れたけど楽しい」のように2つの気持ちを並べる時",
      example: "雖然很累，但是很開心。",
    },
    {
      kind: "pattern",
      text: "還想再＋動詞",
      reading: "ㄏㄞˊ ㄒㄧㄤˇ ㄗㄞˋ",
      meaning: "また〜したい",
      note: "「明日も行きたい」と言いたかった所",
      example: "明天還想再去。",
    },
    {
      kind: "chunk",
      text: "又香又脆",
      reading: "ㄧㄡˋ ㄒㄧㄤ ㄧㄡˋ ㄘㄨㄟˋ",
      meaning: "香ばしくてサクサク",
      note: "揚げ物をおいしいと言う時の決まった言い方",
      example: "這塊雞排又香又脆。",
    },
    {
      kind: "chunk",
      text: "逛夜市",
      reading: "ㄍㄨㄤˋ ㄧㄝˋ ㄕˋ",
      meaning: "夜市をぶらぶらする",
      note: "夜市には「去」より「逛」をよく使う",
      example: "週末一起去逛夜市吧！",
    },
    {
      kind: "word",
      text: "超多",
      reading: "ㄔㄠ ㄉㄨㄛ",
      meaning: "すごく多い",
      note: "話し言葉。「很多」より気持ちが強い",
      example: "今天人超多的。",
    },
    {
      kind: "grammar",
      text: "動詞＋了＋数量＋名詞",
      reading: "",
      meaning: "（どれだけ）〜した",
      note: "「吃很多的雞排」は「吃了很多雞排」。量の前に「的」は付けない",
      example: "我吃了三塊雞排。",
    },
  ],
};

/** AI の代わり。見本の文は決まった答え、それ以外は花丸。 */
export async function fakeRedPen(sentence: string): Promise<RedPenLine> {
  await new Promise((r) => setTimeout(r, 900));
  return (
    REDPEN_LINES[sentence.trim()] ?? {
      verdict: "good",
      corrected: sentence.trim(),
      marks: [],
      note: "（見本）この文には直す所がありません",
    }
  );
}

export async function fakeSummary(): Promise<RedPenSummary> {
  await new Promise((r) => setTimeout(r, 1500));
  return REDPEN_SUMMARY;
}

export function DiaryRedPenScene({ q }: { q: URLSearchParams }) {
  const state = q.get("state");
  const d = q.get("design");
  const design: RedPenDesign = d === "b" || d === "c" ? d : "a";
  const [summary, setSummary] = useState<"none" | "loading" | "ready">(
    state === "summary" ? "ready" : state === "loading" ? "loading" : "none",
  );
  // 見本の赤ペンは最初から入れておく（開いた瞬間に、文のすぐ下の赤が見える）。
  const initial = Object.fromEntries(
    Object.entries(REDPEN_LINES).map(([s, line]) => [redPenKey("zh-TW", s), line]),
  );
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "linear-gradient(180deg, #5b4a3a 0%, #2e241b 100%)",
      }}
    >
      {summary === "none" ? (
        <DiaryWriteSheet
          title="10月1日（水）の日記"
          initialText={REDPEN_DIARY}
          font="hand"
          inputFontFamily='"Zen Kurenaido", "Iansui", cursive'
          target="zh-TW"
          check={(s) => fakeRedPen(s)}
          initialResults={initial}
          design={design}
          onCancel={() => {}}
          onSave={() => {
            setSummary("loading");
            void fakeSummary().then(() => setSummary("ready"));
          }}
        />
      ) : (
        <RedPenSummarySheet
          state={
            summary === "loading"
              ? { status: "loading" }
              : { status: "ready", summary: REDPEN_SUMMARY }
          }
          font="hand"
          original={REDPEN_DIARY}
          design={design}
          onClose={() => setSummary("none")}
          onRetry={() => {}}
        />
      )}
    </div>
  );
}
