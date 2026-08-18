drop policy if exists app_config_select on public.app_config;
create policy app_config_select on public.app_config
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));
comment on table public.app_config is
  'Runtime switches (AI models etc). Readable and writable by admins only.';