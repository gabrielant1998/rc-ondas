-- Metas da embalagem passam a ser digitadas por dia (ondas por pessoa por dia) com as horas de trabalho do dia.
-- A meta por hora (usada nos gráficos) é calculada: meta diária ÷ horas por dia. prod_metas estava vazia.
alter table public.prod_metas alter column por_hora type numeric(9,3);
alter table public.prod_metas add column por_dia numeric(7,1) check (por_dia > 0 and por_dia <= 20000);
alter table public.prod_metas add column horas_dia numeric(4,2) check (horas_dia > 0 and horas_dia <= 24);

drop function public.prod_meta_salvar(uuid, text, numeric, date);
create function public.prod_meta_salvar(p_galpao uuid, p_atividade text, p_por_dia numeric, p_horas_dia numeric, p_inicio date)
returns bigint language plpgsql security definer set search_path = '' as $$
declare em text := private.gestor_email(); hoje date := (now() at time zone 'America/Sao_Paulo')::date; v public.prod_metas; novo bigint;
begin
  if not ((select private.g_admin()) or ((select private.g_pode('config')) and p_galpao = (select private.g_galpao()))) then
    raise exception 'Sem permissão para alterar as metas da produção' using errcode = '42501'; end if;
  if p_atividade not in ('mesa', 'maquina') then raise exception 'Atividade inválida' using errcode = '22023'; end if;
  if p_por_dia is null or p_por_dia <= 0 or p_por_dia > 20000 then
    raise exception 'A meta diária precisa ser maior que zero' using errcode = '22023'; end if;
  if p_horas_dia is null or p_horas_dia <= 0 or p_horas_dia > 24 then
    raise exception 'Informe as horas de trabalho por dia (até 24)' using errcode = '22023'; end if;
  if p_inicio is null or p_inicio < hoje then
    raise exception 'A meta só pode valer a partir de hoje; os dias anteriores ficam com a meta da época' using errcode = '22023'; end if;
  select * into v from public.prod_metas where galpao_id = p_galpao and atividade = p_atividade and inicio = p_inicio;
  insert into public.prod_metas (galpao_id, atividade, por_dia, horas_dia, por_hora, inicio, criado_por)
  values (p_galpao, p_atividade, round(p_por_dia, 1), round(p_horas_dia, 2), round(p_por_dia / p_horas_dia, 3), p_inicio, em)
  on conflict (galpao_id, atividade, inicio) do update
    set por_dia = excluded.por_dia, horas_dia = excluded.horas_dia, por_hora = excluded.por_hora, criado_por = excluded.criado_por, criado_em = now()
  returning id into novo;
  insert into public.prod_auditoria (tabela, registro, acao, antes, depois, email)
  select 'prod_metas', novo::text, case when v.id is null then 'criar' else 'alterar' end, case when v.id is null then null else to_jsonb(v) end, to_jsonb(x), em
  from public.prod_metas x where x.id = novo;
  return novo;
end $$;
revoke all on function public.prod_meta_salvar(uuid, text, numeric, numeric, date) from public, anon;
grant execute on function public.prod_meta_salvar(uuid, text, numeric, numeric, date) to authenticated;
