#!/usr/bin/env python3
"""Extrae los artículos de un PDF de normativa de la OE a JSON (formato `oe-normativa/1`).

Uso:
    uv run --with pdfplumber scripts/normativa-extract.py <estatutos|reglamento|acta|otro> <archivo.pdf> > salida.json

El JSON se revisa a mano (10-verificacion.md) y se carga desde /admin/documentos. Escrito desde cero
para la casa digital (ADR-034 regla 9); las advertencias salen por stderr.
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

try:
    import pdfplumber
except ImportError:  # pragma: no cover - lo instala `uv run --with pdfplumber`
    sys.stderr.write("Falta pdfplumber: corré el script con `uv run --with pdfplumber`.\n")
    sys.exit(2)

KINDS = {"estatutos": "ESTATUTOS", "reglamento": "REGLAMENTO", "acta": "ACTA", "otro": "OTRO"}

CHAPTER_RE = re.compile(
    r"^\s*(CAP[IÍ]TULO|T[IÍ]TULO)\s+([IVXLCDM]+|\d+)\b\s*[.:\-–—]?\s*(.*)$", re.IGNORECASE
)
ARTICLE_RE = re.compile(
    r"^\s*ART[IÍ]CULO\s+(\d+)\s*([A-Za-z]?)\s*[.:°º\-–—]?\s*(.*)$", re.IGNORECASE
)
# "DEFINICIÓN. La Organización…" → título en mayúsculas seguido de punto o dos puntos.
TITLE_RE = re.compile(r"^([A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ0-9 ,;()/\-]{2,120}?)\s*[.:]\s*(.*)$")
PARAGRAPH_START = re.compile(
    r"^(PAR[ÁA]GRAFO|Par[áa]grafo)\b|^\d{1,2}[.)]\s|^[a-zA-Z][.)]\s|^[•\-–]\s"
)
PAGE_NUMBER_RE = re.compile(r"^\d{1,3}$|^p[áa]gina\s+\d+(\s+de\s+\d+)?$", re.IGNORECASE)
ROMAN = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100, "D": 500, "M": 1000}


def roman_to_int(value: str) -> int:
    value = value.upper()
    if value.isdigit():
        return int(value)
    total = 0
    previous = 0
    for char in reversed(value):
        current = ROMAN.get(char, 0)
        total = total - current if current < previous else total + current
        previous = max(previous, current)
    return total


def clean_lines(pages: list[str]) -> list[tuple[int, str]]:
    """Líneas no vacías con su página; sin encabezados/pies repetidos ni números de página."""
    per_page: list[list[str]] = []
    counter: Counter[str] = Counter()
    for text in pages:
        lines = [line.strip() for line in (text or "").splitlines()]
        lines = [line for line in lines if line]
        per_page.append(lines)
        counter.update(set(lines))
    total = len(pages)
    repeated = {line for line, count in counter.items() if total >= 3 and count >= max(3, total * 0.5)}
    result: list[tuple[int, str]] = []
    for index, lines in enumerate(per_page, start=1):
        for line in lines:
            if line in repeated or PAGE_NUMBER_RE.match(line):
                continue
            result.append((index, line))
    return result


def join_body(lines: list[str]) -> str:
    """Une líneas en párrafos: parágrafos, numerales y viñetas abren párrafo; los guiones de corte se cierran."""
    paragraphs: list[str] = []
    current = ""
    for line in lines:
        if PARAGRAPH_START.match(line) and current:
            paragraphs.append(current)
            current = line
            continue
        if not current:
            current = line
        elif current.endswith("-") and line[:1].islower():
            current = current[:-1] + line
        else:
            current = f"{current} {line}"
    if current:
        paragraphs.append(current)
    return "\n\n".join(paragraphs).strip()


def split_title(rest: str) -> tuple[str, str]:
    match = TITLE_RE.match(rest)
    if match and match.group(1).upper() == match.group(1):
        return match.group(1).strip(), match.group(2).strip()
    return "", rest.strip()


def extract(kind: str, pdf_path: Path) -> dict:
    with pdfplumber.open(str(pdf_path)) as pdf:
        pages = [page.extract_text() or "" for page in pdf.pages]
    lines = clean_lines(pages)
    chapter_key, chapter_title = "cap-0", ""
    articles: list[dict] = []
    current: dict | None = None
    body_lines: list[str] = []
    pending_chapter_title = False
    warnings: list[str] = []
    seen_keys: Counter[str] = Counter()

    def flush() -> None:
        nonlocal current, body_lines
        if current is None:
            return
        body = join_body(body_lines)
        first_line = current.pop("_first", "")
        if first_line:
            body = f"{first_line}\n\n{body}".strip() if body else first_line
        if not body:
            warnings.append(f"Artículo {current['number']} sin cuerpo (página {current['pages'][0] if current['pages'] else '?'})")
            body = current["title"] or f"Artículo {current['number']}"
        current["body"] = body
        current["pages"] = sorted(set(current["pages"]))
        articles.append(current)
        current = None
        body_lines = []

    for page, line in lines:
        chapter = CHAPTER_RE.match(line)
        if chapter:
            flush()
            number = roman_to_int(chapter.group(2))
            chapter_key = f"{chapter.group(1).lower().replace('í', 'i')[:3]}-{number}"
            chapter_title = chapter.group(3).strip()
            pending_chapter_title = not chapter_title
            continue
        if pending_chapter_title:
            pending_chapter_title = False
            if line.upper() == line and not ARTICLE_RE.match(line):
                chapter_title = line
                continue
        article = ARTICLE_RE.match(line)
        if article:
            flush()
            number = f"{article.group(1)}{article.group(2).upper()}"
            key = f"art-{number.lower()}"
            seen_keys[key] += 1
            if seen_keys[key] > 1:
                warnings.append(f"Artículo {number} repetido; queda como {key}-{seen_keys[key]}")
                key = f"{key}-{seen_keys[key]}"
            title, first = split_title(article.group(3))
            current = {
                "key": key,
                "chapterKey": chapter_key,
                "chapterTitle": chapter_title,
                "number": number,
                "title": title,
                "pages": [page],
                "_first": first,
            }
            body_lines = []
            continue
        if current is not None:
            body_lines.append(line)
            current["pages"].append(page)
    flush()

    numbers = [int(re.sub(r"\D", "", item["number"]) or 0) for item in articles]
    for previous, following in zip(numbers, numbers[1:]):
        if following not in (previous, previous + 1):
            warnings.append(f"Salto de numeración: del artículo {previous} al {following}")
    if not articles:
        warnings.append("No se encontró ningún artículo: revisá que el PDF tenga texto (no solo imágenes)")
    for warning in warnings:
        sys.stderr.write(f"aviso: {warning}\n")
    return {
        "format": "oe-normativa/1",
        "kind": kind,
        "source": pdf_path.name,
        "pages": len(pages),
        "articles": articles,
    }


def main(argv: list[str]) -> int:
    if len(argv) != 3 or argv[1].lower() not in KINDS:
        sys.stderr.write(__doc__ or "")
        return 2
    pdf_path = Path(argv[2])
    if not pdf_path.is_file():
        sys.stderr.write(f"No existe {pdf_path}\n")
        return 2
    result = extract(KINDS[argv[1].lower()], pdf_path)
    json.dump(result, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 0 if result["articles"] else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
