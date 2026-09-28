/**
 * **撮った後の単語の候補**（本物の `CandidatePicker`）。オーナー指示 2026-09-28
 * 「柚子みたいにこれだけ大きく表示したり、単語の解説を長く書くのではなく、他にも写ってる
 * ものと同じ大きさで表示して。柚子をタップしたら次の画面に移り、柚子は大きく、ほかの詳しい
 * 言い方、専門的な言い方、砕けた言い方、固有名詞などは小さく表示して」。
 *
 * 1段目: 写っている物が全部同じ大きさ。柚子を押すと2段目（ふだんの言い方が大きく、
 * ほかの言い方が小さく）。
 */
import { CandidatePicker, type PickCandidate } from "@/components/CandidatePicker";
import { readySpeech } from "../speech";

const C: PickCandidate[] = [
  {
    headword: "柚子",
    reading_zhuyin: "ㄧㄡˋ ㄗˇ",
    pinyin: "yòuzi",
    meaning_ja: "ブンタン（文旦）",
    distinction: "中秋に食べる大きな柑橘",
    register: "common",
    group: 0,
  },
  {
    headword: "柚仔",
    reading_zhuyin: "ㄧㄡˋ ㄚˋ",
    pinyin: "iū-á",
    meaning_ja: "ブンタン（台湾語なまり）",
    distinction: "年配の人の口ぐせ",
    register: "casual",
    group: 0,
  },
  {
    headword: "文旦",
    reading_zhuyin: "ㄨㄣˊ ㄉㄢˋ",
    pinyin: "wéndàn",
    meaning_ja: "文旦（品種名）",
    distinction: "売り場の表示",
    register: "specific",
    group: 0,
  },
  {
    headword: "麻豆文旦",
    reading_zhuyin: "ㄇㄚˊ ㄉㄡˋ ㄨㄣˊ ㄉㄢˋ",
    pinyin: "Mádòu wéndàn",
    meaning_ja: "麻豆の文旦（産地名）",
    register: "proper",
    group: 0,
  },
  {
    headword: "塑膠袋",
    reading_zhuyin: "ㄙㄨˋ ㄐㄧㄠ ㄉㄞˋ",
    pinyin: "sùjiāodài",
    meaning_ja: "ビニール袋",
    register: "common",
    group: 1,
  },
  {
    headword: "桌子",
    reading_zhuyin: "ㄓㄨㄛ ㄗ˙",
    pinyin: "zhuōzi",
    meaning_ja: "テーブル",
    register: "common",
    group: 2,
  },
  {
    headword: "月餅",
    reading_zhuyin: "ㄩㄝˋ ㄅㄧㄥˇ",
    pinyin: "yuèbǐng",
    meaning_ja: "月餅（中秋の焼き菓子）",
    register: "common",
    group: 3,
  },
];

export function CandidatePickerScene() {
  readySpeech(C.map((c) => c.headword));
  return (
    <div className="pb-24">
      <CandidatePicker suggestions={C} language="zh-TW" onPick={() => {}} />
    </div>
  );
}
