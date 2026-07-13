-- Phase B-2 cost guard: assertWithinDailyCap (ai-provider.server.ts) counts a
-- user's usage_events of one kind over the last 24h before every AI call.
-- Without an index that count is a sequential scan that grows with total
-- usage; with it the guard stays a few-ms lookup forever.
create index if not exists usage_events_user_kind_created_idx
  on public.usage_events (user_id, kind, created_at desc);
