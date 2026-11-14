-- Paradas da operação (falta de energia, sistema fora do ar, urgência...): o gestor registra
-- o dia, o horário e o motivo. O tempo parado não conta como pausa nem como atraso de ninguém.
create table public.paradas (
  id uuid primary key default gen_random_uuid(),
  galpao_id uuid references public.galpoes(id) on delete cascade,  -- nulo = todos os galpões
  dia date not null,
  inicio smallint not null check (inicio between 0 and 1439),
  fim smallint not null check (fim between 1 and 1440),
  motivo text not null check (char_length(motivo) between 1 and 60),
  observacao text check (observacao is null or char_length(observacao) <= 300),
  urgente boolean not null default false,
  criado_por text not null default coalesce(auth.jwt() ->> 'email', ''),
  criado_em timestamptz not null default now(),
  check (fim > inicio)
);
create index paradas_dia_idx on public.paradas (dia desc);
alter table public.paradas enable row level security;

create policy paradas_ler on public.paradas for select to authenticated
  using ((select private.g_admin()) or galpao_id is null or galpao_id = (select private.g_galpao()));
create policy paradas_criar on public.paradas for insert to authenticated
  with check (((select private.g_pode('config')) or (select private.g_pode('individual')))
              and ((select private.g_admin()) or galpao_id = (select private.g_galpao())));
create policy paradas_excluir on public.paradas for delete to authenticated
  using (((select private.g_pode('config')) or (select private.g_pode('individual')))
         and ((select private.g_admin()) or galpao_id = (select private.g_galpao())));

revoke all on public.paradas from anon;
grant select, insert, delete on public.paradas to authenticated;

-- Quem registrou vem sempre do login (o aplicativo não consegue escolher outro nome).
create function private.paradas_autor() returns trigger language plpgsql set search_path = '' as $$
begin new.criado_por := coalesce(auth.jwt() ->> 'email', ''); new.criado_em := now(); return new; end $$;
create trigger paradas_autor before insert on public.paradas for each row execute function private.paradas_autor();
