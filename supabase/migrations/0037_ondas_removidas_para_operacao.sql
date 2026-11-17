-- Aparelhos da operação (sem login) guardam as ondas que enviaram por alguns dias para evitar bipagem repetida.
-- Quando um gestor exclui uma onda, o aparelho precisa saber para liberar o número de novo.
-- Recebe ids que o próprio aparelho enviou e devolve só os que não existem mais. Não expõe nenhum dado das ondas.
create function public.ondas_removidas(p_ids uuid[])
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select i from unnest(p_ids[1:500]) as i
  where not exists (select 1 from public.ondas o where o.id = i)
$$;
revoke all on function public.ondas_removidas(uuid[]) from public;
grant execute on function public.ondas_removidas(uuid[]) to anon, authenticated;
