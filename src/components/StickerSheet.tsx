import type { Dispatch, RefObject, SetStateAction } from "react";
import { hasOwnPhoto, pickStickerPhoto } from "@/lib/sticker-photo";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  X,
  MapPin,
  Clock,
  Loader2,
  Settings2,
  ChevronUp,
  Sparkles,
  Lock,
  Flag,
  Trash2,
  Camera,
} from "lucide-react";
import { toast } from "sonner";
import { WordCard, WordCardSectionsEditor } from "@/components/WordCard";
import {
  getSticker,
  updateWordExtras,
  reportWordIssue,
  deleteSticker,
  replaceStickerPhoto,
  setStickerPlaceholder,
  setStickerHeroRole,
  attachStickerCutout,
} from "@/lib/stickers.functions";
import { searchImageCandidates, fetchImageAsDataUrl } from "@/lib/images.functions";
import { generateCard } from "@/lib/ai.functions";
import { getMyProfile } from "@/lib/profile.functions";
import { downscaleDataUrl } from "@/lib/cutout";
import { toImageDataUrl } from "@/lib/sticker-upload";
import { listStickerPhotos, type StickerPhoto } from "@/lib/encounters.functions";
import { getEncounterEstimate, type EncounterEstimate } from "@/lib/encounter.functions";
import { StickerPhotoHistory } from "@/components/StickerPhotoHistory";
import { supabase } from "@/integrations/supabase/client";
import { CachedImg, putCachedImage } from "@/lib/image-cache";
import { HeroPhotoPicker } from "@/components/HeroPhotoPicker";
import type { PhotoRole } from "@/lib/sticker-photo";
import { resolvePrefer, usePhotoPref } from "@/lib/photo-pref";
import { useT, useUiLang } from "@/lib/i18n";
import { LoadFailed } from "@/components/LoadFailed";

type Props = {
  stickerId: string | null;
  onClose: () => void;
};

export function StickerSheet({ stickerId, onClose }: Props) {
  const t = useT();
  const uiLang = useUiLang();
  const fetchSticker = useServerFn(getSticker);
  const enrichWord = useServerFn(generateCard);
  const saveExtras = useServerFn(updateWordExtras);
  const reportFn = useServerFn(reportWordIssue);
  const [reporting, setReporting] = useState(false);
  const fetchProfile = useServerFn(getMyProfile);
  const fetchPhotos = useServerFn(listStickerPhotos);
  const deleteFn = useServerFn(deleteSticker);
  const replacePhotoFn = useServerFn(replaceStickerPhoto);
  const setHeroRoleFn = useServerFn(setStickerHeroRole);
  const attachCutoutFn = useServerFn(attachStickerCutout);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState<null | "delete" | "image">(null);
  // 削除の誤操作防止: 1回目のタップで「本当に削除?」に変わり、4秒で元に戻る。
  const [deleteArmed, setDeleteArmed] = useState(false);
  useEffect(() => {
    if (!deleteArmed) return;
    const t = setTimeout(() => setDeleteArmed(false), 4000);
    return () => clearTimeout(t);
  }, [deleteArmed]);
  const qc = useQueryClient();
  const {
    data: s,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["sticker", stickerId],
    queryFn: () => fetchSticker({ data: { id: stickerId! } }),
    enabled: !!stickerId,
    staleTime: 5 * 60 * 1000,
  });
  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: () => fetchProfile(),
    staleTime: 60_000,
  });
  /**
   * 同じものを撮り直した記録。**読めなくてもカードは開く** —
   * 写真の一覧は付け足しであって、この画面の本体ではない。
   * 鍵は `/dex/$stickerId` と同じなので、どちらから来ても読み直しは起きない。
   */
  // 「今週出会う見込み」。**カードの中から勝手に走らせない** —
  // 全利用者を数える問い合わせなので、呼ぶ側が1回だけ取って渡す。
  // 読めなくてもカードは開く(節が1つ出ないだけ)。
  const fetchEncounter = useServerFn(getEncounterEstimate);
  const { data: encounter } = useQuery({
    queryKey: ["encounter", s?.word_id ?? null],
    queryFn: () => fetchEncounter({ data: { word_id: s!.word_id } }),
    enabled: !!s?.word_id,
    staleTime: 6 * 60 * 60 * 1000,
  });
  const { data: photoData } = useQuery({
    queryKey: ["sticker-photos", stickerId],
    queryFn: () => fetchPhotos({ data: { sticker_id: stickerId! } }),
    enabled: !!stickerId,
  });
  /**
   * いま何かの写真が載っているか(= 差し替えると失われるものがあるか)。
   *
   * 「自分で撮ったものか」までは分からない。ネット画像を採用すると
   * それも `object_image_url` に入るので、DBの上では区別が付かない
   * (区別するには列を1つ足す必要があり、いまは流せない)。
   * だから**文面で断定しない** — 「あなたが撮った写真」とは言わず、
   * 「いまの写真」と言う。仮画像しか無いゴーストのときは訊かない。
   */
  const hasPhoto = hasOwnPhoto(s);
  /** 表に出す1枚。役も見るので URL だけでなく組で持つ。 */
  const hero = pickStickerPhoto(s);
  const isPro = (profile as { plan?: string } | null | undefined)?.plan === "pro";
  // 母語。発音のコツと語順の説明はこれで中身が変わるので、
  // 変えたら解説を作り直す(下の useEffect)。
  const nativeLang =
    (profile as { native_language?: string } | null | undefined)?.native_language || "ja";
  const [flipped, setFlipped] = useState(false);
  const [editing, setEditing] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const enrichedRef = useRef<Set<string>>(new Set());

  // 画像なしカード(段ボール絵)の根絶: 詳細を開いた時に1枚も画像が無ければ、
  // Web検索の画像を仮画像として自動添付する(1回だけ・失敗しても致命的でない)。
  const searchImagesFn = useServerFn(searchImageCandidates);
  const fetchImageFn = useServerFn(fetchImageAsDataUrl);
  const setPlaceholderFn = useServerFn(setStickerPlaceholder);
  const autoImgRef = useRef<Set<string>>(new Set());
  // ネット画像の候補(複数)。自動で1枚目を入れ、残りは「別の画像に変える」
  // 候補として下に並べる。ユーザーが気に入らなければタップで差し替え。
  const [webCandidates, setWebCandidates] = useState<
    { url: string; credit?: { name?: string; link?: string }; source: string }[]
  >([]);
  const [swapping, setSwapping] = useState<string | null>(null);
  useEffect(() => {
    if (!s) return;
    // 自分の写真があるカードは触らない(候補も出さない)。
    if (s.object_url || s.cutout_url) return;
    if (autoImgRef.current.has(s.id)) return;
    autoImgRef.current.add(s.id);
    void (async () => {
      try {
        const { candidates } = await searchImagesFn({
          data: { query: s.word.meaning_ja || s.word.headword },
        });
        setWebCandidates(candidates.slice(0, 6));
        // すでに画像が入っているなら候補を出すだけで自動差し替えはしない。
        if (s.placeholder_url || s.selfie_url) return;
        const cand = candidates[0];
        if (!cand) return;
        const dataUrl = await toImageDataUrl(cand.url, fetchImageFn);
        const small = await downscaleDataUrl(dataUrl, 1024, 0.8);
        const blob = await (await fetch(small)).blob();
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData.user?.id;
        if (!userId) return;
        const path = `${userId}/${Date.now()}-placeholder.jpg`;
        const { error } = await supabase.storage.from("stickers").upload(path, blob, {
          contentType: blob.type,
          upsert: false,
        });
        if (error) return;
        void putCachedImage(path, blob);
        await setPlaceholderFn({
          data: {
            sticker_id: s.id,
            placeholder_path: path,
            placeholder_credit: cand.credit
              ? { ...cand.credit, source: cand.source }
              : { source: cand.source },
          },
        });
        await qc.invalidateQueries({ queryKey: ["sticker", s.id] });
        await qc.invalidateQueries({ queryKey: ["stickers"] });
      } catch {
        /* 仮画像は任意 */
      }
    })();
  }, [s, searchImagesFn, fetchImageFn, setPlaceholderFn, qc]);

  /**
   * 自動で入ったネット画像を、別の候補に差し替える。
   * 自分で撮った写真ではないので object ではなく placeholder 側を入れ替える
   * (あとで実物を撮ったときに、その写真が正として上書きされる)。
   */
  async function swapWebImage(cand: {
    url: string;
    credit?: { name?: string; link?: string };
    source: string;
  }) {
    if (!s || swapping) return;
    setSwapping(cand.url);
    try {
      const dataUrl = await toImageDataUrl(cand.url, fetchImageFn);
      const small = await downscaleDataUrl(dataUrl, 1024, 0.8);
      const blob = await (await fetch(small)).blob();
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return;
      const path = `${userId}/${Date.now()}-placeholder.jpg`;
      const { error } = await supabase.storage.from("stickers").upload(path, blob, {
        contentType: blob.type,
        upsert: false,
      });
      if (error) throw error;
      void putCachedImage(path, blob);
      await setPlaceholderFn({
        data: {
          sticker_id: s.id,
          placeholder_path: path,
          placeholder_credit: cand.credit
            ? { ...cand.credit, source: cand.source }
            : { source: cand.source },
        },
      });
      await qc.invalidateQueries({ queryKey: ["sticker", s.id] });
      await qc.invalidateQueries({ queryKey: ["stickers"] });
      toast.success(t("card.imageSet"));
    } catch (e) {
      console.warn("Swap web image failed", e);
      toast.error(t("card.photoFailed"));
    } finally {
      setSwapping(null);
    }
  }

  /** ネット画像の「この画像にする」— そのままカードの写真として採用する。 */
  async function applyWebImage(url: string) {
    if (!stickerId) return;
    // **必ず訊く。**
    //
    // このタイルは全面が透明なボタンで、参考画像を眺めているだけの指が
    // 当たっただけで自分の写真が他人の写真に差し替わっていた。
    // 取り消しも無い。写真の長押しには確認があるのに、こちらだけ
    // 素通しだった — 同じ破壊操作の入口で守りが揃っていなかった。
    if (hasPhoto && !window.confirm(t("card.replacePhotoConfirm"))) return;
    try {
      const dataUrl = await toImageDataUrl(url, fetchImageFn);
      const small = await downscaleDataUrl(dataUrl, 1280, 0.82);
      const blob = await (await fetch(small)).blob();
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return;
      const path = `${userId}/${Date.now()}-object.jpg`;
      const { error } = await supabase.storage.from("stickers").upload(path, blob, {
        contentType: blob.type,
        upsert: false,
      });
      if (error) throw error;
      void putCachedImage(path, blob);
      await replacePhotoFn({ data: { sticker_id: stickerId, object_path: path } });
      await qc.invalidateQueries({ queryKey: ["sticker", stickerId] });
      await qc.invalidateQueries({ queryKey: ["stickers"] });
      toast.success(t("card.imageSet"));
    } catch (e) {
      console.warn("Apply web image failed", e);
      toast.error(t("card.photoFailed"));
    }
  }

  // 写真の長押し(550ms)で変更 — ボタンを探さなくても、変えたい写真そのものを
  // 押さえれば変えられる。長押し成立後のクリックはフリップさせない。
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const [heroPickerOpen, setHeroPickerOpen] = useState(false);
  const [savingHero, setSavingHero] = useState(false);

  /**
   * この1枚の主役を決める(要望 #17)。
   * **失敗を握り潰さない** — 移行がまだ当たっていない環境では
   * 保存できないので、その理由をそのまま出す。
   */
  async function pickHeroRole(role: PhotoRole | null) {
    if (savingHero) return;
    setSavingHero(true);
    try {
      const res = await setHeroRoleFn({
        data: { sticker_id: stickerId, hero_role: role },
      });
      if (!res.saved) {
        toast.error(t("photo.saveFailedMigration"));
        return;
      }
      await qc.invalidateQueries({ queryKey: ["sticker", stickerId] });
      setHeroPickerOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("card.photoFailed"));
    } finally {
      setSavingHero(false);
    }
  }
  function heroPressStart() {
    longPressFired.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(12);
      // **`window.confirm` をやめた(要望 #17)。**
      // 以前はここが素のネイティブの窓で、押すとファイル選択へ**直行**して
      // いた。つまり「表示する絵を選ぶ」ができず、要望の半分しか無かった。
      // しかもあの窓はこのアプリの字体にも暗いテーマにも従わない。
      setHeroPickerOpen(true);
    }, 550);
  }
  function heroPressEnd() {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  }

  // A9: Pro限定の手動再生成。auto-enrichのenrichedRefガードを無視して
  // generateCard→updateWordExtrasを強制実行し、詳細を作り直す。
  async function regenerate() {
    if (!s || regenerating) return;
    setRegenerating(true);
    try {
      const card = await enrichWord({
        data: { headword: s.word.headword, targetLanguage: "zh-TW" },
      });
      await saveExtras({
        data: {
          word_id: s.word_id,
          extras: card.extras,
          patch: {
            reading_zhuyin: card.reading_zhuyin,
            pinyin: card.pinyin,
            part_of_speech: card.part_of_speech,
            level: card.level,
            example_sentence: card.example_sentence,
            example_translation: card.example_translation,
            meaning_ja: card.meaning_ja,
          },
        },
      });
      await qc.invalidateQueries({ queryKey: ["sticker", stickerId] });
      await qc.invalidateQueries({ queryKey: ["stickers"] });
    } catch (e) {
      console.warn("Regenerate failed", e);
    } finally {
      setRegenerating(false);
    }
  }

  // B3: カードを削除(確認あり)。成功したらシートを閉じて一覧を更新。
  async function handleDelete() {
    if (!stickerId || busy) return;
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    if (!window.confirm(t("card.deleteConfirmDialog"))) {
      setDeleteArmed(false);
      return;
    }
    setDeleteArmed(false);
    setBusy("delete");
    try {
      await deleteFn({ data: { sticker_id: stickerId } });
      await qc.invalidateQueries({ queryKey: ["stickers"] });
      onClose();
    } catch (e) {
      console.warn("Delete failed", e);
      window.alert(t("card.deleteFailed"));
    } finally {
      setBusy(null);
    }
  }

  // B3: 写真を差し替え(file picker → downscale → upload → attach)。
  /**
   * あとから切り抜きを掛ける(要望 #18 の後半)。
   *
   * 速さを選んだ人はキャッチの瞬間に切り抜いていない。その道しか無ければ
   * 「速さを選ぶ = 二度と切り抜けない」になるので、ここから掛け直せる。
   * 切り抜きは**この端末の上で**走る(サーバに画像を送らない)。
   */
  async function cutoutNow() {
    if (!stickerId || !s?.object_url || busy) return;
    setBusy("image");
    try {
      const { removeBackgroundSmart } = await import("@/lib/cutout");
      // 署名URLから読み直す。**元の写真を差し替えない** — 足すのは切り抜きだけ。
      const srcBlob = await (await fetch(s.object_url)).blob();
      const dataUrl = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.onerror = () => rej(new Error("read failed"));
        r.readAsDataURL(srcBlob);
      });
      const cut = await removeBackgroundSmart(dataUrl);
      if (!cut) throw new Error("cutout failed");
      const blob = await (await fetch(cut)).blob();
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Not signed in");
      const path = `${uid}/${Date.now()}-cutout.png`;
      const { error } = await supabase.storage
        .from("stickers")
        .upload(path, blob, { contentType: blob.type, upsert: false });
      if (error) throw error;
      void putCachedImage(path, blob);
      await attachCutoutFn({ data: { sticker_id: stickerId, cutout_path: path } });
      await qc.invalidateQueries({ queryKey: ["sticker", stickerId] });
      await qc.invalidateQueries({ queryKey: ["stickers"] });
      setHeroPickerOpen(false);
    } catch (e) {
      // **黙って飲まない。** 待ったのに何も起きないのがいちばん困る。
      console.warn("cutout failed", e);
      toast.error(t("photo.cutoutFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function handleImageFile(file: File) {
    if (!stickerId || busy) return;
    setBusy("image");
    try {
      const dataUrl = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.onerror = () => rej(new Error("read failed"));
        r.readAsDataURL(file);
      });
      const small = await downscaleDataUrl(dataUrl, 1280, 0.82);
      const blob = await (await fetch(small)).blob();
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Not signed in");
      const path = `${userId}/${Date.now()}-object.jpg`;
      const { error } = await supabase.storage.from("stickers").upload(path, blob, {
        contentType: blob.type,
        upsert: false,
      });
      if (error) throw error;
      void putCachedImage(path, blob);
      await replacePhotoFn({ data: { sticker_id: stickerId, object_path: path } });
      await qc.invalidateQueries({ queryKey: ["sticker", stickerId] });
      await qc.invalidateQueries({ queryKey: ["stickers"] });
    } catch (e) {
      console.warn("Image change failed", e);
      window.alert(t("card.photoFailed"));
    } finally {
      setBusy(null);
    }
  }

  // Auto-enrich word details (collocations, synonyms, etymology, examples, etc.)
  // the first time a word without extras is opened.
  useEffect(() => {
    if (!s) return;
    const ex = s.word.extras;
    // 完成判定は**いま生成している項目**で行う。
    // 以前はここが旧スキーマ(collocations / synonyms / trivia / register_note /
    // synonym_diff / word_order / study_tips など)だけを見ていた。今の
    // generateCard はそれらを一切作らないため、
    //  ・新しく作ったカードでも「未完成」と判定され毎回AIを呼び直す(課金・待ち時間)
    //  ・逆に、実際に表示する項目(usage_chunks / usage_context / related_words /
    //    pronunciation_tips / taiwan_note …)が欠けていても検知できない
    // という二重の不具合になっていた＝「AIの解説が出ない」の主因。
    const filled = (v: unknown) =>
      Array.isArray(v) ? v.length > 0 : typeof v === "string" ? v.trim().length > 0 : v != null;
    const isEmpty =
      !ex ||
      ![
        ex.usage_chunks,
        ex.usage_context,
        ex.related_words,
        ex.pronunciation_tips,
        ex.taiwan_note,
        ex.etymology,
        ex.mnemonic,
        ex.examples_extra,
      ].some(filled);
    // 部分的に欠けたカードも1回だけ作り直す(主要項目が揃っていなければ未完成)。
    const missingNewFields =
      !ex ||
      ![ex.usage_chunks, ex.usage_context, ex.related_words, ex.pronunciation_tips].every(filled);
    // #65: 表示言語を切り替えたら解説もその言語にする。
    // extras.explain_lang が今の言語と違う(または空=旧データ)なら作り直す。
    // 生成は言語ごとに1回だけで、以後は保存された解説をそのまま出す。
    const wrongLanguage = !!ex && (ex.explain_lang || "ja") !== uiLang;
    // 母語を変えたときも作り直す。日本語話者向けに書いた「有気音の区別が無い」
    // という発音のコツは、韓国語話者にはそのまま当てはまらない。
    const wrongL1 = !!ex && (ex.explain_l1 || "ja") !== nativeLang;
    if (!isEmpty && !missingNewFields && !wrongLanguage && !wrongL1) return;
    /**
     * 共有されている列を書き換えていいのは、**本当に欠けているときだけ**。
     *
     * `words` は `(language, headword)` で共有される表で、同じ語を持つ
     * 他のユーザーとも同じ行を見ている。表示言語を切り替えただけで
     * `meaning_ja` / `example_sentence` / `reading_zhuyin` まで送っていたので、
     * **設定を触っただけで保存済みの意味が書き換わり、4択の選択肢も
     * 揺れていた**(独立監査の指摘)。しかも他人のカードごと。
     *
     * 解説(`extras`)は `explain_lang` の印が付いていて、言語が違えば
     * 各自が開いたときに作り直される = 自己修復する。だから言語切替の
     * ときは**解説だけ**を入れ替え、共有の列には触らない。
     *
     * 根本的には「解説の言語」がユーザーごとの持ち物なのに共有の行に
     * 載っているのが問題で、そこを直すには列を足す必要がある(いま流せない)。
     * docs/ に残すべき宿題。
     */
    // **共有列を書きに行くかどうかは、共有列そのものを見て決める。**
    //
    // ここを二度間違えている。最初は「言語が変わっただけか」を解説の
    // 量(`isEmpty`)で判断していた — 解説と共有列は別物なので、
    // 辞書由来で解説が空のカードは、表示言語を切り替えただけでも
    // 共有列に書きに行っていた(同じ語を持つ他人のカードごと書き換わる)。
    // 「言語が変わっただけか」を正確にしても直らない。**知りたいのは
    // 共有列が実際に欠けているかどうか**で、それは共有列を見れば分かる。
    const sharedMissing = ![
      s.word.meaning_ja,
      s.word.pinyin,
      s.word.reading_zhuyin,
      s.word.example_sentence,
    ].every(filled);
    // 表示言語と母語を含めたキー: どちらを切り替えても同じ語をもう一度作る。
    const guardKey = `${s.word_id}:${uiLang}:${nativeLang}`;
    if (enrichedRef.current.has(guardKey)) return;
    enrichedRef.current.add(guardKey);
    setEnriching(true);
    setEnrichError(null);
    (async () => {
      try {
        const card = await enrichWord({
          data: { headword: s.word.headword, targetLanguage: "zh-TW" },
        });
        await saveExtras({
          data: {
            word_id: s.word_id,
            extras: card.extras,
            patch: !sharedMissing
              ? undefined
              : {
                  reading_zhuyin: card.reading_zhuyin,
                  pinyin: card.pinyin,
                  part_of_speech: card.part_of_speech,
                  level: card.level,
                  example_sentence: card.example_sentence,
                  example_translation: card.example_translation,
                  meaning_ja: card.meaning_ja,
                },
          },
        });
        await qc.invalidateQueries({ queryKey: ["sticker", stickerId] });
        await qc.invalidateQueries({ queryKey: ["stickers"] });
      } catch (e) {
        console.warn("Enrichment failed", e);
        // Let a later reopen retry instead of leaving the word details blank
        // forever (words filed fast from the dictionary start with no extras).
        enrichedRef.current.delete(guardKey);
        // 失敗を黙って握りつぶすと「解説がずっと出ない」状態と見分けが付かない。
        // 理由と再試行手段を必ず画面に出す(apple-design §8 / §21 fallback)。
        setEnrichError(e instanceof Error ? e.message : String(e));
      } finally {
        setEnriching(false);
      }
    })();
  }, [s, stickerId, enrichWord, saveExtras, qc, uiLang, nativeLang]);

  // reset flip when sticker changes
  useEffect(() => {
    setFlipped(false);
    setEditing(false);
  }, [stickerId]);

  // lock body scroll while open
  useEffect(() => {
    if (!stickerId) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [stickerId]);

  // ESC to close
  useEffect(() => {
    if (!stickerId) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [stickerId, onClose]);

  if (!stickerId) return null;

  const hasSelfie = !!s?.selfie_url;

  // 間違い報告: AIが単語を作り直し(自動修正)、報告も記録する(ユーザーFB)。
  async function reportIssue() {
    if (!s || reporting) return;
    setReporting(true);
    try {
      const card = await enrichWord({
        data: { headword: s.word.headword, targetLanguage: "zh-TW" },
      });
      await saveExtras({
        data: {
          word_id: s.word_id,
          extras: card.extras,
          patch: {
            reading_zhuyin: card.reading_zhuyin,
            pinyin: card.pinyin,
            part_of_speech: card.part_of_speech,
            level: card.level,
            example_sentence: card.example_sentence,
            example_translation: card.example_translation,
            meaning_ja: card.meaning_ja,
          },
        },
      });
      await reportFn({ data: { word_id: s.word_id, headword: s.word.headword } });
      await qc.invalidateQueries({ queryKey: ["sticker", stickerId] });
      await qc.invalidateQueries({ queryKey: ["stickers"] });
      toast.success(t("card.reportDone"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("card.reportFailed"));
    } finally {
      setReporting(false);
    }
  }

  return (
    <div
      className="material-in fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={s ? s.word.headword : t("common.card")}
    >
      {/* Close bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-border/60 bg-background/80 px-3 py-2 backdrop-blur">
        <span lang="zh-Hant" className="pl-1 text-footnote font-medium text-muted-foreground">
          {s ? s.word.headword : "..."}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditing((v) => !v)}
            aria-label={t("card.sections")}
            className={`lift-soft inline-flex h-11 w-11 items-center justify-center rounded-full border border-border ${editing ? "bg-primary text-primary-foreground" : "bg-card"}`}
          >
            <Settings2 className="h-4 w-4" />
          </button>
          <button
            onClick={onClose}
            aria-label={t("common.close")}
            className="lift-soft inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Settings panel — slides down from top */}
      <div
        className={`fixed left-0 right-0 top-[52px] z-20 transition-all duration-300 [transition-timing-function:var(--ease-ios)] ${
          editing ? "translate-y-0 opacity-100" : "-translate-y-4 pointer-events-none opacity-0"
        }`}
      >
        <div className="mx-3 mt-2 rounded-2xl border border-border bg-card/95 p-3 shadow-xl backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-footnote font-semibold text-muted-foreground">
              {t("card.sections")}
            </p>
            <button
              onClick={() => setEditing(false)}
              className="lift-soft inline-flex h-10 w-10 items-center justify-center rounded-full bg-secondary"
              aria-label={t("common.closeEdit")}
            >
              <ChevronUp className="h-4 w-4" />
            </button>
          </div>
          {s && <WordCardSectionsEditor />}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-24 pt-3">
        {isLoading ? (
          <div className="grid h-64 place-items-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : isError ? (
          // **通信の失敗を「見つかりません」と言わない。**
          //
          // ユーザーはそれを「消えた」と受け取り、自分の記録が失われたと
          // 思う。やり直せば戻るものは、やり直せると言う(§8)。
          // 同じデータを開く dex.$stickerId ではすでにこう直してあったのに、
          // ホーム・図鑑からカードを開く**主経路であるこのシート**だけが
          // 残っていた(独立監査の指摘)。
          <div className="px-2 py-4">
            <LoadFailed onRetry={() => void refetch()} retrying={isFetching} />
          </div>
        ) : !s ? (
          // 本当に無い(消された・権限が無い)。
          <div className="grid h-64 place-items-center px-6 text-center">
            <div>
              <p className="text-body text-muted-foreground">{t("card.notFound")}</p>
              <p className="mt-1 text-footnote text-muted-foreground">{t("card.notFoundHint")}</p>
            </div>
          </div>
        ) : (
          <StickerSheetBody
            sticker={s}
            uiLang={uiLang}
            isPro={isPro}
            flipped={flipped}
            setFlipped={setFlipped}
            hasSelfie={hasSelfie}
            hasPhoto={hasPhoto}
            busy={busy}
            deleteArmed={deleteArmed}
            handleDelete={handleDelete}
            onCancelDelete={() => setDeleteArmed(false)}
            handleImageFile={handleImageFile}
            fileInputRef={fileInputRef}
            heroPressStart={heroPressStart}
            heroPressEnd={heroPressEnd}
            longPressFired={longPressFired}
            enriching={enriching}
            enrichError={enrichError}
            setEnrichError={setEnrichError}
            onEnrichRetry={() => {
              setEnrichError(null);
              enrichedRef.current.clear();
              void qc.invalidateQueries({ queryKey: ["sticker", stickerId] });
            }}
            regenerating={regenerating}
            regenerate={regenerate}
            reporting={reporting}
            reportIssue={reportIssue}
            webCandidates={webCandidates}
            swapping={swapping}
            swapWebImage={swapWebImage}
            applyWebImage={applyWebImage}
            photos={photoData?.photos ?? []}
            encounter={encounter ?? null}
          />
        )}
      </div>

      {/* 長押しで開く「主役の写真」の面(要望 #17)。
          **札の上に重ねる** — 別の画面へ飛ばすと、選んだ結果を
          その場で確かめられない。 */}
      {heroPickerOpen && s && (
        <div
          className="absolute inset-0 z-20 overflow-y-auto bg-background/95 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={t("photo.pickTitle")}
        >
          <HeroPhotoPicker
            sources={s}
            current={s.hero_role ?? null}
            saving={savingHero || busy === "image"}
            onPick={(role) => void pickHeroRole(role)}
            onReplaceFile={() => {
              setHeroPickerOpen(false);
              fileInputRef.current?.click();
            }}
            onCutoutNow={s.object_url && !s.cutout_url ? () => void cutoutNow() : undefined}
            onClose={() => setHeroPickerOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

/**
 * ホームや図鑑で写真を押すと開く面の**中身**。
 *
 * ## なぜ切り出したか
 * この app でいちばん大きい未検査の画面だった(929行)。ルートが2つの
 * 問い合わせと10個の状態を持っているので、そのままでは検査の雛形から
 * 描けない。**描く所だけ**をここへ出す(復習・ホーム・設定・語の詳細で
 * 同じことを何度もやっている)。
 *
 * 引数が多いのは、この面が**実際に多くの状態で見た目を変える**から。
 * 減らすために束ねると、束の中のどれが効いているのかが型で見えなくなる。
 */
export function StickerSheetBody({
  sticker: s,
  uiLang,
  isPro,
  flipped,
  setFlipped,
  hasSelfie,
  hasPhoto,
  busy,
  deleteArmed,
  handleDelete,
  onCancelDelete,
  handleImageFile,
  fileInputRef,
  heroPressStart,
  heroPressEnd,
  longPressFired,
  enriching,
  enrichError,
  setEnrichError,
  onEnrichRetry,
  regenerating,
  regenerate,
  reporting,
  reportIssue,
  webCandidates,
  swapping,
  swapWebImage,
  applyWebImage,
  photos,
  encounter,
}: {
  sticker: NonNullable<Awaited<ReturnType<typeof getSticker>>>;
  uiLang: string;
  isPro: boolean;
  /** 写真の裏(自撮り)を見ているか。 */
  flipped: boolean;
  setFlipped: Dispatch<SetStateAction<boolean>>;
  hasSelfie: boolean;
  hasPhoto: boolean;
  /** 走っている重い操作。写真の差し替えと削除で見た目が変わる。 */
  busy: null | "delete" | "image";
  /** 削除は2段。1回目で「本当に削除?」に変わり、4秒で戻る。 */
  deleteArmed: boolean;
  handleDelete: () => void;
  /** 2段目から降りる。時間切れを待たずに取り消せるようにする。 */
  onCancelDelete: () => void;
  handleImageFile: (f: File) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  heroPressStart: () => void;
  heroPressEnd: () => void;
  longPressFired: RefObject<boolean>;
  enriching: boolean;
  enrichError: string | null;
  setEnrichError: Dispatch<SetStateAction<string | null>>;
  /** 「もう一度作る」。印を消して問い合わせをやり直す。 */
  onEnrichRetry: () => void;
  regenerating: boolean;
  regenerate: () => void;
  reporting: boolean;
  reportIssue: () => void;
  webCandidates: Array<{ url: string; credit?: { name?: string; link?: string }; source: string }>;
  swapping: string | null;
  swapWebImage: (cand: {
    url: string;
    credit?: { name?: string; link?: string };
    source: string;
  }) => void;
  applyWebImage: (url: string) => void;
  /**
   * この単語をこれまでに撮った写真。
   * 2枚未満なら `StickerPhotoHistory` 自身が何も描かないので、ここでは分岐しない。
   */
  photos: StickerPhoto[];
  /** 「今週出会う見込み」。届いていなければ節そのものが出ない。 */
  encounter?: EncounterEstimate | null;
}) {
  /**
   * 表に出す1枚。**役も見る** — ネット画像のときだけ出典を添えるため。
   *
   * 優先順は「この札の指定(長押しで決めた物) → 設定 → 画面の意図」。
   * 札の指定がいちばん細かい話なので、いちばん強い。
   */
  const photoPref = usePhotoPref();
  const hero = pickStickerPhoto(s, { prefer: s.hero_role ?? resolvePrefer(photoPref, null) });
  const t = useT();
  return (
    <>
      {/* Hero — expands with pop-in. Tap to flip selfie ↔ object */}
      <div
        className="perspective-1200 mb-4"
        // 自撮りが無いカードは裏面が無い＝タップしても回さない(NORI指定)。
        // ボタンとして振る舞うのも自撮りがあるときだけにする。
        role={hasSelfie ? "button" : undefined}
        tabIndex={hasSelfie ? 0 : undefined}
        aria-label={hasSelfie ? (flipped ? t("card.flipBack") : t("card.flipToSelfie")) : undefined}
        onClick={() => {
          // 長押し(写真の変更)が成立した後のクリックは無視する。
          if (longPressFired.current) {
            longPressFired.current = false;
            return;
          }
          if (!hasSelfie) return;
          setFlipped((f) => !f);
        }}
        onPointerDown={heroPressStart}
        onPointerUp={heroPressEnd}
        onPointerLeave={heroPressEnd}
        onPointerCancel={heroPressEnd}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (hasSelfie && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setFlipped((f) => !f);
          }
        }}
      >
        <div
          className={`card-flip relative aspect-[4/5] w-full ${hasSelfie ? "cursor-pointer" : ""} ${flipped ? "flipped" : ""}`}
        >
          {/* Front: original photo WITH background — fills the frame, no side gutters */}
          {/* **裏を向いている面は触れない。** `backface-visibility` で見えなく
              なるだけでは、中のボタンが鍵盤の止まり木として残り、
              指で押しても手前の面に当たる(検査に「送り切っても下敷きの
              まま」と出た)。`inert` で丸ごと外す。 */}
          <div
            inert={flipped}
            className="card-face absolute inset-0 overflow-hidden rounded-3xl shadow-xl"
          >
            {/* どの絵を出すかは `sticker-photo.ts` が1箇所で決める。
                ネット画像だけは**出典を添える**必要があるので役を見る。 */}
            {hero && hero.role !== "placeholder" ? (
              <CachedImg
                src={hero.url}
                alt={
                  hero.role === "cutout"
                    ? s.word.headword
                    : t("common.photoOf", { word: s.word.headword })
                }
                className="hero-pop absolute inset-0 h-full w-full object-cover"
              />
            ) : hero ? (
              // ネット画像。**仮ではなくカードの絵として普通に見せる**
              // (段ボール/ゴースト表現は廃止 2026-07-28)。
              // 気に入らなければ下の候補から選び直せる。
              <>
                <img
                  src={hero.url}
                  alt={t("common.imageOf", { word: s.word.headword })}
                  className="hero-pop absolute inset-0 h-full w-full object-cover"
                />
                {s.placeholder_credit?.name && (
                  <a
                    href={s.placeholder_credit.link}
                    target="_blank"
                    rel="noreferrer"
                    className="absolute bottom-2 left-3 text-caption text-white/90 drop-shadow"
                  >
                    📷 {s.placeholder_credit.name}
                  </a>
                )}
              </>
            ) : (
              <div className="grid h-full w-full animate-pulse place-items-center bg-secondary">
                <span className="text-footnote text-muted-foreground">
                  {t("card.findingImage")}
                </span>
              </div>
            )}
            {/* 写真の変更はこのアイコン or 写真の長押し(下部の大きなボタンは廃止) */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                // 長押しには確認があるのに、常時見えているこちらだけ
                // 素通しだった。押しやすいほうが無防備なのは逆。
                if (hasPhoto && !window.confirm(t("card.changePhotoConfirm"))) return;
                fileInputRef.current?.click();
              }}
              aria-label={t("card.changePhoto")}
              // 見た目は 40px のままでいい(写真の隅の小さな印なので、
              // 44px の塊にすると写真より重くなる)。**当たり判定だけ広げる。**
              className="absolute bottom-2 left-2 grid h-10 w-10 place-items-center rounded-full bg-black/50 text-white backdrop-blur transition before:absolute before:-inset-0.5 before:content-[''] active:scale-95"
            >
              {busy === "image" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
            </button>
            {/* 裏返せるカードだけに案内を出す(自撮りが無いカードは回らない)。 */}
            {hasSelfie && (
              <span className="absolute bottom-2 right-2 rounded-full bg-black/55 px-2 py-1 text-caption text-white backdrop-blur">
                {t("card.flipToSelfie")}
              </span>
            )}
          </div>

          {/* Back: the selfie (you + the thing) */}
          <div
            inert={!flipped}
            className="card-face card-back absolute inset-0 overflow-hidden rounded-3xl bg-secondary shadow-xl"
          >
            {hasSelfie ? (
              <>
                <img
                  src={s.selfie_url!}
                  alt={t("card.selfie")}
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <span className="absolute bottom-2 right-2 rounded-full bg-black/55 px-2 py-1 text-caption text-white backdrop-blur">
                  {t("card.flipBack")}
                </span>
              </>
            ) : (
              <div className="grid h-full place-items-center gap-1 text-center text-body text-muted-foreground">
                <span>{t("card.noSelfie")}</span>
                <span className="text-caption">{t("card.flipBack")}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ネット画像の候補: 自動で入った画像が気に入らなければタップで変更。
            自分で撮った写真があるカードには出さない(#67)。 */}
      {!s.object_url && !s.cutout_url && webCandidates.length > 1 && (
        <section className="mb-4">
          <div className="mb-1.5 text-caption font-semibold text-muted-foreground">
            {t("card.pickAnotherImage")}
          </div>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {webCandidates.map((c) => (
              <button
                key={c.url}
                onClick={() => void swapWebImage(c)}
                disabled={!!swapping}
                className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl ring-1 ring-border transition active:scale-95 disabled:opacity-50"
                aria-label={t("card.pickAnotherImage")}
              >
                <img src={c.url} alt="" className="h-full w-full object-cover" />
                {swapping === c.url && (
                  <span className="absolute inset-0 grid place-items-center bg-black/40">
                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* When & Where chip */}
      <section className="mb-4 rounded-2xl border border-border bg-card p-3 text-body shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-footnote text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {new Date(s.created_at).toLocaleString(uiLang === "en" ? "en-US" : "ja-JP", {
              year: "numeric",
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
          {(s.location_name || (s.lat != null && s.lng != null)) && (
            <a
              href={
                s.lat != null && s.lng != null
                  ? `https://www.google.com/maps?q=${s.lat},${s.lng}`
                  : `https://www.google.com/maps?q=${encodeURIComponent(s.location_name ?? "")}`
              }
              target="_blank"
              rel="noreferrer"
              className="lift relative inline-flex min-h-11 items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-footnote font-medium text-primary-ink"
            >
              <MapPin className="h-3.5 w-3.5" />
              {s.location_name ?? t("card.openMap")}
            </a>
          )}
        </div>
        {s.caption && <p className="mt-2 text-body">「{s.caption}」</p>}
      </section>

      {/* 同じものに何度も出会った記録。
          **図鑑からここに来る人が大多数**なのに、これまでは
          `/dex/$stickerId` を直に開いた人にしか出ていなかった。
          2回目3回目に撮った写真は保存されていたのに、
          図鑑からは永久に辿り着けなかった(オーナー指摘 2026-08-18)。
          再会が無ければ何も描かない。 */}
      <StickerPhotoHistory photos={photos} dateLocale={uiLang === "en" ? "en-US" : "ja-JP"} />

      <WordCard
        word={{
          headword: s.word.headword,
          reading_zhuyin: s.word.reading_zhuyin,
          pinyin: s.word.pinyin,
          meaning_ja: s.word.meaning_ja,
          part_of_speech: s.word.part_of_speech,
          level: s.word.level,
          example_sentence: s.word.example_sentence,
          example_translation: s.word.example_translation,
          extras: s.word.extras,
        }}
        wordId={s.word_id}
        isPro={isPro}
        onPickImage={applyWebImage}
        encounter={encounter}
      />

      {enriching && (
        <div className="mt-3 flex items-center justify-center gap-2 rounded-2xl border border-dashed border-primary/30 bg-primary/5 py-2 text-footnote text-primary-ink">
          <Sparkles className="h-3.5 w-3.5 animate-pulse" />
          {t("card.preparing")}
        </div>
      )}

      {/* 解説の生成に失敗したときは、空欄のまま黙らせない。
            何が起きたかと「もう一度」を必ず見せる(apple-design §8)。 */}
      {!enriching && enrichError && (
        <div className="mt-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-footnote">
          <p className="font-semibold text-destructive-ink">{t("card.enrichFailed")}</p>
          <p className="mt-1 break-words text-muted-foreground">{enrichError}</p>
          <button
            onClick={onEnrichRetry}
            className="press-in mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 font-medium"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {t("card.enrichRetry")}
          </button>
        </div>
      )}

      {/* A9: 手動再生成(Pro限定)。freeユーザーには🔒でProの見せ場に。 */}
      {!enriching &&
        (isPro ? (
          <button
            onClick={regenerate}
            disabled={regenerating}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl min-h-11 border border-primary/30 bg-primary/5 py-3 text-footnote font-semibold text-primary-ink disabled:border-border disabled:bg-secondary disabled:text-muted-foreground"
          >
            {regenerating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {regenerating ? t("card.regenerating") : t("card.regenAll")}
          </button>
        ) : (
          <div className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-secondary/40 py-2.5 text-footnote text-muted-foreground">
            <Lock className="h-3.5 w-3.5" />
            {t("card.regenPro")}
          </div>
        ))}

      {/* 間違い報告: 意味・発音が変なときAIに作り直させ、報告も記録する */}
      <div className="mt-4 text-center">
        <button
          onClick={() => reportIssue()}
          disabled={reporting}
          className="press-in inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-footnote font-medium text-muted-foreground disabled:opacity-60"
        >
          {reporting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Flag className="h-3.5 w-3.5" />
          )}
          {reporting ? t("card.reportFixing") : t("card.reportPrompt")}
        </button>
      </div>

      {s.lat != null && s.lng != null && (
        <a
          href={`https://www.google.com/maps?q=${s.lat},${s.lng}`}
          target="_blank"
          rel="noreferrer"
          className="mt-5 block overflow-hidden rounded-3xl border border-border bg-card shadow-sm"
        >
          <iframe
            title={t("common.mapTitle")}
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${s.lng - 0.005}%2C${s.lat - 0.003}%2C${s.lng + 0.005}%2C${s.lat + 0.003}&layer=mapnik&marker=${s.lat}%2C${s.lng}`}
            // 押せない飾りなので**タブ順から外す**。既定では iframe に
            // 焦点が入るが、中身は `pointer-events-none` で触れないうえ
            // 焦点の輪も出ないので、鍵盤で辿ると「どこに居るか分からない
            // 止まり木」が1つできていた(実測 1.00:1)。押す先は外側の `<a>`。
            tabIndex={-1}
            className="pointer-events-none h-48 w-full"
            loading="lazy"
          />
          <div className="flex items-center justify-between p-3 text-footnote text-muted-foreground">
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" /> {s.location_name ?? t("common.shotHere")}
            </span>
            <span className="text-primary-ink">{t("card.openMapsLabel")}</span>
          </div>
        </a>
      )}

      {/* カード管理: 写真の変更は写真上の📷アイコン/長押し。削除は2段階。 */}
      <div className="mt-5 flex items-center justify-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleImageFile(f);
            e.target.value = "";
          }}
        />
        {/* **やめる手立てを画面に置く(オーナー指摘の形の兄弟)。**
            2段目に入ると4秒で自動的に戻るが、それは**待つ**という手立てで
            あって、押して取り消す手立てではない。取り消せない操作の
            手前で「やっぱりやめる」と思った人に、押せるものが1つも無い
            のはおかしい(圏外で預かった写真を捨てる確認で同じ指摘を受けた)。
            武装しているときだけ出す。 */}
        {deleteArmed && busy === null && (
          <button
            onClick={onCancelDelete}
            className="flex min-h-11 items-center justify-center rounded-2xl border border-border bg-card px-4 py-3 text-footnote font-medium"
          >
            {t("home.pendingDiscardCancel")}
          </button>
        )}
        <button
          onClick={handleDelete}
          disabled={busy !== null}
          // **取り消せない操作。** ここは4つ直してある:
          // ・高さが 42px で指の下限を割っていた → `min-h-11`
          // ・`disabled:opacity-60` で、消している最中の白文字が **1.78:1**
          //   まで落ちて読めなくなっていた(塗りと文字が一緒に薄くなる)
          // ・`border-red-200 bg-red-50 text-red-700` は素の Tailwind の
          //   番号で、**暗いテーマに一切追従しない**
          // ・武装した側の白文字が暗い面で 2.97:1(意味を持つ塗りの下限 3 割れ)
          // 全部トークンの組に置き換える。塗りと文字の組は土台の検査が
          // どのテーマでも読める比を保証している。
          className={`flex min-h-11 items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-footnote font-medium transition-colors disabled:border-border disabled:bg-secondary disabled:text-muted-foreground ${
            deleteArmed
              ? "border-destructive bg-destructive text-destructive-foreground"
              : "border-destructive/30 bg-destructive/10 text-destructive-ink"
          }`}
        >
          {busy === "delete" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
          {deleteArmed ? t("card.deleteConfirm") : t("card.delete")}
        </button>
      </div>
    </>
  );
}
