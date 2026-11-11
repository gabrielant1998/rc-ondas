-- RC Ondas: esquema inicial (PostgreSQL / Supabase)
-- Regras de negócio ficam no banco: o aplicativo é público e não é confiável.

create schema if not exists private;

-- WN normalizado: sem espaços; só dígitos perde zeros à esquerda; texto vira maiúsculo.
create function public.normaliza_wn(wn text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select case when x ~ '^[0-9]+$' then regexp_replace(x, '^0+(?=[0-9])', '') else upper(x) end
  from (select regexp_replace(wn, '\s+', '', 'g') as x) s
$$;

create table public.galpoes (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null check (length(btrim(nome)) between 1 and 60),
  meta_diaria integer check (meta_diaria > 0),
  criado_em   timestamptz not null default now()
);
create unique index galpoes_nome_uq on public.galpoes (lower(btrim(nome)));

create table public.tipos_onda (
  nome   text primary key,
  limite integer not null check (limite > 0),
  ordem  smallint not null unique
);
insert into public.tipos_onda (nome, limite, ordem) values
  ('Vários artigos', 1000, 1), ('Múltiplas quantidades', 1000, 2), ('Itens Únicos', 100, 3),
  ('Maiores/Pesados', 10, 4), ('Retrabalho', 1000, 5), ('Pacote do mesmo', 1000, 6);

create table public.config (
  id                 boolean primary key default true check (id),   -- linha única
  turno1_ini         smallint not null default 7  check (turno1_ini between 0 and 23),
  turno1_fim         smallint not null default 16 check (turno1_fim between 1 and 24),
  turno2_ini         smallint not null default 16 check (turno2_ini between 0 and 23),
  turno2_fim         smallint not null default 23 check (turno2_fim between 1 and 24),
  intervalo_max_min  smallint not null default 30 check (intervalo_max_min between 1 and 120),
  tolerancia_min     smallint not null default 15 check (tolerancia_min between 0 and 120),
  ondas_em_andamento boolean  not null default true
);
insert into public.config default values;

create table public.operadores (
  id          uuid primary key default gen_random_uuid(),
  codigo      text not null check (codigo ~ '^CL[0-9]{3}$'),
  nome        text not null check (length(btrim(nome)) between 2 and 80),
  turno       smallint not null check (turno in (1, 2)),
  galpao_id   uuid not null references public.galpoes (id) on delete restrict,
  excluido_em timestamptz,          -- exclusão lógica: o histórico de ondas precisa do operador
  criado_em   timestamptz not null default now()
);
-- o código e o nome só são únicos entre os ativos: código excluído volta a ficar livre
create unique index operadores_codigo_ativo_uq on public.operadores (codigo) where excluido_em is null;
create unique index operadores_nome_ativo_uq on public.operadores (lower(btrim(nome))) where excluido_em is null;
create index operadores_galpao_idx on public.operadores (galpao_id);

create table public.ondas (
  id             uuid primary key,                 -- gerado no aparelho: reenviar não duplica
  wn             text not null check (length(btrim(wn)) between 1 and 40),
  wn_norm        text generated always as (public.normaliza_wn(wn)) stored,
  operador_id    uuid not null references public.operadores (id) on delete restrict,
  galpao_id      uuid not null references public.galpoes (id) on delete restrict,
  tipo           text not null references public.tipos_onda (nome) on update cascade,
  quantidade     integer not null check (quantidade > 0),
  status         smallint not null default 0 check (status in (0, 1, 2)),  -- 0 concluída, 1 procurando, 2 difícil acesso
  registrada_em  timestamptz not null,             -- hora do aparelho (pode ter sido offline)
  concluida_em   timestamptz,
  encerrada_auto boolean not null default false,
  criada_em      timestamptz not null default now(),  -- hora em que chegou ao servidor
  constraint ondas_conclusao_ck check ((status = 0) = (concluida_em is not null)),
  constraint ondas_ordem_ck check (concluida_em is null or concluida_em >= registrada_em)
);
create unique index ondas_wn_uq on public.ondas (wn_norm);                      -- WN não aceita cópia
create index ondas_galpao_dia_idx on public.ondas (galpao_id, registrada_em desc);
create index ondas_operador_idx on public.ondas (operador_id, registrada_em desc);
create index ondas_abertas_idx on public.ondas (galpao_id) where status <> 0;
create index ondas_tipo_idx on public.ondas (tipo);

create table public.gestores (
  email           text primary key check (email = lower(btrim(email)) and email like '%_@_%'),
  nome            text not null check (length(btrim(nome)) between 2 and 80),
  galpao_id       uuid references public.galpoes (id) on delete restrict,
  admin           boolean not null default false,
  pode_config     boolean not null default true,
  pode_individual boolean not null default true,
  pode_registros  boolean not null default true,
  criado_em       timestamptz not null default now(),
  constraint gestores_galpao_ck check (admin or galpao_id is not null)   -- gestor comum sempre tem galpão
);
create index gestores_galpao_idx on public.gestores (galpao_id);

-- ---------- quem é o gestor logado (e-mail confirmado no Supabase Auth)
create function private.gestor_email() returns text
language sql stable security definer set search_path = '' as $$
  select g.email from public.gestores g
  join auth.users u on lower(u.email) = g.email
  where u.id = (select auth.uid()) and u.email_confirmed_at is not null
$$;
create function private.g_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select g.admin from public.gestores g where g.email = private.gestor_email()), false)
$$;
create function private.g_galpao() returns uuid
language sql stable security definer set search_path = '' as $$
  select g.galpao_id from public.gestores g where g.email = private.gestor_email()
$$;
create function private.g_pode(perm text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select case perm when 'config' then g.pode_config when 'individual' then g.pode_individual
                                    when 'registros' then g.pode_registros else false end
                   from public.gestores g where g.email = private.gestor_email()), false)
$$;
revoke all on function private.gestor_email(), private.g_admin(), private.g_galpao(), private.g_pode(text) from public;
grant usage on schema private to anon, authenticated;
grant execute on function private.g_admin(), private.g_galpao(), private.g_pode(text) to anon, authenticated;

-- ---------- regras das ondas
create function private.ondas_antes_inserir() returns trigger
language plpgsql security definer set search_path = '' as $$
declare op public.operadores; lim integer;
begin
  select * into op from public.operadores where id = new.operador_id and excluido_em is null;
  if not found then raise exception 'Operador não encontrado ou excluído' using errcode = '23503'; end if;
  new.galpao_id := op.galpao_id;                       -- o galpão vem do cadastro, não do aparelho
  select limite into lim from public.tipos_onda where nome = new.tipo;
  if lim is null then raise exception 'Tipo de onda inválido' using errcode = '23503'; end if;
  if new.quantidade > lim then
    raise exception 'Quantidade % acima do limite de % para %', new.quantidade, lim, new.tipo using errcode = '23514';
  end if;
  if new.registrada_em > now() + interval '10 minutes' or new.registrada_em < now() - interval '45 days' then
    raise exception 'Data de registro fora do intervalo aceito' using errcode = '23514';
  end if;
  new.criada_em := now();
  return new;
end $$;
create trigger ondas_antes_inserir before insert on public.ondas
  for each row execute function private.ondas_antes_inserir();

create function private.ondas_antes_alterar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare lim integer;
begin
  if new.id <> old.id or new.operador_id <> old.operador_id or new.galpao_id <> old.galpao_id
     or new.registrada_em <> old.registrada_em or new.criada_em <> old.criada_em then
    raise exception 'Operador, galpão e datas de registro não podem ser alterados' using errcode = '23514';
  end if;
  select limite into lim from public.tipos_onda where nome = new.tipo;
  if new.quantidade > lim then
    raise exception 'Quantidade % acima do limite de % para %', new.quantidade, lim, new.tipo using errcode = '23514';
  end if;
  return new;
end $$;
create trigger ondas_antes_alterar before update on public.ondas
  for each row execute function private.ondas_antes_alterar();

-- sempre precisa existir pelo menos um administrador
create function private.gestores_guarda_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.admin and (tg_op = 'DELETE' or not new.admin or new.email <> old.email)
     and not exists (select 1 from public.gestores where admin and email <> old.email) then
    raise exception 'É preciso manter pelo menos um administrador' using errcode = '23514';
  end if;
  return coalesce(new, old);
end $$;
create trigger gestores_guarda_admin before update or delete on public.gestores
  for each row execute function private.gestores_guarda_admin();

-- ---------- permissões (RLS)
alter table public.galpoes    enable row level security;
alter table public.tipos_onda enable row level security;
alter table public.config     enable row level security;
alter table public.operadores enable row level security;
alter table public.ondas      enable row level security;
alter table public.gestores   enable row level security;

revoke all on all tables in schema public from anon, authenticated;
grant select on public.galpoes, public.tipos_onda, public.config, public.operadores to anon, authenticated;
grant select, update, delete on public.ondas to authenticated;
grant insert, update, delete on public.galpoes to authenticated;
grant update on public.tipos_onda, public.config to authenticated;
grant insert, update on public.operadores to authenticated;
grant select, insert, update, delete on public.gestores to authenticated;

-- leitura pública do que a tela de registro precisa
create policy galpoes_ler    on public.galpoes    for select to anon, authenticated using (true);
create policy tipos_ler      on public.tipos_onda for select to anon, authenticated using (true);
create policy config_ler     on public.config     for select to anon, authenticated using (true);
create policy operadores_ler_publico on public.operadores for select to anon using (excluido_em is null);
create policy operadores_ler_gestor  on public.operadores for select to authenticated
  using (excluido_em is null or (select private.g_admin()) or galpao_id = (select private.g_galpao()));

-- ondas: os aparelhos registram só pela função registrar_ondas; só gestor lê, e só do próprio galpão (admin lê tudo)
create policy ondas_ler on public.ondas for select to authenticated
  using ((select private.g_admin()) or galpao_id = (select private.g_galpao()));
create policy ondas_alterar on public.ondas for update to authenticated
  using ((select private.g_pode('registros')) and ((select private.g_admin()) or galpao_id = (select private.g_galpao())))
  with check ((select private.g_pode('registros')) and ((select private.g_admin()) or galpao_id = (select private.g_galpao())));
create policy ondas_excluir on public.ondas for delete to authenticated
  using ((select private.g_pode('registros')) and ((select private.g_admin()) or galpao_id = (select private.g_galpao())));

-- cadastros: gestor com permissão mexe no próprio galpão; itens globais são do administrador
create policy operadores_criar on public.operadores for insert to authenticated
  with check ((select private.g_pode('config')) and ((select private.g_admin()) or galpao_id = (select private.g_galpao())));
create policy operadores_alterar on public.operadores for update to authenticated
  using ((select private.g_pode('config')) and ((select private.g_admin()) or galpao_id = (select private.g_galpao())))
  with check ((select private.g_pode('config')) and ((select private.g_admin()) or galpao_id = (select private.g_galpao())));
create policy galpoes_criar   on public.galpoes for insert to authenticated with check ((select private.g_admin()));
create policy galpoes_excluir on public.galpoes for delete to authenticated using ((select private.g_admin()));
create policy galpoes_alterar on public.galpoes for update to authenticated
  using ((select private.g_admin()) or ((select private.g_pode('config')) and id = (select private.g_galpao())))
  with check ((select private.g_admin()) or ((select private.g_pode('config')) and id = (select private.g_galpao())));
create policy tipos_alterar  on public.tipos_onda for update to authenticated
  using ((select private.g_admin())) with check ((select private.g_admin()));
create policy config_alterar on public.config for update to authenticated
  using ((select private.g_admin())) with check ((select private.g_admin()));

create policy gestores_ler on public.gestores for select to authenticated
  using ((select private.g_admin()) or email = (select private.gestor_email()));
create policy gestores_criar   on public.gestores for insert to authenticated with check ((select private.g_admin()));
create policy gestores_alterar on public.gestores for update to authenticated
  using ((select private.g_admin())) with check ((select private.g_admin()));
create policy gestores_excluir on public.gestores for delete to authenticated using ((select private.g_admin()));
grant execute on function private.gestor_email() to authenticated;

-- ---------- registro de ondas (único caminho de entrada, usado também pela fila offline)
-- Recebe um lote e responde onda por onda, para que uma recusada não derrube as outras.
-- resultado: 'ok' (gravada), 'ja_existia' (reenvio da mesma onda), 'wn_repetido', 'recusada'
create function public.registrar_ondas(lote jsonb)
returns table (id uuid, resultado text, detalhe text)
language plpgsql security definer set search_path = '' as $$
declare o jsonb; n integer;
begin
  if jsonb_typeof(lote) <> 'array' or jsonb_array_length(lote) > 200 then
    raise exception 'Envie uma lista com até 200 ondas' using errcode = '22023';
  end if;
  for o in select * from jsonb_array_elements(lote) loop
    id := null; detalhe := null;
    begin
      id := (o ->> 'id')::uuid;
      insert into public.ondas (id, wn, operador_id, galpao_id, tipo, quantidade, status, registrada_em, concluida_em)
      values (id, o ->> 'wn', (o ->> 'operador_id')::uuid, (o ->> 'operador_id')::uuid /* trocado pelo gatilho */,
              o ->> 'tipo', (o ->> 'quantidade')::integer, coalesce((o ->> 'status')::smallint, 0),
              (o ->> 'registrada_em')::timestamptz, (o ->> 'concluida_em')::timestamptz)
      on conflict on constraint ondas_pkey do nothing;
      get diagnostics n = row_count;
      resultado := case when n = 1 then 'ok' else 'ja_existia' end;
    exception
      when unique_violation then resultado := 'wn_repetido'; detalhe := 'A onda ' || coalesce(o ->> 'wn', '') || ' já foi registrada';
      when others then resultado := 'recusada'; detalhe := sqlerrm;
    end;
    return next;
  end loop;
end $$;
revoke all on function public.registrar_ondas(jsonb) from public;
grant execute on function public.registrar_ondas(jsonb) to anon, authenticated;
