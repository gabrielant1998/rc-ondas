-- Sincronização incremental das ondas: o aplicativo baixa só o que mudou desde a última vez.
-- 1) atualizado_em em cada onda (inserção e qualquer alteração)
alter table public.ondas add column atualizado_em timestamptz not null default now();
create index ondas_atualizado_idx on public.ondas (atualizado_em);

create function private.ondas_toca() returns trigger language plpgsql set search_path = '' as $$
begin new.atualizado_em := now(); return new; end $$;
create trigger ondas_toca before insert or update on public.ondas for each row execute function private.ondas_toca();

-- 2) registro de ondas excluídas (só o id), para os aparelhos removerem da cópia local
create table public.ondas_excluidas (
  id uuid primary key,
  galpao_id uuid,
  excluida_em timestamptz not null default now()
);
create index ondas_excluidas_em_idx on public.ondas_excluidas (excluida_em);
alter table public.ondas_excluidas enable row level security;
create policy ondas_excluidas_ler on public.ondas_excluidas for select to authenticated
  using ((select private.g_admin()) or galpao_id = (select private.g_galpao()));
revoke all on public.ondas_excluidas from anon;
grant select on public.ondas_excluidas to authenticated;

create function private.ondas_registra_exclusao() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.ondas_excluidas (id, galpao_id) values (old.id, old.galpao_id)
    on conflict (id) do update set excluida_em = now();
  delete from public.ondas_excluidas where excluida_em < now() - interval '45 days';
  return old;
end $$;
create trigger ondas_registra_exclusao after delete on public.ondas for each row execute function private.ondas_registra_exclusao();
