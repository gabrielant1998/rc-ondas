-- Turno por pessoa: cada operador passa a ter horário de início e de término próprios.
-- Os valores atuais são copiados do turno do cadastro (config), para preservar o que já está registrado.
alter table public.operadores
  add column inicio smallint check (inicio between 0 and 23),
  add column fim    smallint check (fim between 1 and 24);

update public.operadores o
   set inicio = case when o.turno = 2 then c.turno2_ini else c.turno1_ini end,
       fim    = case when o.turno = 2 then c.turno2_fim else c.turno1_fim end
  from public.config c
 where o.inicio is null;

alter table public.operadores
  alter column inicio set not null,
  alter column fim    set not null;

-- histórico: cada mudança de início ou término fica registrada com valor anterior, novo e quem alterou
create table public.presenca_alteracoes (
  id             bigint generated always as identity primary key,
  operador_id    uuid not null references public.operadores (id) on delete restrict,
  campo          text not null check (campo in ('inicio', 'fim')),
  valor_anterior smallint,
  valor_novo     smallint not null,
  email          text not null,
  alterado_em    timestamptz not null default now()
);
create index presenca_alteracoes_operador_idx on public.presenca_alteracoes (operador_id, alterado_em desc);

alter table public.presenca_alteracoes enable row level security;
grant select on public.presenca_alteracoes to authenticated;

-- mesma regra de leitura dos operadores: admin lê tudo, gestor lê o próprio galpão
create policy presenca_alteracoes_ler on public.presenca_alteracoes for select to authenticated
  using ((select private.g_admin()) or operador_id in (
    select o.id from public.operadores o where o.galpao_id = (select private.g_galpao())));

create function private.operadores_registra_turno() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.inicio is distinct from old.inicio then
    insert into public.presenca_alteracoes (operador_id, campo, valor_anterior, valor_novo, email)
    values (new.id, 'inicio', old.inicio, new.inicio, coalesce(private.gestor_email(), 'sistema'));
  end if;
  if new.fim is distinct from old.fim then
    insert into public.presenca_alteracoes (operador_id, campo, valor_anterior, valor_novo, email)
    values (new.id, 'fim', old.fim, new.fim, coalesce(private.gestor_email(), 'sistema'));
  end if;
  return new;
end $$;
revoke all on function private.operadores_registra_turno() from public;

create trigger operadores_turno_historico after update of inicio, fim on public.operadores
  for each row when (old.inicio is distinct from new.inicio or old.fim is distinct from new.fim)
  execute function private.operadores_registra_turno();
