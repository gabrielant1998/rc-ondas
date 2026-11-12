-- Procurando: uma onda já bipada pode ser marcada como "procurando" (status 1) com SKU, local e nome de quem procura.
-- Enquanto procura, a onda sai da produção do dia (status 1 não tem conclusão); ao ser encontrada volta ao status 0.
-- Operação é pública: as duas funções rodam sem login e conferem tudo no banco.
alter table public.ondas
  add column procura_sku   text check (procura_sku   is null or length(btrim(procura_sku))   between 1 and 40),
  add column procura_local text check (procura_local is null or length(btrim(procura_local)) between 1 and 60),
  add column procura_nome  text check (procura_nome  is null or length(btrim(procura_nome))  between 1 and 80),
  add column procura_em    timestamptz;

create function public.marcar_procurando(p_wn text, p_sku text, p_local text default null, p_nome text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare o public.ondas;
begin
  if p_sku is null or length(btrim(p_sku)) not between 1 and 40 then
    raise exception 'Informe o SKU (até 40 caracteres)' using errcode = '22023';
  end if;
  select * into o from public.ondas where wn_norm = public.normaliza_wn(p_wn) for update;
  if not found then raise exception 'Onda % não está registrada', p_wn using errcode = 'P0002'; end if;
  if o.status = 2 then raise exception 'Onda em difícil acesso não pode ser marcada como procurando' using errcode = '22023'; end if;
  update public.ondas set status = 1, concluida_em = null, encerrada_auto = false,
         procura_sku = btrim(p_sku), procura_local = nullif(btrim(coalesce(p_local, '')), ''),
         procura_nome = nullif(btrim(coalesce(p_nome, '')), ''),
         procura_em = case when o.status = 1 then coalesce(o.procura_em, now()) else now() end
   where id = o.id returning * into o;
  return jsonb_build_object('id', o.id, 'wn', o.wn, 'tipo', o.tipo, 'quantidade', o.quantidade,
    'galpao_id', o.galpao_id, 'operador_id', o.operador_id, 'registrada_em', o.registrada_em, 'procura_em', o.procura_em);
end $$;

create function public.encontrar_procurando(p_wn text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.ondas set status = 0, concluida_em = greatest(now(), registrada_em)
   where wn_norm = public.normaliza_wn(p_wn) and status = 1;
  get diagnostics n = row_count;
  return n = 1;
end $$;

revoke all on function public.marcar_procurando(text, text, text, text), public.encontrar_procurando(text) from public;
grant execute on function public.marcar_procurando(text, text, text, text), public.encontrar_procurando(text) to anon, authenticated;
