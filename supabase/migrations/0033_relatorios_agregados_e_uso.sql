-- Relatórios de período longo: o banco devolve totais por dia, galpão, pessoa e tipo,
-- em vez de cada onda. Roda com as permissões de quem chama (RLS de ondas vale).
create function public.relatorio_agregado(p_ini timestamptz, p_fim timestamptz)
returns table(dia date, galpao_id uuid, operador_id uuid, tipo text, ondas integer, unidades integer)
language sql stable security invoker set search_path = '' as $$
  select (coalesce(o.concluida_em, o.registrada_em) at time zone 'America/Sao_Paulo')::date,
         o.galpao_id, o.operador_id, o.tipo, count(*)::int, coalesce(sum(o.quantidade), 0)::int
    from public.ondas o
   where o.status = 0
     and o.registrada_em >= p_ini and o.registrada_em < p_fim
     and p_fim - p_ini <= interval '400 days'
   group by 1, 2, 3, 4
$$;
revoke all on function public.relatorio_agregado(timestamptz, timestamptz) from public, anon;
grant execute on function public.relatorio_agregado(timestamptz, timestamptz) to authenticated;

-- Uso do banco para o aviso em Config (só administrador).
create function public.uso_banco()
returns json language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select private.g_admin()) then raise exception 'Sem permissão' using errcode = '42501'; end if;
  return json_build_object(
    'banco_bytes', pg_database_size(current_database()),
    'ondas', (select count(*) from public.ondas),
    'ondas_bytes', pg_total_relation_size('public.ondas'),
    'limite_bytes', 500 * 1024 * 1024);
end $$;
revoke all on function public.uso_banco() from public, anon;
grant execute on function public.uso_banco() to authenticated;

-- Menos espaço: índice por tipo nunca foi usado; folga nas páginas deixa as alterações
-- de status (procurando, baixa) reaproveitarem a mesma página.
drop index if exists public.ondas_tipo_idx;
alter table public.ondas set (fillfactor = 90, autovacuum_vacuum_scale_factor = 0.05);
