-- Metas da Embalagem por posto: Térreo Mesa, Térreo Máquina, Mezanino Mesa e Mezanino Máquina, em cada galpão.
-- As metas antigas (sem andar) continuam valendo como meta geral da atividade enquanto o posto não tiver a sua.
alter table public.prod_metas add column andar text check (andar is null or andar in ('terreo', 'mezanino'));
alter table public.prod_metas drop constraint prod_metas_galpao_id_atividade_inicio_key;
create unique index prod_metas_posto_inicio_uq on public.prod_metas (galpao_id, atividade, (coalesce(andar, '')), inicio);

create function public.prod_meta_salvar(p_galpao uuid, p_atividade text, p_andar text, p_por_dia numeric, p_horas_dia numeric, p_inicio date)
returns bigint language plpgsql security definer set search_path = '' as $function$
declare em text := private.gestor_email(); hoje date := (now() at time zone 'America/Sao_Paulo')::date; v public.prod_metas; novo bigint;
begin
  if not ((select private.g_admin()) or (((select private.g_pode('metas')) or (select private.g_pode('config'))) and p_galpao = (select private.g_galpao()))) then
    raise exception 'Sem permissão para alterar metas. Peça ao administrador para liberar "Pode alterar metas".' using errcode = '42501'; end if;
  if p_atividade not in ('mesa', 'maquina') then raise exception 'Atividade inválida: use Mesa ou Máquina' using errcode = '22023'; end if;
  if p_andar is not null and p_andar not in ('terreo', 'mezanino') then raise exception 'Andar inválido: use Térreo ou Mezanino' using errcode = '22023'; end if;
  if p_por_dia is null or p_por_dia <= 0 or p_por_dia > 20000 then
    raise exception 'Meta inválida: a meta diária precisa ser maior que zero e até 20.000' using errcode = '22023'; end if;
  if p_horas_dia is null or p_horas_dia <= 0 or p_horas_dia > 24 then
    raise exception 'Horas inválidas: informe as horas de trabalho por dia (até 24)' using errcode = '22023'; end if;
  if p_inicio is null or p_inicio < hoje then
    raise exception 'Data inválida: a meta só pode valer a partir de hoje; os dias anteriores ficam com a meta da época' using errcode = '22023'; end if;
  select * into v from public.prod_metas where galpao_id = p_galpao and atividade = p_atividade and andar is not distinct from p_andar and inicio = p_inicio;
  insert into public.prod_metas (galpao_id, atividade, andar, por_dia, horas_dia, por_hora, inicio, criado_por)
  values (p_galpao, p_atividade, p_andar, round(p_por_dia, 1), round(p_horas_dia, 2), round(p_por_dia / p_horas_dia, 3), p_inicio, em)
  on conflict (galpao_id, atividade, (coalesce(andar, '')), inicio) do update
    set por_dia = excluded.por_dia, horas_dia = excluded.horas_dia, por_hora = excluded.por_hora, criado_por = excluded.criado_por, criado_em = now()
  returning id into novo;
  insert into public.prod_auditoria (tabela, registro, acao, antes, depois, email)
  select 'prod_metas', novo::text, case when v.id is null then 'criar' else 'alterar' end, case when v.id is null then null else to_jsonb(v) end, to_jsonb(x), em
  from public.prod_metas x where x.id = novo;
  return novo;
end $function$;
revoke all on function public.prod_meta_salvar(uuid, text, text, numeric, numeric, date) from public, anon;
grant execute on function public.prod_meta_salvar(uuid, text, text, numeric, numeric, date) to authenticated;

-- a versão antiga (sem andar) continua funcionando para aparelhos ainda com a página antiga aberta
create or replace function public.prod_meta_salvar(p_galpao uuid, p_atividade text, p_por_dia numeric, p_horas_dia numeric, p_inicio date)
returns bigint language sql security definer set search_path = '' as $function$
  select public.prod_meta_salvar(p_galpao, p_atividade, null::text, p_por_dia, p_horas_dia, p_inicio)
$function$;
