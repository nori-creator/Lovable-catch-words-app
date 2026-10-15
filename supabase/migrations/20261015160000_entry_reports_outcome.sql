-- 報告に「どうなったか」を残す（2026-10-15）。
--
-- これまで `entry_reports` は open / resolved / dismissed の3つしか持てず、「AI が直した」のか
-- 「直せずに開発者の確認待ち」なのかが分からなかった。報告はどれも open のまま並び、誰にも
-- 知らされなかった（貓眼・尺・鮮奶酪、2026-09〜10）。
--
-- - word_id / item / reporter_lang … どの語のどの項目を、どの言語で読む人が報告したか
-- - status … 'fixed'（自動で直して書いた）/ 'needs_review'（直せなかった・判定が通らなかった）を足す
-- - outcome / outcome_at … 何をしたかの一言と、その時刻
-- - notified_at … 開発者に知らせた時刻（メール。鍵が無ければ空のまま = 管理画面の一覧だけ）
--
-- コードはこの移行が**まだ当たっていなくても動く**（列が無ければ古い3つの状態に落とす。
-- `src/lib/entry-report.ts` の `legacyStatus`）。
alter table public.entry_reports
  add column if not exists word_id uuid,
  add column if not exists item text,
  add column if not exists reporter_lang text,
  add column if not exists outcome text,
  add column if not exists outcome_at timestamptz,
  add column if not exists notified_at timestamptz;

alter table public.entry_reports drop constraint if exists entry_reports_status_check;
alter table public.entry_reports
  add constraint entry_reports_status_check
  check (status in ('open', 'fixed', 'needs_review', 'resolved', 'dismissed'));

create index if not exists entry_reports_word_idx on public.entry_reports (word_id);
