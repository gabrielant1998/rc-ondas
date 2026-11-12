-- Quem se cadastra sozinho informa nome e galpão; o pedido guarda isso para o administrador liberar sem redigitar.
alter table public.solicitacoes_gestor add column if not exists nome text check (nome is null or length(btrim(nome)) between 2 and 80);
alter table public.solicitacoes_gestor add column if not exists galpao_id uuid references public.galpoes (id) on delete set null;

drop function if exists public.solicitar_acesso();

create function public.solicitar_acesso(p_nome text default null, p_galpao uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare e text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
begin
  if e = '' then raise exception 'Sem e-mail na sessão' using errcode = '42501'; end if;
  if exists (select 1 from public.gestores g where g.email = e) then return; end if;
  insert into public.solicitacoes_gestor (email, nome, galpao_id) values (e, nullif(btrim(p_nome), ''), p_galpao)
  on conflict (email) do update set
    nome      = coalesce(excluded.nome, public.solicitacoes_gestor.nome),
    galpao_id = coalesce(excluded.galpao_id, public.solicitacoes_gestor.galpao_id);
end $$;

revoke all on function public.solicitar_acesso(text, uuid) from public, anon;
grant execute on function public.solicitar_acesso(text, uuid) to authenticated;
