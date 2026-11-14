-- Retrabalho não entra nas metas do dia, coletiva e individual (regra no aplicativo);
-- tem uma meta individual própria, em unidades por dia, por galpão.
alter table public.galpoes add column meta_ind_ret integer check (meta_ind_ret > 0);
