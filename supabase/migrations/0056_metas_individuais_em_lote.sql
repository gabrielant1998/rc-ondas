-- Meta individual por pessoa também na Embalagem (unidades por dia; vazio = usa a meta do posto)
-- e alteração da meta de uma ou mais pessoas de uma vez (Coleta e Embalagem). Exige "Pode alterar metas".
alter table public.prod_pessoas
  add column meta_dia numeric check (meta_dia is null or (meta_dia > 0 and meta_dia <= 20000));

-- Coleta: uma ou mais pessoas; null limpa a meta própria (volta a usar a do galpão)
create function public.metas_individuais_coleta(p_ids uuid[], p_ondas integer, p_unidades integer, p_mudar_ondas boolean, p_mudar_unidades boolean)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if private.gestor_email() is null or not ((select private.g_admin()) or (select private.g_pode('metas'))) then
    raise exception 'Sem permissão para alterar metas. Peça ao administrador para liberar "Pode alterar metas".' using errcode = '42501'; end if;
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 500 then
    raise exception 'Escolha de 1 a 500 pessoas' using errcode = '22023'; end if;
  if not coalesce(p_mudar_ondas, false) and not coalesce(p_mudar_unidades, false) then
    raise exception 'Nada para alterar: preencha a meta de ondas ou de unidades' using errcode = '22023'; end if;
  if p_ondas is not null and p_ondas not between 1 and 100000 then raise exception 'Meta de ondas inválida: use um número de 1 a 100.000' using errcode = '23514'; end if;
  if p_unidades is not null and p_unidades not between 1 and 10000000 then raise exception 'Meta de unidades inválida: use um número de 1 a 10.000.000' using errcode = '23514'; end if;
  if exists (select 1 from public.operadores o where o.id = any(p_ids) and o.excluido_em is null and private.g_outro_galpao(o.galpao_id)) then
    raise exception 'Há pessoas de outro galpão na seleção. Você só altera pessoas do seu galpão.' using errcode = '42501'; end if;
  update public.operadores o set
    meta_ind_ondas = case when p_mudar_ondas then p_ondas else o.meta_ind_ondas end,
    meta_ind_qtd = case when p_mudar_unidades then p_unidades else o.meta_ind_qtd end
  where o.id = any(p_ids) and o.excluido_em is null;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.metas_individuais_coleta(uuid[], integer, integer, boolean, boolean) from public, anon;
grant execute on function public.metas_individuais_coleta(uuid[], integer, integer, boolean, boolean) to authenticated;

-- Embalagem: uma ou mais pessoas; null limpa a meta própria (volta a usar a do posto)
create function public.metas_individuais_embalagem(p_ids uuid[], p_meta_dia numeric)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if private.gestor_email() is null or not ((select private.g_admin()) or (select private.g_pode('metas'))) then
    raise exception 'Sem permissão para alterar metas. Peça ao administrador para liberar "Pode alterar metas".' using errcode = '42501'; end if;
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 500 then
    raise exception 'Escolha de 1 a 500 pessoas' using errcode = '22023'; end if;
  if p_meta_dia is not null and (p_meta_dia <= 0 or p_meta_dia > 20000) then
    raise exception 'Meta inválida: use um número maior que zero e até 20.000' using errcode = '23514'; end if;
  if exists (select 1 from public.prod_pessoas p where p.id = any(p_ids) and p.excluido_em is null and private.g_outro_galpao(p.galpao_id)) then
    raise exception 'Há pessoas de outro galpão na seleção. Você só altera pessoas do seu galpão.' using errcode = '42501'; end if;
  update public.prod_pessoas p set meta_dia = round(p_meta_dia, 1) where p.id = any(p_ids) and p.excluido_em is null;
  get diagnostics n = row_count;
  insert into public.prod_auditoria (tabela, registro, acao, antes, depois, email)
  values ('prod_pessoas', array_to_string(p_ids, ','), 'alterar', null, jsonb_build_object('meta_dia', p_meta_dia, 'pessoas', n), private.gestor_email());
  return n;
end $$;
revoke all on function public.metas_individuais_embalagem(uuid[], numeric) from public, anon;
grant execute on function public.metas_individuais_embalagem(uuid[], numeric) to authenticated;
