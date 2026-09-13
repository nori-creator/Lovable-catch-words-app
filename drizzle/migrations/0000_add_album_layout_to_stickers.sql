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