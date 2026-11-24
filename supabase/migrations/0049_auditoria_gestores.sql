-- Auditoria dos gestores: quando entram, abrem o sistema, saem e o que fazem (criar, alterar, excluir).
-- Só o administrador lê. Ninguém altera nem apaga pelo sistema. Registros do aparelho público (sem login) não entram aqui.
create table public.auditoria (
  id bigint generated always as identity primary key,
  em timestamptz not null default now(),
  email text,
  nome text,
  galpao_id uuid,
  acao text not null check (acao in ('entrou','abriu','saiu','criou','alterou','excluiu')),
  tabela text,
  registro text,
  antes jsonb,
  depois jsonb
);
create index auditoria_em_idx on public.auditoria (em desc);
create index auditoria_email_em_idx on public.auditoria (email, em desc);
alter table public.auditoria enable row level security;
create policy auditoria_ler_admin on public.auditoria for select to authenticated using ((select private.g_admin()));
revoke all on public.auditoria from anon, authenticated;
grant select on public.auditoria to authenticated;

-- grava uma linha com o gestor logado (identidade tirada do token, nunca do aparelho)
create function private.audita(p_acao text, p_tabela text, p_registro text, p_antes jsonb, p_depois jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare g public.gestores;
begin
  select * into g from public.gestores where email = private.gestor_email();
  if not found then return; end if;
  insert into public.auditoria (email, nome, galpao_id, acao, tabela, registro, antes, depois)
  values (g.email, g.nome, g.galpao_id, p_acao, p_tabela, p_registro, p_antes, p_depois);
end $$;
revoke all on function private.audita(text, text, text, jsonb, jsonb) from public, anon, authenticated;

-- acesso: chamado pelo sistema ao entrar, ao abrir com a sessão salva e ao sair
create function public.registrar_acesso(p_acao text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_acao not in ('entrou','abriu','saiu') then raise exception 'Ação inválida' using errcode = '22023'; end if;
  if private.gestor_email() is null then return; end if;
  -- "abriu" no máximo uma vez a cada 10 minutos por gestor, para não encher a lista
  if p_acao = 'abriu' and exists (select 1 from public.auditoria a where a.email = private.gestor_email()
       and a.acao in ('abriu','entrou') and a.em > now() - interval '10 minutes') then return; end if;
  perform private.audita(p_acao, null, null, null, null);
end $$;
revoke all on function public.registrar_acesso(text) from public, anon;
grant execute on function public.registrar_acesso(text) to authenticated;

-- ações: gatilho genérico nas tabelas que os gestores mexem
create function private.audita_mudanca() returns trigger
language plpgsql security definer set search_path = '' as $$
declare a jsonb; d jsonb; reg text;
begin
  if private.gestor_email() is null then return coalesce(new, old); end if;
  a := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  d := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
  if tg_op = 'UPDATE' and a = d then return new; end if;
  reg := coalesce(d ->> 'id', a ->> 'id', d ->> 'email', a ->> 'email', d ->> 'pessoa_id', a ->> 'pessoa_id', d ->> 'dia', a ->> 'dia');
  perform private.audita(case tg_op when 'INSERT' then 'criou' when 'UPDATE' then 'alterou' else 'excluiu' end, tg_table_name, reg, a, d);
  return coalesce(new, old);
end $$;
revoke all on function private.audita_mudanca() from public, anon, authenticated;

do $$ declare t text; begin
  foreach t in array array['ondas','operadores','gestores','galpoes','config','metas_diarias','tipos_onda','ausencias','paradas',
    'presenca_registros','presenca_baixas','presenca_atrasos','solicitacoes_gestor',
    'prod_pessoas','prod_atribuicoes','prod_metas','prod_turnos','prod_bipagens','prod_ausencias'] loop
    if to_regclass('public.' || t) is not null then
      execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.audita_mudanca()', t || '_auditoria', t);
    end if;
  end loop;
end $$;

-- leitura para o administrador
create function public.auditoria_listar(p_ini date, p_fim date, p_email text default null, p_tipo text default null)
returns setof public.auditoria language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select private.g_admin()) then raise exception 'Só o administrador vê a auditoria' using errcode = '42501'; end if;
  if p_ini is null or p_fim is null or p_fim < p_ini or p_fim - p_ini > 92 then
    raise exception 'Período inválido (máximo de 93 dias)' using errcode = '22023'; end if;
  return query
  select a.* from public.auditoria a
  where a.em >= (p_ini::timestamp at time zone 'America/Sao_Paulo') and a.em < ((p_fim + 1)::timestamp at time zone 'America/Sao_Paulo')
    and (p_email is null or a.email = lower(p_email))
    and (p_tipo is null or (p_tipo = 'acesso' and a.acao in ('entrou','abriu','saiu')) or (p_tipo = 'acao' and a.acao in ('criou','alterou','excluiu')))
  order by a.em desc limit 5000;
end $$;
revoke all on function public.auditoria_listar(date, date, text, text) from public, anon;
grant execute on function public.auditoria_listar(date, date, text, text) to authenticated;
