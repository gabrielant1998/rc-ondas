-- Página "Semana" da Equipe: presença e ausências de cada pessoa, dia a dia, numa semana.
-- Permissão própria (o administrador liga e desliga por gestor). Quem hoje vê a Equipe começa com ela ligada.
alter table public.gestores add column pode_semana boolean not null default true;
update public.gestores set pode_semana = pode_individual where perfil = 'gestor';
update public.gestores set pode_semana = false where perfil = 'bipador';
alter table public.gestores drop constraint gestores_bipador_ck;
alter table public.gestores add constraint gestores_bipador_ck check (perfil <> 'bipador' or (
  not admin and not pode_config and not pode_individual and not pode_registros and not pode_pessoas and not pode_metas and not pode_semana
  and galpao_id is not null and abas is not null
  and abas <@ array['painel','op','op.ctl','op.ace','op.aus','prod','prod.aus','prs']::text[]));

create or replace function private.g_pode(perm text)
returns boolean language sql stable security definer set search_path = '' as $function$
  select coalesce((select case perm when 'config' then g.pode_config when 'individual' then g.pode_individual
                                    when 'registros' then g.pode_registros when 'pessoas' then g.pode_pessoas
                                    when 'metas' then g.pode_metas when 'semana' then g.pode_semana else false end
                   from public.gestores g where g.email = private.gestor_email()), false)
$function$;

-- Embalagem na semana: por pessoa e dia, quando entrou (primeira bipagem), ondas, unidades e ausências do dia
create function public.prod_semana(p_ini date, p_fim date)
returns table (pessoa_id uuid, dia date, primeira_em timestamptz, ondas integer, unidades integer, ausencias integer, minutos_ausente integer, motivos text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if private.gestor_email() is null or not ((select private.g_admin()) or (select private.g_pode('semana'))) then
    raise exception 'Sem permissão para ver a semana da equipe. Peça ao administrador para liberar "Pode ver a semana da equipe".' using errcode = '42501'; end if;
  if p_ini is null or p_fim is null or p_fim < p_ini or p_fim - p_ini > 13 then
    raise exception 'Período inválido: escolha uma semana' using errcode = '22023'; end if;
  return query
  with pes as (
    select p.id from public.prod_pessoas p
    where (select private.g_admin()) or p.galpao_id = (select private.g_galpao())
  ), bip as (
    select b.pessoa_id, b.dia, min(b.bipada_em) primeira, count(*)::integer n, coalesce(sum(b.quantidade), 0)::integer q
    from public.prod_bipagens b join pes on pes.id = b.pessoa_id
    where b.dia between p_ini and p_fim group by 1, 2
  ), aus as (
    select a.pessoa_id, (a.inicio at time zone 'America/Sao_Paulo')::date dia, count(*)::integer n,
      coalesce(sum(extract(epoch from (coalesce(a.fim, least(now(), a.inicio + interval '16 hours')) - a.inicio)) / 60), 0)::integer mins,
      string_agg(distinct a.motivo, ', ') mot
    from public.prod_ausencias a join pes on pes.id = a.pessoa_id
    where a.inicio >= (p_ini::timestamp at time zone 'America/Sao_Paulo') and a.inicio < ((p_fim + 1)::timestamp at time zone 'America/Sao_Paulo')
    group by 1, 2
  )
  select coalesce(b.pessoa_id, a.pessoa_id), coalesce(b.dia, a.dia), b.primeira, coalesce(b.n, 0), coalesce(b.q, 0), coalesce(a.n, 0), coalesce(a.mins, 0), a.mot
  from bip b full join aus a on a.pessoa_id = b.pessoa_id and a.dia = b.dia;
end $$;
revoke all on function public.prod_semana(date, date) from public, anon;
grant execute on function public.prod_semana(date, date) to authenticated;
