# RC Ondas

Sistema de painel e operação de ondas. Hospedado com GitHub Pages.

No GitHub Pages os dados ficam no Supabase, com fila offline no aparelho. Veja `docs/BACKEND.md`.

## Testes

Bateria com 35 cenários (volume de 60 mil ondas, WN repetido, quantidades inválidas, offline, hora extra, virada do dia, permissões, XSS, celular).

```bash
npm i -D playwright
python3 -m http.server 8765 --bind 127.0.0.1 &   # na raiz do repositório
node tests/run.js
```

## Limites

O plano gratuito do Supabase pausa o projeto após uma semana sem uso. A fila do aparelho guarda os registros enquanto isso.
