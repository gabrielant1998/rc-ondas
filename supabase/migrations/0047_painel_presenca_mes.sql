-- Painel (radar individual): dias com registro nos últimos 30 dias por pessoa, na Coleta e na Embalagem.
-- Só leitura, só gestor logado, limitado ao galpão do gestor (administrador vê todos).
create function public.painel_presenca_mes(p_fim date)
returns table (setor text, pessoa_id uuid, dias integer, dias_op integer)
language plpgsql stable security definer set search_path = '' as $$
declare ini timestamptz; fim timestamptz; adm boolean := (select private.g_admin()); gal uuid := (select private.g_galpao());
begin
  if private.gestor_email() is null then raise exception 'Entre como gestor para ver a presença' using errcode = '42501'; end if;
  if p_fim is null or p_fim > current_date + 1 or p_fim < current_date - 400 then
    raise exception 'Data inválida' using errcode = '22023'; end if;
  ini := ((p_fim - 29)::timestamp at time zone 'America/Sao_Paulo');
  fim := ((p_fim + 1)::timestamp at time zone 'America/Sao_Paulo');
  return query
  with c as (
    select o.operador_id as pid, (o.registrada_em at time zone 'America/Sao_Paulo')::date as d
    from public.ondas o
    where o.registrada_em >= ini and o.registrada_em < fim and o.operador_id is not null
      and (adm or o.galpao_id = gal)),
  e as (
    select pr.pessoa_id as pid, pr.dia as d
    from public.prod_presenca pr join public.prod_pessoas p on p.id = pr.pessoa_id
    where pr.dia between p_fim - 29 and p_fim and (adm or p.galpao_id = gal))
  select 'coleta'::text, c.pid, count(distinct c.d)::integer, (select count(distinct d) from c)::integer from c group by c.pid
  union all
  select 'embalagem'::text, e.pid, count(distinct e.d)::integer, (select count(distinct d) from e)::integer from e group by e.pid;
end $$;
revoke all on function public.painel_presenca_mes(date) from public, anon;
grant execute on function public.painel_presenca_mes(date) to authenticated;
