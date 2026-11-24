-- Separação por galpão também no banco: gestor que não é administrador só vê e só registra pessoas do seu galpão.
-- Aparelho público (sem login) continua registrando para todos, como antes. Não altera nem apaga dados.
create function private.g_outro_galpao(p_galpao uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.gestor_email() is not null and not (select private.g_admin())
     and p_galpao is distinct from (select private.g_galpao())
$$;
revoke all on function private.g_outro_galpao(uuid) from public, anon;
grant execute on function private.g_outro_galpao(uuid) to authenticated;

-- leitura do cadastro: gestor comum só o do seu galpão (o público, sem login, segue vendo os ativos)
drop policy operadores_ler_gestor on public.operadores;
create policy operadores_ler_gestor on public.operadores for select to authenticated
  using ((select private.g_admin()) or galpao_id = (select private.g_galpao()));
drop policy prod_pessoas_ler_gestor on public.prod_pessoas;
create policy prod_pessoas_ler_gestor on public.prod_pessoas for select to authenticated
  using ((select private.g_admin()) or galpao_id = (select private.g_galpao()));

-- ondas: recusa operador de outro galpão quando quem envia é gestor comum
create or replace function private.ondas_antes_inserir()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare op public.operadores; lim integer;
begin
  select * into op from public.operadores where id = new.operador_id and excluido_em is null;
  if not found then raise exception 'Operador não encontrado ou excluído' using errcode = '23503'; end if;
  if private.g_outro_galpao(op.galpao_id) then
    raise exception '% é de outro galpão. Você só registra pessoas do seu galpão.', op.nome using errcode = '42501'; end if;
  new.galpao_id := op.galpao_id;
  select limite into lim from public.tipos_onda where nome = new.tipo;
  if lim is null then raise exception 'Tipo de onda inválido' using errcode = '23503'; end if;
  if new.quantidade > lim then
    raise exception 'Quantidade % acima do limite de % para %', new.quantidade, lim, new.tipo using errcode = '23514';
  end if;
  if new.registrada_em > now() + interval '10 minutes' or new.registrada_em < now() - interval '45 days' then
    raise exception 'Data de registro fora do intervalo aceito' using errcode = '23514';
  end if;
  new.criada_em := now();
  return new;
end $function$;

create or replace function public.registrar_ausencia(p_id uuid, p_operador uuid, p_motivo text, p_inicio timestamptz, p_fim timestamptz default null)
returns text language plpgsql security definer set search_path = '' as $function$
declare op public.operadores; ms text[];
begin
  select * into op from public.operadores where id = p_operador and excluido_em is null;
  if not found then raise exception 'Pessoa não encontrada' using errcode = '23503'; end if;
  if private.g_outro_galpao(op.galpao_id) then raise exception 'Essa pessoa é de outro galpão' using errcode = '42501'; end if;
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
end $function$;

create or replace function public.prod_registrar_ausencia(p_id uuid, p_pessoa uuid, p_motivo text, p_inicio timestamptz, p_fim timestamptz default null)
returns text language plpgsql security definer set search_path = '' as $$
declare ps public.prod_pessoas; ms text[];
begin
  select * into ps from public.prod_pessoas where id = p_pessoa and excluido_em is null;
  if not found then raise exception 'Pessoa não encontrada na produção' using errcode = '23503'; end if;
  if private.g_outro_galpao(ps.galpao_id) then raise exception 'Essa pessoa é de outro galpão' using errcode = '42501'; end if;
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

create or replace function public.registrar_embalagens(lote jsonb)
returns table (id uuid, resultado text, detalhe text, coletado boolean, presenca_nova boolean, andar text, atividade text)
language plpgsql security definer set search_path = '' as $$
declare o jsonb; ps public.prod_pessoas; a public.prod_atribuicoes; t public.prod_turnos; quando timestamptz; loc timestamp;
        ent time; sai time; d date; n integer; wn_n text; qtd integer; wn_t text; orig text;
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
      qtd := null;
      if o ? 'quantidade' and jsonb_typeof(o -> 'quantidade') <> 'null' then
        if jsonb_typeof(o -> 'quantidade') <> 'number' or (o ->> 'quantidade') !~ '^[0-9]{1,4}$' or (o ->> 'quantidade')::integer not between 1 and 5000 then
          resultado := 'recusada'; detalhe := 'A quantidade precisa ser um número inteiro de 1 a 5000'; return next; continue; end if;
        qtd := (o ->> 'quantidade')::integer;
      end if;
      -- lançamento só de quantidade: sem número de onda; o identificador vira o código interno
      wn_t := case when qtd is null then btrim(o ->> 'wn') else 'QTD' || replace(id::text, '-', '') end;
      orig := case when qtd is null then 'bipagem' else 'quantidade' end;
      if coalesce(length(wn_t), 0) not between 1 and 40 then
        resultado := 'recusada'; detalhe := 'Número da onda inválido'; return next; continue; end if;
      select * into ps from public.prod_pessoas x where x.id = (o ->> 'pessoa_id')::uuid and x.excluido_em is null;
      if not found then resultado := 'recusada'; detalhe := 'Pessoa não encontrada na produção'; return next; continue; end if;
      if private.g_outro_galpao(ps.galpao_id) then resultado := 'recusada'; detalhe := ps.nome || ' é de outro galpão. Você só registra pessoas do seu galpão.'; return next; continue; end if;
      select * into a from public.prod_atribuicoes x
       where x.pessoa_id = ps.id and x.inicio <= quando and (x.fim is null or x.fim > quando)
       order by x.inicio desc limit 1;
      if not found or a.situacao <> 'ativo' then
        resultado := 'sem_posto'; detalhe := ps.nome || ' ainda não tem posto na produção. Fale com o gestor.'; return next; continue; end if;
      select * into t from public.prod_turnos x where x.id = a.turno_id;
      andar := a.andar; atividade := a.atividade;
      loc := quando at time zone 'America/Sao_Paulo';
      -- horário do dia: individual da pessoa, senão o do sábado/domingo do turno (se houver), senão o da semana
      if a.entrada is not null then ent := a.entrada; sai := a.saida;
      elsif extract(dow from loc)::int = 6 and t.sab_entrada is not null then ent := t.sab_entrada; sai := t.sab_saida;
      elsif extract(dow from loc)::int = 0 and t.dom_entrada is not null then ent := t.dom_entrada; sai := t.dom_saida;
      else ent := t.entrada; sai := t.saida; end if;
      d := loc::date;
      if sai is not null and sai <= ent and loc::time < sai then d := d - 1; end if;
      wn_n := public.normaliza_wn(wn_t);
      coletado := case when qtd is null then exists (select 1 from public.ondas w where w.wn_norm = wn_n) else false end;
      insert into public.prod_bipagens (id, wn, pessoa_id, galpao_id, atribuicao_id, andar, atividade, turno_id, dia, bipada_em, quantidade, origem)
      values (id, wn_t, ps.id, ps.galpao_id, a.id, a.andar, a.atividade, a.turno_id, d, quando, coalesce(qtd, 1), orig)
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
