-- アルバムの配置を1回で、全部か何も無しかで保存する（2026-10-03 監査 M6）。
--
-- `saveAlbumLayout` は札の数だけ（最大500回）順に UPDATE していた。遅いうえに、途中で
-- 落ちると半分だけ並べ替わった日が残った。この関数は1つの文で書くので、全部入るか
-- 何も変わらないかのどちらか。
--
-- **呼んだ人の権限で動く**（SECURITY INVOKER）。stickers の RLS がそのまま効き、さらに
-- `user_id = auth.uid()` の札だけを書く。他人の札の id を混ぜても、その行は書かれない
-- （前の1枚ずつの書き方と同じ）。値の範囲は表の制約（stickers_album_size_check /
-- stickers_album_placement_check）が守り、外れていれば丸ごと失敗する。
--
-- この移行が当たる前のアプリは、関数が無いと分かって前の1枚ずつの書き方に戻る。
-- 何度流しても同じ結果になる。

create or replace function public.save_album_layout(p_items jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items must be a json array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 500 then
    raise exception 'too many items' using errcode = '22023';
  end if;

  update public.stickers s
     set album_order = i.album_order,
         album_size = i.album_size,
         album_x = i.album_x,
         album_y = i.album_y,
         album_scale = i.album_scale,
         album_rot = i.album_rot
    from jsonb_to_recordset(p_items) as i(
      sticker_id uuid,
      album_order bigint,
      album_size text,
      album_x double precision,
      album_y double precision,
      album_scale double precision,
      album_rot double precision
    )
   where s.id = i.sticker_id
     and s.user_id = v_uid;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.save_album_layout(jsonb) from public, anon;
grant execute on function public.save_album_layout(jsonb) to authenticated;
