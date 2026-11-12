-- Metas individuais por galpão (ondas e/ou unidades por pessoa por dia) e total de ondas procurando no Painel público.
alter table public.galpoes
  add column meta_ind_ondas integer check (meta_ind_ondas > 0),
  add column meta_ind_qtd   integer check (meta_ind_qtd   > 0);

create function private.procurando_publico(p_galpao uuid default null, p_turno smallint default null)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('ondas', count(*), 'qtd', coalesce(sum(w.quantidade), 0))
  from public.ondas w join public.operadores o on o.id = w.operador_id
  where w.status = 1 and (p_galpao is null or w.galpao_id = p_galpao) and (p_turno is null or o.turno = p_turno)
$$;
revoke all on function private.procurando_publico(uuid, smallint) from public;
grant execute on function private.procurando_publico(uuid, smallint) to anon, authenticated;

create or replace function public.painel_publico(p_dia date, p_galpao uuid default null, p_turno smallint default null)
returns jsonb
language sql stable set search_path = '' as $$
  select private.painel_publico_agregado(p_dia, p_galpao, p_turno)
         || jsonb_build_object('procurando', private.procurando_publico(p_galpao, p_turno))
$$;
