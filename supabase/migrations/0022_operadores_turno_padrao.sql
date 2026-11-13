-- Rede de segurança: operador criado sem início/fim (app antigo em cache, importação) recebe o turno do cadastro,
-- em vez de falhar com "null value in column inicio violates not-null constraint".
create function private.operadores_turno_padrao() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.inicio is null or new.fim is null then
    select coalesce(new.inicio, case when new.turno = 2 then c.turno2_ini else c.turno1_ini end),
           coalesce(new.fim,    case when new.turno = 2 then c.turno2_fim else c.turno1_fim end)
      into new.inicio, new.fim
      from public.config c limit 1;
  end if;
  return new;
end $$;
revoke all on function private.operadores_turno_padrao() from public;

create trigger operadores_turno_padrao before insert on public.operadores
  for each row execute function private.operadores_turno_padrao();
