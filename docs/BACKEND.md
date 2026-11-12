# RC Ondas: desenho do banco de dados (Supabase)

Estado: esquema aplicado no projeto Supabase `rc-ondas` e testado em PostgreSQL 16 local (48 testes). O aplicativo usa o banco quando roda no GitHub Pages; em outros endereços continua gravando só no aparelho (use `?srv=1` para ligar e `?srv=0` para desligar).

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
| Público, sem login | Ler galpões, tipos, configuração e operadores ativos. Registrar ondas pela função `registrar_ondas`. O painel consulta apenas totais agregados; não lê as ondas individuais. |
| Gestor comum | Ler e, se tiver permissão, alterar ondas do próprio galpão. Cadastrar operadores do próprio galpão. |
| Administrador | Tudo, em todos os galpões: tipos, configuração, galpões e gestores. |

O gestor é reconhecido pelo e-mail confirmado no Supabase Auth. Sempre existe pelo menos um administrador.

## 5. Repetição e concorrência
A entrada de ondas é a função `registrar_ondas(lote)`. Ela recebe até 200 ondas e responde uma por uma, para que uma recusada não derrube as outras. O id vem do aparelho, então reenviar é seguro.

## 6. Acompanhamento
`criada_em` (chegada ao servidor) contra `registrada_em` (hora do aparelho) mostra o atraso de sincronização. O aparelho mostra quantas ondas estão pendentes.

## Decisões tomadas
1. **Painel público.** A função `painel_publico` retorna totais por dia, tipo, hora e galpão, sem WN nem detalhes de operador. A tabela de ondas continua restrita a gestores: cada gestor vê o próprio galpão e o administrador vê todos.
2. **Tela pública de registro.** Qualquer pessoa com o link pode registrar ondas. O banco valida operador, tipo, limite, data e WN, mas não limita a quantidade de envios.

## Entrada de gestores
O administrador cadastra o e-mail do gestor em Config, Gestores. O gestor cria a própria senha em Entrar, Primeiro acesso, e confirma pelo link que chega por e-mail. Só e-mail confirmado e cadastrado como gestor tem acesso.

No painel do Supabase, em Authentication, URL Configuration, o Site URL precisa ser o endereço do site, para os links de confirmação voltarem ao lugar certo.

## Como testar
```bash
createdb rc
psql -d rc -f supabase/tests/shim_supabase.sql -f supabase/migrations/0001_rc_ondas.sql
psql -d rc -f supabase/tests/rls_test.sql

# aplicativo no modo servidor, com banco simulado (17 cenários)
node tests/run_srv.js
```

## Gestão operacional

- A área continua restrita a gestores com permissão de acompanhamento individual. A consulta do histórico é feita conforme o período selecionado.
- A referência individual divide a meta diária **atual** de cada galpão entre as pessoas com alguma bipagem naquele dia. A referência muda quando novas bipagens são sincronizadas e não considera diferenças de dificuldade entre tipos.
- A meta coletiva soma as metas diárias atuais dos galpões nos dias com atividade e no dia de hoje; é comparada com as unidades concluídas da equipe somente quando todos os turnos estão selecionados. O sistema não desconta faltas ou horas extras automaticamente.
- Uma pessoa sem bipagem é sinalizada como **falta a conferir** somente depois do fim do seu turno e quando houve alguma atividade registrada no mesmo galpão e turno. Dias anteriores ao cadastro, futuros ou sem operação identificada não contam como falta. A ausência de bipagem não comprova ausência ao trabalho.
- A hora extra estimada soma apenas os intervalos entre bipagens fora do turno e da tolerância configurada, quando esses intervalos não ultrapassam o intervalo máximo. Uma bipagem isolada ou uma pausa maior não permite calcular a duração. Não é controle de ponto.
- O histórico usa as metas e os turnos **atuais**, pois o sistema não mantém versões anteriores dessas configurações.
