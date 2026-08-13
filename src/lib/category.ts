/**
 * 図鑑カテゴリーの正規化(共有)。
 *
 * 以前は ai.functions.ts の中にだけ存在し、しかも判定が部分一致だったため
 * 「斑馬線(横断歩道)」が /馬/ に引っかかって**動物**に分類されていた。
 * ここでは
 *   1) 完全一致(EXACT) → 2) 語末一致(SUFFIX) → 3) 部分一致(CONTAINS)
 * の順に見て、部分一致は誤爆しにくい2字以上の語だけに絞っている。
 *
 * カテゴリーキーは DB の categories テーブルに必ず存在させること
 * (存在しないキーは upsertWord が 'other' に落とすため。
 *  20260723090000_seed_missing_categories.sql で54キーを投入済み)。
 */

export const CATEGORY_KEYS = [
  "fruit",
  "vegetable",
  "drink",
  "food",
  "dessert",
  "vehicle",
  "transport",
  "animal",
  "plant",
  "flower",
  "building",
  "street",
  "sign",
  "shop",
  "home",
  "furniture",
  "appliance",
  "kitchenware",
  "tool",
  "clothes",
  "accessory",
  "shoes",
  "bag",
  "jewelry",
  "stationery",
  "book",
  "tech",
  "gadget",
  "toy",
  "game",
  "sport",
  "instrument",
  "nature",
  "weather",
  "sky",
  "water",
  "mountain",
  "body",
  "face",
  "hand",
  "clothing_part",
  "person",
  "family",
  "job",
  "art",
  "decoration",
  "character",
  "symbol",
  "color",
  "shape",
  "money",
  "document",
  "medicine",
  "other",
] as const;

export type CategoryKey = (typeof CATEGORY_KEYS)[number];

/** 完全一致(1字語や、部分一致だと誤爆する語はここに置く)。 */
const EXACT: Record<string, CategoryKey> = {
  // 体 — 1字語が多く、部分一致にすると「斑馬線」「手機」等を誤分類する
  手: "body",
  腳: "body",
  脚: "body",
  頭: "body",
  髮: "body",
  頭髮: "body",
  眼: "body",
  眼睛: "body",
  耳: "body",
  耳朵: "body",
  鼻: "body",
  鼻子: "body",
  嘴: "body",
  嘴巴: "body",
  臉: "body",
  舌: "body",
  舌頭: "body",
  牙: "body",
  牙齒: "body",
  指: "body",
  手指: "body",
  腳趾: "body",
  肩: "body",
  肩膀: "body",
  膝: "body",
  膝蓋: "body",
  肚: "body",
  肚子: "body",
  背: "body",
  胸: "body",
  腰: "body",
  脖: "body",
  脖子: "body",
  手肘: "body",
  手腕: "body",
  手臂: "body",
  // 自然・空・水
  太陽: "sky",
  月亮: "sky",
  星星: "sky",
  雲: "weather",
  雨: "weather",
  風: "weather",
  雪: "weather",
  颱風: "weather",
  台風: "weather",
  海: "water",
  河: "water",
  湖: "water",
  水: "drink",
  山: "mountain",
  // 人・家族
  女朋友: "person",
  男朋友: "person",
  朋友: "person",
  老師: "job",
  學生: "person",
  醫生: "job",
  護士: "job",
  店員: "job",
  司機: "job",
  爸爸: "family",
  媽媽: "family",
  哥哥: "family",
  姐姐: "family",
  弟弟: "family",
  妹妹: "family",
  家人: "family",
};

/** 語末一致(「〜傘」「〜鞋」など、末尾で種類が決まるもの)。 */
const SUFFIX: Array<[RegExp, CategoryKey]> = [
  [/(花|玫瑰|櫻花|向日葵|鬱金香|百合)$/, "flower"],
  [/(樹|竹|草|葉|盆栽)$/, "plant"],
  [/(傘|雨傘|陽傘)$/, "accessory"],
  [/(鞋|鞋子|運動鞋|拖鞋|靴子|高跟鞋)$/, "shoes"],
  [/(包包|背包|皮包|錢包|手提袋|袋子)$/, "bag"],
  [/(項鍊|戒指|耳環|手鍊|手錶|錶|手環)$/, "jewelry"],
  [/(椅子|桌子|沙發|床|櫃子|書架|書桌|衣櫃)$/, "furniture"],
  [/(鍋|平底鍋|刀|叉|筷子|湯匙|盤子|碗|砧板|鍋子|水壺)$/, "kitchenware"],
  [/(書|小說|字典|漫畫|雜誌|課本|筆記本)$/, "book"],
  [/(證|證件|卡|表格|文件|收據|發票|菜單|地圖)$/, "document"],
  [/(燈|小夜燈|檯燈)$/, "furniture"],
  [/(杯|杯子|馬克杯)$/, "kitchenware"],
];

/** 部分一致(2字以上の具体語のみ。1字語は EXACT 側で扱う)。 */
const CONTAINS: Array<[RegExp, CategoryKey]> = [
  // テック・ガジェット
  [
    /(滑鼠|鍵盤|電腦|筆電|螢幕|手機|平板|耳機|喇叭|路由器|插頭|充電器|相機|行動電源|USB|手機架)/,
    "tech",
  ],
  // 交通
  [/(汽車|機車|摩托車|腳踏車|自行車|捷運|公車|火車|高鐵|飛機|輪船|計程車)/, "transport"],
  // 動物(「斑馬線」を誤爆しないよう2字以上の動物名だけ)
  [/(狗狗|小狗|貓咪|小貓|兔子|老鼠|綿羊|山羊|烏龜|金魚|熊貓|大象|獅子|老虎|斑馬(?!線))/, "animal"],
  [/^(狗|貓|鳥|魚|馬|牛|羊|豬|雞|鴨|熊)$/, "animal"],
  // 果物・野菜・飲食
  [/(蘋果|香蕉|橘子|柳丁|葡萄|草莓|西瓜|芒果|鳳梨|木瓜|檸檬|柿子|水梨)/, "fruit"],
  [/(高麗菜|白菜|菠菜|紅蘿蔔|馬鈴薯|洋蔥|番茄|茄子|青椒|大蒜|生薑|蔥花)/, "vegetable"],
  [/(咖啡|奶茶|果汁|可樂|礦泉水|牛奶|豆漿|啤酒|紅茶|綠茶|珍珠奶茶)/, "drink"],
  [/(三明治|炒飯|炒麵|便當|漢堡|披薩|蛋餅|蔥抓餅|滷肉飯|小籠包|水餃|包子|麵包|海帶)/, "food"],
  [/(蛋糕|布丁|冰淇淋|甜甜圈|巧克力|餅乾|糖果|雪花冰|豆花|芒果冰)/, "dessert"],
  // 家電・調理・日用品
  [/(冰箱|洗衣機|微波爐|電視|冷氣|烤箱|吹風機|電風扇|除濕機)/, "appliance"],
  [/(衛生紙|面紙|毛巾|清潔劑|洗碗精|洗衣精|沐浴乳|洗髮精|牙膏|牙刷|肥皂|垃圾袋)/, "medicine"],
  [/(護唇膏|護手霜|乳液|防曬|口罩|藥膏|藥品|OK繃|繃帶|藥水|維他命)/, "medicine"],
  [/(指甲剪|剪刀|螺絲|工具|鎚子|梯子|掃把|拖把)/, "tool"],
  // 服・アクセ
  [/(衣服|襯衫|T恤|外套|夾克|大衣|褲子|裙子|洋裝|毛衣|帽子|圍巾|手套|襪子)/, "clothes"],
  [/(眼鏡|太陽眼鏡|皮帶|髮飾)/, "accessory"],
  // 文房具・お金・場所
  [/(鉛筆|原子筆|橡皮擦|尺子|膠水|膠帶|便利貼|螢光筆)/, "stationery"],
  [/(硬幣|紙鈔|鈔票|信用卡|零錢)/, "money"],
  [/(便利商店|超市|超商|夜市|市場|百貨|書店|餐廳|咖啡店|藥局)/, "shop"],
  [/(公園|車站|機場|銀行|醫院|學校|郵局|廟|捷運站)/, "building"],
  [/(招牌|標誌|標示|指示牌|路牌|告示)/, "sign"],
  [/(斑馬線|紅綠燈|人行道|馬路|巷子|樓梯|電梯)/, "street"],
];

/**
 * AIが返したカテゴリーを、見出し語から確実に補正する。
 * ルールに当たらなければAIの答えを尊重し、未知キーだけ 'other' にする。
 */
export function normalizeCategory(headword: string, cat: string | null | undefined): CategoryKey {
  const h = (headword ?? "").trim();
  if (h) {
    const exact = EXACT[h];
    if (exact) return exact;
    for (const [re, key] of SUFFIX) if (re.test(h)) return key;
    for (const [re, key] of CONTAINS) if (re.test(h)) return key;
  }
  const c = cat as CategoryKey;
  if (c && (CATEGORY_KEYS as readonly string[]).includes(c)) return c;
  return "other";
}

/* ─────────────────────────────────────────────────────────────────
   部屋(room) — 図鑑を「棚」として見せるための上位のまとまり。

   54個のカテゴリーをそのまま棚として縦に並べると、ただ長いだけで
   「あの単語はあのへん」という手がかりにならない。人が place を
   覚えるときの粒度はもっと粗いので、まず8つの部屋に入れて、
   部屋の中に棚(カテゴリー)を置く。

   ここが図鑑の**唯一の正**。以前は3箇所に割れていた:
     - CATEGORY_KEYS (54個、Zodのenum)
     - dex.tsx の KNOWN_CATEGORIES (56個、place/object を勝手に追加)
     - i18n.tsx の cat.* (56個、絵文字がラベル文字列に直書き)
   絵文字をラベルから剥がしてここに置いたので、絵文字だけ大きく出す、
   といった扱いができるようになる。
   ───────────────────────────────────────────────────────────────── */

export const ROOM_KEYS = [
  "eat",
  "town",
  "house",
  "wear",
  "play",
  "nature",
  "people",
  "marks",
] as const;

export type RoomKey = (typeof ROOM_KEYS)[number];

export type CategoryMeta = {
  /** どの部屋の棚か。 */
  room: RoomKey;
  /** 棚の見出しに添える絵文字(i18n のラベルからは剥がしてある)。 */
  emoji: string;
};

/**
 * カテゴリー → 部屋と絵文字。**CATEGORY_KEYS の全54キーを覆うこと**
 * (型で強制しているので、キーを足したらここもコンパイルが通らなくなる)。
 * 並び順は CATEGORY_KEYS ではなくこの定義順を使う — 部屋ごとに固まる。
 */
export const CATEGORY_META: Record<CategoryKey, CategoryMeta> = {
  // 食べる
  fruit: { room: "eat", emoji: "🍎" },
  vegetable: { room: "eat", emoji: "🥬" },
  drink: { room: "eat", emoji: "🥤" },
  food: { room: "eat", emoji: "🍜" },
  dessert: { room: "eat", emoji: "🍰" },
  // 街
  vehicle: { room: "town", emoji: "🚗" },
  transport: { room: "town", emoji: "🚆" },
  building: { room: "town", emoji: "🏢" },
  street: { room: "town", emoji: "🛣️" },
  sign: { room: "town", emoji: "🪧" },
  shop: { room: "town", emoji: "🏪" },
  // 家
  home: { room: "house", emoji: "🏠" },
  furniture: { room: "house", emoji: "🛋️" },
  appliance: { room: "house", emoji: "🔌" },
  kitchenware: { room: "house", emoji: "🍳" },
  tool: { room: "house", emoji: "🔧" },
  // 身につける
  clothes: { room: "wear", emoji: "👕" },
  accessory: { room: "wear", emoji: "🧢" },
  shoes: { room: "wear", emoji: "👟" },
  bag: { room: "wear", emoji: "👜" },
  jewelry: { room: "wear", emoji: "💍" },
  clothing_part: { room: "wear", emoji: "👔" },
  // 学び・遊び
  stationery: { room: "play", emoji: "✏️" },
  book: { room: "play", emoji: "📚" },
  tech: { room: "play", emoji: "💻" },
  gadget: { room: "play", emoji: "🖱️" },
  toy: { room: "play", emoji: "🧸" },
  game: { room: "play", emoji: "🎮" },
  sport: { room: "play", emoji: "⚽" },
  instrument: { room: "play", emoji: "🎸" },
  art: { room: "play", emoji: "🎨" },
  decoration: { room: "play", emoji: "🎊" },
  // 自然
  animal: { room: "nature", emoji: "🐾" },
  plant: { room: "nature", emoji: "🌿" },
  flower: { room: "nature", emoji: "🌸" },
  nature: { room: "nature", emoji: "🍃" },
  weather: { room: "nature", emoji: "🌦️" },
  sky: { room: "nature", emoji: "☀️" },
  water: { room: "nature", emoji: "💧" },
  mountain: { room: "nature", emoji: "⛰️" },
  // 人・体
  body: { room: "people", emoji: "🖐️" },
  face: { room: "people", emoji: "😊" },
  hand: { room: "people", emoji: "✋" },
  person: { room: "people", emoji: "🧑" },
  family: { room: "people", emoji: "👨‍👩‍👧" },
  job: { room: "people", emoji: "💼" },
  // しるし
  character: { room: "marks", emoji: "🔤" },
  symbol: { room: "marks", emoji: "🔣" },
  color: { room: "marks", emoji: "🎨" },
  shape: { room: "marks", emoji: "🔷" },
  money: { room: "marks", emoji: "💰" },
  document: { room: "marks", emoji: "📄" },
  medicine: { room: "marks", emoji: "💊" },
  other: { room: "marks", emoji: "✨" },
};

/** 部屋 → その部屋に属するカテゴリー(CATEGORY_META の定義順)。 */
export const ROOM_CATEGORIES: Record<RoomKey, CategoryKey[]> = ROOM_KEYS.reduce(
  (acc, room) => {
    acc[room] = (Object.keys(CATEGORY_META) as CategoryKey[]).filter(
      (k) => CATEGORY_META[k].room === room,
    );
    return acc;
  },
  {} as Record<RoomKey, CategoryKey[]>,
);

/**
 * 未知のキーを安全に受ける。DBには古いキー(place / object など、
 * CATEGORY_KEYS に無いもの)が残っている可能性があるため、
 * 画面側は必ずこれを通してから CATEGORY_META を引く。
 */
export function asCategoryKey(key: string | null | undefined): CategoryKey {
  const k = (key ?? "").trim() as CategoryKey;
  return k && k in CATEGORY_META ? k : "other";
}

/** そのカテゴリーの絵文字。 */
export function categoryEmoji(key: string | null | undefined): string {
  return CATEGORY_META[asCategoryKey(key)].emoji;
}
