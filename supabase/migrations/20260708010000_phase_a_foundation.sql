-- Phase A foundation (spec 06 §3.1b/5.2/5.3/§6/§7):
-- measurement columns, ghost/input-catch columns, word-tree branch plan,
-- phrase entries, and the review-mode preference.

-- §7 speed measurement — persisted so the developer panel can show medians
alter table public.scan_events
  add column if not exists detect_ms integer,
  add column if not exists tap_to_audio_ms integer;

-- §5.2/5.3 input catch + ghost cards + §6 word tree
alter table public.stickers
  add column if not exists capture_type text not null default 'photo'
    check (capture_type in ('photo','text','voice')),
  add column if not exists placeholder_image_url text,
  add column if not exists placeholder_credit jsonb,
  add column if not exists branch_plan jsonb;

-- §5.2 phrase cards share the words table (entry_type distinguishes them)
alter table public.words
  add column if not exists entry_type text not null default 'word'
    check (entry_type in ('word','phrase'));

-- §6/§10-3 review mode preference: speaking (default) or choice (light mode)
alter table public.profiles
  add column if not exists review_mode text not null default 'speaking'
    check (review_mode in ('speaking','choice'));
