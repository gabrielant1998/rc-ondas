-- Procurando com vários SKUs (cada um com a sua quantidade) e marcações da onda (BARUERI, SEM ESTOQUE, BAIXO ESTOQUE, PERDIDO).
-- procura_itens = [{"sku": "ABC123", "qtd": 5}, ...]; procura_sku continua guardando o resumo (até 40 caracteres),
-- então telas e versões antigas do app seguem funcionando.
alter table public.ondas
  add column procura_itens jsonb not null default '[]'::jsonb
  check (jsonb_typeof(procura_itens) = 'array' and jsonb_array_length(procura_itens) <= 30);
alter table public.ondas
  add column procura_marcas text[] not null default '{}'
  check (procura_marcas <@ array['BARUERI', 'SEM ESTOQUE', 'BAIXO ESTOQUE', 'PERDIDO']::text[]);

drop function public.marcar_procurando(text, text, text, text);
create function public.marcar_procurando(p_wn text, p_sku text, p_local text default null, p_nome text default null,
                                         p_itens jsonb default null, p_marcas text[] default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare o public.ondas; quem text; it jsonb; itens jsonb := '[]'::jsonb; q numeric;
begin
  if p_sku is null or length(btrim(p_sku)) not between 1 and 40 then
    raise exception 'Informe o SKU (até 40 caracteres)' using errcode = '22023';
  end if;
  if p_itens is not null then
    if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) > 30 then
      raise exception 'Informe até 30 SKUs' using errcode = '22023';
    end if;
    for it in select * from jsonb_array_elements(p_itens) loop
      if jsonb_typeof(it) <> 'object' or length(btrim(coalesce(it ->> 'sku', ''))) not between 1 and 40 then
        raise exception 'Cada SKU precisa ter de 1 a 40 caracteres' using errcode = '22023';
      end if;
      begin q := (it ->> 'qtd')::numeric; exception when others then q := null; end;
      if q is null or q <> trunc(q) or q < 1 or q > 100000 then
        raise exception 'A quantidade de cada SKU precisa ser um número inteiro de 1 a 100000' using errcode = '22023';
      end if;
      itens := itens || jsonb_build_array(jsonb_build_object('sku', btrim(it ->> 'sku'), 'qtd', q::integer));
    end loop;
  end if;
  if p_marcas is not null and not (p_marcas <@ array['BARUERI', 'SEM ESTOQUE', 'BAIXO ESTOQUE', 'PERDIDO']::text[]) then
    raise exception 'Marcação inválida' using errcode = '22023';
  end if;
  select * into o from public.ondas where wn_norm = public.normaliza_wn(p_wn) for update;
  if not found then raise exception 'Onda % não está registrada', p_wn using errcode = 'P0002'; end if;
  if o.status = 2 then raise exception 'Onda em difícil acesso não pode ser marcada como procurando' using errcode = '22023'; end if;
  quem := coalesce(nullif(btrim(coalesce(p_nome, '')), ''), (select x.nome from public.operadores x where x.id = o.operador_id));
  if o.status = 1 then
    update public.ondas set procura_sku = btrim(p_sku), procura_local = nullif(btrim(coalesce(p_local, '')), ''),
           procura_itens = case when p_itens is null then procura_itens else itens end,
           procura_marcas = case when p_marcas is null then procura_marcas else (select coalesce(array_agg(distinct m order by m), '{}') from unnest(p_marcas) m) end
     where id = o.id returning * into o;
  else
    update public.ondas set status = 1, concluida_em = null, encerrada_auto = false,
           procura_sku = btrim(p_sku), procura_local = nullif(btrim(coalesce(p_local, '')), ''),
           procura_itens = itens,
           procura_marcas = coalesce((select array_agg(distinct m order by m) from unnest(p_marcas) m), '{}'),
           procura_nome = quem, procura_em = now(), procura_achou_por = null,
           procura_hist = (case when jsonb_array_length(procura_hist) >= 45 then '[]'::jsonb else procura_hist end)
                          || jsonb_build_array(jsonb_build_object('e', 'm', 'q', quem, 't', now()))
     where id = o.id returning * into o;
  end if;
  return jsonb_build_object('id', o.id, 'wn', o.wn, 'tipo', o.tipo, 'quantidade', o.quantidade, 'galpao_id', o.galpao_id,
    'operador_id', o.operador_id, 'registrada_em', o.registrada_em, 'procura_em', o.procura_em,
    'procura_nome', o.procura_nome, 'procura_hist', o.procura_hist, 'procura_itens', o.procura_itens, 'procura_marcas', o.procura_marcas);
end $$;
revoke all on function public.marcar_procurando(text, text, text, text, jsonb, text[]) from public;
grant execute on function public.marcar_procurando(text, text, text, text, jsonb, text[]) to anon, authenticated;
