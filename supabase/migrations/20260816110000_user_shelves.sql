-- 2026-08-16
-- 新しい語を取ったら、AI が分析して**その人の図鑑にだけ**棚(と部屋)が生える。
--
-- ## なぜ words 側ではないのか
-- `words.category_key` は `categories(key)` への外部キーで、`words` は
-- **全ユーザー共通**の辞書。ここに AI が思いついた分類を挿すと、誰か1人の
-- 変わった語が全員の図鑑に棚を作る(名前の重複もゴミも共有される)。
-- 棚は「その人がどう並べたいか」なので、per-user 側に持つ。
--
--   user_shelves      … その人だけの棚の定義(棚名・絵文字・どの部屋か)
--   stickers.shelf_key … その1枚がどの棚に載るか(null = 語の既定の分類)
--
-- 既存の54棚は今までどおり動く。`shelf_key` が null なら
-- `words.category_key` を見る、という**上書き方式**なので、
-- この移行で既存の図鑑の並びは1つも変わらない。

create table if not exists public.user_shelves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- 棚の鍵。その人の中で一意。英小文字とアンダースコアだけ(表示には使わない)。
  key text not null,
  -- 画面に出る棚の名前。学習者の母語で入る。
  label text not null,
  emoji text not null default '📦',
  -- どの部屋に置くか。既知の8部屋の鍵ならそこへ、知らない鍵なら
  -- **新しい部屋として生える**(部屋のためだけの表を増やさない)。
  room_key text not null,
  room_label text not null,
  created_at timestamptz not null default now(),
  unique (user_id, key)
);

-- 鍵と名前は「AIが出した文字列」なので、長さと形をDB側でも閉じる。
-- アプリ側の検証だけに頼らない — 生成物は必ず想定外を出す。
alter table public.user_shelves drop constraint if exists user_shelves_key_shape;
alter table public.user_shelves add constraint user_shelves_key_shape
  check (key ~ '^[a-z][a-z0-9_]{1,38}$');
alter table public.user_shelves drop constraint if exists user_shelves_room_key_shape;
alter table public.user_shelves add constraint user_shelves_room_key_shape
  check (room_key ~ '^[a-z][a-z0-9_]{1,38}$');
alter table public.user_shelves drop constraint if exists user_shelves_label_len;
alter table public.user_shelves add constraint user_shelves_label_len
  check (char_length(label) between 1 and 24 and char_length(room_label) between 1 and 24);
alter table public.user_shelves drop constraint if exists user_shelves_emoji_len;
alter table public.user_shelves add constraint user_shelves_emoji_len
  check (char_length(emoji) between 1 and 8);

grant select, insert, update, delete on public.user_shelves to authenticated;
grant all on public.user_shelves to service_role;
alter table public.user_shelves enable row level security;

drop policy if exists user_shelves_select_own on public.user_shelves;
create policy user_shelves_select_own on public.user_shelves
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists user_shelves_insert_own on public.user_shelves;
create policy user_shelves_insert_own on public.user_shelves
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists user_shelves_update_own on public.user_shelves;
create policy user_shelves_update_own on public.user_shelves
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists user_shelves_delete_own on public.user_shelves;
create policy user_shelves_delete_own on public.user_shelves
  for delete to authenticated using (auth.uid() = user_id);

create index if not exists user_shelves_user_idx on public.user_shelves(user_id, created_at);

-- 1枚ごとの棚の上書き。**外部キーは張らない。**
-- 棚を消したときに写真まで道連れにしたくないし、消えた棚を指していたら
-- 語の既定の分類へ黙って戻ればいい(読み側がそう書いてある)。
alter table public.stickers add column if not exists shelf_key text;

comment on table public.user_shelves is
  'Per-user shelves the AI creates for words that do not fit the 54 curated categories.';
comment on column public.stickers.shelf_key is
  'Overrides words.category_key for this user. NULL = use the word''s own category.';
