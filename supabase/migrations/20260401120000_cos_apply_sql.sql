-- Optional: COS apply_sql live 경로용. service_role만 실행 허용.
-- 보안: 임의 SQL 실행 — 프로덕션에서는 RLS·권한·네트워크로 제한할 것.

create or replace function public.cos_apply_sql(sql_text text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if sql_text is null or btrim(sql_text) = '' then
    raise exception 'cos_apply_sql: empty sql';
  end if;
  execute sql_text;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.cos_apply_sql(text) from public;
grant execute on function public.cos_apply_sql(text) to service_role;
