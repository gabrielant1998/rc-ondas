-- Pedidos de acesso: quem faz Primeiro acesso mas ainda não está em gestores fica aqui até o administrador decidir.

create table public.solicitacoes_gestor (
  email     text primary key check (email = lower(btrim(email)) and email like '%_@_%'),
  criado_em timestamptz not null default now()
);

alter table public.solicitacoes_gestor enable row level security;
grant select, delete on public.solicitacoes_gestor to authenticated;

create policy solicitacoes_ler     on public.solicitacoes_gestor for select to authenticated
  using ((select private.g_admin()));
create policy solicitacoes_excluir on public.solicitacoes_gestor for delete to authenticated
  using ((select private.g_admin()));

-- o próprio usuário logado pede acesso; o e-mail vem do token, não do formulário
create function public.solicitar_acesso() returns void
language plpgsql security definer set search_path = '' as $$
declare e text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
begin
  if e = '' then raise exception 'Sem e-mail na sessão' using errcode = '42501'; end if;
  if exists (select 1 from public.gestores g where g.email = e) then return; end if;
  insert into public.solicitacoes_gestor (email) values (e) on conflict (email) do nothing;
end $$;

-- o administrador libera o acesso: cria o gestor e apaga o pedido, na mesma operação
create function public.aceitar_solicitacao(p_email text, p_nome text, p_galpao uuid, p_admin boolean,
                                           p_pc boolean, p_pi boolean, p_pr boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (select private.g_admin()) then raise exception 'Sem permissão' using errcode = '42501'; end if;
  insert into public.gestores (email, nome, galpao_id, admin, pode_config, pode_individual, pode_registros)
  values (lower(btrim(p_email)), p_nome, case when p_admin then null else p_galpao end, p_admin, p_pc, p_pi, p_pr);
  delete from public.solicitacoes_gestor where email = lower(btrim(p_email));
end $$;

revoke all on function public.solicitar_acesso(), public.aceitar_solicitacao(text, text, uuid, boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.solicitar_acesso(), public.aceitar_solicitacao(text, text, uuid, boolean, boolean, boolean, boolean) to authenticated;
