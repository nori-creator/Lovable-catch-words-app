-- Trigger-only functions: revoke all execute
REVOKE EXECUTE ON FUNCTION public.bump_post_like_count() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_post_comment_count() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_like() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_comment() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_follow() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_review_for_new_sticker() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

-- RLS helpers: only authenticated needs execute
REVOKE EXECUTE ON FUNCTION public.are_mutual_followers(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_see_post(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.are_mutual_followers(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_see_post(uuid, uuid) TO authenticated;
