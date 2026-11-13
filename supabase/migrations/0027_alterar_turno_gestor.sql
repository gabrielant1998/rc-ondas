-- Turno por pessoa: qualquer gestor com acesso à gestão individual (ou à configuração) pode alterar o turno,
-- restrito ao próprio galpão (admin altera em qualquer galpão). A alteração vale retroativamente para todos os dias;
-- cada mudança continua registrada em presenca_alteracoes pelo trigger operadores_turno_historico.
create function public.alterar_turno(p_operador uuid, p_inicio smallint, p_fim smallint)
returns json language plpgsql security definer set search_path = '' as $$
begin
  if not ((select private.g_admin()) or (select private.g_pode('individual')) or (select private.g_pode('config'))) then
    raise exception 'Sem permissão para alterar o turno' using errcode = '42501';
  end if;
  if not exists (select 1 from public.operadores o
                  where o.id = p_operador
                    and ((select private.g_admin()) or o.galpao_id = (select private.g_galpao()))) then
    raise exception 'Operador fora do seu galpão' using errcode = '42501';
  end if;
  if p_inicio is null or p_inicio not between 0 and 23 or p_fim is null or p_fim not between 1 and 24 then
    raise exception 'Horário inválido' using errcode = '22023';
  end if;
  update public.operadores set inicio = p_inicio, fim = p_fim where id = p_operador;
  return json_build_object('id', p_operador, 'inicio', p_inicio, 'fim', p_fim);
end $$;
revoke all on function public.alterar_turno(uuid, smallint, smallint) from public;
grant execute on function public.alterar_turno(uuid, smallint, smallint) to authenticated;
