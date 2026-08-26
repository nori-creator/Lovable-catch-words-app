grant select, insert, update, delete on public.app_config to authenticated;
grant all on public.app_config to service_role;

comment on table public.app_config is
  'Runtime switches (AI models etc). Readable and writable by admins only through RLS.';