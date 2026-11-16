-- Gestor com permissão de Configuração pode alterar a configuração geral
-- (turnos, almoço, pausas, fim de semana, intervalo, tolerância, meta mínima).
-- Antes só o administrador conseguia; o banco recusava o gestor.
drop policy config_alterar on public.config;
create policy config_alterar on public.config for update to authenticated
  using ((select private.g_admin()) or (select private.g_pode('config')))
  with check ((select private.g_admin()) or (select private.g_pode('config')));
