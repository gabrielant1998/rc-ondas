-- Produção (embalagem): lançamento só da quantidade de embalagens que a pessoa fez, sem bipar cada onda.
-- Guarda em prod_bipagens (origem 'quantidade', quantidade N): presença, posto e turno funcionam como numa bipagem.
-- Não altera bipagens já feitas (quantidade = 1 para elas) nem nada da Coleta.
alter table public.prod_bipagens add column quantidade integer not null default 1 check (quantidade between 1 and 5000);

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
      ent := coalesce(a.entrada, t.entrada); sai := coalesce(a.saida, t.saida);
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

drop function public.prod_bipagens_dia(date);
create function public.prod_bipagens_dia(p_dia date)
returns table (id uuid, wn text, pessoa_id uuid, andar text, atividade text, turno_id smallint, bipada_em timestamptz, coletado boolean, quantidade integer, origem text)
language sql stable security definer set search_path = '' as $$
  select b.id, b.wn, b.pessoa_id, b.andar, b.atividade, b.turno_id, b.bipada_em,
         exists (select 1 from public.ondas w where w.wn_norm = b.wn_norm), b.quantidade, b.origem
  from public.prod_bipagens b
  where p_dia between current_date - 7 and current_date + 1 and b.dia = p_dia
  order by b.bipada_em desc limit 8000
$$;
revoke all on function public.prod_bipagens_dia(date) from public;
grant execute on function public.prod_bipagens_dia(date) to anon, authenticated;

drop function public.prod_bipagens_periodo(date, date);
create function public.prod_bipagens_periodo(p_ini date, p_fim date)
returns table (id uuid, pessoa_id uuid, codigo text, nome text, andar text, atividade text, turno_id smallint, dia date, bipada_em timestamptz, coletado boolean, wn_norm text, quantidade integer, origem text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if private.gestor_email() is null then raise exception 'Entre como gestor para ver o desempenho' using errcode = '42501'; end if;
  if p_ini is null or p_fim is null or p_fim < p_ini or p_fim - p_ini > 92 then
    raise exception 'Período inválido (máximo de 93 dias)' using errcode = '22023'; end if;
  return query
  select b.id, b.pessoa_id, p.codigo, p.nome, b.andar, b.atividade, b.turno_id, b.dia, b.bipada_em,
         exists (select 1 from public.ondas w where w.wn_norm = b.wn_norm), b.wn_norm, b.quantidade, b.origem
  from public.prod_bipagens b join public.prod_pessoas p on p.id = b.pessoa_id
  where b.dia between p_ini and p_fim
    and ((select private.g_admin()) or p.galpao_id = (select private.g_galpao()))
  order by b.bipada_em limit 60000;
end $$;
revoke all on function public.prod_bipagens_periodo(date, date) from public, anon;
grant execute on function public.prod_bipagens_periodo(date, date) to authenticated;
