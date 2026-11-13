-- Horário justificado do atraso: o gestor pode informar o horário aceito para a chegada do dia.
-- O primeiro bipe real (horário das ondas) nunca muda; o atraso passa a ser calculado a partir deste horário quando ele existir.
alter table public.presenca_atrasos
  add column horario_justificado timestamptz;
