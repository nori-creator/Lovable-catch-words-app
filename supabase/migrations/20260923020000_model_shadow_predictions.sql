-- 試験中の予測モデル（TypeSafe Jev など）の「影の実行」の記録。
--
-- ARCHITECTURE.md / PRODUCT.md: 実験的な予測は、まず影で走らせて実際の結果と
-- 突き合わせ、較正を確かめてから予定（復習の日）を動かす。ここは**記録だけ**で、
-- どの画面もこの表を読んで判断を変えない。
create table if not exists public.model_shadow_predictions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  sticker_id uuid,
  -- 何を当てようとしたか（'recall' = いま思い出せるか）
  task text not null,
  -- どのモデルの予測か（例 'jev-latest'）
  model text not null,
  -- そのモデルの見込み 0〜1
  predicted real not null check (predicted >= 0 and predicted <= 1),
  -- このアプリの式（retentionNow）の見込み 0〜1。比べる相手
  baseline real check (baseline is null or (baseline >= 0 and baseline <= 1)),
  -- 実際の結果（思い出せたか）
  outcome boolean,
  meta jsonb,
  created_at timestamptz not null default now()
);

alter table public.model_shadow_predictions enable row level security;

drop policy if exists model_shadow_predictions_insert_own on public.model_shadow_predictions;
create policy model_shadow_predictions_insert_own
  on public.model_shadow_predictions for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists model_shadow_predictions_select_own on public.model_shadow_predictions;
create policy model_shadow_predictions_select_own
  on public.model_shadow_predictions for select to authenticated
  using (auth.uid() = user_id);

grant select, insert on public.model_shadow_predictions to authenticated;
grant all on public.model_shadow_predictions to service_role;

create index if not exists model_shadow_predictions_task_created
  on public.model_shadow_predictions (task, created_at desc);
