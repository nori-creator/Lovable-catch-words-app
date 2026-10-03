-- AI の回数の上限を、数えると入れるを1回で確保する（2026-10-03 監査 M1）。
--
-- 前はサーバが usage_events を「数える → 1行入れる」の2回で確かめていたので、同時に何本も
-- 送ると全部が数える段を通り抜け、その人の 24 時間の上限を超えて AI を呼べた。
-- この関数は同じ人・同じ種類を advisory lock で1本ずつにし、数えて、上限の内側なら1行入れて
-- その id を返す（上限なら null）。lock はトランザクションの終わりで外れる。
--
-- 呼ぶのはサーバ（service role）だけ（`src/lib/usage-reserve.ts`）。ブラウザ（anon /
-- authenticated）からは呼べない。何度流しても同じ結果になる。

create or replace function public.reserve_usage_event(
  p_user_id uuid,
  p_kind text,
  p_limit integer,
  p_since timestamptz
)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_count integer;
  v_id bigint;
begin
  if p_user_id is null or p_kind is null or p_limit is null or p_since is null then
    raise exception 'reserve_usage_event: missing argument' using errcode = '22004';
  end if;
  if p_limit <= 0 then
    return null;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('usage_events:' || p_user_id::text || ':' || p_kind, 0));
  select count(*) into v_count
    from public.usage_events
    where user_id = p_user_id and kind = p_kind and created_at >= p_since;
  if v_count >= p_limit then
    return null;
  end if;
  insert into public.usage_events (user_id, kind)
    values (p_user_id, p_kind)
    returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.reserve_usage_event(uuid, text, integer, timestamptz) from public;
revoke all on function public.reserve_usage_event(uuid, text, integer, timestamptz) from anon;
revoke all on function public.reserve_usage_event(uuid, text, integer, timestamptz) from authenticated;
grant execute on function public.reserve_usage_event(uuid, text, integer, timestamptz) to service_role;
