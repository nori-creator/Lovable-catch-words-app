-- profiles を読めるのは本人の行だけにする（2026-10-03 監査）。
--
-- これまでの `profiles_select_public_or_own` は「本人の行か、設定を終えた (onboarded) 人の行」を
-- ログインした人（お試しの匿名の人も）全員に見せていた。表示名・写真を他の学習者に見せる
-- ための物だったが、その機能（交流・ランキング）はもう無い。残っていたのは、誰でも
-- 全員の id・表示名・写真・学習言語・plan などを一覧で読める穴だけ。
--
-- アプリが profiles を読むのはすべて本人の行（`.eq("id", userId)`、`get_my_profile()`）。
-- 開発者の画面（`admin-users.functions.ts`・`metrics.functions.ts`）と Stripe の知らせは
-- service role（RLS を通らない）で読むので、この変更で動きは変わらない。
-- 使われていない `get_leaderboard`（SECURITY INVOKER）は本人の1行だけを返すようになる。
--
-- 何度流しても同じ結果になる書き方。

DROP POLICY IF EXISTS "profiles_select_public_or_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);
