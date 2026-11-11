# RC Ondas: sistema visual

Referência: sinalização de galpão e etiqueta de expedição. Chapado, com linhas e números estreitos.

## Cores
| Nome | Claro | Escuro | Uso |
|---|---|---|---|
| Piso `--bg` | #eef1f4 | #0e1726 | fundo da página |
| Papel `--card` | #ffffff | #152033 | painéis |
| Tinta `--ink` | #14243d | #e8edf5 | texto |
| Cinza `--mut` | #55627a | #9aa7bd | texto de apoio |
| Linha `--line` | #d3d9e3 | #2a3850 | divisórias |
| Azul doca `--g` | #0f4bd0 | #2a63e0 | ação e dado principal |
| Faixa `--band` | #0d2a5e | #173a85 | placar do turno e menu |
| Vermelho `--r` | #d42a2a | #d42a2a | só problema: erro, atraso, menor hora |

Tipos de onda: azul, azul-marinho, azul claro, cinza, laranja (Retrabalho) e verde-água (Pacote do mesmo).

## Letra
- Barlow Condensed 600/700: números, título da página, WN e quantidades.
- Barlow 400/500/600: todo o resto. Corpo em 15px.
- Títulos em caixa normal. Sem maiúsculas espaçadas.

## Forma
- Raio 4px em campos e botões, 6px em painéis. Sem sombra e sem gradiente.
- Painel com borda de 1px. O único bloco cheio é o placar do turno.
- Abas internas sublinhadas. Status com quadradinho de cor e texto.
- Área de toque mínima de 40px (44px nos botões principais).

## Componentes
- Placar do turno: número grande, régua com as horas, marca "agora" e mensagem de ritmo.
- Faixa de números: valores lado a lado com divisórias, sem ícones.
- Crachá: avatar com iniciais, nome, código, turno e galpão.
- Pictograma por tipo de onda, usado nos botões e nas listas.
- Estado vazio: ícone, frase e, quando existe, o botão do próximo passo.

## Texto
- Frases curtas, em caixa normal, sem "·", setas ou emojis.
- Botão diz o que acontece: "Salvar ondas", "Criar usuário".
- Erro diz o que houve e como resolver.
