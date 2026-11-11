# RC Ondas: desenho do banco de dados (Supabase)

Estado: esquema escrito e testado em PostgreSQL 16 local (48 testes). Ainda não aplicado em um projeto Supabase.

## 1. Contexto
Página estática que fala direto com o banco pela API do Supabase. Não há servidor próprio, então toda regra fica no banco.

## 2. Dados
- `galpoes`: nome único e meta diária opcional.
- `tipos_onda`: os seis tipos e o limite de quantidade de cada um.
- `config`: linha única com turnos, tolerância de hora extra e intervalo máximo.
- `operadores`: código `CL000`, nome, turno e galpão. Exclusão lógica, para o histórico não perder o operador. Código e nome só são únicos entre os ativos, então um código excluído volta a ficar livre.
- `ondas`: id gerado no aparelho, WN, operador, galpão, tipo, quantidade, status e horários. O WN normalizado é único.
- `gestores`: e-mail, galpão, administrador e três permissões.

## 3. O que pode dar errado
| Situação | O que acontece |
|---|---|
| Sem internet | A onda fica na fila do aparelho e é enviada depois |
| Mesma onda enviada duas vezes | O banco responde `ja_existia` e não duplica |
| WN já usado | Resposta `wn_repetido`; o aparelho avisa quem registrou |
| Quantidade acima do limite | Resposta `recusada` com o motivo |
| Projeto pausado (plano gratuito, 1 semana sem uso) | A fila segura os registros até o projeto voltar |

## 4. Permissões
| Quem | Pode |
|---|---|
| Público, sem login | Ler galpões, tipos, configuração e operadores ativos. Registrar ondas pela função `registrar_ondas`. Não lê ondas. |
| Gestor comum | Ler e, se tiver permissão, alterar ondas do próprio galpão. Cadastrar operadores do próprio galpão. |
| Administrador | Tudo, em todos os galpões: tipos, configuração, galpões e gestores. |

O gestor é reconhecido pelo e-mail confirmado no Supabase Auth. Sempre existe pelo menos um administrador.

## 5. Repetição e concorrência
A entrada de ondas é a função `registrar_ondas(lote)`. Ela recebe até 200 ondas e responde uma por uma, para que uma recusada não derrube as outras. O id vem do aparelho, então reenviar é seguro.

## 6. Acompanhamento
`criada_em` (chegada ao servidor) contra `registrada_em` (hora do aparelho) mostra o atraso de sincronização. O aparelho mostra quantas ondas estão pendentes.

## Decisões em aberto
1. **Painel público ou com login.** O esquema atual não deixa o público ler ondas, porque sem login não há como limitar por galpão. Se o painel precisar ficar aberto, basta uma regra de leitura a mais, e aí qualquer pessoa com o link vê todos os galpões.
2. **Abuso da tela pública.** Qualquer pessoa com o link pode registrar ondas. O banco valida operador, tipo, limite, data e WN, mas não limita a quantidade de envios.

## Como testar
```bash
createdb rc
psql -d rc -f supabase/tests/shim_supabase.sql -f supabase/migrations/0001_rc_ondas.sql
psql -d rc -f supabase/tests/rls_test.sql
```
