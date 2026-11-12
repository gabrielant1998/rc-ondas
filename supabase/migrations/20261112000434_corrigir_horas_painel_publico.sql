-- Retorna hora e quantidade em cada barra do gráfico público.
create or replace function private.painel_publico_agregado(p_dia date, p_galpao uuid default null, p_turno smallint default null)
returns jsonb
language sql stable security definer set search_path = '' as $$
 with cfg as (select * from public.config where id),
 base as (
   select w.operador_id, w.galpao_id, g.nome as galpao, w.tipo, w.quantidade,
          coalesce(w.concluida_em,w.registrada_em) as momento,
          extract(hour from coalesce(w.concluida_em,w.registrada_em) at time zone 'America/Sao_Paulo')::integer as hora,
          extract(epoch from (coalesce(w.concluida_em,w.registrada_em) at time zone 'America/Sao_Paulo')::time)/3600.0 as hora_decimal,
          case when o.turno=2 then c.turno2_ini else c.turno1_ini end as inicio,
          case when o.turno=2 then c.turno2_fim else c.turno1_fim end as fim,
          c.tolerancia_min,c.intervalo_max_min
   from public.ondas w
   join public.operadores o on o.id=w.operador_id
   join public.galpoes g on g.id=w.galpao_id
   cross join cfg c
   where w.status=0
     and w.registrada_em >= (p_dia::timestamp at time zone 'America/Sao_Paulo')
     and w.registrada_em < ((p_dia+1)::timestamp at time zone 'America/Sao_Paulo')
     and (p_galpao is null or w.galpao_id=p_galpao)
     and (p_turno is null or o.turno=p_turno)
 ),
 calc as (
   select *, case when fim>inicio then hora_decimal<inicio-tolerancia_min/60.0 or hora_decimal>fim+tolerancia_min/60.0
                  else hora_decimal<inicio-tolerancia_min/60.0 and hora_decimal>fim+tolerancia_min/60.0 end as extra,
          extract(epoch from (momento-lag(momento) over (partition by operador_id order by momento)))*1000 as dur_ms
   from base
 ), dur as (select * from calc where dur_ms>0 and dur_ms<=intervalo_max_min*60000),
 resumo as (select coalesce(sum(quantidade),0) as total,count(*) as ondas,count(distinct operador_id) as pessoas,
                   coalesce(sum(quantidade) filter (where extra),0) as extra_un,count(*) filter (where extra) as extra_ondas from calc),
 hora as (select hora,sum(quantidade) as qtd from calc group by hora),
 tipos as (select tipo,sum(quantidade) as qtd,count(*) as ondas from calc group by tipo),
 galpoes as (select galpao as nome,sum(quantidade) as qtd,count(*) as ondas,count(distinct operador_id) as pessoas from calc group by galpao),
 dur_tipos as (select tipo,sum(dur_ms) as ms,count(*) as n from dur group by tipo)
 select jsonb_build_object(
  'total',resumo.total,'ondas',resumo.ondas,'pessoas',resumo.pessoas,'extra_un',resumo.extra_un,'extra_ondas',resumo.extra_ondas,
  'horas',coalesce((select jsonb_agg(to_jsonb(h) order by h.hora) from hora h),'[]'::jsonb),
  'tipos',coalesce((select jsonb_agg(to_jsonb(tipos) order by tipos.tipo) from tipos),'[]'::jsonb),
  'galpoes',coalesce((select jsonb_agg(to_jsonb(galpoes) order by galpoes.nome) from galpoes),'[]'::jsonb),
  'dur_ms',coalesce((select sum(dur_ms) from dur),0), 'dur_n',(select count(*) from dur),
  'dur_tipos',coalesce((select jsonb_agg(to_jsonb(dur_tipos) order by dur_tipos.tipo) from dur_tipos),'[]'::jsonb))
 from resumo
$$;
