-- Gestão de presença: falta injustificada, declaração, atestado, folga e baixa de cada pessoa.
-- Nada disso é calculado sozinho: quem lança é o gestor. Correções são feitas cancelando e lançando de novo,
-- e toda alteração fica em presenca_historico.

create table public.presenca_registros (
  id            uuid primary key default gen_random_uuid(),
  operador_id   uuid not null references public.operadores (id) on delete restrict,
  tipo          text not null check (tipo in ('falta', 'declaracao', 'atestado', 'folga')),
  data_ini      date not null,
  data_fim      date not null,
  horario_ini   time,                       -- só para declaração, opcional (justifica parte do dia)
  horario_fim   time,
  observacao    text check (observacao is null or length(observacao) <= 500),
  criado_por    text not null default coalesce(private.gestor_email(), 'sistema'),
  criado_em     timestamptz not null default now(),
  cancelado_em  timestamptz,
  constraint presenca_registros_datas_ck check (data_fim >= data_ini),
  constraint presenca_registros_falta_ck check (tipo <> 'falta' or data_fim = data_ini),
  constraint presenca_registros_horario_ck check (horario_ini is null or horario_fim is null or horario_fim > horario_ini
    or tipo <> 'declaracao')
);
create index presenca_registros_operador_idx on public.presenca_registros (operador_id, data_ini, data_fim);

create table public.presenca_baixas (
  id           uuid primary key default gen_random_uuid(),
  operador_id  uuid not null references public.operadores (id) on delete restrict,
  data         date not null,
  saida        timestamptz not null,       -- horário em que a pessoa encerrou as atividades
  criado_por   text not null default coalesce(private.gestor_email(), 'sistema'),
  criado_em    timestamptz not null default now(),
  constraint presenca_baixas_dia_uq unique (operador_id, data)   -- uma baixa por pessoa e dia: evita duplicar
);

create table public.presenca_historico (
  id             bigint generated always as identity primary key,
  tabela         text not null check (tabela in ('presenca_registros', 'presenca_baixas')),
  registro_id    uuid not null,
  operador_id    uuid not null references public.operadores (id) on delete restrict,
  campo          text not null,
  valor_anterior text,
  valor_novo     text,
  email          text not null,
  alterado_em    timestamptz not null default now()
);
create index presenca_historico_operador_idx on public.presenca_historico (operador_id, alterado_em desc);

-- quem gerencia o galpão da pessoa (admin gerencia tudo)
create function private.g_pode_operador(p_operador uuid, perm text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select private.g_admin())
      or ((select private.g_pode(perm))
          and exists (select 1 from public.operadores o
                      where o.id = p_operador and o.galpao_id = (select private.g_galpao())))
$$;
revoke all on function private.g_pode_operador(uuid, text) from public;
grant execute on function private.g_pode_operador(uuid, text) to anon, authenticated;

create function private.g_ve_operador(p_operador uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select private.g_admin())
      or exists (select 1 from public.operadores o
                 where o.id = p_operador and o.galpao_id = (select private.g_galpao()))
$$;
revoke all on function private.g_ve_operador(uuid) from public;
grant execute on function private.g_ve_operador(uuid) to anon, authenticated;

-- histórico genérico: grava cada coluna que mudou (quem, quando, de quanto para quanto)
create function private.presenca_registra_historico() returns trigger
language plpgsql security definer set search_path = '' as $$
declare k text; ov jsonb := to_jsonb(old); nv jsonb := to_jsonb(new);
begin
  for k in select jsonb_object_keys(nv) loop
    if k in ('id', 'criado_em', 'criado_por', 'operador_id') then continue; end if;
    if ov->k is distinct from nv->k then
      insert into public.presenca_historico (tabela, registro_id, operador_id, campo, valor_anterior, valor_novo, email)
      values (tg_table_name, new.id, new.operador_id, k, ov->>k, nv->>k,
              coalesce(private.gestor_email(), 'sistema'));
    end if;
  end loop;
  return new;
end $$;
revoke all on function private.presenca_registra_historico() from public;

create trigger presenca_registros_historico after update on public.presenca_registros
  for each row execute function private.presenca_registra_historico();
create trigger presenca_baixas_historico after update on public.presenca_baixas
  for each row execute function private.presenca_registra_historico();

-- permissões: leitura pelo galpão; escrita exige pode_registros
alter table public.presenca_registros enable row level security;
alter table public.presenca_baixas    enable row level security;
alter table public.presenca_historico enable row level security;

grant select, insert, update on public.presenca_registros, public.presenca_baixas to authenticated;
grant select on public.presenca_historico to authenticated;

create policy presenca_registros_ler on public.presenca_registros for select to authenticated
  using ((select private.g_ve_operador(operador_id)));
create policy presenca_registros_criar on public.presenca_registros for insert to authenticated
  with check ((select private.g_pode_operador(operador_id, 'registros')));
create policy presenca_registros_alterar on public.presenca_registros for update to authenticated
  using ((select private.g_pode_operador(operador_id, 'registros')))
  with check ((select private.g_pode_operador(operador_id, 'registros')));

create policy presenca_baixas_ler on public.presenca_baixas for select to authenticated
  using ((select private.g_ve_operador(operador_id)));
create policy presenca_baixas_criar on public.presenca_baixas for insert to authenticated
  with check ((select private.g_pode_operador(operador_id, 'registros')));
create policy presenca_baixas_alterar on public.presenca_baixas for update to authenticated
  using ((select private.g_pode_operador(operador_id, 'registros')))
  with check ((select private.g_pode_operador(operador_id, 'registros')));

create policy presenca_historico_ler on public.presenca_historico for select to authenticated
  using ((select private.g_ve_operador(operador_id)));
