-- Procurando em etapas: 1) pendente (status 1, com SKU/local), 2) encontrada (volta à produção e vai ao histórico), 3) baixa com o nome de quem fez.
-- procura_hist: eventos {e: 'm' marcou | 'a' encontrou | 'b' baixa, q: pessoa, t: horário}; um novo 'm' abre um novo ciclo.
drop function public.passar_procurando(text, text);
drop function public.encontrar_procurando(text, text);

create or replace function public.marcar_procurando(p_wn text, p_sku text, p_local text default null, p_nome text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare o public.ondas; quem text;
begin
  if p_sku is null or length(btrim(p_sku)) not between 1 and 40 then
    raise exception 'Informe o SKU (até 40 caracteres)' using errcode = '22023';
  end if;
  select * into o from public.ondas where wn_norm = public.normaliza_wn(p_wn) for update;
  if not found then raise exception 'Onda % não está registrada', p_wn using errcode = 'P0002'; end if;
  if o.status = 2 then raise exception 'Onda em difícil acesso não pode ser marcada como procurando' using errcode = '22023'; end if;
  quem := coalesce(nullif(btrim(coalesce(p_nome, '')), ''), (select x.nome from public.operadores x where x.id = o.operador_id));
  if o.status = 1 then
    update public.ondas set procura_sku = btrim(p_sku), procura_local = nullif(btrim(coalesce(p_local, '')), '')
     where id = o.id returning * into o;
  else
    update public.ondas set status = 1, concluida_em = null, encerrada_auto = false,
           procura_sku = btrim(p_sku), procura_local = nullif(btrim(coalesce(p_local, '')), ''),
           procura_nome = quem, procura_em = now(), procura_achou_por = null,
           procura_hist = (case when jsonb_array_length(procura_hist) >= 45 then '[]'::jsonb else procura_hist end)
                          || jsonb_build_array(jsonb_build_object('e', 'm', 'q', quem, 't', now()))
     where id = o.id returning * into o;
  end if;
  return jsonb_build_object('id', o.id, 'wn', o.wn, 'tipo', o.tipo, 'quantidade', o.quantidade, 'galpao_id', o.galpao_id,
    'operador_id', o.operador_id, 'registrada_em', o.registrada_em, 'procura_em', o.procura_em,
    'procura_nome', o.procura_nome, 'procura_hist', o.procura_hist);
end $$;

create function public.encontrar_procurando(p_wn text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.ondas set status = 0, concluida_em = greatest(now(), registrada_em),
         procura_hist = procura_hist || jsonb_build_array(jsonb_build_object('e', 'a', 't', now()))
   where wn_norm = public.normaliza_wn(p_wn) and status = 1;
  get diagnostics n = row_count;
  return n = 1;
end $$;

create function public.baixar_procurando(p_wn text, p_nome text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if p_nome is null or length(btrim(p_nome)) not between 2 and 80 then
    raise exception 'Informe o nome de quem fez (2 a 80 caracteres)' using errcode = '22023';
  end if;
  update public.ondas set procura_achou_por = btrim(p_nome),
         procura_hist = procura_hist || jsonb_build_array(jsonb_build_object('e', 'b', 'q', btrim(p_nome), 't', now()))
   where wn_norm = public.normaliza_wn(p_wn) and status = 0 and procura_achou_por is null
     and jsonb_array_length(procura_hist) > 0 and procura_hist -> -1 ->> 'e' = 'a';
  get diagnostics n = row_count;
  return n = 1;
end $$;

revoke all on function public.encontrar_procurando(text), public.baixar_procurando(text, text) from public;
grant execute on function public.encontrar_procurando(text), public.baixar_procurando(text, text) to anon, authenticated;
