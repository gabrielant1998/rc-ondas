-- 1) Horário próprio por galpão. Formato por turno ("1" e "2"):
--    {"ini":7,"fim":16,"alm":{"ini":720,"fim":780},"pz":[{"n":"Café","i":540,"f":555}],"s":{"ini":7,"fim":12},"d":{"ini":8,"fim":12}}
--    ini/fim em horas; almoço e pausas em minutos do dia. Vazio = usa o horário geral de Configurações.
alter table public.galpoes add column horarios jsonb not null default '{}'::jsonb
  check (jsonb_typeof(horarios) = 'object' and pg_column_size(horarios) < 4000);

-- cadastro novo de operador pega o horário do galpão (ou o geral)
create or replace function private.operadores_turno_padrao() returns trigger
language plpgsql security definer set search_path = '' as $$
declare h jsonb;
begin
  if new.inicio is null or new.fim is null then
    select g.horarios -> (case when new.turno = 2 then '2' else '1' end) into h from public.galpoes g where g.id = new.galpao_id;
    select coalesce(new.inicio, (h ->> 'ini')::smallint, case when new.turno = 2 then c.turno2_ini else c.turno1_ini end),
           coalesce(new.fim,    (h ->> 'fim')::smallint, case when new.turno = 2 then c.turno2_fim else c.turno1_fim end)
      into new.inicio, new.fim
      from public.config c limit 1;
  end if;
  return new;
end $$;

-- 2) Motivos de ausência editáveis pelo gestor
alter table public.config add column motivos_ausencia text[] not null default array['Ajudando na Rua','Embalando']
  check (cardinality(motivos_ausencia) between 1 and 30);

-- 3) Ausências registradas na Operação (sem login)
create table public.ausencias (
  id uuid primary key,
  operador_id uuid not null references public.operadores(id) on delete cascade,
  galpao_id uuid references public.galpoes(id) on delete set null,
  motivo text not null check (length(motivo) between 1 and 60),
  inicio timestamptz not null,
  fim timestamptz check (fim is null or fim > inicio),
  criado_em timestamptz not null default now()
);
create index ausencias_galpao_inicio_idx on public.ausencias (galpao_id, inicio desc);
create index ausencias_operador_idx on public.ausencias (operador_id, inicio desc);
alter table public.ausencias enable row level security;
create policy ausencias_ler on public.ausencias for select to authenticated
  using ((select private.g_admin()) or galpao_id = (select private.g_galpao()));
create policy ausencias_excluir on public.ausencias for delete to authenticated
  using ((select private.g_pode('registros')) and ((select private.g_admin()) or galpao_id = (select private.g_galpao())));
revoke all on public.ausencias from anon;
grant select, delete on public.ausencias to authenticated;

create function public.registrar_ausencia(p_id uuid, p_operador uuid, p_motivo text, p_inicio timestamptz, p_fim timestamptz default null)
returns text language plpgsql security definer set search_path = '' as $$
declare op public.operadores; ms text[];
begin
  select * into op from public.operadores where id = p_operador and excluido_em is null;
  if not found then raise exception 'Pessoa não encontrada' using errcode = '23503'; end if;
  select motivos_ausencia into ms from public.config limit 1;
  if p_motivo is null or not (p_motivo = any(ms)) then raise exception 'Motivo de ausência inválido' using errcode = '23514'; end if;
  if p_inicio is null or p_inicio > now() + interval '12 hours' or p_inicio < now() - interval '2 days' then
    raise exception 'Horário de início fora do intervalo aceito' using errcode = '23514'; end if;
  if p_fim is not null and (p_fim <= p_inicio or p_fim > p_inicio + interval '16 hours') then
    raise exception 'O retorno precisa ser depois da saída' using errcode = '23514'; end if;
  insert into public.ausencias (id, operador_id, galpao_id, motivo, inicio, fim)
  values (p_id, op.id, op.galpao_id, p_motivo, p_inicio, p_fim)
  on conflict (id) do nothing;
  return 'ok';
end $$;

create function public.encerrar_ausencia(p_id uuid, p_fim timestamptz)
returns text language plpgsql security definer set search_path = '' as $$
declare a public.ausencias;
begin
  select * into a from public.ausencias where id = p_id;
  if not found then raise exception 'Ausência não encontrada' using errcode = '23503'; end if;
  if a.fim is not null then return 'ja_encerrada'; end if;
  if p_fim is null or p_fim <= a.inicio or p_fim > now() + interval '12 hours' or p_fim > a.inicio + interval '16 hours' then
    raise exception 'O retorno precisa ser depois da saída' using errcode = '23514'; end if;
  update public.ausencias set fim = p_fim where id = p_id;
  return 'ok';
end $$;

create function public.ausencias_publicas(p_dia date)
returns table (id uuid, operador_id uuid, galpao_id uuid, motivo text, inicio timestamptz, fim timestamptz)
language sql stable security definer set search_path = '' as $$
  select a.id, a.operador_id, a.galpao_id, a.motivo, a.inicio, a.fim
  from public.ausencias a
  where p_dia between current_date - 7 and current_date + 1
    and a.inicio >= (p_dia::timestamp at time zone 'America/Sao_Paulo')
    and a.inicio < ((p_dia + 1)::timestamp at time zone 'America/Sao_Paulo')
  order by a.inicio desc limit 1000
$$;

-- 4) Ondas do dia para o modo público (Operação: em andamento e concluídas), últimos 7 dias
create function public.ondas_publicas(p_dia date)
returns table (id uuid, wn text, operador_id uuid, galpao_id uuid, tipo text, quantidade integer, status smallint,
               registrada_em timestamptz, concluida_em timestamptz, encerrada_auto boolean, tempo_zerado boolean,
               procura_sku text, procura_local text, procura_nome text, procura_em timestamptz, procura_hist jsonb)
language sql stable security definer set search_path = '' as $$
  select w.id, w.wn, w.operador_id, w.galpao_id, w.tipo, w.quantidade, w.status, w.registrada_em, w.concluida_em,
         w.encerrada_auto, w.tempo_zerado, w.procura_sku, w.procura_local, w.procura_nome, w.procura_em, w.procura_hist
  from public.ondas w
  where p_dia between current_date - 7 and current_date + 1
    and w.registrada_em >= (p_dia::timestamp at time zone 'America/Sao_Paulo')
    and w.registrada_em < ((p_dia + 1)::timestamp at time zone 'America/Sao_Paulo')
  order by w.registrada_em limit 8000
$$;

revoke all on function public.registrar_ausencia(uuid, uuid, text, timestamptz, timestamptz) from public;
revoke all on function public.encerrar_ausencia(uuid, timestamptz) from public;
revoke all on function public.ausencias_publicas(date) from public;
revoke all on function public.ondas_publicas(date) from public;
grant execute on function public.registrar_ausencia(uuid, uuid, text, timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.encerrar_ausencia(uuid, timestamptz) to anon, authenticated;
grant execute on function public.ausencias_publicas(date) to anon, authenticated;
grant execute on function public.ondas_publicas(date) to anon, authenticated;
