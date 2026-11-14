-- Pausas programadas por turno (café, ginástica laboral etc.), além do almoço.
-- Formato: {"1":[{"n":"Café","i":570,"f":585}], "2":[...]}  (minutos desde 0h).
-- Como o almoço, não contam como pausa, atraso nem hora extra.
alter table public.config add column pausas jsonb not null default '{}'::jsonb
  check (jsonb_typeof(pausas) = 'object' and pg_column_size(pausas) < 4000);
