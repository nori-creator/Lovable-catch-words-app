-- アルバムの札を「好きな場所・好きな大きさ・好きな傾き」で置けるようにする。
-- （オーナー指示 2026-09-15）
--
-- これまでは `album_order`（並び順）と `album_size`（升目4通り）だけで、
-- 場所は並び順からしか決まらず、大きさは4つに飛ぶしか無かった。指をどれだけ
-- 滑らかに動かしても結果が4通りなので、「カクカクする」という報告になる。
--
-- ここで足すのは連続値4つ。単位は **台紙の箱に対する割合**（px ではない）で、
-- 別の端末や横向きで開いても同じ見た目になる。詳しくは `src/lib/album-place.ts`。
--
--   album_x     中心の横位置 0..1
--   album_y     中心の縦位置 0..1
--   album_scale 基準の大きさに対する倍率（0.45〜2.6）
--   album_rot   傾き（度。−180〜180）
--
-- **古い列は消さない。** 既に自分で S/縦/横/L を選んだ人の設定が残っている
-- ので、消すと「勝手に変わった」になる。新しい列が NULL の札は
-- `placementFrom()` が昔の並びに寄せた場所へ自動で置く。

ALTER TABLE public.stickers
  ADD COLUMN IF NOT EXISTS album_x DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS album_y DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS album_scale DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS album_rot DOUBLE PRECISION;

-- 壊れた値が入らないようにする。画面側でも範囲に収めているが、
-- **表の側でも守る** — 別の道から書かれたときに絵が壊れるのを防ぐ。
ALTER TABLE public.stickers
  DROP CONSTRAINT IF EXISTS stickers_album_placement_check;

ALTER TABLE public.stickers
  ADD CONSTRAINT stickers_album_placement_check
  CHECK (
    (album_x IS NULL OR (album_x >= 0 AND album_x <= 1))
    AND (album_y IS NULL OR (album_y >= 0 AND album_y <= 1))
    AND (album_scale IS NULL OR (album_scale >= 0.45 AND album_scale <= 2.6))
    AND (album_rot IS NULL OR (album_rot >= -180 AND album_rot <= 180))
  );
