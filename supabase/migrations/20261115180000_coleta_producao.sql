-- Produção da coleta vinda do relatório Work Package Statistics (Mercado Livre).
-- O relatório traz, por pessoa: total de ondas, pacotes por tipo de onda e produtos.
-- Ele não traz o número de cada onda, então a coleta NÃO entra em public.ondas:
-- fica em tabela própria, ligada ao lote (arquivo) importado.
-- Computador e máquina vêm somados na origem; esta importação não separa os dois.

create table public.coleta_lotes (
  id            uuid primary key default gen_random_uuid(),
  loja          text not null check (char_length(btrim(loja)) between 1 and 20),
  dia           date not null,
  arquivo       text not null check (char_length(arquivo) between 1 and 160),
  linhas        integer not null check (linhas between 1 and 5000),
  conferencia   jsonb not null default '{}'::jsonb check (jsonb_typeof(conferencia) = 'object'),
  importado_em  timestamptz not null default now(),
  importado_por text not null default coalesce(auth.jwt() ->> 'email', ''),
  unique (loja, dia, arquivo)          -- reimportar o mesmo arquivo substitui o lote
);

create table public.coleta_producao (
  lote_id      uuid not null references public.coleta_lotes (id) on delete cascade,
  pessoa       text not null check (char_length(btrim(pessoa)) between 2 and 80),
  papeis       text[] not null default '{}',        -- coletor, embalador, supervisor, excecao
  ondas        integer not null check (ondas >= 0),
  pacotes      jsonb not null check (jsonb_typeof(pacotes) = 'object'),  -- {"Itens Únicos": 12, ...}
  pacote_total integer not null check (pacote_total >= 0),
  produtos     integer not null check (produtos >= 0),
  primary key (lote_id, pessoa)
);
create index coleta_producao_lote_idx on public.coleta_producao (lote_id);

alter table public.coleta_lotes enable row level security;
alter table public.coleta_producao enable row level security;

create policy coleta_lotes_ler on public.coleta_lotes for select to authenticated
  using ((select private.g_admin()) or (select private.g_pode('individual')));
create policy coleta_producao_ler on public.coleta_producao for select to authenticated
  using ((select private.g_admin()) or (select private.g_pode('individual')));

revoke all on public.coleta_lotes, public.coleta_producao from anon;
grant select on public.coleta_lotes, public.coleta_producao to authenticated, service_role;

-- ---------- entrada do lote
-- p_lote = {"loja":"RC","dia":"2026-11-15","arquivo":"Work_Package_Statistics....xlsx",
--           "pessoas":[{"pessoa":"Fulana","papeis":["coletor"],
--                       "ondas":443,"pacotes":{"Itens Únicos":20322,...},
--                       "pacote_total":27878,"produtos":38929}]}
-- Responde {"resultado":"importada","lote":"...","linhas":91} ou {"resultado":"recusada","motivo":"..."}.
-- Só o importador (chave de serviço) chama esta função.
create or replace function public.importar_coleta(p_lote jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_loja    text := btrim(coalesce(p_lote ->> 'loja', ''));
  v_arquivo text := btrim(coalesce(p_lote ->> 'arquivo', ''));
  v_dia     date;
  v_pessoas jsonb := coalesce(p_lote -> 'pessoas', '[]'::jsonb);
  v_linhas  integer;
  v_div     text;
  v_lote    uuid;
begin
  if v_loja = '' or v_arquivo = '' then
    return jsonb_build_object('resultado', 'recusada', 'motivo', 'loja e arquivo são obrigatórios');
  end if;

  begin
    v_dia := (p_lote ->> 'dia')::date;
  exception when others then
    return jsonb_build_object('resultado', 'recusada', 'motivo', 'dia inválido');
  end;
  if v_dia is null then
    return jsonb_build_object('resultado', 'recusada', 'motivo', 'dia é obrigatório');
  end if;

  if jsonb_typeof(v_pessoas) <> 'array' then
    return jsonb_build_object('resultado', 'recusada', 'motivo', 'pessoas deve ser uma lista');
  end if;
  v_linhas := jsonb_array_length(v_pessoas);
  if v_linhas < 1 or v_linhas > 5000 then
    return jsonb_build_object('resultado', 'recusada', 'motivo', 'o lote precisa de 1 a 5000 pessoas');
  end if;

  -- o mesmo nome duas vezes no arquivo: uma linha por pessoa
  select string_agg(pessoa, ', ') into v_div from (
    select btrim(p ->> 'pessoa') as pessoa
    from jsonb_array_elements(v_pessoas) p
    group by 1 having count(*) > 1
  ) d;
  if v_div is not null then
    return jsonb_build_object('resultado', 'recusada', 'motivo', 'pessoa repetida: ' || v_div);
  end if;

  -- os pacotes por tipo precisam fechar com o total da pessoa; 1 unidade de diferença é
  -- arredondamento da origem e passa, com o valor original preservado no lote
  select string_agg(pessoa, ', ') into v_div from (
    select btrim(p ->> 'pessoa') as pessoa
    from jsonb_array_elements(v_pessoas) p
    where abs(coalesce((select sum(t.valor::numeric)
                        from jsonb_each_text(coalesce(p -> 'pacotes', '{}'::jsonb)) as t(tipo, valor)), 0)
              - coalesce((p ->> 'pacote_total')::numeric, -1)) > 1
  ) d;
  if v_div is not null then
    return jsonb_build_object('resultado', 'recusada', 'motivo', 'pacotes não fecham com o total: ' || v_div);
  end if;

  begin
    delete from public.coleta_lotes where loja = v_loja and dia = v_dia and arquivo = v_arquivo;

    insert into public.coleta_lotes (loja, dia, arquivo, linhas, conferencia, importado_por)
    values (v_loja, v_dia, v_arquivo, v_linhas, coalesce(p_lote -> 'conferencia', '{}'::jsonb),
            coalesce(auth.jwt() ->> 'email', 'importador'))
    returning id into v_lote;

    insert into public.coleta_producao (lote_id, pessoa, papeis, ondas, pacotes, pacote_total, produtos)
    select v_lote,
           btrim(p ->> 'pessoa'),
           coalesce((select array_agg(btrim(r)) from jsonb_array_elements_text(coalesce(p -> 'papeis', '[]'::jsonb)) r), '{}'),
           coalesce((p ->> 'ondas')::integer, 0),
           coalesce(p -> 'pacotes', '{}'::jsonb),
           (p ->> 'pacote_total')::integer,
           coalesce((p ->> 'produtos')::integer, 0)
    from jsonb_array_elements(v_pessoas) p;
  exception when others then
    return jsonb_build_object('resultado', 'recusada', 'motivo', sqlerrm);
  end;

  return jsonb_build_object('resultado', 'importada', 'lote', v_lote, 'linhas', v_linhas);
end $$;

revoke all on function public.importar_coleta(jsonb) from public, anon, authenticated;
grant execute on function public.importar_coleta(jsonb) to service_role;

-- ---------- leitura para o painel
-- ranking_coleta('2026-11-15') devolve totais, Top 3 por métrica e Top 3 por tipo de onda.
-- Restrito a gestor com permissão individual, como o restante do acompanhamento por pessoa.
create or replace function public.ranking_coleta(p_dia date, p_loja text default null)
returns jsonb
language sql stable security definer set search_path = '' as $$
with permitido as (
  select (select private.g_admin()) or (select private.g_pode('individual')) as ok
), lote as (
  select l.* from public.coleta_lotes l
  where l.dia = p_dia and (p_loja is null or l.loja = p_loja)
  order by l.importado_em desc
  limit 1
), base as (
  select p.pessoa, p.papeis, p.ondas, p.pacotes, p.pacote_total, p.produtos
  from public.coleta_producao p join lote on lote.id = p.lote_id
), tot as (
  select coalesce(sum(ondas), 0)::integer as ondas,
         coalesce(sum(pacote_total), 0)::integer as pacotes,
         coalesce(sum(produtos), 0)::integer as produtos,
         count(*)::integer as pessoas
  from base
), rk as (
  select 'ondas' as chave, 'Ondas' as titulo, pessoa, ondas as valor from base where ondas > 0
  union all
  select 'pacotes', 'Pacotes', pessoa, pacote_total from base where pacote_total > 0
  union all
  select 'produtos', 'Produtos', pessoa, produtos from base where produtos > 0
), tres as (
  select chave, titulo, jsonb_agg(jsonb_build_object('pessoa', pessoa, 'valor', valor) order by valor desc, pessoa) as lista
  from (select chave, titulo, pessoa, valor,
               row_number() over (partition by chave order by valor desc, pessoa) as n
        from rk) x
  where n <= 3
  group by chave, titulo
), tipos as (
  select t.tipo,
         count(*) filter (where t.qtd > 0)::integer as pessoas,
         coalesce(sum(t.qtd), 0)::integer as pacotes,
         coalesce(jsonb_agg(jsonb_build_object('pessoa', t.pessoa, 'valor', t.qtd)
                            order by t.qtd desc, t.pessoa) filter (where t.n <= 3), '[]'::jsonb) as top
  from (
    select b.pessoa, e.tipo, e.valor::integer as qtd,
           row_number() over (partition by e.tipo order by e.valor::integer desc, b.pessoa) as n
    from base b, lateral jsonb_each_text(b.pacotes) e(tipo, valor)
    where e.valor::integer > 0
  ) t
  group by t.tipo
)
select case
  when not (select ok from permitido) then jsonb_build_object('resultado', 'sem_permissao')
  else jsonb_build_object(
    'resultado', 'ok',
    'lote', (select jsonb_build_object('loja', loja, 'dia', dia, 'arquivo', arquivo,
                                      'linhas', linhas, 'importado_em', importado_em,
                                      'conferencia', conferencia) from lote),
    'totais', (select to_jsonb(tot) from tot),
    'metricas', coalesce((select jsonb_agg(jsonb_build_object('chave', chave, 'titulo', titulo, 'top', lista)
                                           order by chave) from tres), '[]'::jsonb),
    'tipos', coalesce((select jsonb_agg(jsonb_build_object('tipo', tipo, 'pessoas', pessoas,
                                                           'pacotes', pacotes, 'top', top)
                                        order by pacotes desc, tipo) from tipos), '[]'::jsonb)
  )
end
$$;

revoke all on function public.ranking_coleta(date, text) from public, anon;
grant execute on function public.ranking_coleta(date, text) to authenticated;
