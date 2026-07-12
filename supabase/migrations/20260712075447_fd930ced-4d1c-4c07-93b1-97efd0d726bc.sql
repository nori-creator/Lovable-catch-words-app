
-- 1) Column-level SELECT on profiles: hide personal settings from other users
REVOKE SELECT ON public.profiles FROM authenticated;
REVOKE SELECT ON public.profiles FROM anon;
GRANT SELECT (id, display_name, avatar_url, created_at) ON public.profiles TO authenticated;
GRANT SELECT (id, display_name, avatar_url, created_at) ON public.profiles TO anon;
-- Column-level UPDATE grants so users can still edit their own settings via RLS
GRANT UPDATE (display_name, avatar_url, native_language, ui_language, target_language,
              level_goal, pronunciation_strictness, onboarded, album_bg, updated_at)
  ON public.profiles TO authenticated;

-- 2) review_choices: remove permissive authenticated write policies; only service_role writes
DROP POLICY IF EXISTS review_choices_insert_auth ON public.review_choices;
DROP POLICY IF EXISTS review_choices_update_auth ON public.review_choices;
REVOKE INSERT, UPDATE ON public.review_choices FROM authenticated;

-- 3) Lock down SECURITY DEFINER functions callable from the API
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.are_mutual_followers(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.are_mutual_followers(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.can_see_post(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_see_post(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_leaderboard(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_leaderboard(int) TO authenticated, service_role;
