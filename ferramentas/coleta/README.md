# Importar a produção da coleta

A planilha **Work Package Statistics** (exportação do sistema de coleta) vira um lote no
Supabase do RC Ondas. O painel lê esse lote pela função `ranking_coleta`.

O relatório traz o total por pessoa e por tipo de onda, mas não o número de cada onda.
Por isso a coleta **não** entra em `ondas`: fica em `coleta_lotes` + `coleta_producao`,
ligada ao arquivo importado. Reimportar o mesmo arquivo substitui o lote.

Computador e máquina vêm somados na origem e continuam somados aqui: a importação não
separa os dois.

## Como rodar

```bash
pip install openpyxl                       # só para ler .xlsx
python ferramentas/coleta/importar_coleta.py Work_Package_Statistics20261115145555644776.xlsx
```

O script só lê e confere; nada é enviado. Para gravar:

```bash
# 1) gerar o SQL e rodar no SQL Editor do Supabase
python ferramentas/coleta/importar_coleta.py arquivo.xlsx --sql lote.sql

# 2) ou enviar direto (chave de serviço, nunca no repositório)
set SUPABASE_URL=https://SEU-PROJETO.supabase.co
set SUPABASE_SERVICE_KEY=sua-chave-de-servico
python ferramentas/coleta/importar_coleta.py arquivo.xlsx --push
```

`--dia` escolhe o dia (padrão: a data no nome do arquivo, senão hoje) e `--loja` escolhe a
loja quando o arquivo tem mais de uma.

## De → para

| Planilha | RC Ondas |
|---|---|
| Núm de Ondas | `coleta_producao.ondas` |
| Produto Único (Qtd. = 1) | tipo **Itens Únicos** |
| Produto Único (Qtd. > 1) | tipo **Múltiplas quantidades** |
| Múltiplos Produtos | tipo **Vários artigos** |
| Pacotes do mesmo tipo | tipo **Pacote do mesmo** |
| Pacote Total | `pacote_total` |
| Qtd. de Produto | `produtos` |
| Papel (打包员/拣货员/操作主管/异常单子处理员) | `papeis` (embalador/coletor/supervisor/excecao) |

## Conferência

Cada linha é conferida: os quatro tipos de pacote precisam somar o Pacote Total. Diferença
de 1 unidade é arredondamento da origem e passa; acima disso o lote é recusado com o nome
das pessoas. Nome repetido no arquivo é somado em uma linha. Os avisos ficam em
`coleta_lotes.conferencia`.

Na planilha de 15/11/2026 (loja RC): 91 pessoas, 27.786 ondas, 1.431.257 pacotes,
1.589.133 produtos, 4 linhas com 1 pacote de diferença.

## Leitura

```sql
select public.ranking_coleta('2026-11-15');   -- gestor com permissão individual
```

Devolve `totais`, `metricas` (Top 3 de ondas, pacotes e produtos) e `tipos` (Top 3 por tipo
de onda). O público não lê nome de pessoa: a função responde `sem_permissao`.
