-- 2026-08-18
-- 再会したときに撮った写真を残す。
--
-- ## なぜ要るか
-- 同じものをもう一度撮ると `recordEncounter` が呼ばれ、回数が1つ増え、
-- 記録が1行入る。**しかし撮った写真はどこにも保存されず、捨てられていた。**
-- 学習者から見ると「撮ったのに、その写真がどこにも無い」。
--
-- 単語の詳細で「前に撮った写真が何枚も並ぶ」ようにしたいので、
-- 1回の再会 = 1行 = 1枚、という形で `encounters` に持たせる。
-- 写真のための表を新しく作らない — 再会の記録そのものが既にここにある。
--
-- `stickers` 側は触らない。最初の1枚(`object_image_url` /
-- `cutout_image_url`)は今までどおりそこにあり、詳細では
-- 「最初の1枚 + 再会の写真」を時系列で並べる。

alter table public.encounters add column if not exists image_path text;
alter table public.encounters add column if not exists cutout_path text;

comment on column public.encounters.image_path is
  'Storage path of the photo taken at this re-encounter. NULL for encounters logged before this column existed.';
comment on column public.encounters.cutout_path is
  'Storage path of the cut-out version, when the cutout step succeeded.';

-- 詳細を開くたびに「この単語の再会を古い順に」引くので、そのための索引。
create index if not exists encounters_sticker_created_idx
  on public.encounters(sticker_id, created_at);
