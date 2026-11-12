-- A 0003 chegou a remover galpoes.meta_diaria, mas o site publicado ainda grava essa coluna
-- (criação e edição de galpão). A coluna volta; a meta que vale é a de metas_diarias.
alter table public.galpoes add column if not exists meta_diaria integer check (meta_diaria > 0);
