-- Abas por gestor: o administrador escolhe quais abas cada gestor vê.
-- null = todas as abas (comportamento anterior). Administradores sempre veem todas.
-- A edição segue a política existente de gestores (somente administrador).
alter table public.gestores
  add column abas text[] check (abas is null or (cardinality(abas) > 0
    and abas <@ array['painel', 'op', 'prs', 'ind', 'his', 'cfg']::text[]));
