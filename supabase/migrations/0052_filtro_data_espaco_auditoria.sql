-- 1) Filtro de data: gestor logado consulta ausências e bipagens de qualquer dia do último ano
--    (aparelho público continua limitado aos últimos 7 dias, como antes).
create or replace function public.ausencias_publicas(p_dia date)
returns table(id uuid, operador_id uuid, galpao_id uuid, motivo text, inicio timestamptz, fim timestamptz)
language sql stable security definer set search_path = '' as $function$
  select a.id, a.operador_id, a.galpao_id, a.motivo, a.inicio, a.fim
  from public.ausencias a
  where p_dia between current_date - case when private.gestor_email() is not null then 400 else 7 end and current_date + 1
    and a.inicio >= (p_dia::timestamp at time zone 'America/Sao_Paulo')
    and a.inicio < ((p_dia + 1)::timestamp at time zone 'America/Sao_Paulo')
  order by a.inicio desc limit 1000
$function$;

create or replace function public.prod_ausencias_dia(p_dia date)
returns table(id uuid, pessoa_id uuid, galpao_id uuid, motivo text, inicio timestamptz, fim timestamptz)
language sql stable security definer set search_path = '' as $function$
  select a.id, a.pessoa_id, a.galpao_id, a.motivo, a.inicio, a.fim
  from public.prod_ausencias a
  where p_dia between current_date - case when private.gestor_email() is not null then 400 else 7 end and current_date + 1
    and a.inicio >= (p_dia::timestamp at time zone 'America/Sao_Paulo')
    and a.inicio < ((p_dia + 1)::timestamp at time zone 'America/Sao_Paulo')
  order by a.inicio desc limit 1000
$function$;

create or replace function public.prod_bipagens_dia(p_dia date)
returns table(id uuid, wn text, pessoa_id uuid, andar text, atividade text, turno_id smallint, bipada_em timestamptz, coletado boolean, quantidade integer, origem text)
language sql stable security definer set search_path = '' as $function$
  select b.id, b.wn, b.pessoa_id, b.andar, b.atividade, b.turno_id, b.bipada_em,
         exists (select 1 from public.ondas w where w.wn_norm = b.wn_norm), b.quantidade, b.origem
  from public.prod_bipagens b
  where p_dia between current_date - case when private.gestor_email() is not null then 400 else 7 end and current_date + 1
    and b.dia = p_dia
  order by b.bipada_em desc limit 30000
$function$;

-- 2) Auditoria guarda um ano: ao entrar, um gestor limpa só registros de auditoria com mais de 1 ano.
create or replace function public.registrar_acesso(p_acao text)
returns void language plpgsql security definer set search_path = '' as $function$
begin
  if p_acao not in ('entrou','abriu','saiu') then raise exception 'Ação inválida' using errcode = '22023'; end if;
  if private.gestor_email() is null then return; end if;
  if p_acao = 'abriu' and exists (select 1 from public.auditoria a where a.email = private.gestor_email()
       and a.acao in ('abriu','entrou') and a.em > now() - interval '10 minutes') then return; end if;
  perform private.audita(p_acao, null, null, null, null);
  if p_acao = 'entrou' then
    delete from public.auditoria where em < now() - interval '1 year';
  end if;
end $function$;

-- 3) Uso do banco também informa quanto a auditoria ocupa (barra em Config › Manutenção e na Auditoria)
create or replace function public.uso_banco()
returns json language plpgsql stable security definer set search_path = '' as $function$
begin
  if not (select private.g_admin()) then raise exception 'Sem permissão' using errcode = '42501'; end if;
  return json_build_object(
    'banco_bytes', pg_database_size(current_database()),
    'ondas', (select count(*) from public.ondas),
    'ondas_bytes', pg_total_relation_size('public.ondas'),
    'auditoria_bytes', pg_total_relation_size('public.auditoria'),
    'limite_bytes', 500 * 1024 * 1024);
end $function$;
