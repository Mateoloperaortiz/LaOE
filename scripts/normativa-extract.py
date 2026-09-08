#!/usr/bin/env python3
r"""Extrae un PDF revisable como oe-normativa/2, sin reescribir su contenido.

Uso:
    uv run --python 3.12 --with-requirements scripts/requirements-normativa.txt \
        python scripts/normativa-extract.py estatutos original.pdf \
        --profile perfil-privado.json --assets-dir directorio-privado > corpus-privado.json

El perfil opcional resuelve límites que requieren revisión visual. Admite sha256,
bodyStartPage (1-based), closing {page, top, columnsBottom?, columnBreaks?} e
images [{page, bbox: [x0, top, x1, bottom], assetId, alt}]. Las coordenadas son
puntos PDF desde arriba. Las imágenes se extraen del objeto original, no se
recrean. El perfil, el corpus y los medios reales nunca se commitean.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path

import pdfplumber

KINDS = {"estatutos": "ESTATUTOS", "reglamento": "REGLAMENTO", "acta": "ACTA", "otro": "OTRO"}
ORDINALS = {
    "PRIMERO": 1, "SEGUNDO": 2, "TERCERO": 3, "CUARTO": 4, "QUINTO": 5,
    "SEXTO": 6, "SEPTIMO": 7, "OCTAVO": 8, "NOVENO": 9, "DECIMO": 10,
    "DECIMOPRIMERO": 11, "DECIMOSEGUNDO": 12,
}
CHAPTER_RE = re.compile(r"^(CAP[IÍ]TULO|T[IÍ]TULO)\s+([A-ZÁÉÍÓÚ]+|\d+)\b\s*[.:\-–—]?\s*(.*)$", re.I)
# El delimitador es obligatorio: una referencia «Artículo 7 de…» nunca es título.
# Un sufijo pertenece al número solo cuando está unido a él.
ARTICLE_RE = re.compile(r"^ART[IÍ]CULO\s+(\d+[A-Za-z]?)\s*[:.]\s*(.*)$", re.I)
ANNEX_RE = re.compile(r"^ANEXO\s+(\d+)\s*[:.]\s*(.*)$", re.I)
PARAGRAPH_START = re.compile(r"^(?:PAR[ÁA]GRAFO\b|\d{1,3}[.)]\s*|[a-zA-Z][.)]\s|[•\-–]\s)", re.I)
PAGE_NUMBER_RE = re.compile(r"^\d{1,3}$|^p[áa]gina\s+\d+(\s+de\s+\d+)?$", re.I)
CONTENTS_RE = re.compile(r"^(?:CONTENIDO|[ÍI]NDICE|TABLA DE CONTENIDO)$", re.I)


def unaccent(value: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", value) if not unicodedata.combining(c))


def chapter_number(value: str) -> int:
    value = unaccent(value.upper())
    if value.isdigit():
        return int(value)
    if value in ORDINALS:
        return ORDINALS[value]
    if not re.fullmatch(r"[IVXLCDM]+", value):
        raise ValueError(f"Ordinal de capítulo desconocido: {value}; revisá el original")
    roman = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100, "D": 500, "M": 1000}
    total = previous = 0
    for char in reversed(value):
        current = roman[char]
        total += -current if current < previous else current
        previous = max(previous, current)
    return total


def line_event(page: int, line: dict) -> dict:
    return {
        "page": page, "text": line["text"].strip(), "top": line["top"],
        "bottom": line["bottom"], "x0": line["x0"], "x1": line["x1"],
        "fonts": frozenset(c["fontname"] for c in line.get("chars", [])),
    }


def inside(line: dict, bbox: tuple | list) -> bool:
    midpoint = (line["top"] + line["bottom"]) / 2
    return bbox[1] <= midpoint <= bbox[3] and line["x0"] >= bbox[0] - 2 and line["x1"] <= bbox[2] + 2


def export_image(pdf_path: Path, page: int, source: dict, asset_id: str, directory: Path) -> Path:
    """Decodifica el XObject original: conserva resolución y píxeles del PDF."""
    from pypdf import PdfReader

    if not re.fullmatch(r"[a-zA-Z0-9_-]+", asset_id):
        raise ValueError("assetId de extracción debe ser un nombre local simple")
    reader = PdfReader(pdf_path)
    matches = [image for image in reader.pages[page - 1].images
               if image.indirect_reference and image.indirect_reference.idnum == source["stream"].objid]
    if len(matches) != 1:
        raise ValueError(f"No se pudo resolver la imagen original en página {page}")
    image = matches[0]
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    path = directory / f"{asset_id}{Path(image.name).suffix}"
    path.write_bytes(image.data)
    path.chmod(0o600)
    return path


def read_events(pdf_path: Path, profile: dict, assets_dir: Path | None) -> tuple[int, list[dict]]:
    events: list[dict] = []
    marginal_counts: Counter[str] = Counter()
    closing = profile.get("closing")
    with pdfplumber.open(pdf_path) as pdf:
        total = len(pdf.pages)
        page_options = [profile.get("bodyStartPage", 1)]
        if closing:
            page_options.append(closing["page"])
        page_options.extend(image["page"] for image in profile.get("images", []))
        if any(not isinstance(n, int) or not 1 <= n <= total for n in page_options):
            raise ValueError("El perfil contiene una página fuera del PDF")
        for page_no, page in enumerate(pdf.pages, 1):
            lines = [line_event(page_no, line) for line in page.extract_text_lines(return_chars=True)]
            for line in lines:
                line["marginal"] = line["top"] < 40 or line["bottom"] > page.height * .90
            marginal_counts.update({line["text"] for line in lines
                                    if line["marginal"]})
            lines = [line for line in lines if not (
                PAGE_NUMBER_RE.fullmatch(line["text"]) and line["top"] > page.height * .85)]
            inserts: list[dict] = []
            for table in page.find_tables():
                cells = table.extract()
                if len(cells) < 2 or len(cells[0]) < 2:
                    continue
                rows = [[re.sub(r"\s+", " ", value or "").strip() for value in row] for row in cells]
                lines = [line for line in lines if not inside(line, table.bbox)]
                inserts.append({"page": page_no, "top": table.bbox[1], "bottom": table.bbox[3],
                                "block": {"type": "table", "headers": rows[0], "rows": rows[1:]}})
            for spec in profile.get("images", []):
                if spec["page"] != page_no:
                    continue
                if assets_dir is None:
                    raise ValueError("El perfil incluye imágenes: indicá --assets-dir privado")
                matches = [image for image in page.images if all(abs(a - b) < 1 for a, b in zip(
                    (image["x0"], image["top"], image["x1"], image["bottom"]), spec["bbox"]))]
                if len(matches) != 1 or not spec.get("alt", "").strip():
                    raise ValueError(f"Imagen o texto alternativo ambiguo en página {page_no}")
                export_image(pdf_path, page_no, matches[0], spec["assetId"], assets_dir)
                inserts.append({"page": page_no, "top": spec["bbox"][1], "bottom": spec["bbox"][3],
                                "block": {"type": "image", "assetId": spec["assetId"], "alt": spec["alt"]}})
            if closing and closing["page"] == page_no:
                inserts.append({"page": page_no, "top": closing["top"] - .01,
                                "section": ("cierre", "Firmas y última reforma")})
                if closing.get("columnBreaks"):
                    bottom = closing["columnsBottom"]
                    bounds = [0, *closing["columnBreaks"], page.width]
                    lines = [line for line in lines if not closing["top"] <= line["top"] < bottom]
                    for index, (left, right) in enumerate(zip(bounds, bounds[1:])):
                        cropped = page.crop((left, closing["top"], right, bottom))
                        text = cropped.extract_text() or ""
                        if text.strip():
                            inserts.append({"page": page_no, "top": closing["top"] + index * .001,
                                            "bottom": bottom, "block": {"type": "text", "text": text.strip()}})
            events.extend(sorted([*lines, *inserts], key=lambda event: event["top"]))
        # Solo se eliminan repeticiones en márgenes, nunca prosa repetida del cuerpo.
        repeated = {value for value, count in marginal_counts.items() if count >= max(3, total * .5)}
        events = [event for event in events if not (event.get("marginal") and event.get("text") in repeated)]
    return total, events


def join_lines(lines: list[dict]) -> list[dict]:
    """Recompone párrafos sin corregir puntuación, palabras o numeración originales."""
    paragraphs: list[str] = []
    current = ""
    previous = None
    for line in lines:
        value = line["text"]
        gap = (previous is not None and line["page"] == previous["page"]
               and line["top"] - previous["bottom"] > 5)
        if current and (gap or PARAGRAPH_START.match(value)):
            paragraphs.append(current)
            current = value
        else:
            current = f"{current} {value}".strip()
        previous = line
    if current:
        paragraphs.append(current)
    return [{"type": "text", "text": paragraph} for paragraph in paragraphs]


def extract(kind: str, pdf_path: Path, *, profile: dict | None = None,
            assets_dir: Path | None = None) -> dict:
    profile = profile or {}
    if kind not in KINDS.values():
        raise ValueError("Tipo de documento desconocido")
    source_hash = hashlib.sha256(pdf_path.read_bytes()).hexdigest()
    if profile.get("sha256") and profile["sha256"] != source_hash:
        raise ValueError("El SHA-256 del perfil no coincide con el PDF revisado")
    total, events = read_events(pdf_path, profile, assets_dir)
    contents = next((index for index, event in enumerate(events)
                     if CONTENTS_RE.fullmatch(event.get("text", ""))), None)
    body_start = profile.get("bodyStartPage")
    if contents is not None:
        if body_start is None:
            conventions = next((event for event in events[contents + 1:]
                                if event.get("text", "").upper() == "CONVENCIONES"), None)
            if conventions is None:
                raise ValueError("El índice necesita bodyStartPage en un perfil revisado")
            body_start = conventions["page"]
        events = events[:contents] + [event for event in events[contents + 1:] if event["page"] >= body_start]
    elif body_start is not None:
        events = [event for event in events if event["page"] >= body_start]

    units: list[dict] = []
    current: dict | None = None
    text_lines: list[dict] = []
    chapter_key, chapter_title = "cap-0", ""
    heading: dict | None = None
    heading_type: str | None = None
    seen: set[str] = set()

    def flush_text() -> None:
        nonlocal text_lines
        if current:
            current["blocks"].extend(join_lines(text_lines))
        text_lines = []

    def flush() -> None:
        nonlocal current
        flush_text()
        if current:
            if not current["blocks"]:
                raise ValueError(f"Unidad sin contenido: {current['key']}; revisá el original")
            current["pages"] = sorted(set(current["pages"]))
            units.append(current)
        current = None

    def begin(key: str, unit_type: str, title: str, page: int, number: str | None = None) -> None:
        nonlocal current
        flush()
        if key in seen:
            raise ValueError(f"Unidad repetida: {key}; no se renumera automáticamente")
        seen.add(key)
        current = {"key": key, "unitType": unit_type,
                   "chapterKey": chapter_key if unit_type == "ARTICLE" else key,
                   "chapterTitle": chapter_title if unit_type == "ARTICLE" else "",
                   "number": number, "title": title, "pages": [page], "blocks": []}

    for event in events:
        value = event.get("text", "")
        page = event["page"]
        if "section" in event:
            key, title = event["section"]
            begin(key, "SECTION", title, page)
            heading = heading_type = None
            continue
        if "block" in event:
            if current is None:
                raise ValueError(f"Tabla o imagen sin unidad en página {page}")
            flush_text()
            current["blocks"].append(event["block"])
            current["pages"].append(page)
            heading = heading_type = None
            continue
        chapter = CHAPTER_RE.match(value)
        article = ARTICLE_RE.match(value)
        annex = ANNEX_RE.match(value)
        if chapter:
            flush()
            chapter_key = f"{'cap' if unaccent(chapter.group(1).upper()) == 'CAPITULO' else 'tit'}-{chapter_number(chapter.group(2))}"
            chapter_title = value
            heading, heading_type = event, "chapter"
            continue
        if article:
            number = article.group(1).upper()
            begin(f"art-{number.lower()}", "ARTICLE", article.group(2).strip(), page, number)
            heading, heading_type = event, "article"
            continue
        if annex:
            begin(f"anexo-{annex.group(1)}", "SECTION", value, page)
            heading, heading_type = event, "section"
            continue
        if value.upper() == "CONVENCIONES":
            begin("convenciones", "SECTION", value, page)
            heading = heading_type = None
            continue
        if heading is not None:
            nearby = page == heading["page"] and event["top"] - heading["bottom"] <= 5
            styled = bool(heading["fonts"]) and event["fonts"] == heading["fonts"]
            continuation = nearby and styled and (
                heading_type == "chapter" and value.isupper()
                or heading_type in ("article", "section") and any("Bold" in font for font in event["fonts"])
            )
            if continuation:
                if heading_type == "chapter":
                    chapter_title += " " + value
                else:
                    current["title"] = f"{current['title']} {value}".strip()
                    current["pages"].append(page)
                heading = event
                continue
            heading = heading_type = None
        if current is None:
            if units:
                raise ValueError(f"Texto sin unidad después de un capítulo, página {page}: {value[:70]}")
            begin("introduccion", "SECTION", "Introducción", page)
        current["pages"].append(page)
        text_lines.append(event)
    flush()
    articles = [unit for unit in units if unit["unitType"] == "ARTICLE"]
    if not articles:
        raise ValueError("No se encontró ningún artículo; revisá el texto o perfil del PDF")
    numeric = [int(re.match(r"\d+", unit["number"]).group()) for unit in articles]
    for previous, following in zip(numeric, numeric[1:]):
        if following not in (previous, previous + 1):
            raise ValueError(f"Salto de numeración: {previous} a {following}; revisá el original")
    return {"format": "oe-normativa/2", "kind": kind, "source": pdf_path.name,
            "pages": total, "sha256": source_hash, "units": units}


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("kind", choices=KINDS)
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--profile", type=Path)
    parser.add_argument("--assets-dir", type=Path)
    args = parser.parse_args(argv[1:])
    try:
        profile = json.loads(args.profile.read_text()) if args.profile else None
        result = extract(KINDS[args.kind], args.pdf, profile=profile, assets_dir=args.assets_dir)
    except (ValueError, OSError, KeyError, TypeError) as error:
        sys.stderr.write(f"No se pudo extraer: {error}\n")
        return 1
    json.dump(result, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
