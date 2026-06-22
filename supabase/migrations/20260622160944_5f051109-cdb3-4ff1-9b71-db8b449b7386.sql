
-- Prevent users from manipulating like_count / comment_count via UPDATE
CREATE OR REPLACE FUNCTION public.preserve_post_counters()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow service_role to bypass (triggers use SECURITY DEFINER as table owner)
  NEW.like_count := OLD.like_count;
  NEW.comment_count := OLD.comment_count;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.preserve_post_counters() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_preserve_post_counters ON public.posts;
CREATE TRIGGER trg_preserve_post_counters
  BEFORE UPDATE ON public.posts
  FOR EACH ROW
  WHEN (current_setting('role', true) <> 'service_role')
  EXECUTE FUNCTION public.preserve_post_counters();

-- Enable realtime for notifications
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;
