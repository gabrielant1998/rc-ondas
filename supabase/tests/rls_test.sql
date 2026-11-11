\set ON_ERROR_STOP on
\set QUIET on
create temp table r (n serial, ok boolean, nome text); grant all on r to anon, authenticated; grant usage on sequence r_n_seq to anon, authenticated;
-- espera(sql, 'ok' | 'erro', nome): roda sql como o papel atual e confere se deu certo ou falhou
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
create function pg_temp.rpc(o text, quer text, nome text) returns void language plpgsql as $$
declare veio text; det text;
begin
  begin select resultado, detalhe into veio, det from public.registrar_ondas(('[' || o || ']')::jsonb);
  exception when others then veio := 'erro'; det := sqlerrm; end;
  insert into r (ok, nome) values (veio = quer, nome || case when veio <> quer then ' >> veio ' || veio || ' ' || coalesce(det,'') else '' end);
end $$;
create function pg_temp.como(papel text, uid text default null) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', case when uid is null then '{}' else json_build_object('sub', uid)::text end, false);
  execute 'set role ' || papel;
end $$;

-- ---------- dados de base (como dono do banco)
insert into galpoes (id, nome, meta_diaria) values ('00000000-0000-0000-0000-0000000000a1','Galpão 1',10000),('00000000-0000-0000-0000-0000000000a2','Galpão 2',8000);
insert into operadores (id, codigo, nome, turno, galpao_id) values
 ('00000000-0000-0000-0000-0000000000b1','CL001','Ana Souza',1,'00000000-0000-0000-0000-0000000000a1'),
 ('00000000-0000-0000-0000-0000000000b2','CL002','Bruno Lima',1,'00000000-0000-0000-0000-0000000000a1'),
 ('00000000-0000-0000-0000-0000000000b3','CL003','Carla Dias',2,'00000000-0000-0000-0000-0000000000a2');
insert into gestores (email, nome, galpao_id, admin, pode_registros) values
 ('adm@x.com','Admin',null,true,true),
 ('g2@x.com','Gestor G2','00000000-0000-0000-0000-0000000000a2',false,true),
 ('leitor@x.com','Só leitura','00000000-0000-0000-0000-0000000000a1',false,false);
insert into auth.users values
 ('00000000-0000-0000-0000-0000000000c1','adm@x.com',now()),
 ('00000000-0000-0000-0000-0000000000c2','G2@x.com',now()),
 ('00000000-0000-0000-0000-0000000000c3','leitor@x.com',now()),
 ('00000000-0000-0000-0000-0000000000c4','estranho@x.com',now()),
 ('00000000-0000-0000-0000-0000000000c5','adm@x.com',null);      -- mesmo e-mail do admin, sem confirmar

-- ---------- público (sem login)
select pg_temp.como('anon');
select pg_temp.conta('select * from operadores', 3, 'público lê os operadores ativos');
select pg_temp.conta('select * from galpoes', 2, 'público lê os galpões');
select pg_temp.espera('select * from ondas', 'erro', 'público NÃO lê ondas');
select pg_temp.espera('select * from gestores', 'erro', 'público NÃO lê gestores');
select pg_temp.rpc('{"id":"10000000-0000-0000-0000-000000000001","wn":"5001","operador_id":"00000000-0000-0000-0000-0000000000b1","tipo":"Vários artigos","quantidade":10,"status":0,"registrada_em":' || to_json(now())::text || ',"concluida_em":' || to_json(now())::text || '}', 'ok', 'público registra onda');
select pg_temp.rpc('{"id":"10000000-0000-0000-0000-000000000001","wn":"5001","operador_id":"00000000-0000-0000-0000-0000000000b1","tipo":"Vários artigos","quantidade":10,"status":0,"registrada_em":' || to_json(now())::text || ',"concluida_em":' || to_json(now())::text || '}', 'ja_existia', 'reenviar a mesma onda não dá erro (idempotente)');
select pg_temp.rpc('{"id":"10000000-0000-0000-0000-000000000002","wn":" 05001 ","operador_id":"00000000-0000-0000-0000-0000000000b2","tipo":"Vários artigos","quantidade":5,"status":0,"registrada_em":' || to_json(now())::text || ',"concluida_em":' || to_json(now())::text || '}', 'wn_repetido', 'WN repetido (" 05001 " x "5001") é recusado');
select pg_temp.rpc('{"id":"10000000-0000-0000-0000-000000000003","wn":"5003","operador_id":"00000000-0000-0000-0000-0000000000b1","tipo":"Maiores/Pesados","quantidade":11,"status":0,"registrada_em":' || to_json(now())::text || ',"concluida_em":' || to_json(now())::text || '}', 'recusada', 'acima do limite do tipo é recusado');
select pg_temp.rpc('{"id":"10000000-0000-0000-0000-000000000004","wn":"5004","operador_id":"00000000-0000-0000-0000-0000000000b1","tipo":"Vários artigos","quantidade":0,"status":0,"registrada_em":' || to_json(now())::text || ',"concluida_em":' || to_json(now())::text || '}', 'recusada', 'quantidade zero é recusada');
select pg_temp.rpc('{"id":"10000000-0000-0000-0000-000000000005","wn":"5005","operador_id":"00000000-0000-0000-0000-0000000000b1","tipo":"Vários artigos","quantidade":5,"status":0,"registrada_em":' || to_json(now())::text || ',"concluida_em":null}', 'recusada', 'concluída sem hora de conclusão é recusada');
select pg_temp.rpc('{"id":"10000000-0000-0000-0000-000000000006","wn":"5006","operador_id":"00000000-0000-0000-0000-0000000000b3","tipo":"Retrabalho","quantidade":7,"status":1,"registrada_em":' || to_json(now())::text || ',"concluida_em":null}', 'ok', 'onda em andamento (procurando) é aceita');
select pg_temp.rpc('{"id":"10000000-0000-0000-0000-000000000007","wn":"5007","operador_id":"00000000-0000-0000-0000-0000000000b1","tipo":"Vários artigos","quantidade":5,"status":0,"registrada_em":' || to_json(now()+interval '2 days')::text || ',"concluida_em":' || to_json(now()+interval '2 days')::text || '}', 'recusada', 'data no futuro é recusada');
select pg_temp.rpc('{"id":"10000000-0000-0000-0000-000000000008","wn":"5008","operador_id":"00000000-0000-0000-0000-0000000000b1","tipo":"Tipo inventado","quantidade":5,"status":0,"registrada_em":' || to_json(now())::text || ',"concluida_em":' || to_json(now())::text || '}', 'recusada', 'tipo inexistente é recusado');
select pg_temp.espera($$insert into ondas (id,wn,operador_id,galpao_id,tipo,quantidade,status,registrada_em,concluida_em) values ('10000000-0000-0000-0000-0000000000ff','9999','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1','Vários artigos',1,0,now(),now())$$, 'erro', 'público NÃO insere direto na tabela, só pela função');
select pg_temp.espera($$update ondas set quantidade=999$$, 'erro', 'público NÃO altera ondas');
select pg_temp.espera($$delete from ondas$$, 'erro', 'público NÃO exclui ondas');
select pg_temp.espera($$insert into operadores (codigo,nome,turno,galpao_id) values ('CL009','Invasor',1,'00000000-0000-0000-0000-0000000000a1')$$, 'erro', 'público NÃO cadastra operador');
select pg_temp.espera($$update config set tolerancia_min=0$$, 'erro', 'público NÃO altera configuração');
select pg_temp.conta($$select * from public.registrar_ondas(('[{"id":"10000000-0000-0000-0000-0000000000e1","wn":"7001","operador_id":"00000000-0000-0000-0000-0000000000b1","tipo":"Vários artigos","quantidade":3,"registrada_em":' || to_json(now())::text || ',"concluida_em":' || to_json(now())::text || '},{"id":"10000000-0000-0000-0000-0000000000e2","wn":"7001","operador_id":"00000000-0000-0000-0000-0000000000b1","tipo":"Vários artigos","quantidade":3,"registrada_em":' || to_json(now())::text || ',"concluida_em":' || to_json(now())::text || '},{"id":"10000000-0000-0000-0000-0000000000e3","wn":"7003","operador_id":"00000000-0000-0000-0000-0000000000b1","tipo":"Vários artigos","quantidade":3,"registrada_em":' || to_json(now())::text || ',"concluida_em":' || to_json(now())::text || '}]')::jsonb) where resultado='ok'$$, 2, 'lote com uma onda repetida grava as outras duas');
reset role;
select pg_temp.conta($$select 1 from ondas where id='10000000-0000-0000-0000-000000000001' and galpao_id='00000000-0000-0000-0000-0000000000a1'$$, 1, 'galpão da onda vem do cadastro do operador, não do aparelho');
select pg_temp.conta('select 1 from ondas', 4, 'só as 4 ondas válidas ficaram gravadas');

-- ---------- gestor comum do Galpão 2
select pg_temp.como('authenticated', '00000000-0000-0000-0000-0000000000c2');
select pg_temp.conta('select * from ondas', 1, 'gestor comum vê só as ondas do galpão dele');
select pg_temp.conta('select * from gestores', 1, 'gestor comum vê só o próprio cadastro');
select pg_temp.espera($$update config set tolerancia_min=5$$, 'ok', 'gestor comum tenta alterar configuração (sem efeito)');
select pg_temp.conta('select 1 from config where tolerancia_min=5', 0, 'configuração não mudou para gestor comum');
select pg_temp.espera($$insert into operadores (codigo,nome,turno,galpao_id) values ('CL004','Novo G1',1,'00000000-0000-0000-0000-0000000000a1')$$, 'erro', 'gestor comum NÃO cadastra operador em outro galpão');
select pg_temp.espera($$insert into operadores (codigo,nome,turno,galpao_id) values ('CL004','Novo G2',1,'00000000-0000-0000-0000-0000000000a2')$$, 'ok', 'gestor comum cadastra operador no próprio galpão');
select pg_temp.espera($$insert into gestores (email,nome,admin) values ('eu@x.com','Eu mesmo',true)$$, 'erro', 'gestor comum NÃO cria administrador');
update ondas set status=0, concluida_em=now() where id='10000000-0000-0000-0000-000000000006';
update ondas set quantidade=1 where id='10000000-0000-0000-0000-000000000001';
reset role;
select pg_temp.conta($$select 1 from ondas where id='10000000-0000-0000-0000-000000000006' and status=0$$, 1, 'gestor conclui onda do próprio galpão');
select pg_temp.conta($$select 1 from ondas where id='10000000-0000-0000-0000-000000000001' and quantidade=10$$, 1, 'gestor NÃO altera onda de outro galpão');

-- ---------- gestor sem permissão de registros
select pg_temp.como('authenticated', '00000000-0000-0000-0000-0000000000c3');
update ondas set quantidade=2 where id='10000000-0000-0000-0000-000000000001';
delete from ondas where id='10000000-0000-0000-0000-000000000001';
reset role;
select pg_temp.conta($$select 1 from ondas where id='10000000-0000-0000-0000-000000000001' and quantidade=10$$, 1, 'gestor sem permissão NÃO altera nem exclui registros');

-- ---------- logado mas não é gestor / e-mail não confirmado
select pg_temp.como('authenticated', '00000000-0000-0000-0000-0000000000c4');
select pg_temp.conta('select * from ondas', 0, 'conta logada que não é gestor não vê ondas');
select pg_temp.como('authenticated', '00000000-0000-0000-0000-0000000000c5');
select pg_temp.conta('select * from ondas', 0, 'e-mail do admin SEM confirmação não vê nada');
select pg_temp.conta('select * from gestores', 0, 'e-mail do admin SEM confirmação não lê gestores');

-- ---------- administrador
select pg_temp.como('authenticated', '00000000-0000-0000-0000-0000000000c1');
select pg_temp.conta('select * from ondas', 4, 'admin vê as ondas de todos os galpões');
select pg_temp.conta('select * from gestores', 3, 'admin vê todos os gestores');
select pg_temp.espera($$update config set tolerancia_min=20$$, 'ok', 'admin altera configuração');
select pg_temp.espera($$update tipos_onda set limite=500 where nome='Retrabalho'$$, 'ok', 'admin altera limite de tipo');
select pg_temp.espera($$update operadores set excluido_em=now() where codigo='CL002'$$, 'ok', 'admin exclui operador (lógico)');
select pg_temp.espera($$insert into operadores (codigo,nome,turno,galpao_id) values ('CL002','Diego Rocha',1,'00000000-0000-0000-0000-0000000000a1')$$, 'ok', 'código excluído volta a ficar disponível');
select pg_temp.espera($$insert into operadores (codigo,nome,turno,galpao_id) values ('CL002','Outro',1,'00000000-0000-0000-0000-0000000000a1')$$, 'erro', 'dois operadores ativos com o mesmo código é recusado');
select pg_temp.espera($$update ondas set operador_id='00000000-0000-0000-0000-0000000000b3' where id='10000000-0000-0000-0000-000000000001'$$, 'erro', 'nem admin troca o operador de uma onda');
select pg_temp.espera($$delete from galpoes where id='00000000-0000-0000-0000-0000000000a1'$$, 'erro', 'galpão com registros não pode ser apagado');
select pg_temp.espera($$update gestores set admin=false where email='adm@x.com'$$, 'erro', 'o último administrador não pode ser rebaixado');
select pg_temp.espera($$delete from gestores where email='adm@x.com'$$, 'erro', 'o último administrador não pode ser excluído');
reset role;
select pg_temp.conta('select 1 from config where tolerancia_min=20', 1, 'configuração do admin ficou gravada');
select pg_temp.como('anon');
select pg_temp.conta('select * from operadores', 4, 'público não vê o operador excluído');
select pg_temp.rpc('{"id":"10000000-0000-0000-0000-000000000009","wn":"5009","operador_id":"00000000-0000-0000-0000-0000000000b2","tipo":"Vários artigos","quantidade":5,"status":0,"registrada_em":' || to_json(now())::text || ',"concluida_em":' || to_json(now())::text || '}', 'recusada', 'operador excluído não registra onda');
reset role;

\pset tuples_only on
\pset format unaligned
select case when ok then 'PASSOU ' else 'FALHOU ' end || nome from r order by n;
select (select count(*) from r where ok) || '/' || (select count(*) from r) || ' passaram';
