-- Acesso "Bipador": pessoa comum com login próprio, sem nenhuma permissão de gestor.
-- Vê só as telas liberadas (abas), só o galpão do gestor responsável, e não altera configurações nem registros.
-- O administrador cria; o administrador e o gestor responsável escolhem os acessos. Não altera dados existentes.
alter table public.gestores
  add column perfil text not null default 'gestor' check (perfil in ('gestor', 'bipador')),
  add column responsavel text references public.gestores(email) on update cascade on delete set null;

alter table public.gestores drop constraint gestores_abas_check;
alter table public.gestores add constraint gestores_abas_check check (abas is null or (cardinality(abas) > 0
  and abas <@ array['painel','op','prod','prs','ind','his','cfg','op.ctl','op.ace','op.aus','prod.aus']::text[]));

-- bipador nunca tem poder de gestor e sempre tem galpão e lista de acessos
alter table public.gestores add constraint gestores_bipador_ck check (perfil <> 'bipador' or (
  not admin and not pode_config and not pode_individual and not pode_registros
  and galpao_id is not null and abas is not null
  and abas <@ array['painel','op','op.ctl','op.ace','op.aus','prod','prod.aus','prs']::text[]));
create index gestores_responsavel_idx on public.gestores (responsavel);

-- o gestor responsável enxerga os bipadores dele (para ajustar os acessos)
drop policy gestores_ler on public.gestores;
create policy gestores_ler on public.gestores for select to authenticated
  using ((select private.g_admin()) or email = (select private.gestor_email()) or responsavel = (select private.gestor_email()));

-- administrador ou gestor responsável escolhe os acessos do bipador
create function public.bipador_acessos(p_email text, p_abas text[])
returns text language plpgsql security definer set search_path = '' as $$
declare b public.gestores; eu text := private.gestor_email();
begin
  if eu is null then raise exception 'Entre como gestor para fazer isso' using errcode = '42501'; end if;
  select * into b from public.gestores where email = lower(btrim(p_email));
  if not found or b.perfil <> 'bipador' then raise exception 'Bipador não encontrado' using errcode = '23503'; end if;
  if not ((select private.g_admin()) or b.responsavel = eu) then
    raise exception 'Só o administrador ou o gestor responsável muda os acessos de %', b.nome using errcode = '42501'; end if;
  if p_abas is null or cardinality(p_abas) = 0 then raise exception 'Escolha pelo menos um acesso' using errcode = '23514'; end if;
  if not (p_abas <@ array['painel','op','op.ctl','op.ace','op.aus','prod','prod.aus','prs']::text[]) then
    raise exception 'Acesso inválido para bipador' using errcode = '23514'; end if;
  update public.gestores set abas = (select array_agg(distinct x order by x) from unnest(p_abas) x) where email = b.email;
  return 'ok';
end $$;
revoke all on function public.bipador_acessos(text, text[]) from public, anon;
grant execute on function public.bipador_acessos(text, text[]) to authenticated;
