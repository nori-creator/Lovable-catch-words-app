import { supabase } from "@/integrations/supabase/client";
import { isTooBig, voiceNotePath } from "@/lib/voice-note";

/**
 * 一言の録音を**置き場所に上げる、ただ1つの道**。
 *
 * ## なぜ関数にするか
 * 一言を残せる所が3つある — カードから録る所、写真のキャッチの一言の欄、
 * かざして撮るキャッチの一言の欄。この作業場で何度も起きているのは
 * **同じ判断が複数の場所に書かれて片方だけ直る**事故で、
 * 「どこに置くか」「大きすぎたら断る」はまさにその判断。
 *
 * ## 上げるだけで、札には結び付けない
 * 結び付けるのは `setStickerVoiceVideo`(サーバ関数)の仕事。ここで一緒に
 * やると、キャッチの経路が**保存の前に**サーバ関数を1つ増やすことになり、
 * オーナーが「最大のペイン」と書いた「一瞬でも早く」を削る。
 * キャッチ側は札が出来てから、裏でこの道を通る。
 */
export async function uploadVoiceNote(input: {
  blob: Blob;
  mime: string;
  stickerId: string;
}): Promise<string> {
  const { blob, mime, stickerId } = input;
  if (blob.size === 0) throw new Error("empty recording");
  // **断る側と止める側で同じ数字を使う**(`voice-note.ts`)。
  if (isTooBig(blob.size)) throw new Error("recording too large");
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("no user");
  const path = voiceNotePath(userId, stickerId, mime);
  const { error } = await supabase.storage.from("stickers").upload(path, blob, {
    contentType: mime,
    // **録り直しは上書き。** 札ごとに1本なので、古いものを残さない
    // (残すと画面から消せない物が増え続ける)。
    upsert: true,
  });
  if (error) throw error;
  return path;
}
