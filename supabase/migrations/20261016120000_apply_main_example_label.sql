-- 札の無い古いメインの例文に、札だけを**1回の文で部分的に**書く（2026-10-16 冰淇淋、PR #189 の点検 P1）。
--
-- 前はサーバが行の extras を丸ごと読み、札を足して丸ごと書き戻していた。その間に別の処理（項目の作り直しが
-- 使い方の型を足すなど）が同じ行に書くと、書き戻しがそれを消していた（全員が見る行で）。
-- この関数は extras の**名前を挙げた鍵だけ**をその場で書き換える（`extras || jsonb_build_object(...)`）。
-- ほかの鍵は書いた時点の値のまま残る。
--
-- 書く物（どれも省略できる）:
-- - p_scene: 札。`example_scene` と、どの文の札かの目印 `example_scene_for` = p_sentence を置く。
--   その行の目印がもう p_sentence なら（ほかの誰かが先に札を付けた）、何も書かない
-- - p_chunks: p_sentence を分けたパーツ。置き換える
-- - p_stale_chunks: いまの `example_chunks` がこの値のままなら空にする（別の文のパーツを消す。その間に
--   書き換わっていれば触らない）
-- - p_drop: `examples_extra` のうち、文（zh）がこのどれかと同じ物だけを落とす（メインと同じパターン）
-- - p_recount: `example_pattern_count` を 1 + 残った追加の例文の数にする（書く時点の数で）
-- - p_translation: 読む人の行の訳が空の時だけ入れる
--
-- 書く先: p_l1 が null なら共有の行（words.extras。解説がその言語で書かれている時だけ）、そうでなければ
-- 読む人の行（word_explanations）。**人が確かめた行（source = 'verified'）はどちらも触らない。**
-- 札を置くのは、札が無い行か、目印が**別の文**を指す行だけ（`main_example_label_writable`）。目印の無い札
-- （人が書いた・目印より前の札）は、どの文の札か分からないので入れ替えない。どちらも、語のメインの例文がまだ p_sentence
-- の時だけ（語の行を共有ロックで押さえて確かめる）。何か書いたら true。
--
-- 呼ぶのはサーバ（service role）だけ（`src/lib/example-scene-label.server.ts`）。何度流しても同じ結果になる。

create or replace function public.main_example_label_patch(
  p_extras jsonb,
  p_sentence text,
  p_scene text,
  p_chunks jsonb,
  p_stale_chunks jsonb,
  p_drop text[],
  p_recount boolean
)
returns jsonb
language plpgsql
immutable
set search_path to 'public'
as $$
declare
  e jsonb := case when jsonb_typeof(p_extras) = 'object' then p_extras else '{}'::jsonb end;
  kept jsonb;
begin
  if p_scene is not null then
    e := e || jsonb_build_object('example_scene', p_scene, 'example_scene_for', p_sentence);
  end if;
  if p_chunks is not null then
    e := e || jsonb_build_object('example_chunks', p_chunks);
  elsif p_stale_chunks is not null and e -> 'example_chunks' = p_stale_chunks then
    e := e || jsonb_build_object('example_chunks', '[]'::jsonb);
  end if;
  if coalesce(array_length(p_drop, 1), 0) > 0 and jsonb_typeof(e -> 'examples_extra') = 'array' then
    select coalesce(jsonb_agg(x order by i), '[]'::jsonb)
      into kept
      from jsonb_array_elements(e -> 'examples_extra') with ordinality as t(x, i)
      where not (coalesce(x ->> 'zh', '') = any (p_drop));
    e := e || jsonb_build_object('examples_extra', kept);
  end if;
  if coalesce(p_recount, false) then
    e := e || jsonb_build_object(
      'example_pattern_count',
      1 + case when jsonb_typeof(e -> 'examples_extra') = 'array'
               then jsonb_array_length(e -> 'examples_extra') else 0 end
    );
  end if;
  return e;
end;
$$;

-- 札を置いてよい行か（JS の `mayWriteMainLabel` と同じ決まり）: 札が無い、または目印が別の文を指す。
create or replace function public.main_example_label_writable(p_extras jsonb, p_sentence text)
returns boolean
language sql
immutable
set search_path to 'public'
as $$
  select coalesce(btrim(p_extras ->> 'example_scene'), '') = ''
    or (
      coalesce(btrim(p_extras ->> 'example_scene_for'), '') <> ''
      and btrim(p_extras ->> 'example_scene_for') <> btrim(p_sentence)
    );
$$;

create or replace function public.apply_main_example_label(
  p_word_id uuid,
  p_explain_lang text,
  p_l1 text,
  p_sentence text,
  p_scene text,
  p_chunks jsonb,
  p_stale_chunks jsonb,
  p_drop text[],
  p_recount boolean,
  p_translation text
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_rows integer := 0;
begin
  if p_word_id is null or coalesce(p_explain_lang, '') = '' or coalesce(btrim(p_sentence), '') = '' then
    raise exception 'apply_main_example_label: missing argument' using errcode = '22004';
  end if;
  -- 語のメインの例文がまだこの文か（書き終えるまで変えさせない）。
  perform 1
    from public.words
    where id = p_word_id and btrim(coalesce(example_sentence, '')) = btrim(p_sentence)
    for share;
  if not found then
    return false;
  end if;

  if p_l1 is null then
    update public.words w
      set extras = public.main_example_label_patch(
        w.extras, btrim(p_sentence), p_scene, p_chunks, p_stale_chunks, p_drop, p_recount)
      where w.id = p_word_id
        and w.source is distinct from 'verified'
        and coalesce(nullif(btrim(w.extras ->> 'explain_lang'), ''), 'ja') = p_explain_lang
        and (p_scene is null or public.main_example_label_writable(w.extras, p_sentence))
        and public.main_example_label_patch(
          w.extras, btrim(p_sentence), p_scene, p_chunks, p_stale_chunks, p_drop, p_recount)
          is distinct from w.extras;
  else
    update public.word_explanations e
      set extras = public.main_example_label_patch(
            e.extras, btrim(p_sentence), p_scene, p_chunks, p_stale_chunks, p_drop, p_recount),
          example_translation = case
            when coalesce(btrim(e.example_translation), '') = '' and coalesce(btrim(p_translation), '') <> ''
              then p_translation
            else e.example_translation
          end,
          updated_at = now()
      where e.word_id = p_word_id
        and e.explain_lang = p_explain_lang
        and e.l1 = p_l1
        and e.source is distinct from 'verified'
        and (p_scene is null or public.main_example_label_writable(e.extras, p_sentence))
        and public.main_example_label_patch(
          e.extras, btrim(p_sentence), p_scene, p_chunks, p_stale_chunks, p_drop, p_recount)
          is distinct from e.extras;
  end if;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

revoke all on function public.main_example_label_patch(jsonb, text, text, jsonb, jsonb, text[], boolean) from public;
revoke all on function public.main_example_label_patch(jsonb, text, text, jsonb, jsonb, text[], boolean) from anon;
revoke all on function public.main_example_label_patch(jsonb, text, text, jsonb, jsonb, text[], boolean) from authenticated;
grant execute on function public.main_example_label_patch(jsonb, text, text, jsonb, jsonb, text[], boolean) to service_role;

revoke all on function public.main_example_label_writable(jsonb, text) from public;
revoke all on function public.main_example_label_writable(jsonb, text) from anon;
revoke all on function public.main_example_label_writable(jsonb, text) from authenticated;
grant execute on function public.main_example_label_writable(jsonb, text) to service_role;

revoke all on function public.apply_main_example_label(uuid, text, text, text, text, jsonb, jsonb, text[], boolean, text) from public;
revoke all on function public.apply_main_example_label(uuid, text, text, text, text, jsonb, jsonb, text[], boolean, text) from anon;
revoke all on function public.apply_main_example_label(uuid, text, text, text, text, jsonb, jsonb, text[], boolean, text) from authenticated;
grant execute on function public.apply_main_example_label(uuid, text, text, text, text, jsonb, jsonb, text[], boolean, text) to service_role;
