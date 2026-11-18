-- Produção (embalagem): metas por hora para Mesa e Máquina e leitura do desempenho por período.
-- Não altera bipagens, postos nem nada da Coleta.

-- meta = ondas embaladas por hora por pessoa; cada mudança vale a partir de um dia (o histórico de metas fica guardado)
create table public.prod_metas (
  id          bigint generated always as identity primary key,
  galpao_id   uuid not null references public.galpoes(id),
  atividade   text not null check (atividade in ('mesa', 'maquina')),
  por_hora    numeric(6,1) not null check (por_hora > 0 and por_hora <= 1000),
  inicio      date not null,
  criado_por  text not null,
  criado_em   timestamptz not null default now(),
  unique (galpao_id, atividade, inicio)
);
alter table public.prod_metas enable row level security;
create policy prod_metas_ler on public.prod_metas for select to anon, authenticated using (true);
revoke all on public.prod_metas from anon, authenticated;
grant select on public.prod_metas to anon, authenticated;

create function public.prod_meta_salvar(p_galpao uuid, p_atividade text, p_por_hora numeric, p_inicio date)
returns bigint language plpgsql security definer set search_path = '' as $$
declare em text := private.gestor_email(); hoje date := (now() at time zone 'America/Sao_Paulo')::date; v public.prod_metas; novo bigint;
begin
  if not ((select private.g_admin()) or ((select private.g_pode('config')) and p_galpao = (select private.g_galpao()))) then
    raise exception 'Sem permissão para alterar as metas da produção' using errcode = '42501'; end if;
  if p_atividade not in ('mesa', 'maquina') then raise exception 'Atividade inválida' using errcode = '22023'; end if;
  if p_por_hora is null or p_por_hora <= 0 or p_por_hora > 1000 then
    raise exception 'A meta precisa ser maior que zero e no máximo 1000 ondas por hora' using errcode = '22023'; end if;
  if p_inicio is null or p_inicio < hoje then
    raise exception 'A meta só pode valer a partir de hoje; os dias anteriores ficam com a meta da época' using errcode = '22023'; end if;
  select * into v from public.prod_metas where galpao_id = p_galpao and atividade = p_atividade and inicio = p_inicio;
  insert into public.prod_metas (galpao_id, atividade, por_hora, inicio, criado_por)
  values (p_galpao, p_atividade, round(p_por_hora, 1), p_inicio, em)
  on conflict (galpao_id, atividade, inicio) do update set por_hora = excluded.por_hora, criado_por = excluded.criado_por, criado_em = now()
  returning id into novo;
  insert into public.prod_auditoria (tabela, registro, acao, antes, depois, email)
  select 'prod_metas', novo::text, case when v.id is null then 'criar' else 'alterar' end, case when v.id is null then null else to_jsonb(v) end, to_jsonb(x), em
  from public.prod_metas x where x.id = novo;
  return novo;
end $$;

-- bipagens de um período para o desempenho (gestor; só as pessoas do próprio galpão, administrador vê todas)
create function public.prod_bipagens_periodo(p_ini date, p_fim date)
returns table (id uuid, pessoa_id uuid, codigo text, nome text, andar text, atividade text, turno_id smallint, dia date, bipada_em timestamptz, coletado boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if private.gestor_email() is null then raise exception 'Entre como gestor para ver o desempenho' using errcode = '42501'; end if;
  if p_ini is null or p_fim is null or p_fim < p_ini or p_fim - p_ini > 92 then
    raise exception 'Período inválido (máximo de 93 dias)' using errcode = '22023'; end if;
  return query
  select b.id, b.pessoa_id, p.codigo, p.nome, b.andar, b.atividade, b.turno_id, b.dia, b.bipada_em,
         exists (select 1 from public.ondas w where w.wn_norm = b.wn_norm)
  from public.prod_bipagens b join public.prod_pessoas p on p.id = b.pessoa_id
  where b.dia between p_ini and p_fim
    and ((select private.g_admin()) or p.galpao_id = (select private.g_galpao()))
  order by b.bipada_em limit 60000;
end $$;

revoke all on function public.prod_meta_salvar(uuid, text, numeric, date) from public, anon;
revoke all on function public.prod_bipagens_periodo(date, date) from public, anon;
grant execute on function public.prod_meta_salvar(uuid, text, numeric, date) to authenticated;
grant execute on function public.prod_bipagens_periodo(date, date) to authenticated;
