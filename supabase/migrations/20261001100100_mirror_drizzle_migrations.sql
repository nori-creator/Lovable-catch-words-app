-- `drizzle/migrations/` にだけ書かれていた変更を、こちらにも写す（2026-10-01）。
--
-- この app の DB 変更は2か所に置かれてきた（`supabase/migrations/` と Lovable の
-- `drizzle/migrations/`）。drizzle 側にしか無い変更は、こちらだけを見ても
-- 本番に何が入っているか分からない。本番には下の変更がすべて入っていることを
-- 2026-10-01 に確かめた（列・関数・制約・ポリシー）。どれも何度流しても同じ結果になる書き方。
--
-- 写した物（`src/lib/migrations-mirror.test.ts` がこの一覧を確かめる）:
--   drizzle/migrations/0000_add_album_layout_to_stickers.sql
--   drizzle/migrations/0001_add_album_placement_to_stickers.sql
--   drizzle/migrations/0001_restore_get_my_profile.sql
--   drizzle/migrations/0002_album_y_measured_in_widths.sql
--   drizzle/migrations/0002_tighten_words_insert_and_profiles_select.sql

-- ---- drizzle/migrations/0000_add_album_layout_to_stickers.sql ----
ALTER TABLE public.stickers
  ADD COLUMN IF NOT EXISTS album_order BIGINT,
  ADD COLUMN IF NOT EXISTS album_size TEXT;

ALTER TABLE public.stickers
  DROP CONSTRAINT IF EXISTS stickers_album_size_check;

ALTER TABLE public.stickers
  ADD CONSTRAINT stickers_album_size_check
  CHECK (album_size IS NULL OR album_size IN ('small', 'portrait', 'landscape', 'large'));

CREATE INDEX IF NOT EXISTS stickers_user_album_order_idx
  ON public.stickers (user_id, album_order)
  WHERE album_order IS NOT NULL;


-- ---- drizzle/migrations/0001_add_album_placement_to_stickers.sql ----
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
-- （ここで一度 album_y <= 1 の制約を足していたが、すぐ下の 0002 で <= 8 に広げている。
--   写しでは途中の狭い制約を足さない — 既に 1 を越える値が入っている本番で流すと失敗するため。）

-- ---- drizzle/migrations/0001_restore_get_my_profile.sql ----
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS public.profiles
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.*
  FROM public.profiles AS p
  WHERE p.id = auth.uid()
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.get_my_profile() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_profile() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated, service_role;

COMMENT ON FUNCTION public.get_my_profile() IS
  'Returns the full profile row for the authenticated caller only, so private settings can be read without exposing profile columns globally.';


-- ---- drizzle/migrations/0002_album_y_measured_in_widths.sql ----
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


-- ---- drizzle/migrations/0002_tighten_words_insert_and_profiles_select.sql ----
-- 1) words: 署名した本人の行だけ足せるようにする。
--    以前は「ログインしていれば誰でも何でも足せる」だけの検査だった。
--    created_by は BEFORE INSERT トリガ enforce_words_source が auth.uid()
--    を入れるので、通常の追加はそのまま通る。
DROP POLICY IF EXISTS "words_insert_authenticated" ON public.words;
CREATE POLICY "words_insert_own" ON public.words
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

-- 2) profiles: 「全部通す」をやめ、本人の行か、公開の相手だけに絞る。
--    表示名・写真は他の学習者に見せる必要があるが、まだ設定を終えていない
--    (onboarded = false) 人は一覧に出さない。
DROP POLICY IF EXISTS "profiles_select_public_or_own" ON public.profiles;
CREATE POLICY "profiles_select_public_or_own" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR onboarded = true);

