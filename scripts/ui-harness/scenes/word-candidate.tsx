/**
 * 「どの語にするか」を選ぶ札(`WordCandidateRow`)。
 *
 * この札は2画面で使う — 撮った写真の候補(`capture.tsx`)と、
 * **打ち込んだ語の候補(`InputCatchSheet`)**。後者はこれまで
 * 場面が1つも無く、**一度も機械の目に映っていなかった**。
 * オーナーが2度「文字入力が機能してない」と言った画面がそれで、
 * 壊れた姿を誰も撮っていなかったことと無関係ではない。
 *
 * ここで見るのは、`cap-pick` の場面には出ない極端な形:
 * 訳が長い / 使い分けが無い / 語が長い。
 */
import { WordCandidateRow } from "@/components/WordCandidateRow";
import { readySpeech } from "../speech";

/**
 * 発音ボタンは**鳴らせるようになってから**出る。足場にはサーバが無いので、
 * ここで支度が済んだことにしないと**ボタンが1つも撮られない**。
 */
const WORDS = ["面紙", "雞肉", "遙控器", "珍珠奶茶"];

export function WordCandidateScene() {
  readySpeech(WORDS);
  return (
    <ul className="space-y-2">
      <li>
        <WordCandidateRow
          headword="面紙"
          zhuyin="ㄇㄧㄢˋ ㄓˇ"
          pinyin="miàn zhǐ"
          meaning="ティッシュ"
          distinction="持ち歩く箱・ポケット"
          onPick={() => {}}
        />
      </li>
      <li>
        {/* **使い分けが無い語。** 母語と一対一なら書かないのが正しい
            (オーナー指摘: 雞肉に「鶏の肉全般」と書く必要はない)。
            札が無いときに行が崩れないかを見る。 */}
        <WordCandidateRow
          headword="雞肉"
          zhuyin="ㄐㄧ ㄖㄡˋ"
          pinyin="jī ròu"
          meaning="鶏肉"
          onPick={() => {}}
        />
      </li>
      <li>
        {/* **訳が長い回。** 訳を右に寄せたので、伸びたときに
            台湾華語のほうが押し出されないかを見る。 */}
        <WordCandidateRow
          headword="遙控器"
          zhuyin="ㄧㄠˊ ㄎㄨㄥˋ ㄑㄧˋ"
          pinyin="yáo kòng qì"
          meaning="エアコンやテレビのリモコン(手に持つ操作器)"
          distinction="家電を離れて操作する方"
          onPick={() => {}}
        />
      </li>
      <li>
        {/* 語のほうが長い回。 */}
        <WordCandidateRow
          headword="珍珠奶茶"
          zhuyin="ㄓㄣ ㄓㄨ ㄋㄞˇ ㄔㄚˊ"
          pinyin="zhēn zhū nǎi chá"
          meaning="タピオカミルクティー"
          onPick={() => {}}
        />
      </li>
    </ul>
  );
}
