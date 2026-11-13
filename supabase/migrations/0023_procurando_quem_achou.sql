-- "Onda encontrada" passa a gravar o nome de quem encontrou/coletou (antes o servidor só guardava o horário).
-- O parâmetro é opcional: versões antigas do app continuam chamando só com a onda.
drop function public.encontrar_procurando(text);
create function public.encontrar_procurando(p_wn text, p_quem text default null) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n integer; quem text := nullif(btrim(coalesce(p_quem, '')), '');
begin
  if quem is not null and length(quem) > 80 then
    raise exception 'Nome grande demais (até 80 caracteres)' using errcode = '22023';
  end if;
  update public.ondas set status = 0, concluida_em = greatest(now(), registrada_em),
         procura_hist = procura_hist || jsonb_build_array(
           case when quem is null then jsonb_build_object('e', 'a', 't', now())
                else jsonb_build_object('e', 'a', 'q', quem, 't', now()) end)
   where wn_norm = public.normaliza_wn(p_wn) and status = 1;
  get diagnostics n = row_count;
  return n = 1;
end $$;
revoke all on function public.encontrar_procurando(text, text) from public;
grant execute on function public.encontrar_procurando(text, text) to anon, authenticated;
