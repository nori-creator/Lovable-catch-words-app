-- 2026-08-20
-- 札ごとに「主役の絵」を決められるようにする。
--
-- ## なぜ要るか
-- 要望(2026-07-14):
-- 「写真ごとに長押しで表示画像を変更できるようにしたい」
--
-- 設定の既定(`lib/photo-pref.ts`、端末ごと)は**全部の札に効く**。
-- 「この1枚だけは切り抜きで見たい」はそこでは言えないので、
-- 札の側に持たせる。null = 設定に従う(既定)。
--
-- ## 名前で消さない
-- 検査制約は `alter ... add constraint` で**名前を付けて**足す。
-- 列定義に直接書くと Postgres が名前を決めてしまい、後で広げるときに
-- 「たぶんこの名前」で `drop constraint if exists` を撃つことになる —
-- 名前が違えば黙って何も消えず、狭いほうが残って弾き続ける
-- (`review_mode` でその形を踏みかけた)。
--
-- ## 追記だけ
-- 既存の63枚は null のまま。読む側は列が無くても落ちない形にしてあるので、
-- この移行が当たる前でもアプリは動く(主役を選べないだけ)。

alter table public.stickers add column if not exists hero_role text;

alter table public.stickers
  drop constraint if exists stickers_hero_role_valid;

alter table public.stickers
  add constraint stickers_hero_role_valid
  check (
    hero_role is null
    or hero_role in ('object', 'cutout', 'selfie', 'placeholder')
  );

comment on column public.stickers.hero_role is
  'この1枚を表に出すときの主役(object=撮った写真 / cutout=切り抜き / '
  'selfie=自撮り / placeholder=ネット画像)。null は設定に従う。'
  '値の集合は src/lib/sticker-photo.ts の PhotoRole と必ず同じにすること。';
