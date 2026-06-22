
-- Revoke EXECUTE on trigger-only SECURITY DEFINER functions from public/anon/authenticated
DO $$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'public.create_review_for_new_sticker()',
    'public.notify_on_like()',
    'public.notify_on_comment()',
    'public.notify_on_follow()',
    'public.bump_post_like_count()',
    'public.bump_post_comment_count()',
    'public.set_updated_at()',
    'public.handle_new_user()',
    'public.enforce_words_source()'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
  END LOOP;
END $$;
