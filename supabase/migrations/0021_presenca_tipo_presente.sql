-- Checking diário: além de falta, declaração, atestado e folga, o gestor marca "Presente" para dar a pessoa como conferida.
alter table public.presenca_registros drop constraint presenca_registros_tipo_check;
alter table public.presenca_registros add constraint presenca_registros_tipo_check
  check (tipo in ('falta', 'declaracao', 'atestado', 'folga', 'presente'));
