-- Hora de almoço: um horário por turno (config) e um ajuste opcional por pessoa (operadores).
-- Valores em minutos desde 0h (ex.: 720 = 12:00). Nulo = sem almoço configurado / usa o do turno.
-- O intervalo do almoço não conta como pausa, nem como atraso, nem como hora extra.
alter table public.config
  add column almoco1_ini smallint, add column almoco1_fim smallint,
  add column almoco2_ini smallint, add column almoco2_fim smallint,
  add constraint config_almoco1_ck check ((almoco1_ini is null and almoco1_fim is null) or (almoco1_ini between 0 and 1439 and almoco1_fim between 1 and 1440 and almoco1_fim > almoco1_ini)),
  add constraint config_almoco2_ck check ((almoco2_ini is null and almoco2_fim is null) or (almoco2_ini between 0 and 1439 and almoco2_fim between 1 and 1440 and almoco2_fim > almoco2_ini));

alter table public.operadores
  add column almoco_ini smallint, add column almoco_fim smallint,
  add constraint operadores_almoco_ck check ((almoco_ini is null and almoco_fim is null) or (almoco_ini between 0 and 1439 and almoco_fim between 1 and 1440 and almoco_fim > almoco_ini));

-- Ajuste por pessoa: mesmas regras do turno (gestão individual ou configuração; só no próprio galpão, admin em todos).
-- p_inicio e p_fim nulos voltam a usar o almoço do turno.
create function public.alterar_almoco(p_operador uuid, p_inicio smallint, p_fim smallint)
returns json language plpgsql security definer set search_path = '' as $$
begin
  if not ((select private.g_admin()) or (select private.g_pode('individual')) or (select private.g_pode('config'))) then
    raise exception 'Sem permissão para alterar o almoço' using errcode = '42501';
  end if;
  if not exists (select 1 from public.operadores o
                  where o.id = p_operador
                    and ((select private.g_admin()) or o.galpao_id = (select private.g_galpao()))) then
    raise exception 'Operador fora do seu galpão' using errcode = '42501';
  end if;
  if (p_inicio is null) <> (p_fim is null)
     or (p_inicio is not null and (p_inicio not between 0 and 1439 or p_fim not between 1 and 1440 or p_fim <= p_inicio)) then
    raise exception 'Horário de almoço inválido' using errcode = '22023';
  end if;
  update public.operadores set almoco_ini = p_inicio, almoco_fim = p_fim where id = p_operador;
  return json_build_object('id', p_operador, 'inicio', p_inicio, 'fim', p_fim);
end $$;
revoke all on function public.alterar_almoco(uuid, smallint, smallint) from public;
grant execute on function public.alterar_almoco(uuid, smallint, smallint) to authenticated;

-- Visitante (anon) não chama as funções de turno e almoço; a checagem interna já recusaria, mas fecha na porta.
revoke execute on function public.alterar_almoco(uuid, smallint, smallint) from anon;
revoke execute on function public.alterar_turno(uuid, smallint, smallint) from anon;
