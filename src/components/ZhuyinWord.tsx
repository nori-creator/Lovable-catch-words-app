import type { ElementType } from "react";
import { targetProfile } from "@/lib/target-profile";
import { useReadingPref } from "@/lib/phonetic";
import { pairZhuyin, type ZhuyinUnit } from "@/lib/zhuyin-layout";

/**
 * 注音を**字の右に縦に**組むか。組めるときは1字ずつの組を返す。
 *
 * 組むのは「学習言語に注音があり、読みの設定が注音で、字と音節の数が
 * 合う」ときだけ。ピンインを選んでいる人・英語の語・数の合わない語は
 * `null` — 呼ぶ側は今までどおり読みを下の行に出す（オーナー指示
 * 2026-09-27「ピンインはそのまま」）。
 */
export function useZhuyinUnits(
  lang: string | null | undefined,
  headword: string | null | undefined,
  zhuyin: string | null | undefined,
): ZhuyinUnit[] | null {
  const profile = targetProfile(lang);
  const pref = useReadingPref(profile);
  if (!profile.readings.includes("zhuyin") || pref !== "zhuyin") return null;
  return pairZhuyin(headword, zhuyin);
}

/**
 * 字の右に注音を縦に積んだ見出し語（台湾の教科書と同じ組み方）。
 *
 * - 注音の記号は字の右に上から縦に並ぶ
 * - 2〜4声の印は、その列のさらに右（最後の記号の高さ）
 * - 軽声の印（˙）は列の上
 *
 * 大きさは字の大きさから決まる（`em`）ので、見出し・候補・4択のどこに
 * 置いても同じ釣り合いになる。読み上げでは語だけを読む（記号を1つずつ
 * 読ませない）。
 */
export function ZhuyinWord({
  units,
  lang,
  as: Tag = "span",
  className,
}: {
  units: ZhuyinUnit[];
  lang?: string | null;
  as?: ElementType;
  className?: string;
}) {
  const word = units.map((u) => u.char).join("");
  return (
    <Tag lang={targetProfile(lang).scriptLang} className={`zy-word ${className ?? ""}`}>
      <span className="sr-only">{word}</span>
      <span aria-hidden className="zy-word__row">
        {units.map((u, i) => (
          <span key={i} className="zy-unit">
            <span className="zy-char">{u.char}</span>
            {u.zhuyin && (
              <span className="zy-col" data-neutral={u.zhuyin.neutral ? "" : undefined}>
                {u.zhuyin.neutral && <span className="zy-neutral">˙</span>}
                {[...u.zhuyin.body].map((s, j, all) => (
                  <span key={j} className="zy-sym">
                    {s}
                    {j === all.length - 1 && u.zhuyin!.tone && (
                      <span className="zy-tone">{u.zhuyin!.tone}</span>
                    )}
                  </span>
                ))}
              </span>
            )}
          </span>
        ))}
      </span>
    </Tag>
  );
}
