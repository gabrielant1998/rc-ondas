-- Produção com cadastro de pessoas próprio: quem embala não é o mesmo pessoal da Coleta.
-- As tabelas da Produção estavam vazias quando esta migração foi aplicada; o cadastro da Coleta (operadores) não é tocado.

create table public.prod_pessoas (
  id          uuid primary key default gen_random_uuid(),
  codigo      text not null check (codigo ~ '^[A-Z0-9]{2,12}$'),
  nome        text not null check (length(btrim(nome)) between 2 and 80),
  galpao_id   uuid not null references public.galpoes(id),
  excluido_em timestamptz,
  criado_por  text not null,
  criado_em   timestamptz not null default now()
);
create unique index prod_pessoas_codigo_uq on public.prod_pessoas (codigo) where excluido_em is null;
create index prod_pessoas_galpao_idx on public.prod_pessoas (galpao_id);
alter table public.prod_pessoas enable row level security;
create policy prod_pessoas_ler_publico on public.prod_pessoas for select to anon using (excluido_em is null);
create policy prod_pessoas_ler_gestor on public.prod_pessoas for select to authenticated
  using (excluido_em is null or (select private.g_admin()) or galpao_id = (select private.g_galpao()));
revoke all on public.prod_pessoas from anon, authenticated;
grant select on public.prod_pessoas to anon, authenticated;

create function private.g_ve_pessoa(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select private.g_admin()) or exists (select 1 from public.prod_pessoas x where x.id = p and x.galpao_id = (select private.g_galpao()))
$$;
revoke all on function private.g_ve_pessoa(uuid) from public;
grant execute on function private.g_ve_pessoa(uuid) to authenticated;

-- trocar a ligação das tabelas da Produção: operadores (Coleta) -> prod_pessoas
drop policy prod_atribuicoes_ler on public.prod_atribuicoes;
drop policy prod_bipagens_ler on public.prod_bipagens;
drop policy prod_presenca_ler on public.prod_presenca;
drop function public.prod_atribuir(uuid, text, text, smallint, time, time, text, timestamptz);
drop function public.prod_postos();
drop function public.registrar_embalagens(jsonb);
drop function public.prod_bipagens_dia(date);

alter table public.prod_atribuicoes drop constraint prod_atribuicoes_operador_id_fkey;
alter table public.prod_atribuicoes rename column operador_id to pessoa_id;
alter table public.prod_atribuicoes add constraint prod_atribuicoes_pessoa_id_fkey foreign key (pessoa_id) references public.prod_pessoas(id);
alter index public.prod_atribuicoes_aberta_uq rename to prod_atribuicoes_pessoa_aberta_uq;
alter index public.prod_atribuicoes_operador_idx rename to prod_atribuicoes_pessoa_idx;

alter table public.prod_bipagens drop constraint prod_bipagens_operador_id_fkey;
alter table public.prod_bipagens rename column operador_id to pessoa_id;
alter table public.prod_bipagens add constraint prod_bipagens_pessoa_id_fkey foreign key (pessoa_id) references public.prod_pessoas(id);
alter index public.prod_bipagens_operador_idx rename to prod_bipagens_pessoa_idx;

alter table public.prod_presenca drop constraint prod_presenca_operador_id_fkey;
alter table public.prod_presenca rename column operador_id to pessoa_id;
alter table public.prod_presenca add constraint prod_presenca_pessoa_id_fkey foreign key (pessoa_id) references public.prod_pessoas(id);

create policy prod_atribuicoes_ler on public.prod_atribuicoes for select to authenticated using ((select private.g_ve_pessoa(pessoa_id)));
create policy prod_bipagens_ler on public.prod_bipagens for select to authenticated using ((select private.g_ve_pessoa(pessoa_id)));
create policy prod_presenca_ler on public.prod_presenca for select to authenticated using ((select private.g_ve_pessoa(pessoa_id)));

-- cadastro (gestor com permissão de configuração do galpão, ou administrador)
create function public.prod_pessoa_salvar(p_id uuid, p_codigo text, p_nome text, p_galpao uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v public.prod_pessoas; novo uuid; em text := private.gestor_email(); c text := upper(regexp_replace(coalesce(p_codigo, ''), '\s+', '', 'g'));
begin
  if p_id is null then
    if not ((select private.g_admin()) or ((select private.g_pode('config')) and p_galpao = (select private.g_galpao()))) then
      raise exception 'Sem permissão para cadastrar pessoas da produção' using errcode = '42501'; end if;
    if exists (select 1 from public.prod_pessoas where codigo = c and excluido_em is null) then
      raise exception 'O código % já está em uso na produção', c using errcode = '23505'; end if;
    insert into public.prod_pessoas (codigo, nome, galpao_id, criado_por) values (c, btrim(p_nome), p_galpao, em) returning id into novo;
    insert into public.prod_auditoria (tabela, registro, acao, depois, email)
    select 'prod_pessoas', novo::text, 'criar', to_jsonb(x), em from public.prod_pessoas x where x.id = novo;
    return novo;
  end if;
  select * into v from public.prod_pessoas where id = p_id and excluido_em is null for update;
  if not found then raise exception 'Pessoa não encontrada' using errcode = '23503'; end if;
  if not ((select private.g_admin()) or ((select private.g_pode('config')) and v.galpao_id = (select private.g_galpao()))) then
    raise exception 'Sem permissão para alterar esta pessoa' using errcode = '42501'; end if;
  if exists (select 1 from public.prod_pessoas where codigo = c and excluido_em is null and id <> p_id) then
    raise exception 'O código % já está em uso na produção', c using errcode = '23505'; end if;
  update public.prod_pessoas set codigo = c, nome = btrim(p_nome) where id = p_id;
  insert into public.prod_auditoria (tabela, registro, acao, antes, depois, email)
  select 'prod_pessoas', p_id::text, 'alterar', to_jsonb(v), to_jsonb(x), em from public.prod_pessoas x where x.id = p_id;
  return p_id;
end $$;

-- remover da produção: o cadastro fica marcado como excluído e o histórico continua
create function public.prod_pessoa_excluir(p_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v public.prod_pessoas; em text := private.gestor_email();
begin
  select * into v from public.prod_pessoas where id = p_id and excluido_em is null for update;
  if not found then raise exception 'Pessoa não encontrada' using errcode = '23503'; end if;
  if not ((select private.g_admin()) or ((select private.g_pode('config')) and v.galpao_id = (select private.g_galpao()))) then
    raise exception 'Sem permissão para remover esta pessoa' using errcode = '42501'; end if;
  update public.prod_atribuicoes set fim = now() where pessoa_id = p_id and fim is null and inicio < now();
  delete from public.prod_atribuicoes a where a.pessoa_id = p_id and a.fim is null
    and not exists (select 1 from public.prod_bipagens b where b.atribuicao_id = a.id);
  update public.prod_pessoas set excluido_em = now() where id = p_id;
  insert into public.prod_auditoria (tabela, registro, acao, antes, email) values ('prod_pessoas', p_id::text, 'excluir', to_jsonb(v), em);
  return 'ok';
end $$;

create function public.prod_atribuir(p_pessoa uuid, p_andar text, p_atividade text, p_turno smallint,
  p_entrada time, p_saida time, p_situacao text, p_desde timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
declare ps public.prod_pessoas; atual public.prod_atribuicoes; novo uuid; em text := private.gestor_email(); d timestamptz := coalesce(p_desde, now());
begin
  select * into ps from public.prod_pessoas where id = p_pessoa and excluido_em is null for update;
  if not found then raise exception 'Pessoa não encontrada' using errcode = '23503'; end if;
  if not ((select private.g_admin()) or ((select private.g_pode('config')) and ps.galpao_id = (select private.g_galpao()))) then
    raise exception 'Sem permissão para distribuir esta pessoa' using errcode = '42501'; end if;
  if not exists (select 1 from public.prod_turnos where id = p_turno) then
    raise exception 'Turno não encontrado' using errcode = '23503'; end if;
  if (p_entrada is null) <> (p_saida is null) then
    raise exception 'Informe entrada e saída do horário individual, ou deixe os dois em branco' using errcode = '23514'; end if;
  if d > now() + interval '60 days' or d < now() - interval '2 days' then
    raise exception 'A data de início precisa estar entre 2 dias atrás e 60 dias à frente' using errcode = '23514'; end if;
  select * into atual from public.prod_atribuicoes where pessoa_id = p_pessoa and fim is null;
  if found then
    if d <= atual.inicio then
      if exists (select 1 from public.prod_bipagens b where b.atribuicao_id = atual.id) then
        raise exception 'Já existem bipagens nesta distribuição. A mudança precisa começar depois de %', to_char(atual.inicio at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') using errcode = '23514'; end if;
      insert into public.prod_auditoria (tabela, registro, acao, antes, email) values ('prod_atribuicoes', atual.id::text, 'substituir', to_jsonb(atual), em);
      delete from public.prod_atribuicoes where id = atual.id;
    else
      update public.prod_atribuicoes set fim = d where id = atual.id;
      insert into public.prod_auditoria (tabela, registro, acao, antes, email) values ('prod_atribuicoes', atual.id::text, 'encerrar', to_jsonb(atual), em);
    end if;
  end if;
  insert into public.prod_atribuicoes (pessoa_id, andar, atividade, turno_id, entrada, saida, situacao, inicio, criado_por)
  values (p_pessoa, p_andar, p_atividade, p_turno, p_entrada, p_saida, coalesce(p_situacao, 'ativo'), d, coalesce(em, 'sistema'))
  returning id into novo;
  insert into public.prod_auditoria (tabela, registro, acao, depois, email)
  select 'prod_atribuicoes', novo::text, 'criar', to_jsonb(a), coalesce(em, 'sistema') from public.prod_atribuicoes a where a.id = novo;
  return novo;
end $$;

create function public.prod_postos()
returns table (pessoa_id uuid, andar text, atividade text, turno_id smallint, entrada time, saida time, situacao text, inicio timestamptz)
language sql stable security definer set search_path = '' as $$
  select a.pessoa_id, a.andar, a.atividade, a.turno_id, a.entrada, a.saida, a.situacao, a.inicio
  from public.prod_atribuicoes a join public.prod_pessoas p on p.id = a.pessoa_id and p.excluido_em is null
  where a.fim is null limit 2000
$$;

-- resultado: ok | ja_existia | wn_repetido | sem_posto | recusada
create function public.registrar_embalagens(lote jsonb)
returns table (id uuid, resultado text, detalhe text, coletado boolean, presenca_nova boolean, andar text, atividade text)
language plpgsql security definer set search_path = '' as $$
declare o jsonb; ps public.prod_pessoas; a public.prod_atribuicoes; t public.prod_turnos; quando timestamptz; loc timestamp;
        ent time; sai time; d date; n integer; wn_n text;
begin
  if jsonb_typeof(lote) <> 'array' or jsonb_array_length(lote) > 200 then
    raise exception 'Envie uma lista com até 200 bipagens' using errcode = '22023'; end if;
  for o in select * from jsonb_array_elements(lote) loop
    id := null; detalhe := null; coletado := null; presenca_nova := false; andar := null; atividade := null;
    begin
      id := (o ->> 'id')::uuid;
      quando := (o ->> 'bipada_em')::timestamptz;
      if quando is null or quando > now() + interval '5 minutes' or quando < now() - interval '2 days' then
        resultado := 'recusada'; detalhe := 'Horário da bipagem fora do intervalo aceito'; return next; continue; end if;
      if coalesce(length(btrim(o ->> 'wn')), 0) not between 1 and 40 then
        resultado := 'recusada'; detalhe := 'Número da onda inválido'; return next; continue; end if;
      select * into ps from public.prod_pessoas x where x.id = (o ->> 'pessoa_id')::uuid and x.excluido_em is null;
      if not found then resultado := 'recusada'; detalhe := 'Pessoa não encontrada na produção'; return next; continue; end if;
      select * into a from public.prod_atribuicoes x
       where x.pessoa_id = ps.id and x.inicio <= quando and (x.fim is null or x.fim > quando)
       order by x.inicio desc limit 1;
      if not found or a.situacao <> 'ativo' then
        resultado := 'sem_posto'; detalhe := ps.nome || ' ainda não tem posto na produção. Fale com o gestor.'; return next; continue; end if;
      select * into t from public.prod_turnos x where x.id = a.turno_id;
      andar := a.andar; atividade := a.atividade;
      loc := quando at time zone 'America/Sao_Paulo';
      ent := coalesce(a.entrada, t.entrada); sai := coalesce(a.saida, t.saida);
      d := loc::date;
      if sai is not null and sai <= ent and loc::time < sai then d := d - 1; end if;
      wn_n := public.normaliza_wn(o ->> 'wn');
      coletado := exists (select 1 from public.ondas w where w.wn_norm = wn_n);
      insert into public.prod_bipagens (id, wn, pessoa_id, galpao_id, atribuicao_id, andar, atividade, turno_id, dia, bipada_em)
      values (id, btrim(o ->> 'wn'), ps.id, ps.galpao_id, a.id, a.andar, a.atividade, a.turno_id, d, quando)
      on conflict on constraint prod_bipagens_pkey do nothing;
      get diagnostics n = row_count;
      if n = 0 then
        if exists (select 1 from public.prod_bipagens b where b.id = (o ->> 'id')::uuid and b.pessoa_id = ps.id) then
          resultado := 'ja_existia';
        else resultado := 'recusada'; detalhe := 'Identificador já usado por outra bipagem'; end if;
        return next; continue; end if;
      insert into public.prod_presenca (pessoa_id, dia, primeira_id, primeira_em, turno_id, andar, atividade)
      values (ps.id, d, id, quando, a.turno_id, a.andar, a.atividade)
      on conflict (pessoa_id, dia) do nothing;
      get diagnostics n = row_count;
      presenca_nova := n = 1;
      resultado := 'ok';
    exception
      when unique_violation then
        resultado := 'wn_repetido';
        detalhe := 'A onda ' || coalesce(o ->> 'wn', '') || ' já foi embalada na ' || case atividade when 'maquina' then 'Máquina' else 'Mesa' end;
      when others then resultado := 'recusada'; detalhe := sqlerrm;
    end;
    return next;
  end loop;
end $$;

create function public.prod_bipagens_dia(p_dia date)
returns table (id uuid, wn text, pessoa_id uuid, andar text, atividade text, turno_id smallint, bipada_em timestamptz, coletado boolean)
language sql stable security definer set search_path = '' as $$
  select b.id, b.wn, b.pessoa_id, b.andar, b.atividade, b.turno_id, b.bipada_em,
         exists (select 1 from public.ondas w where w.wn_norm = b.wn_norm)
  from public.prod_bipagens b
  where p_dia between current_date - 7 and current_date + 1 and b.dia = p_dia
  order by b.bipada_em desc limit 8000
$$;

revoke all on function public.prod_pessoa_salvar(uuid, text, text, uuid) from public, anon;
revoke all on function public.prod_pessoa_excluir(uuid) from public, anon;
revoke all on function public.prod_atribuir(uuid, text, text, smallint, time, time, text, timestamptz) from public, anon;
revoke all on function public.prod_postos() from public;
revoke all on function public.registrar_embalagens(jsonb) from public;
revoke all on function public.prod_bipagens_dia(date) from public;
grant execute on function public.prod_pessoa_salvar(uuid, text, text, uuid) to authenticated;
grant execute on function public.prod_pessoa_excluir(uuid) to authenticated;
grant execute on function public.prod_atribuir(uuid, text, text, smallint, time, time, text, timestamptz) to authenticated;
grant execute on function public.prod_postos() to anon, authenticated;
grant execute on function public.registrar_embalagens(jsonb) to anon, authenticated;
grant execute on function public.prod_bipagens_dia(date) to anon, authenticated;
