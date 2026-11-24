-- Cadastro de pessoas da coleta: o código (CL001, CL002…) passa a ser escolhido no banco, olhando TODOS os galpões.
-- Depois da separação por galpão, o gestor só enxerga o cadastro do seu galpão e o sistema sugeria um código
-- já usado em outro galpão (erro 409 "já existe"). Também libera códigos de 4 dígitos (até CL9999).
alter table public.operadores drop constraint operadores_codigo_check,
  add constraint operadores_codigo_check check (codigo ~ '^CL[0-9]{3,4}$');

create function private.prox_codigo_operador() returns text
language sql stable security definer set search_path = '' as $$
  select 'CL' || lpad(n::text, case when n < 1000 then 3 else 4 end, '0')
  from generate_series(1, 9999) n
  where not exists (select 1 from public.operadores o where o.excluido_em is null
                    and o.codigo = 'CL' || lpad(n::text, case when n < 1000 then 3 else 4 end, '0'))
  order by n limit 1
$$;
revoke all on function private.prox_codigo_operador() from public, anon, authenticated;

-- se o código pedido já estiver em uso (ou vier vazio), o banco troca pelo próximo livre
create function private.operadores_codigo_livre() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.excluido_em is null and (new.codigo is null or exists (select 1 from public.operadores o
       where o.excluido_em is null and o.codigo = new.codigo and o.id <> new.id)) then
    new.codigo := private.prox_codigo_operador();
  end if;
  return new;
end $$;
revoke all on function private.operadores_codigo_livre() from public, anon, authenticated;
create trigger operadores_codigo_livre before insert on public.operadores
  for each row execute function private.operadores_codigo_livre();

create function public.operador_proximo_codigo() returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  if private.gestor_email() is null then raise exception 'Entre como gestor' using errcode = '42501'; end if;
  return private.prox_codigo_operador();
end $$;
revoke all on function public.operador_proximo_codigo() from public, anon;
grant execute on function public.operador_proximo_codigo() to authenticated;

-- Embalagem: prod_pessoa_salvar passou a trocar um código automático PRnnn já usado pelo próximo livre de todos os galpões
-- (alteração feita no corpo da função com replace do trecho "if exists (select 1 from public.prod_pessoas where codigo = c ...").
