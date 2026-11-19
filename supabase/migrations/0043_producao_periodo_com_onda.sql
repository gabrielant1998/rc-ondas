-- prod_bipagens_periodo passa a devolver também o número normalizado da onda (para cruzar Coleta × Embalagem no Painel).
drop function public.prod_bipagens_periodo(date, date);
create function public.prod_bipagens_periodo(p_ini date, p_fim date)
returns table (id uuid, pessoa_id uuid, codigo text, nome text, andar text, atividade text, turno_id smallint, dia date, bipada_em timestamptz, coletado boolean, wn_norm text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if private.gestor_email() is null then raise exception 'Entre como gestor para ver o desempenho' using errcode = '42501'; end if;
  if p_ini is null or p_fim is null or p_fim < p_ini or p_fim - p_ini > 92 then
    raise exception 'Período inválido (máximo de 93 dias)' using errcode = '22023'; end if;
  return query
  select b.id, b.pessoa_id, p.codigo, p.nome, b.andar, b.atividade, b.turno_id, b.dia, b.bipada_em,
         exists (select 1 from public.ondas w where w.wn_norm = b.wn_norm), b.wn_norm
  from public.prod_bipagens b join public.prod_pessoas p on p.id = b.pessoa_id
  where b.dia between p_ini and p_fim
    and ((select private.g_admin()) or p.galpao_id = (select private.g_galpao()))
  order by b.bipada_em limit 60000;
end $$;
revoke all on function public.prod_bipagens_periodo(date, date) from public, anon;
grant execute on function public.prod_bipagens_periodo(date, date) to authenticated;
