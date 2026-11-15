\set ON_ERROR_STOP on
\set QUIET on
-- Testa a importação da produção da coleta (Work Package Statistics).
-- Rode depois de shim_supabase.sql e de todas as migrações, como dono do banco.
create temp table r (n serial, ok boolean, nome text);
grant all on r to anon, authenticated, service_role;
grant usage on sequence r_n_seq to anon, authenticated, service_role;

create function pg_temp.espera(q text, quer text, nome text) returns void language plpgsql as $$
declare deu text := 'ok'; msg text := '';
begin
  begin execute q; exception when others then deu := 'erro'; msg := sqlerrm; end;
  insert into r (ok, nome) values (deu = quer, nome || case when deu <> quer then ' >> veio ' || deu || ' ' || msg else '' end);
end $$;
create function pg_temp.conta(q text, quer bigint, nome text) returns void language plpgsql as $$
declare n bigint; msg text := '';
begin
  begin execute 'select count(*) from (' || q || ') t' into n; exception when others then n := -1; msg := sqlerrm; end;
  insert into r (ok, nome) values (n = quer, nome || case when n <> quer then ' >> veio ' || n || ' ' || msg else '' end);
end $$;
create function pg_temp.como(papel text, uid text default null) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', case when uid is null then '{}' else json_build_object('sub', uid)::text end, false);
  execute 'set role ' || papel;
end $$;

insert into galpoes (nome, meta_diaria) values ('RC', 100000);
insert into gestores (email, nome, admin, pode_individual) values ('coleta@x.com','Admin Coleta',true,true);
insert into gestores (email, nome, galpao_id, admin, pode_individual)
  values ('sem@x.com','Sem Permissão',(select id from galpoes limit 1),false,false);
insert into auth.users values
  ('00000000-0000-0000-0000-0000000000d1','coleta@x.com',now()),
  ('00000000-0000-0000-0000-0000000000d2','sem@x.com',now());

-- lote de exemplo: 3 pessoas, tipos fechando com o total
create temp table lote as select '{
  "loja":"RC","dia":"2026-11-15","arquivo":"teste.xlsx",
  "conferencia":{"computador_e_maquina":"somados na origem"},
  "pessoas":[
    {"pessoa":"Ana Souza","papeis":["coletor"],"ondas":10,
     "pacotes":{"Itens Únicos":100,"Pacote do mesmo":400},"pacote_total":500,"produtos":520},
    {"pessoa":"Bruno Lima","papeis":["embalador"],"ondas":8,
     "pacotes":{"Itens Únicos":300,"Vários artigos":100},"pacote_total":400,"produtos":430},
    {"pessoa":"Carla Dias","papeis":["coletor","embalador"],"ondas":6,
     "pacotes":{"Itens Únicos":50,"Pacote do mesmo":650},"pacote_total":700,"produtos":710}
  ]}'::jsonb as p;
grant select on lote to anon, authenticated, service_role;

-- ---------- importação (chave de serviço)
select pg_temp.como('service_role');
select pg_temp.espera(format('select public.importar_coleta(%L::jsonb)', (select p::text from lote)), 'ok', 'importação do lote');
select pg_temp.conta('select 1 from coleta_lotes where arquivo=''teste.xlsx''', 1, 'lote gravado');
select pg_temp.conta('select 1 from coleta_producao where pessoa=''Ana Souza''', 1, 'pessoas gravadas');
select pg_temp.espera(format('select public.importar_coleta(%L::jsonb)', (select p::text from lote)), 'ok', 'reenvio do mesmo arquivo é seguro');
select pg_temp.conta('select 1 from coleta_lotes where loja=''RC'' and dia=''2026-11-15''', 1, 'reenvio não duplica o lote');

-- pacote total que não fecha é recusado
create temp table ruim as select '{"loja":"RC","dia":"2026-11-16","arquivo":"ruim.xlsx",
  "pessoas":[{"pessoa":"Ana Souza","ondas":1,"pacotes":{"Itens Únicos":10},"pacote_total":99,"produtos":10}]}'::jsonb as p;
grant select on ruim to anon, authenticated, service_role;
select pg_temp.espera(format('select public.importar_coleta(%L::jsonb)', (select p::text from ruim)), 'ok', 'lote com total errado responde recusada');
select pg_temp.conta('select 1 from coleta_lotes where arquivo=''ruim.xlsx''', 0, 'lote com total errado não é gravado');

-- ---------- leitura por gestor com permissão
select pg_temp.como('authenticated', '00000000-0000-0000-0000-0000000000d1');
select pg_temp.espera($$select public.ranking_coleta('2026-11-15')$$, 'ok', 'ranking responde para o gestor');
select pg_temp.conta($$select 1 from public.ranking_coleta('2026-11-15') j where j ->> 'resultado' = 'ok'$$, 1, 'gestor com permissão recebe ok');
select pg_temp.conta($$select 1 from jsonb_array_elements(public.ranking_coleta('2026-11-15') -> 'metricas') m
                      where m ->> 'chave' = 'pacotes' and jsonb_array_length(m -> 'top') = 3$$, 1, 'Top 3 de pacotes');
select pg_temp.conta($$select 1 from jsonb_array_elements(public.ranking_coleta('2026-11-15') -> 'metricas') m
                      where m ->> 'chave' = 'pacotes' and m -> 'top' -> 0 ->> 'pessoa' = 'Carla Dias'$$, 1, 'Top 3 começa por quem tem mais pacotes');
select pg_temp.conta($$select 1 from jsonb_array_elements(public.ranking_coleta('2026-11-15') -> 'tipos') t
                      where t ->> 'tipo' = 'Pacote do mesmo' and t -> 'top' -> 0 ->> 'pessoa' = 'Carla Dias'
                        and (t -> 'top' -> 0 ->> 'valor')::int = 650$$, 1, 'Top 3 por tipo ordena pelo valor');
select pg_temp.conta($$select 1 from public.ranking_coleta('2026-11-15') b, lateral (select 1) x
                      where (b -> 'totais' ->> 'pacotes')::int = 1600$$, 1, 'totais somam o lote');

-- ---------- permissões
select pg_temp.como('authenticated', '00000000-0000-0000-0000-0000000000d2');
select pg_temp.conta($$select 1 from public.ranking_coleta('2026-11-15') j where j ->> 'resultado' = 'sem_permissao'$$, 1, 'gestor sem permissão individual não vê pessoas');
select pg_temp.como('anon');
select pg_temp.espera($$select public.ranking_coleta('2026-11-15')$$, 'erro', 'público não lê o ranking por pessoa');
select pg_temp.espera($$select public.importar_coleta('{}'::jsonb)$$, 'erro', 'público não importa');
reset role;

\pset tuples_only on
\pset format unaligned
select case when ok then 'PASSOU ' else 'FALHOU ' end || nome from r order by n;
select (select count(*) from r where ok) || '/' || (select count(*) from r) || ' passaram';
