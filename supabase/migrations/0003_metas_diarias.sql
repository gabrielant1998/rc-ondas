-- Meta por dia: cada galpão tem a sua meta em cada data. Dia novo começa sem meta e fica salvo por data.

create table public.metas_diarias (
  galpao_id uuid    not null references public.galpoes (id) on delete cascade,
  data      date    not null,
  meta      integer not null check (meta > 0),
  primary key (galpao_id, data)
);

alter table public.metas_diarias enable row level security;
grant select, insert, update, delete on public.metas_diarias to authenticated;

create policy metas_ler on public.metas_diarias for select to authenticated
  using ((select private.g_admin()) or galpao_id = (select private.g_galpao()));
create policy metas_criar on public.metas_diarias for insert to authenticated
  with check ((select private.g_pode('config')) and ((select private.g_admin()) or galpao_id = (select private.g_galpao())));
create policy metas_alterar on public.metas_diarias for update to authenticated
  using ((select private.g_pode('config')) and ((select private.g_admin()) or galpao_id = (select private.g_galpao())))
  with check ((select private.g_pode('config')) and ((select private.g_admin()) or galpao_id = (select private.g_galpao())));
create policy metas_excluir on public.metas_diarias for delete to authenticated
  using ((select private.g_pode('config')) and ((select private.g_admin()) or galpao_id = (select private.g_galpao())));

