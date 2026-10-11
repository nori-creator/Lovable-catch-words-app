/**
 * **「固定の写真で試す」の写真と正解**（開発者の「AI の設定」。オーナー依頼 2026-10-11
 * 「haiku や sonnet をテストして時間と正確性を gemini と比較して」「すべての AI を使っている個所の
 * 速さと正確性を計測したい」）。
 *
 * 本番を切り替えずに、選んだモデルへ同じ写真を流し、撮った後の候補（`suggestWords` と同じ指示・
 * 同じ並べ直し）の何番目に正解が出たかを数える（`adminTestPhotoCandidates`）。
 *
 * - 写真は `public/ai-test/photos/`（公開の置き場。人の顔・住所・利用者の写真は入れない）。
 *   `photo` = 実際の写真（アプリのチュートリアルの写真と、台湾の店先の1枚）、
 *   `object` = 台湾の身の回りの物の切り抜きを明るい台に置いた物（撮影の動画の素材）。
 *   切り抜きは実際の写真より易しい — 主に「台湾でふだん何と呼ぶか」を確かめる組。
 * - 正解は学習言語ごと。**先頭がいちばん欲しい語**、残りも正解として数える（同じ物の言い方の揺れ）。
 *   見た目だけでは決められない物（豆漿と牛奶、冬瓜茶と紅茶）は入れていない。
 * - 語を足す・直す時はここだけを変える（画面も iOS もここから読む — `adminGetAiTestPhotos`）。
 */
import { TARGET_LANGUAGES } from "./target-lang";

export type AiTestPhotoKind = "photo" | "object";

export type AiTestPhoto = {
  id: string;
  kind: AiTestPhotoKind;
  labels: Record<AiTestLanguage, readonly string[]>;
};

/** 学習言語の全部（台湾華語・英語・日本語）。 */
export const AI_TEST_LANGUAGES = TARGET_LANGUAGES;
export type AiTestLanguage = (typeof AI_TEST_LANGUAGES)[number];

/** 写真の置き場（Web は同じ場所、iOS はアプリの入口の URL に付けて取る）。 */
export const AI_TEST_PHOTO_DIR = "/ai-test/photos/";

export function aiTestPhotoPath(id: string): string {
  return `${AI_TEST_PHOTO_DIR}${id}.jpg`;
}

const P = (
  id: string,
  kind: AiTestPhotoKind,
  zh: readonly string[],
  en: readonly string[],
  ja: readonly string[],
): AiTestPhoto => ({
  id,
  kind,
  labels: {
    "zh-TW": zh,
    en,
    ja,
  },
});

export const AI_TEST_PHOTOS: readonly AiTestPhoto[] = [
  // 実際の写真
  P(
    "cafe",
    "photo",
    ["咖啡", "拿鐵", "拿鐵咖啡", "咖啡杯", "熱咖啡", "卡布奇諾"],
    ["coffee", "latte", "cappuccino", "coffee cup", "cup of coffee", "flat white"],
    ["コーヒー", "ラテ", "カフェラテ", "コーヒーカップ", "カプチーノ"],
  ),
  P(
    "flowers",
    "photo",
    ["花", "花束", "鮮花", "大波斯菊", "波斯菊", "花瓶"],
    ["flowers", "flower", "bouquet", "cosmos", "vase"],
    ["花", "花束", "コスモス", "花瓶"],
  ),
  P(
    "cat",
    "photo",
    ["貓", "貓咪", "橘貓", "小貓", "橘白貓"],
    ["cat", "kitten", "ginger cat", "orange cat", "tabby cat"],
    ["猫", "ねこ", "ネコ", "茶トラ"],
  ),
  P(
    "sea",
    "photo",
    ["海", "大海", "海景", "海邊", "海洋"],
    ["sea", "ocean", "sea view", "coast", "seaside"],
    ["海", "海辺", "海景"],
  ),
  P(
    "bubble-tea-street",
    "photo",
    ["珍珠奶茶", "珍奶", "波霸奶茶", "奶茶"],
    ["bubble tea", "boba tea", "milk tea", "boba", "pearl milk tea"],
    ["タピオカミルクティー", "タピオカ", "ミルクティー"],
  ),
  // 台湾の身の回りの物（切り抜き）
  P(
    "aircon",
    "object",
    ["冷氣", "冷氣機", "分離式冷氣"],
    ["air conditioner", "ac", "aircon", "air conditioning unit"],
    ["エアコン", "クーラー"],
  ),
  P("banana", "object", ["香蕉"], ["banana", "bananas"], ["バナナ"]),
  P(
    "bike-bell",
    "object",
    ["腳踏車鈴", "車鈴", "鈴鐺", "鈴", "自行車鈴", "單車鈴", "腳踏車鈴鐺"],
    ["bicycle bell", "bike bell", "bell"],
    ["自転車のベル", "ベル", "自転車ベル"],
  ),
  P(
    "chicken-cutlet",
    "object",
    ["雞排", "炸雞排", "大雞排"],
    ["fried chicken", "chicken cutlet", "fried chicken cutlet", "taiwanese fried chicken"],
    ["鶏排", "ジーパイ", "フライドチキン", "台湾唐揚げ"],
  ),
  P(
    "coconut",
    "object",
    ["椰子", "椰子水", "椰子汁"],
    ["coconut", "coconut water", "young coconut"],
    ["ココナッツ", "ヤシの実", "ココナッツジュース"],
  ),
  P(
    "coffee-cup",
    "object",
    ["咖啡", "紙杯", "咖啡杯", "外帶杯", "熱咖啡"],
    ["coffee", "coffee cup", "paper cup", "takeaway cup", "to-go cup"],
    ["コーヒー", "紙コップ", "コーヒーカップ"],
  ),
  P(
    "cola",
    "object",
    ["可樂", "罐裝可樂", "汽水"],
    ["cola", "soda", "coke", "soda can", "can"],
    ["コーラ", "缶", "炭酸飲料", "缶ジュース"],
  ),
  P(
    "bubble-tea-cup",
    "object",
    ["珍珠奶茶", "珍奶", "波霸奶茶", "奶茶"],
    ["bubble tea", "boba tea", "milk tea", "boba", "pearl milk tea"],
    ["タピオカミルクティー", "タピオカ", "ミルクティー"],
  ),
  P(
    "douhua",
    "object",
    ["豆花", "花生豆花"],
    ["douhua", "tofu pudding", "tofu dessert", "soybean pudding"],
    ["豆花", "トウファ", "豆腐プリン"],
  ),
  P("fan", "object", ["電風扇", "電扇", "風扇"], ["fan", "electric fan", "desk fan"], ["扇風機"]),
  P(
    "juice",
    "object",
    ["柳橙汁", "果汁", "鋁箔包", "柳丁汁", "橙汁"],
    ["orange juice", "juice", "juice box", "juice carton"],
    ["オレンジジュース", "ジュース", "紙パック"],
  ),
  P(
    "keys",
    "object",
    ["鑰匙", "一串鑰匙"],
    ["keys", "key", "bunch of keys", "key ring"],
    ["鍵", "カギ", "キー"],
  ),
  P(
    "lantern",
    "object",
    ["燈籠", "紅燈籠"],
    ["lantern", "red lantern", "paper lantern", "chinese lantern"],
    ["提灯", "ランタン", "赤い提灯"],
  ),
  P(
    "braised-pork-rice",
    "object",
    ["滷肉飯", "魯肉飯", "肉燥飯"],
    ["braised pork rice", "lu rou fan", "minced pork rice", "rice bowl"],
    ["魯肉飯", "ルーローハン", "豚肉飯"],
  ),
  P("mango", "object", ["芒果"], ["mango"], ["マンゴー"]),
  P(
    "mango-shaved-ice",
    "object",
    ["芒果冰", "芒果剉冰", "芒果雪花冰", "剉冰", "雪花冰"],
    ["mango shaved ice", "shaved ice", "mango ice", "mango snow ice"],
    ["マンゴーかき氷", "かき氷", "マンゴーアイス"],
  ),
  P(
    "mug",
    "object",
    ["馬克杯", "杯子", "茶杯", "咖啡杯"],
    ["mug", "cup", "coffee mug"],
    ["マグカップ", "マグ", "カップ"],
  ),
  P(
    "oolong",
    "object",
    ["烏龍茶", "茶", "瓶裝茶", "寶特瓶", "麥茶"],
    ["oolong tea", "tea", "bottled tea", "iced tea", "plastic bottle", "bottle"],
    ["ウーロン茶", "お茶", "ペットボトル", "麦茶"],
  ),
  P(
    "pineapple-cake",
    "object",
    ["鳳梨酥"],
    ["pineapple cake", "pineapple pastry"],
    ["パイナップルケーキ", "鳳梨酥"],
  ),
  P(
    "pomelo",
    "object",
    ["柚子", "文旦", "白柚"],
    ["pomelo", "grapefruit"],
    ["文旦", "ザボン", "ブンタン", "ポメロ", "グレープフルーツ"],
  ),
  P(
    "remote",
    "object",
    ["遙控器", "冷氣遙控器"],
    ["remote", "remote control", "air conditioner remote", "ac remote"],
    ["リモコン", "エアコンのリモコン"],
  ),
  P("rice-cooker", "object", ["電子鍋", "電鍋", "飯鍋"], ["rice cooker"], ["炊飯器"]),
  P(
    "slippers",
    "object",
    ["拖鞋", "夾腳拖", "人字拖"],
    ["flip-flops", "slippers", "sandals", "thongs"],
    ["ビーチサンダル", "サンダル", "スリッパ", "ビーサン"],
  ),
  P(
    "stool",
    "object",
    ["塑膠椅", "板凳", "凳子", "椅子", "塑膠凳", "紅色塑膠椅", "小板凳"],
    ["stool", "plastic stool", "chair", "plastic chair"],
    ["椅子", "スツール", "プラスチックの椅子"],
  ),
  P(
    "succulent",
    "object",
    ["多肉植物", "多肉", "盆栽"],
    ["succulent", "succulent plant", "potted plant", "plant pot"],
    ["多肉植物", "観葉植物", "鉢植え"],
  ),
  P(
    "tissue",
    "object",
    ["面紙", "衛生紙", "面紙盒", "紙巾", "抽取式衛生紙"],
    ["tissue box", "tissues", "tissue", "box of tissues", "kleenex"],
    ["ティッシュ", "ティッシュペーパー", "ティッシュ箱"],
  ),
  P("umbrella", "object", ["雨傘", "傘", "長柄傘"], ["umbrella"], ["傘", "雨傘"]),
  P(
    "xiaolongbao",
    "object",
    ["小籠包", "蒸籠", "包子", "湯包"],
    ["xiaolongbao", "soup dumplings", "dumplings", "steamer basket", "dim sum"],
    ["小籠包", "ショウロンポー", "蒸籠", "点心"],
  ),
];

export function isAiTestLanguage(v: unknown): v is AiTestLanguage {
  return typeof v === "string" && (AI_TEST_LANGUAGES as readonly string[]).includes(v);
}

export function aiTestPhoto(id: string): AiTestPhoto | null {
  return AI_TEST_PHOTOS.find((p) => p.id === id) ?? null;
}

/** 見出しを比べられる形に（前後・途中の空白、全角空白、大文字小文字）。 */
export function normHead(s: string): string {
  return String(s ?? "")
    .normalize("NFC")
    .replace(/[\s\u3000]/g, "")
    .toLowerCase();
}

/** 候補の何番目に正解があったか（1 から）。無ければ null。 */
export function testPhotoRank(heads: readonly string[], accept: readonly string[]): number | null {
  const want = new Set(accept.map(normHead));
  const i = heads.findIndex((h) => want.has(normHead(h)));
  return i >= 0 ? i + 1 : null;
}
