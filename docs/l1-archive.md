# 使わなくなった母語の干渉データ（10言語）

オーナー決定 2026-08-25:

> 「ユーザーの言語選択12種類は多すぎるから、**日本語、英語、台湾華語に絞って
>  AIの回答の速さを早めたい、効率化させたい。**」

## なぜ消さずにここへ移したのか

`word_explanations` は `(word_id, explain_lang, l1)` で引く**共有キャッシュ**。
母語が減るほど「誰かが既に払った解説」に当たりやすくなる。12母語だと
1語あたり最大24通りの解説を作ることになるが、3母語なら6通りで済む。
**AI呼び出しがおよそ4分の1**になる。これが速さの効果のほぼ全部。

もう1つ、`L1_TABLE` は `settings.tsx` が静的に取り込んでいるので
**ブラウザまで載る**（`vite build` が `INEFFECTIVE_DYNAMIC_IMPORT` で
警告していた）。10言語ぶんで約 24KB を落とせる。

## 戻すとき

`src/lib/l1.ts` の `L1Code` に符号を足し、`L1_ORDER` に並べ、下の欄を
`L1_TABLE` に貼り戻す。**そのとき `l1.test.ts` の現物
（`src/lib/__fixtures__/l1-prompts.zh-TW.json`）を採り直すこと** —
組み合わせの数を数えている門があるので、貼っただけでは落ちる。

中身は台湾華語を学ぶときの干渉項目として書いてある。**英語版で戻すなら
中身は書き直しが要る**（韓国語話者の英語の難所は声調ではない）。

---

```ts
  ko: {
    code: "ko",
    labelJa: "韓国語",
    labelEn: "Korean",
    speakerJa: "韓国語話者",
    speakerEn: "Korean speakers",
    priority: [
      "声調(母語に無い)",
      "ㄈ(f)が母語に無く ㄆ(p)で代用する",
      "無気音 ㄅㄉㄍ を濃音(ㅃㄸㄲ)で置き換えて硬く聞こえる",
    ],
    phonology: {
      consonants:
        "平音・激音・濃音の3系列があるため**有気/無気の区別自体は得意(有利)**だが、" +
        "無気音 ㄅㄉㄍ を濃音(ㅃㄸㄲ)で代用して硬く聞こえる。" +
        "ㄈ(f)が母語に無く ㄆ(p)で代用する。" +
        "そり舌 ㄓㄔㄕㄖ が無く ㄗㄘㄙ や l/r で代用する。",
      finals: "ㄩ(ü)が無い。パッチムの影響で末子音を内破させ、解放が弱くなる。",
      tones: "声調が無く、韓国語の文末イントネーションを持ち込む。第2声と第3声の混同が起きやすい。",
      prosody:
        "音節末を詰める癖(パッチム)により -n/-ng の後に余分な閉鎖が入る。" +
        "語頭の平音が有声化する規則を中国語に持ち込みがち。",
      advantages:
        "**-n/-ng/-m の区別が母語にあるので鼻音韻尾は得意**(日本語話者より明確に有利)。" +
        "漢字語彙が多く共通するので語彙の推測が効く。有気/無気の3系列も土台になる。",
    },
    grammar: {
      wordOrder: "母語が SOV なので目的語を動詞の前に置きがち。修飾語の前置は母語と同じで有利。",
      aspect: "「了」を韓国語の過去語尾と同一視しやすい。「過」「在」「著」の使い分けが要点。",
      measureWords: "母語にも助数詞があるので概念は理解できる(有利)が、対応する語が違う。",
      particles: "助詞をそのまま訳そうとする。「的」の過剰使用にも注意。",
      negation: "「不」と「沒」の使い分け。母語の 안/못 の区別とは対応しない。",
      patterns:
        "敬語体系が違うため中国語の丁寧さを語尾で表そうとする" +
        "(中国語は「請/麻煩/一下/可以…嗎」など語彙と構文で表す)。離合詞にも注意。",
      falseFriends: "韓国漢字語と中国語で意味がずれる語に注意(工夫/放心/愛人/約束など)。",
    },
    taiwan: TAIWAN_COMMON,
  },

  vi: {
    code: "vi",
    labelJa: "ベトナム語",
    labelEn: "Vietnamese",
    speakerJa: "ベトナム語話者",
    speakerEn: "Vietnamese speakers",
    priority: [
      "母語の6声調に引きずられる(特に第3声を hỏi/ngã 調で置き換える)",
      "末子音を内破させるため -n/-ng の解放が弱い",
      "そり舌 ㄓㄔㄕ と ㄗㄘㄙ の区別",
    ],
    phonology: {
      consonants: "そり舌 ㄓㄔㄕ と ㄗㄘㄙ の区別が難しい。有気/無気は母語にある程度対応がある。",
      finals: "ㄩ(ü)が要練習。母音体系が豊富なので単母音は比較的得意。",
      tones:
        "**声調言語なので声調の存在自体は理解しやすい(大きな有利)**が、母語の6声調に引きずられる。" +
        "特に中国語の第3声を hỏi/ngã 調で置き換える。声門閉鎖を伴う調(nặng)の癖も出る。",
      prosody: "末子音を内破させる(息を出し切らない)ため -n/-ng が弱く聞こえる。",
      advantages: "声調言語であること、語順が SVO であること、量詞を持つことの3点が有利。",
    },
    grammar: {
      wordOrder:
        "語順は SVO で中国語に近い(有利)。ただし**修飾語が名詞の後ろ**に来る(nhà đẹp)ため、" +
        "中国語の「漂亮的房子」の前置修飾を逆にしがち。",
      aspect: "アスペクト表現(đã/rồi)と中国語の「了」の対応がずれる。",
      measureWords: "量詞を持つので概念は得意(有利)。対応語の違いだけ覚える。",
      particles: "「的」の位置と省略。",
      negation: "「不」と「沒」の使い分け。",
      patterns: "把構文・是…的が母語に無いので使えないまま終わりやすい。",
      falseFriends: "漢越語(từ Hán Việt)は中国語と意味がずれることがある。",
    },
    taiwan: TAIWAN_COMMON,
  },

  th: {
    code: "th",
    labelJa: "タイ語",
    labelEn: "Thai",
    speakerJa: "タイ語話者",
    speakerEn: "Thai speakers",
    priority: ["タイ語の5声調に引きずられる", "そり舌 ㄓㄔㄕㄖ が母語に無い", "末子音の解放が弱い"],
    phonology: {
      consonants:
        "そり舌 ㄓㄔㄕㄖ が無い。ㄖ をタイ語の r/l で代用する。" +
        "有気/無気の区別は母語にあるので得意(有利)。",
      finals: "ㄩ(ü)が無い。母音の長短の対立を中国語に持ち込みがち。",
      tones: "声調言語なので概念は得意(有利)だが、タイ語の5声調に引きずられる。",
      prosody: "末子音を内破させるため -n/-ng の解放が弱い。",
      advantages: "声調・有気/無気・量詞の3つが母語にあり、土台が非常に強い。",
    },
    grammar: {
      wordOrder: "語順は SVO で近い(有利)。修飾語が名詞の後置なので前置修飾「〜的」を逆にしがち。",
      aspect: "時制を時間副詞に頼るのは母語と共通(有利)。「了/過」の使い分けが要点。",
      measureWords: "量詞は豊富で得意(有利)。",
      particles: "「的」の位置。",
      negation: "「不」と「沒」の使い分け。",
      patterns: "把構文・是…的。",
      falseFriends: "中国語からの借用語で意味がずれるものに注意。",
    },
    taiwan: TAIWAN_COMMON,
  },

  id: {
    code: "id",
    labelJa: "インドネシア語・マレー語",
    labelEn: "Indonesian / Malay",
    speakerJa: "インドネシア語話者",
    speakerEn: "Indonesian speakers",
    priority: [
      "声調が母語に無く強勢アクセントで代用する",
      "そり舌 ㄓㄔㄕㄖ が母語に無い",
      "有気/無気の区別が弱く ㄅㄉㄍ を有声音にする",
    ],
    phonology: {
      consonants: "そり舌 ㄓㄔㄕㄖ が無い。有気/無気の区別が弱く ㄅㄉㄍ を有声音で発音しがち。",
      finals: "ㄩ(ü)が無い。母音が少ないため ㄜ(e)が難しい。",
      tones: "声調が無く、強勢アクセントで代用する。",
      prosody: "音節構造が単純なため、中国語の複雑な韻母に母音を足しがち。",
      advantages: "**-n/-ng の区別が母語にあるので有利**。語順も SVO で近い。",
    },
    grammar: {
      wordOrder: "語順は SVO で近い。修飾語は名詞の後置なので前置修飾「〜的」を逆にしがち。",
      aspect: "sudah/sedang と「了/在」の対応がずれる。",
      measureWords: "量詞の概念はあるが対応する語が違う。",
      particles: "「的」の位置。",
      negation: "tidak/bukan の区別があるので「不/沒」の発想は理解しやすい(有利)。",
      patterns: "複数を重複(buku-buku)で表すため、中国語の「們」や数量表現の使い方に注意。",
      falseFriends: "閩南語由来の借用語(bakso など)は中国語標準形と異なる。",
    },
    taiwan: TAIWAN_COMMON,
  },

  es: {
    code: "es",
    labelJa: "スペイン語",
    labelEn: "Spanish",
    speakerJa: "スペイン語話者",
    speakerEn: "Spanish speakers",
    priority: [
      "声調が母語に無く、文全体の抑揚で代用する",
      "有気/無気の区別が無く ㄅㄉㄍ を有声音 b/d/g にする",
      "母音が5つしかないため ㄩ(ü)・ㄜ(e)が難しい",
    ],
    phonology: {
      consonants:
        "有気/無気の区別が無く ㄅㄉㄍ を有声音 b/d/g にする。" +
        "そり舌 ㄓㄔㄕㄖ が無い。ㄏ(h)をスペイン語の j に寄せる。",
      finals: "母音が5つしかないため ㄩ(ü)・ㄜ(e)が難しい。-ng の韻尾が母語に無い。",
      tones: "声調が無く、文全体の抑揚で代用する。第2声と第3声の混同。",
      prosody: "音節のリズムが等時的なのは中国語と近い(有利)。",
      advantages: "syllable-timed のリズム。主語の省略が母語と共通なので自然に使える。",
    },
    grammar: {
      wordOrder: "形容詞を名詞の後ろに置く癖(casa bonita)→中国語は「漂亮的房子」で前置。",
      aspect: "動詞の活用で時制を表そうとする(中国語は「了/過/在」)。",
      measureWords: "量詞が母語に無いので落としやすい。",
      particles: "「的」の位置。冠詞に相当する語を探して余計な語を入れる。",
      negation: "「不」と「沒」の使い分け。",
      patterns: "性・数の一致を持ち込もうとする(中国語には無い)。",
      falseFriends: "音訳語を母語読みしてしまう。",
    },
    taiwan: TAIWAN_COMMON,
  },

  fr: {
    code: "fr",
    labelJa: "フランス語",
    labelEn: "French",
    speakerJa: "フランス語話者",
    speakerEn: "French speakers",
    priority: [
      "声調が母語に無い",
      "鼻母音があるため -n/-ng を鼻母音化して母音ごと変えてしまう",
      "ㄏ(h)が母語で無音のため落としがち",
    ],
    phonology: {
      consonants:
        "ㄏ(h)が母語で無音のため落としがち。そり舌 ㄓㄔㄕ が無い。" +
        "ㄖ をフランス語の r(口蓋垂音)で発音してしまう。",
      finals: "**ㄩ(ü)はフランス語の u があるので得意(有利)**。鼻母音の干渉に注意。",
      tones: "声調が無い。フランス語は語末に強勢が来るため、最後の音節の声調が崩れやすい。",
      prosody: "語末子音を落とす癖。連音(liaison)の癖で音節境界を溶かす。",
      advantages: "**ㄩ(ü)が母語にある**のは大きな有利。syllable-timed のリズムも近い。",
    },
    grammar: {
      wordOrder: "形容詞を名詞の後置にする癖。",
      aspect: "動詞活用で時制を表そうとする(中国語は「了/過/在」)。",
      measureWords: "量詞が母語に無いので落としやすい。",
      particles: "冠詞に相当する語を入れたがる。「的」の過剰使用。",
      negation: "「不」と「沒」の使い分け。",
      patterns: "性・数の一致を持ち込む。",
      falseFriends: "音訳語を母語読みしてしまう。",
    },
    taiwan: TAIWAN_COMMON,
  },

  de: {
    code: "de",
    labelJa: "ドイツ語",
    labelEn: "German",
    speakerJa: "ドイツ語話者",
    speakerEn: "German speakers",
    priority: [
      "声調が母語に無い",
      "そり舌 ㄓㄔㄕㄖ が母語に無い",
      "動詞第二位・枠構造を持ち込んで語順が崩れる",
    ],
    phonology: {
      consonants:
        "**有気音があるため ㄆㄊㄎ は得意(有利)**。そり舌 ㄓㄔㄕㄖ が無い。" +
        "ㄖ をドイツ語の r(口蓋垂音)で発音してしまう。",
      finals: "**ü があるため ㄩ も得意(有利)**。",
      tones: "声調が無い。",
      prosody: "語末の無声化(Auslautverhärtung)を持ち込む。強勢リズムで弱音節を潰す。",
      advantages: "**有気音と ü の両方が母語にある**ので、子音・韻母の負担が小さい。",
    },
    grammar: {
      wordOrder:
        "動詞第二位・枠構造を持ち込んで語順が崩れる(中国語は S+時間+場所+V+O)。" +
        "関係節を後置しようとする(中国語は前置)。",
      aspect: "動詞活用で時制を表そうとする。",
      measureWords: "量詞が母語に無いので落としやすい。",
      particles: "冠詞に相当する語を入れたがる。",
      negation: "「不」と「沒」の使い分け。",
      patterns: "格変化に相当するものを探す(中国語は語順と介詞で示す)。",
      falseFriends: "音訳語を母語読みしてしまう。",
    },
    taiwan: TAIWAN_COMMON,
  },

  ru: {
    code: "ru",
    labelJa: "ロシア語",
    labelEn: "Russian",
    speakerJa: "ロシア語話者",
    speakerEn: "Russian speakers",
    priority: [
      "声調が母語に無い",
      "有気/無気を有声/無声で置き換えてしまう(ㄅ→б)",
      "母音の弱化(アーカニエ)で無強勢音節の声調が消える",
    ],
    phonology: {
      consonants:
        "**ш/ж があるため ㄕ/ㄖ は比較的得意(有利)**。" +
        "有気/無気を有声/無声で置き換えてしまう(ㄅ→б)。" +
        "子音の硬/軟の対立を持ち込み、ㄐㄑㄒ が過度に軟音化する。",
      finals: "ы があるため ㄗㄘㄙ の後の i(空韻)に応用できる(有利)。ㄩ(ü)は要練習。",
      tones: "声調が無い。",
      prosody: "母音を弱化(アーカニエ)させて無強勢音節の声調を潰す。",
      advantages: "ш/ж/ы が母語にあるのでそり舌と空韻の土台がある。冠詞が無いのも共通。",
    },
    grammar: {
      wordOrder: "語順が自由な母語のため、中国語の固定語順を崩しがち。",
      aspect: "**動詞の完了体/不完了体があるため「了/過/在」のアスペクトは理解しやすい(有利)**。",
      measureWords: "量詞が母語に無いので落としやすい。",
      particles: "「的」の位置。",
      negation: "「不」と「沒」の使い分け。",
      patterns: "格変化で関係を示そうとする(中国語は語順と介詞)。",
      falseFriends: "音訳語を母語読みしてしまう。",
    },
    taiwan: TAIWAN_COMMON,
  },

  pt: {
    code: "pt",
    labelJa: "ポルトガル語",
    labelEn: "Portuguese",
    speakerJa: "ポルトガル語話者",
    speakerEn: "Portuguese speakers",
    priority: [
      "声調が母語に無い",
      "鼻母音があるため -n/-ng を鼻母音化する",
      "有気/無気の区別が無く ㄅㄉㄍ を有声音にする",
    ],
    phonology: {
      consonants:
        "有気/無気の区別が無く ㄅㄉㄍ を有声音にする。" +
        "**ブラジルポルトガル語の r はそり舌に近い場合があり ㄖ に応用できる(有利)**。",
      finals: "ㄩ(ü)が無い。鼻母音があるため -n/-ng を鼻母音化する。",
      tones: "声調が無い。",
      prosody: "無強勢母音の弱化を持ち込む。",
      advantages: "r 音の一部がそり舌に近い。母音体系が比較的豊か。",
    },
    grammar: {
      wordOrder: "形容詞の後置。",
      aspect: "動詞活用で時制を表そうとする(中国語は「了/過/在」)。",
      measureWords: "量詞が母語に無いので落としやすい。",
      particles: "冠詞に相当する語を入れたがる。",
      negation: "「不」と「沒」の使い分け。",
      patterns: "性・数の一致を持ち込む。",
      falseFriends: "音訳語を母語読みしてしまう。",
    },
    taiwan: TAIWAN_COMMON,
  },

  tl: {
    code: "tl",
    labelJa: "フィリピン語(タガログ語)",
    labelEn: "Filipino (Tagalog)",
    speakerJa: "フィリピン語話者",
    speakerEn: "Filipino speakers",
    priority: ["声調が母語に無い", "ㄈ(f)が p と混同されやすい", "そり舌 ㄓㄔㄕㄖ が母語に無い"],
    phonology: {
      consonants:
        "ㄈ(f)が母語で p と混同されやすい。そり舌 ㄓㄔㄕㄖ が無い。有気/無気の区別が弱い。",
      finals: "ㄩ(ü)が無い。母音が少ないため ㄜ(e)が難しい。",
      tones: "声調が無い。",
      prosody: "強勢の位置で意味が変わる母語なので、高さより強さで区別しようとする。",
      advantages: "**-ng は母語にあるので有利**。閩南語由来の借用語で語彙に馴染みがある。",
    },
    grammar: {
      wordOrder: "述語が文頭に来る語順(VSO寄り)を持ち込むと中国語の SVO と衝突する。",
      aspect: "動詞の相(aspect)体系が発達しているので「了/過/在」の発想は掴みやすい(有利)。",
      measureWords: "量詞は要練習。",
      particles: "「的」の前置修飾は要練習。",
      negation: "hindi/wala の区別があるので「不/沒」の発想は理解しやすい(有利)。",
      patterns: "**焦点(ang)体系を持つため、中国語の主題化(這個我知道)は理解しやすい(有利)**。",
      falseFriends: "閩南語由来の借用語は中国語標準形と発音が異なる。",
    },
    taiwan: TAIWAN_COMMON,
  },
```
