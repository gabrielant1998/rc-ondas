-- Uma configuração compartilhada por tipo; preserva os tipos que já aceitavam várias linhas.
alter table public.tipos_onda
  add column multiplas_no_lancamento boolean not null default false;

update public.tipos_onda
set multiplas_no_lancamento = true
where nome in ('Pacote do mesmo', 'Maiores/Pesados', 'Retrabalho');
