-- Meta individual por pessoa da Coleta (vazio = usa a meta individual do galpão)
-- e duas permissões novas para o administrador liberar ou tirar de cada gestor:
--   pode_pessoas: cadastrar e editar pessoas (nome, turno, galpão)
--   pode_metas:   alterar metas (do dia, individuais do galpão e de cada pessoa)
-- Quem hoje pode alterar configurações começa com as duas liberadas (nada muda para ninguém).
alter table public.operadores
  add column meta_ind_ondas integer check (meta_ind_ondas is null or meta_ind_ondas between 1 and 100000),
  add column meta_ind_qtd integer check (meta_ind_qtd is null or meta_ind_qtd between 1 and 10000000);

alter table public.gestores
  add column pode_pessoas boolean not null default true,
  add column pode_metas boolean not null default true;
update public.gestores set pode_pessoas = pode_config, pode_metas = pode_config where perfil = 'gestor';
update public.gestores set pode_pessoas = false, pode_metas = false where perfil = 'bipador';
alter table public.gestores drop constraint gestores_bipador_ck;
alter table public.gestores add constraint gestores_bipador_ck check (perfil <> 'bipador' or (
  not admin and not pode_config and not pode_individual and not pode_registros and not pode_pessoas and not pode_metas
  and galpao_id is not null and abas is not null
  and abas <@ array['painel','op','op.ctl','op.ace','op.aus','prod','prod.aus','prs']::text[]));

create or replace function private.g_pode(perm text)
returns boolean language sql stable security definer set search_path = '' as $function$
  select coalesce((select case perm when 'config' then g.pode_config when 'individual' then g.pode_individual
                                    when 'registros' then g.pode_registros when 'pessoas' then g.pode_pessoas
                                    when 'metas' then g.pode_metas else false end
                   from public.gestores g where g.email = private.gestor_email()), false)
$function$;

-- pessoas: cadastrar e editar exige "pessoas"; mudar só a meta da pessoa exige "metas"
drop policy operadores_criar on public.operadores;
create policy operadores_criar on public.operadores for insert to authenticated
  with check ((select private.g_pode('pessoas')) and ((select private.g_admin()) or galpao_id = (select private.g_galpao())));
drop policy operadores_alterar on public.operadores;
create policy operadores_alterar on public.operadores for update to authenticated
  using (((select private.g_pode('pessoas')) or (select private.g_pode('metas'))) and ((select private.g_admin()) or galpao_id = (select private.g_galpao())))
  with check (((select private.g_pode('pessoas')) or (select private.g_pode('metas'))) and ((select private.g_admin()) or galpao_id = (select private.g_galpao())));

create function private.operadores_confere_permissao()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if private.gestor_email() is null then return new; end if;
  if (new.meta_ind_ondas is distinct from old.meta_ind_ondas or new.meta_ind_qtd is distinct from old.meta_ind_qtd)
     and not private.g_pode('metas') then
    raise exception 'Sem permissão para alterar metas. Peça ao administrador para liberar "Pode alterar metas".' using errcode = '42501'; end if;
  if (new.nome, new.galpao_id, new.excluido_em) is distinct from (old.nome, old.galpao_id, old.excluido_em)
     and not private.g_pode('pessoas') then
    raise exception 'Sem permissão para editar pessoas. Peça ao administrador para liberar "Pode cadastrar e editar pessoas".' using errcode = '42501'; end if;
  -- turno, horário e almoço: também valem as permissões que já mudavam isso na Equipe
  if (new.turno, new.inicio, new.fim, new.almoco_ini, new.almoco_fim) is distinct from (old.turno, old.inicio, old.fim, old.almoco_ini, old.almoco_fim)
     and not (private.g_pode('pessoas') or private.g_pode('individual') or private.g_pode('config')) then
    raise exception 'Sem permissão para mudar turno ou horário. Peça ao administrador para liberar "Pode cadastrar e editar pessoas".' using errcode = '42501'; end if;
  return new;
end $$;
create trigger operadores_confere_permissao before update on public.operadores
  for each row execute function private.operadores_confere_permissao();

-- galpão: metas individuais do galpão exigem "metas"; nome e horários seguem exigindo "configurações"
drop policy galpoes_alterar on public.galpoes;
create policy galpoes_alterar on public.galpoes for update to authenticated
  using ((select private.g_admin()) or (((select private.g_pode('config')) or (select private.g_pode('metas'))) and id = (select private.g_galpao())))
  with check ((select private.g_admin()) or (((select private.g_pode('config')) or (select private.g_pode('metas'))) and id = (select private.g_galpao())));

create function private.galpoes_confere_permissao()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if private.gestor_email() is null or private.g_admin() then return new; end if;
  if (new.meta_ind_ondas, new.meta_ind_qtd, new.meta_ind_ret) is distinct from (old.meta_ind_ondas, old.meta_ind_qtd, old.meta_ind_ret)
     and not private.g_pode('metas') then
    raise exception 'Sem permissão para alterar metas. Peça ao administrador para liberar "Pode alterar metas".' using errcode = '42501'; end if;
  if (to_jsonb(new) - array['meta_ind_ondas','meta_ind_qtd','meta_ind_ret']) is distinct from (to_jsonb(old) - array['meta_ind_ondas','meta_ind_qtd','meta_ind_ret'])
     and not private.g_pode('config') then
    raise exception 'Sem permissão para alterar o galpão. Peça ao administrador para liberar "Pode alterar configurações".' using errcode = '42501'; end if;
  return new;
end $$;
create trigger galpoes_confere_permissao before update on public.galpoes
  for each row execute function private.galpoes_confere_permissao();

-- meta do dia: exige "metas"
drop policy metas_criar on public.metas_diarias;
create policy metas_criar on public.metas_diarias for insert to authenticated
  with check ((select private.g_pode('metas')) and ((select private.g_admin()) or galpao_id = (select private.g_galpao())));
drop policy metas_alterar on public.metas_diarias;
create policy metas_alterar on public.metas_diarias for update to authenticated
  using ((select private.g_pode('metas')) and ((select private.g_admin()) or galpao_id = (select private.g_galpao())))
  with check ((select private.g_pode('metas')) and ((select private.g_admin()) or galpao_id = (select private.g_galpao())));
drop policy metas_excluir on public.metas_diarias;
create policy metas_excluir on public.metas_diarias for delete to authenticated
  using ((select private.g_pode('metas')) and ((select private.g_admin()) or galpao_id = (select private.g_galpao())));
