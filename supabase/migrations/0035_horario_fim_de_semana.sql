-- Horário de sábado e domingo por turno (diferente do horário da semana).
-- Formato: {"1":{"s":{"ini":7,"fim":13,"ai":null,"af":null},"d":{...}},"2":{...}}
--   ini/fim em horas; ai/af = almoço em minutos desde 0h (nulo = sem almoço). Dia sem chave = horário normal.
alter table public.config add column fds jsonb not null default '{}'::jsonb
  check (jsonb_typeof(fds) = 'object' and pg_column_size(fds) < 2000);
