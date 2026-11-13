-- Observação do gestor sobre o alerta de possível atraso de um dia.
-- Fica separada do primeiro bipe: o horário das ondas nunca é alterado por esta observação.
create table public.presenca_atrasos (
  id           uuid primary key default gen_random_uuid(),
  operador_id  uuid not null references public.operadores (id) on delete restrict,
  data         date not null,
  observacao   text check (observacao is null or length(observacao) <= 500),
  criado_por   text not null default coalesce(private.gestor_email(), 'sistema'),
  criado_em    timestamptz not null default now(),
  constraint presenca_atrasos_dia_uq unique (operador_id, data)
);

-- histórico: aceita também as alterações desta tabela
alter table public.presenca_historico drop constraint presenca_historico_tabela_check;
alter table public.presenca_historico add constraint presenca_historico_tabela_check
  check (tabela in ('presenca_registros', 'presenca_baixas', 'presenca_atrasos'));

create trigger presenca_atrasos_historico after update on public.presenca_atrasos
  for each row execute function private.presenca_registra_historico();

alter table public.presenca_atrasos enable row level security;
grant select, insert, update on public.presenca_atrasos to authenticated;

create policy presenca_atrasos_ler on public.presenca_atrasos for select to authenticated
  using ((select private.g_ve_operador(operador_id)));
create policy presenca_atrasos_criar on public.presenca_atrasos for insert to authenticated
  with check ((select private.g_pode_operador(operador_id, 'registros')));
create policy presenca_atrasos_alterar on public.presenca_atrasos for update to authenticated
  using ((select private.g_pode_operador(operador_id, 'registros')))
  with check ((select private.g_pode_operador(operador_id, 'registros')));
