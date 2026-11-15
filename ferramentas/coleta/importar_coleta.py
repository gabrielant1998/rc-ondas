#!/usr/bin/env python3
"""Leva a produção da coleta (Work Package Statistics) para o RC Ondas.

Entrada: o .xlsx (ou .csv) exportado pelo sistema de coleta. Cada linha é uma pessoa,
com total de ondas, pacotes por tipo de onda e produtos.

Uso:
    python ferramentas/coleta/importar_coleta.py arquivo.xlsx
    python ferramentas/coleta/importar_coleta.py arquivo.xlsx --json lote.json --sql lote.sql
    python ferramentas/coleta/importar_coleta.py arquivo.xlsx --push

--push precisa de SUPABASE_URL e SUPABASE_SERVICE_KEY no ambiente (nunca no repositório).
Sem --push o script só lê, confere e grava o que foi pedido: nada é enviado.

Computador e máquina vêm somados na origem e continuam somados aqui, como combinado.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import os
import re
import sys
import unicodedata
import urllib.error
import urllib.request

# Cabeçalho do relatório (chinês) -> campo interno. O relatório em português usa os mesmos nomes.
COLUNAS = {
    "loja": ["loja", "门店"],
    "operador": ["operador", "操作员"],
    "papel": ["papel", "角色"],
    "ondas": ["num de ondas", "número de ondas", "ondas", "波次数量"],
    "itens_unicos_1": ["produto unico (qtd. = 1)", "produto único (qtd. = 1)", "单品(数量=1)"],
    "itens_unicos_n": ["produto unico (qtd. > 1)", "produto único (qtd. > 1)", "单品(数量>1)"],
    "varios": ["multiplos produtos", "múltiplos produtos", "多品"],
    "pacote_mesmo": ["pacotes do mesmo tipo", "pacotes do mesmo tipo", "同类型包裹"],
    "pacote_total": ["pacote total", "包裹总数"],
    "produtos": ["qtd. de produto", "quantidade de produto", "商品数量"],
}

# Tipo de onda do RC Ondas que recebe cada coluna de pacotes da coleta.
TIPOS = {
    "itens_unicos_1": "Itens Únicos",
    "itens_unicos_n": "Múltiplas quantidades",
    "varios": "Vários artigos",
    "pacote_mesmo": "Pacote do mesmo",
}

PAPEIS = {
    "操作主管": "supervisor",
    "打包员": "embalador",
    "拣货员": "coletor",
    "异常单子处理员": "excecao",
}

# papel na coleta -> nome usado no painel
NOME_TAREFA = {
    "coletor": "Coleta",
    "embalador": "Embalagem",
    "supervisor": "Supervisão",
    "excecao": "Exceções",
}


def texto(valor) -> str:
    """Limpa nome/cabeçalho: espaço duro do Excel, espaços repetidos, acentos preservados."""
    if valor is None:
        return ""
    s = str(valor).replace("\xa0", " ").replace("\u3000", " ")
    return re.sub(r"\s+", " ", s).strip()


def chave(valor) -> str:
    """Compara cabeçalhos sem acento, sem maiúscula e sem pontuação."""
    s = unicodedata.normalize("NFKD", texto(valor))
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z0-9=>< ]+", "", s).strip()


def inteiro(valor) -> int:
    if valor is None or texto(valor) == "":
        return 0
    if isinstance(valor, (int, float)):
        return int(round(valor))
    s = re.sub(r"[^0-9,.\-]", "", str(valor)).replace(".", "").replace(",", ".")
    return int(round(float(s or 0)))


def ler_planilha(caminho: str) -> list[dict]:
    if caminho.lower().endswith(".csv"):
        with open(caminho, newline="", encoding="utf-8-sig") as f:
            return [dict(r) for r in csv.DictReader(f)]
    try:
        import openpyxl
    except ImportError:
        sys.exit("Falta openpyxl para ler o .xlsx. Instale com: pip install openpyxl")
    # Alguns exportadores gravam a planilha sem as dimensões; a leitura normal vê todas as linhas.
    wb = openpyxl.load_workbook(caminho, data_only=True)
    linhas = []
    for aba in wb.worksheets:
        it = aba.iter_rows(values_only=True)
        try:
            cabecalho = [texto(c) for c in next(it)]
        except StopIteration:
            continue
        for bruta in it:
            if all(v is None for v in bruta):
                continue
            linhas.append({cabecalho[i]: bruta[i] for i in range(min(len(cabecalho), len(bruta)))})
    return linhas


def mapear_cabecalho(cabecalhos: list[str]) -> dict[str, str]:
    achado = {}
    for alvo, nomes in COLUNAS.items():
        for cab in cabecalhos:
            if chave(cab) in {chave(n) for n in nomes}:
                achado[alvo] = cab
                break
    faltando = [c for c in ("operador", "pacote_total") if c not in achado]
    if faltando:
        sys.exit(f"Planilha sem as colunas obrigatórias: {', '.join(faltando)}. Veio: {cabecalhos}")
    return achado


def papeis_de(valor) -> list[str]:
    partes = [p for p in re.split(r"[;,/|]", texto(valor)) if p.strip()]
    saida = []
    for p in partes:
        nome = PAPEIS.get(p.strip(), chave(p).replace(" ", "_"))
        if nome and nome not in saida:
            saida.append(nome)
    return saida


def dia_do_arquivo(nome: str) -> dt.date | None:
    """Work_Package_Statistics20261115145555644776.xlsx -> 2026-11-15."""
    m = re.search(r"(20\d{2})(\d{2})(\d{2})\d{6}", nome)
    if not m:
        return None
    try:
        return dt.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    except ValueError:
        return None


def montar(linhas: list[dict], nome_arquivo: str, dia: dt.date, loja_pedida: str | None) -> tuple[dict, list[str]]:
    mapa = mapear_cabecalho(list(linhas[0].keys()))
    avisos: list[str] = []
    por_pessoa: dict[str, dict] = {}
    lojas: dict[str, int] = {}

    for i, linha in enumerate(linhas, start=2):
        pessoa = texto(linha.get(mapa["operador"]))
        if not pessoa:
            continue
        loja = texto(linha.get(mapa["loja"], "")) if "loja" in mapa else ""
        if loja:
            lojas[loja] = lojas.get(loja, 0) + 1

        pacotes = {TIPOS[c]: inteiro(linha.get(mapa[c])) for c in TIPOS if c in mapa}
        pacotes = {t: q for t, q in pacotes.items() if q > 0}
        total = inteiro(linha.get(mapa["pacote_total"]))
        soma = sum(pacotes.values())
        if soma != total:
            avisos.append(f"linha {i} ({pessoa}): tipos somam {soma}, pacote total diz {total}")

        reg = {
            "pessoa": pessoa,
            "papeis": papeis_de(linha.get(mapa["papel"])) if "papel" in mapa else [],
            "ondas": inteiro(linha.get(mapa["ondas"])) if "ondas" in mapa else 0,
            "pacotes": pacotes,
            "pacote_total": total,
            "produtos": inteiro(linha.get(mapa["produtos"])) if "produtos" in mapa else 0,
        }

        # Nome repetido no arquivo: soma, para não perder produção nem duplicar pessoa.
        if pessoa in por_pessoa:
            anterior = por_pessoa[pessoa]
            anterior["ondas"] += reg["ondas"]
            anterior["pacote_total"] += reg["pacote_total"]
            anterior["produtos"] += reg["produtos"]
            for t, q in reg["pacotes"].items():
                anterior["pacotes"][t] = anterior["pacotes"].get(t, 0) + q
            for p in reg["papeis"]:
                if p not in anterior["papeis"]:
                    anterior["papeis"].append(p)
            avisos.append(f"linha {i}: {pessoa} aparecia mais de uma vez e foi somada")
        else:
            por_pessoa[pessoa] = reg

    if not por_pessoa:
        sys.exit("Nenhuma pessoa com produção encontrada na planilha.")

    if len(lojas) > 1 and not loja_pedida:
        sys.exit(f"O arquivo tem mais de uma loja ({', '.join(lojas)}). Use --loja para escolher uma.")
    loja = loja_pedida or (next(iter(lojas)) if lojas else "RC")

    pessoas = sorted(por_pessoa.values(), key=lambda r: (-r["pacote_total"], r["pessoa"]))
    lote = {
        "loja": loja,
        "dia": dia.isoformat(),
        "arquivo": nome_arquivo,
        "conferencia": {
            "linhas_lidas": len(linhas),
            "pessoas": len(pessoas),
            "pacotes_fecham": not avisos,
            "computador_e_maquina": "somados na origem, sem separação",
            "avisos": avisos[:50],
        },
        "pessoas": pessoas,
    }
    return lote, avisos


def totais(lote: dict) -> dict:
    p = lote["pessoas"]
    tipos: dict[str, int] = {}
    for r in p:
        for t, q in r["pacotes"].items():
            tipos[t] = tipos.get(t, 0) + q
    return {
        "pessoas": len(p),
        "ondas": sum(r["ondas"] for r in p),
        "pacotes": sum(r["pacote_total"] for r in p),
        "produtos": sum(r["produtos"] for r in p),
        "por_tipo": dict(sorted(tipos.items(), key=lambda kv: -kv[1])),
    }


def top3(itens: list[tuple[str, int]], n: int = 3) -> list[tuple[str, int]]:
    return sorted(itens, key=lambda kv: (-kv[1], kv[0]))[:n]


def relatorio(lote: dict) -> str:
    t = totais(lote)
    linhas = [
        f"Lote {lote['arquivo']}  loja {lote['loja']}  dia {lote['dia']}",
        f"Pessoas {t['pessoas']}  ondas {t['ondas']}  pacotes {t['pacotes']}  produtos {t['produtos']}",
        "",
        "Top 3 geral",
    ]
    for rotulo, campo in (("Pacotes", "pacote_total"), ("Produtos", "produtos"), ("Ondas", "ondas")):
        linha = ", ".join(f"{p} {v}" for p, v in top3([(r["pessoa"], r[campo]) for r in lote["pessoas"]]))
        linhas.append(f"  {rotulo}: {linha}")
    linhas.append("")
    linhas.append("Top 3 por tipo de onda")
    for tipo, _ in sorted(t["por_tipo"].items(), key=lambda kv: -kv[1]):
        candidatos = [(r["pessoa"], r["pacotes"].get(tipo, 0)) for r in lote["pessoas"] if r["pacotes"].get(tipo, 0) > 0]
        linhas.append(f"  {tipo}: " + ", ".join(f"{p} {v}" for p, v in top3(candidatos)))
    return "\n".join(linhas)


def sql_do_lote(lote: dict) -> str:
    """Carga direta no Supabase, para quando não houver chave de serviço à mão."""
    corpo = json.dumps(lote, ensure_ascii=False).replace("'", "''")
    return (
        "-- Gerado por ferramentas/coleta/importar_coleta.py\n"
        "-- Rode no SQL Editor do Supabase (chave de serviço) ou com psql como dono do banco.\n"
        f"select public.importar_coleta('{corpo}'::jsonb);\n"
    )


def enviar(lote: dict) -> dict:
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    chave = os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not url or not chave:
        sys.exit("Defina SUPABASE_URL e SUPABASE_SERVICE_KEY para usar --push.")
    corpo = json.dumps({"p_lote": lote}, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        f"{url}/rest/v1/rpc/importar_coleta",
        data=corpo,
        headers={
            "apikey": chave,
            "Authorization": f"Bearer {chave}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        sys.exit(f"Supabase recusou ({e.code}): {e.read().decode('utf-8', 'replace')[:500]}")


def main() -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    p = argparse.ArgumentParser(description="Importa a produção da coleta para o RC Ondas.")
    p.add_argument("arquivo", help="caminho do .xlsx ou .csv exportado da coleta")
    p.add_argument("--dia", help="dia da produção (AAAA-MM-DD); padrão: data no nome do arquivo ou hoje")
    p.add_argument("--loja", help="loja (ex.: RC); obrigatório se o arquivo tiver mais de uma")
    p.add_argument("--json", dest="saida_json", help="grava o lote normalizado neste arquivo")
    p.add_argument("--sql", dest="saida_sql", help="grava um .sql com a chamada de importação")
    p.add_argument("--push", action="store_true", help="envia ao Supabase (SUPABASE_URL + SUPABASE_SERVICE_KEY)")
    a = p.parse_args()

    caminho = os.path.abspath(a.arquivo)
    if not os.path.isfile(caminho):
        sys.exit(f"Arquivo não encontrado: {caminho}")

    nome = os.path.basename(caminho)
    dia = dt.date.fromisoformat(a.dia) if a.dia else (dia_do_arquivo(nome) or dt.date.today())

    lote, avisos = montar(ler_planilha(caminho), nome, dia, a.loja)
    print(relatorio(lote))
    if avisos:
        print(f"\n{len(avisos)} aviso(s) de conferência:")
        for av in avisos[:10]:
            print(f"  - {av}")
        if len(avisos) > 10:
            print(f"  ... e mais {len(avisos) - 10}")
    else:
        print("\nConferência: pacotes por tipo fecham com o total em todas as linhas.")

    if a.saida_json:
        with open(a.saida_json, "w", encoding="utf-8") as f:
            json.dump(lote, f, ensure_ascii=False, indent=2)
        print(f"\nLote gravado em {a.saida_json}")
    if a.saida_sql:
        with open(a.saida_sql, "w", encoding="utf-8") as f:
            f.write(sql_do_lote(lote))
        print(f"SQL gravado em {a.saida_sql}")
    if a.push:
        print("\nEnviando ao Supabase...")
        print(json.dumps(enviar(lote), ensure_ascii=False))


if __name__ == "__main__":
    main()
