-- Procurando com percurso: a onda pode passar de uma pessoa para outra; fica o registro de quem marcou, quem não achou e passou, e quem achou.
-- procura_hist guarda eventos {e: 'm' marcou | 'p' passou | 'a' achou, q: pessoa, p: para quem (só em 'p'), t: horário}.
alter table public.ondas
  add column procura_hist jsonb not null default '[]'::jsonb
    check (jsonb_typeof(procura_hist) = 'array' and jsonb_array_length(procura_hist) <= 50),
  add column procura_achou_por text check (procura_achou_por is null or length(btrim(procura_achou_por)) between 1 and 80);

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
           procura_hist = jsonb_build_array(jsonb_build_object('e', 'm', 'q', quem, 't', now()))
     where id = o.id returning * into o;
  end if;
  return jsonb_build_object('id', o.id, 'wn', o.wn, 'tipo', o.tipo, 'quantidade', o.quantidade, 'galpao_id', o.galpao_id,
    'operador_id', o.operador_id, 'registrada_em', o.registrada_em, 'procura_em', o.procura_em,
    'procura_nome', o.procura_nome, 'procura_hist', o.procura_hist);
end $$;

create function public.passar_procurando(p_wn text, p_para text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if p_para is null or length(btrim(p_para)) not between 2 and 80 then
    raise exception 'Informe para quem a onda vai (2 a 80 caracteres)' using errcode = '22023';
  end if;
  update public.ondas set
         procura_hist = procura_hist || jsonb_build_array(jsonb_build_object('e', 'p', 'q', procura_nome, 'p', btrim(p_para), 't', now())),
         procura_nome = btrim(p_para)
   where wn_norm = public.normaliza_wn(p_wn) and status = 1;
  get diagnostics n = row_count;
  return n = 1;
end $$;

drop function public.encontrar_procurando(text);
create function public.encontrar_procurando(p_wn text, p_quem text default null) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.ondas set status = 0, concluida_em = greatest(now(), registrada_em),
         procura_achou_por = coalesce(nullif(btrim(coalesce(p_quem, '')), ''), procura_nome),
         procura_hist = procura_hist || jsonb_build_array(jsonb_build_object('e', 'a',
                          'q', coalesce(nullif(btrim(coalesce(p_quem, '')), ''), procura_nome), 't', now()))
   where wn_norm = public.normaliza_wn(p_wn) and status = 1;
  get diagnostics n = row_count;
  return n = 1;
end $$;

revoke all on function public.passar_procurando(text, text), public.encontrar_procurando(text, text) from public;
grant execute on function public.passar_procurando(text, text), public.encontrar_procurando(text, text) to anon, authenticated;
