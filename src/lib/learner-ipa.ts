/**
 * **学習者の見慣れた発音記号に直す**（オーナー報告 2026-09-27「学習言語が
 * 英語の4択で、英単語の下の発音記号が見たことない記号 → 日本・台湾で
 * 使われる世界的に標準な英語の発音記号に」）。
 *
 * 米式の読みは CMUdict から機械的に作っており、音声学の精密な記号
 * （ɹ・ɝ・ɚ・ɡ、長さの印なし）になっていた。日本の英和辞典・台湾の
 * 教材で見る IPA（いわゆる簡略表記）は:
 *
 * | 精密   | 見慣れた形 | 例                    |
 * |--------|-----------|-----------------------|
 * | ɹ      | r         | ɹɛd → red /rɛd/        |
 * | ɝ      | əːr       | bɝd → bird /bəːrd/     |
 * | ɚ      | ər        | ˈwɔtɚ → water /ˈwɔːtər/|
 * | ɡ      | g         | 字形だけの違い          |
 * | i / u（強勢のある長い音） | iː / uː | ˈsi → see /siː/ |
 * | ɔ      | ɔː        | ɔl → all /ɔːl/          |
 *
 * **語末の弱い i（happy の -y）は短いまま**（辞書でも i）。
 * 表示のときだけ直す（保存してある値は変えない — 読み上げや検索は
 * 精密な形のほうが扱いやすい）。
 */
export function learnerIpa(ipa: string): string {
  if (!ipa) return ipa;
  let s = ipa.replace(/ɹ/g, "r").replace(/ɝː?/g, "əːr").replace(/ɚ/g, "ər").replace(/ɡ/g, "g");
  // 長い母音。後ろに ː が既に在る・二重母音の後半（aɪ の ɪ など）は触らない。
  // i は「後ろに母音記号・ː が無い i」。ただし語末の無強勢の i は短いまま。
  s = s.replace(/(?<![aeɔoʊ])i(?![ːəɪ])/g, (m, off: number, all: string) => {
    const rest = all.slice(off + 1);
    const atWordEnd = rest === "" || /^[\s/,)]/.test(rest);
    if (atWordEnd && !stressedSyllableBefore(all, off)) return "i";
    return "iː";
  });
  s = s.replace(/(?<![aoɔ])u(?![ːə])/g, "uː");
  s = s.replace(/ɔ(?![ːɪ])/g, "ɔː");
  return s;
}

/** その位置の音節に主強勢の印が付いているか（`ˈsi` の i なら true）。 */
function stressedSyllableBefore(s: string, at: number): boolean {
  for (let k = at - 1; k >= 0; k--) {
    const c = s[k];
    if (c === "ˈ") return true;
    if (c === "ˌ" || c === "." || /[aeiouæɑɔəɛɪʊʌ]/.test(c)) return false;
  }
  // 1音節の語（強勢の印が無い）は強い。
  return !/[ˈˌ]/.test(s);
}
