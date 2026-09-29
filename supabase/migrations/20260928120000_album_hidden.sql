-- ホームのアルバムから外した写真（オーナー指示 2026-09-28「画像を削除するボタンを
-- 画像の右端に出して。赤バツ。ただし図鑑からは削除しないで、ホームアルバムだけから
-- 消して。またあとから戻すこともできるようにして」）。
-- 札そのものは消さない。アルバムに貼るかどうかだけの印。
alter table public.stickers
  add column if not exists album_hidden boolean not null default false;

create index if not exists stickers_album_hidden_idx
  on public.stickers (user_id)
  where album_hidden;
