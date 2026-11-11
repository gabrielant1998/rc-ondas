# RC Ondas

Sistema de painel e operação de ondas. Hospedado com GitHub Pages.

Os dados ficam salvos no navegador de cada aparelho (localStorage). Não há banco de dados ainda.

## Testes

Bateria com 32 cenários (volume de 60 mil ondas, WN repetido, quantidades inválidas, offline, hora extra, virada do dia, permissões, XSS, celular).

```bash
npm i -D playwright
python3 -m http.server 8765 --bind 127.0.0.1 &   # na raiz do repositório
node tests/run.js
```

## Limite atual

Os dados ficam no navegador de cada aparelho (cerca de 5 MB, perto de 60 mil ondas). Para uso contínuo, é preciso ligar um banco de dados.
