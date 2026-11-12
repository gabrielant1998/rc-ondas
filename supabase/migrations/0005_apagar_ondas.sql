-- Manutenção: só o administrador apaga registros de ondas por período (dias inclusive, horário de São Paulo) e opcionalmente por galpão.
-- p_so_contar = true só conta, sem apagar.
create function public.apagar_ondas(p_de date, p_ate date, p_galpao uuid default null, p_so_contar boolean default false)
returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if not (select private.g_admin()) then raise exception 'Somente o administrador pode apagar registros' using errcode = '42501'; end if;
  if p_de is null or p_ate is null or p_ate < p_de then raise exception 'Período inválido' using errcode = '22023'; end if;
  if p_so_contar then
    select count(*)::integer into n from public.ondas o
     where o.registrada_em >= (p_de::timestamp at time zone 'America/Sao_Paulo')
       and o.registrada_em <  ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo')
       and (p_galpao is null or o.galpao_id = p_galpao);
  else
    with apagadas as (
      delete from public.ondas o
       where o.registrada_em >= (p_de::timestamp at time zone 'America/Sao_Paulo')
         and o.registrada_em <  ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo')
         and (p_galpao is null or o.galpao_id = p_galpao)
       returning 1)
    select count(*)::integer into n from apagadas;
  end if;
  return n;
end $$;

revoke all on function public.apagar_ondas(date, date, uuid, boolean) from public, anon;
grant execute on function public.apagar_ondas(date, date, uuid, boolean) to authenticated;
