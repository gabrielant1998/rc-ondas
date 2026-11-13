-- Meta mínima para a animação de "meta batida": a festa só aparece quando a produção do dia
-- alcança a meta E também esse valor (0 = sem mínimo). Fica na linha única de config.
alter table public.config
  add column meta_minima integer not null default 0 check (meta_minima between 0 and 10000000);
