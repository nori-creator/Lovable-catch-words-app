-- アルバムの縦位置を「台紙の**幅**に対する割合」で持つようにした。
-- （オーナー報告 2026-09-15「デフォルトで表示するのは今までと同じ大きさに
--   して」を直す過程で判明）
--
-- 0001 では `album_y` を 0〜1 に縛っていた。これは台紙の**高さ**に対する
-- 割合という前提で、そのためには台紙の形を決め打ちにする必要があった。
-- ところが形を決め打ちにすると、
--   ・札が増えた日に、下の札が紙からはみ出す
--   ・札が少ない日に、紙が余りすぎる
-- のどちらかになる。台紙の高さを中身から決める形に変えたが、そうすると
-- 高さが変わるたびに**置いてある札が全部上下に動いてしまう**（割合は同じでも
-- 掛ける高さが変わるため）。
--
-- なので縦も**幅**で測ることにした。幅は台紙の実寸で決まって変わらないので、
-- 紙が縦に伸びても置いた物は動かない。代わりに `album_y` は 1 を越える
-- （縦に長い紙では 2 や 3 になる）。上限を広げる。
--
-- 8 は「幅の8倍の高さ」で、3列の升目なら 20 段ぶん。1日のアルバムとしては
-- 十分に余裕がある一方、桁の壊れた値は弾ける。

ALTER TABLE public.stickers
  DROP CONSTRAINT IF EXISTS stickers_album_placement_check;

ALTER TABLE public.stickers
  ADD CONSTRAINT stickers_album_placement_check
  CHECK (
    (album_x IS NULL OR (album_x >= 0 AND album_x <= 1))
    AND (album_y IS NULL OR (album_y >= 0 AND album_y <= 8))
    AND (album_scale IS NULL OR (album_scale >= 0.45 AND album_scale <= 2.6))
    AND (album_rot IS NULL OR (album_rot >= -180 AND album_rot <= 180))
  );
