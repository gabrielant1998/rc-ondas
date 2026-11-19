-- Turnos da embalagem: sábado e domingo podem ter horário próprio (em branco = igual ao da semana).
alter table public.prod_turnos
  add column sab_entrada time, add column sab_saida time, add column dom_entrada time, add column dom_saida time,
  add constraint prod_turnos_sab_ck check (sab_saida is null or sab_entrada is not null),
  add constraint prod_turnos_dom_ck check (dom_saida is null or dom_entrada is not null);

drop function public.prod_turno_salvar(smallint, text, time, time, smallint[], time, time, boolean);
create function public.prod_turno_salvar(p_id smallint, p_nome text, p_entrada time, p_saida time,
  p_dias smallint[], p_int_ini time, p_int_fim time, p_ativo boolean,
  p_sab_entrada time default null, p_sab_saida time default null, p_dom_entrada time default null, p_dom_saida time default null)
returns smallint language plpgsql security definer set search_path = '' as $$
declare v public.prod_turnos; novo smallint; em text := private.gestor_email();
begin
  if not ((select private.g_admin()) or (select private.g_pode('config'))) then
    raise exception 'Sem permissão para alterar turnos' using errcode = '42501'; end if;
  if p_int_ini is not null and p_saida is not null and p_saida > p_entrada
     and not (p_int_ini >= p_entrada and p_int_fim <= p_saida and p_int_fim > p_int_ini) then
    raise exception 'O intervalo precisa ficar dentro do horário do turno' using errcode = '23514'; end if;
  if (p_sab_saida is not null and p_sab_entrada is null) or (p_dom_saida is not null and p_dom_entrada is null) then
    raise exception 'Informe a entrada do sábado ou do domingo, ou deixe os dois horários em branco' using errcode = '22023'; end if;
  if p_id is null then
    insert into public.prod_turnos (nome, entrada, saida, dias, int_ini, int_fim, ativo, sab_entrada, sab_saida, dom_entrada, dom_saida)
    values (btrim(p_nome), p_entrada, p_saida, coalesce(p_dias, array[1,2,3,4,5,6]::smallint[]), p_int_ini, p_int_fim, coalesce(p_ativo, true),
            p_sab_entrada, p_sab_saida, p_dom_entrada, p_dom_saida)
    returning id into novo;
    insert into public.prod_auditoria (tabela, registro, acao, depois, email)
    select 'prod_turnos', novo::text, 'criar', to_jsonb(t), em from public.prod_turnos t where t.id = novo;
    return novo;
  end if;
  select * into v from public.prod_turnos where id = p_id for update;
  if not found then raise exception 'Turno não encontrado' using errcode = '23503'; end if;
  update public.prod_turnos set nome = btrim(p_nome), entrada = p_entrada, saida = p_saida,
    dias = coalesce(p_dias, v.dias), int_ini = p_int_ini, int_fim = p_int_fim, ativo = coalesce(p_ativo, v.ativo), atualizado_em = now(),
    sab_entrada = p_sab_entrada, sab_saida = p_sab_saida, dom_entrada = p_dom_entrada, dom_saida = p_dom_saida
  where id = p_id;
  insert into public.prod_auditoria (tabela, registro, acao, antes, depois, email)
  select 'prod_turnos', p_id::text, 'alterar', to_jsonb(v), to_jsonb(t), em from public.prod_turnos t where t.id = p_id;
  return p_id;
end $$;
revoke all on function public.prod_turno_salvar(smallint, text, time, time, smallint[], time, time, boolean, time, time, time, time) from public, anon;
grant execute on function public.prod_turno_salvar(smallint, text, time, time, smallint[], time, time, boolean, time, time, time, time) to authenticated;

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
