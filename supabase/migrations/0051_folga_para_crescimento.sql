-- Folga para o crescimento das ondas (hoje ~1.500 por dia somando os galpões).
-- 1) tetos das consultas do dia e do período bem acima do uso previsto
do $$ declare f text; d text; begin
  foreach f in array array['public.ondas_publicas(date)','public.prod_bipagens_dia(date)'] loop
    d := pg_get_functiondef(f::regprocedure); if position('limit 8000' in d) = 0 then raise exception 'limite não achado em %', f; end if;
    execute replace(d, 'limit 8000', 'limit 30000'); end loop;
  d := pg_get_functiondef('public.prod_bipagens_periodo(date,date)'::regprocedure); if position('limit 60000' in d) = 0 then raise exception 'limite do período não achado'; end if;
  execute replace(d, 'limit 60000', 'limit 300000');
  d := pg_get_functiondef('public.auditoria_listar(date,date,text,text)'::regprocedure); if position('limit 5000' in d) = 0 then raise exception 'limite da auditoria não achado'; end if;
  execute replace(d, 'limit 5000', 'limit 20000');
end $$;

-- 2) auditoria mais leve: registro de onda/embalagem nova guarda só o essencial (a onda completa já está na própria tabela)
create or replace function private.audita_mudanca() returns trigger
language plpgsql security definer set search_path = '' as $$
declare a jsonb; d jsonb; reg text;
begin
  if private.gestor_email() is null then return coalesce(new, old); end if;
  a := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) - 'procura_hist' end;
  d := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) - 'procura_hist' end;
  if tg_op = 'UPDATE' and a = d then return new; end if;
  if tg_op = 'INSERT' and tg_table_name = 'ondas' then
    d := jsonb_build_object('id', d->'id', 'wn', d->'wn', 'operador_id', d->'operador_id', 'galpao_id', d->'galpao_id', 'tipo', d->'tipo', 'quantidade', d->'quantidade', 'status', d->'status');
  elsif tg_op = 'INSERT' and tg_table_name = 'prod_bipagens' then
    d := jsonb_build_object('id', d->'id', 'wn', d->'wn', 'pessoa_id', d->'pessoa_id', 'quantidade', d->'quantidade', 'origem', d->'origem');
  end if;
  reg := coalesce(d ->> 'id', a ->> 'id', d ->> 'email', a ->> 'email', d ->> 'pessoa_id', a ->> 'pessoa_id', d ->> 'dia', a ->> 'dia');
  perform private.audita(case tg_op when 'INSERT' then 'criou' when 'UPDATE' then 'alterou' else 'excluiu' end, tg_table_name, reg, a, d);
  return coalesce(new, old);
end $$;
