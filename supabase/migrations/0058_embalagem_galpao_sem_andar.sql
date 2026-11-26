-- Galpão sem andares na Embalagem (só Mesa e Máquina): marcado em galpoes.horarios -> 'pdSA' = true.
-- Nesse galpão o posto é guardado como Térreo; o servidor recusa Mezanino.
create function private.prod_atrib_confere_andar()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.andar = 'mezanino' and exists (
    select 1 from public.prod_pessoas p join public.galpoes g on g.id = p.galpao_id
    where p.id = new.pessoa_id and coalesce((g.horarios ->> 'pdSA')::boolean, false)) then
    raise exception 'Este galpão não tem Mezanino na embalagem: escolha só Mesa ou Máquina.' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger prod_atrib_confere_andar before insert or update of andar on public.prod_atribuicoes
  for each row execute function private.prod_atrib_confere_andar();
