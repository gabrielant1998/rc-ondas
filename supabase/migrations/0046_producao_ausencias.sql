-- Ausência do pessoal da embalagem: cadastro próprio (prod_pessoas), separado das ausências da Coleta.
alter table public.config add column motivos_ausencia_prod text[]
  not null default array['Ajudando na coleta','Reunião','Treinamento','Outra atividade']
  check (cardinality(motivos_ausencia_prod) between 1 and 30);

create table public.prod_ausencias (
  id uuid primary key,
  pessoa_id uuid not null references public.prod_pessoas(id) on delete cascade,
  galpao_id uuid references public.galpoes(id) on delete set null,
  motivo text not null check (length(motivo) between 1 and 60),
  inicio timestamptz not null,
  fim timestamptz check (fim is null or fim > inicio),
  criado_em timestamptz not null default now()
);
create index prod_ausencias_galpao_inicio_idx on public.prod_ausencias (galpao_id, inicio desc);
create index prod_ausencias_pessoa_idx on public.prod_ausencias (pessoa_id, inicio desc);
alter table public.prod_ausencias enable row level security;
create policy prod_ausencias_ler on public.prod_ausencias for select to authenticated
  using ((select private.g_admin()) or galpao_id = (select private.g_galpao()));
create policy prod_ausencias_excluir on public.prod_ausencias for delete to authenticated
  using (((select private.g_admin()) or (select private.g_pode('config')) or (select private.g_pode('registros')))
         and ((select private.g_admin()) or galpao_id = (select private.g_galpao())));
revoke all on public.prod_ausencias from anon, authenticated;
grant select, delete on public.prod_ausencias to authenticated;

create function public.prod_registrar_ausencia(p_id uuid, p_pessoa uuid, p_motivo text, p_inicio timestamptz, p_fim timestamptz default null)
returns text language plpgsql security definer set search_path = '' as $$
declare ps public.prod_pessoas; ms text[];
begin
  select * into ps from public.prod_pessoas where id = p_pessoa and excluido_em is null;
  if not found then raise exception 'Pessoa não encontrada na produção' using errcode = '23503'; end if;
  select motivos_ausencia_prod into ms from public.config limit 1;
  if p_motivo is null or not (p_motivo = any(ms)) then raise exception 'Motivo de ausência inválido' using errcode = '23514'; end if;
  if p_inicio is null or p_inicio > now() + interval '12 hours' or p_inicio < now() - interval '2 days' then
    raise exception 'Horário de início fora do intervalo aceito' using errcode = '23514'; end if;
  if p_fim is not null and (p_fim <= p_inicio or p_fim > p_inicio + interval '16 hours') then
    raise exception 'O retorno precisa ser depois da saída' using errcode = '23514'; end if;
  if exists (select 1 from public.prod_ausencias a where a.pessoa_id = ps.id and a.id <> p_id and a.fim is null and a.inicio >= now() - interval '2 days') then
    raise exception 'Esta pessoa já tem uma ausência em aberto. Registre a volta antes de lançar outra.' using errcode = '23505'; end if;
  insert into public.prod_ausencias (id, pessoa_id, galpao_id, motivo, inicio, fim)
  values (p_id, ps.id, ps.galpao_id, p_motivo, p_inicio, p_fim)
  on conflict (id) do nothing;
  return 'ok';
end $$;

create function public.prod_encerrar_ausencia(p_id uuid, p_fim timestamptz)
returns text language plpgsql security definer set search_path = '' as $$
declare a public.prod_ausencias;
begin
  select * into a from public.prod_ausencias where id = p_id;
  if not found then raise exception 'Ausência não encontrada' using errcode = '23503'; end if;
  if a.fim is not null then return 'ja_encerrada'; end if;
  if p_fim is null or p_fim <= a.inicio or p_fim > now() + interval '12 hours' or p_fim > a.inicio + interval '16 hours' then
    raise exception 'O retorno precisa ser depois da saída' using errcode = '23514'; end if;
  update public.prod_ausencias set fim = p_fim where id = p_id;
  return 'ok';
end $$;

create function public.prod_ausencias_dia(p_dia date)
returns table (id uuid, pessoa_id uuid, galpao_id uuid, motivo text, inicio timestamptz, fim timestamptz)
language sql stable security definer set search_path = '' as $$
  select a.id, a.pessoa_id, a.galpao_id, a.motivo, a.inicio, a.fim
  from public.prod_ausencias a
  where p_dia between current_date - 7 and current_date + 1
    and a.inicio >= (p_dia::timestamp at time zone 'America/Sao_Paulo')
    and a.inicio < ((p_dia + 1)::timestamp at time zone 'America/Sao_Paulo')
  order by a.inicio desc limit 1000
$$;

revoke all on function public.prod_registrar_ausencia(uuid, uuid, text, timestamptz, timestamptz) from public;
revoke all on function public.prod_encerrar_ausencia(uuid, timestamptz) from public;
revoke all on function public.prod_ausencias_dia(date) from public;
grant execute on function public.prod_registrar_ausencia(uuid, uuid, text, timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.prod_encerrar_ausencia(uuid, timestamptz) to anon, authenticated;
grant execute on function public.prod_ausencias_dia(date) to anon, authenticated;
