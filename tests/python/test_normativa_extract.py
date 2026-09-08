r"""Pruebas de PDFs sintéticos; nunca leen documentos ni datos de miembros reales.

uv run --python 3.12 --with-requirements scripts/requirements-normativa.txt \
    python -m unittest discover -s tests/python -p 'test_*.py'
"""

import hashlib
import importlib.util
import io
import tempfile
import unittest
from pathlib import Path

import pdfplumber
from PIL import Image
from pypdf import PdfReader
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from reportlab.platypus import Table, TableStyle

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "normativa-extract.py"
SPEC = importlib.util.spec_from_file_location("normativa_extract", SCRIPT)
extractor = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(extractor)


class ExtractorTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.pdf = self.directory / "documento-sintetico.pdf"
        self.canvas = canvas.Canvas(str(self.pdf), pagesize=(612, 792))

    def line(self, text, top, font="Helvetica", x=72):
        self.canvas.setFont(font, 12)
        self.canvas.drawString(x, 792 - top - 12, text)

    def finish(self, **options):
        self.canvas.save()
        return extractor.extract("ESTATUTOS", self.pdf, **options)

    def test_index_references_wrapped_titles_and_cross_page_lists(self):
        self.line("DOCUMENTO SINTÉTICO", 60, "Helvetica-Bold")
        self.line("Introducción con una disposición vigente.", 90)
        self.line("CONTENIDO", 120, "Helvetica-Bold")
        self.line("CAPÍTULO PRIMERO: TÍTULO ANTIGUO ........... 2", 150)
        self.line("Artículo 1: título antiguo ..................... 2", 180)
        self.line("Artículo 2: segunda entrada .................. 3", 210)
        self.canvas.showPage()
        self.line("CONVENCIONES", 60, "Helvetica-Bold")
        self.line("EX: Ejemplo sintético", 90)
        self.line("CAPÍTULO PRIMERO: DE LA", 120, "Helvetica-Bold")
        self.line("ESTRUCTURA SINTÉTICA", 134, "Helvetica-Bold")
        self.line("Artículo 1: de un título en minúsculas", 170, "Helvetica-BoldOblique")
        self.line("que continúa en la línea siguiente.", 184, "Helvetica-BoldOblique")
        self.line("Una referencia permanece en su párrafo:", 220)
        self.line("Artículo 7 de este documento.", 234)
        self.line("1. Primer numeral con continuación", 265)
        self.line("en una segunda línea.", 279)
        self.line("2. Segundo numeral.", 295)
        self.line("PARÁGRAFO 1: regla que sigue", 325)
        self.line("2", 755)
        self.canvas.showPage()
        self.line("en otra página sin alterarse.", 60)
        self.line("Artículo 2: de la segunda unidad.", 100, "Helvetica-Bold")
        self.line("Texto final íntegro.", 135)
        result = self.finish()
        self.assertEqual([u["key"] for u in result["units"]], ["introduccion", "convenciones", "art-1", "art-2"])
        article = result["units"][2]
        self.assertEqual(article["chapterKey"], "cap-1")
        self.assertEqual(article["chapterTitle"], "CAPÍTULO PRIMERO: DE LA ESTRUCTURA SINTÉTICA")
        self.assertEqual(article["title"], "de un título en minúsculas que continúa en la línea siguiente.")
        self.assertEqual(article["pages"], [2, 3])
        self.assertEqual([b["text"] for b in article["blocks"]], [
            "Una referencia permanece en su párrafo: Artículo 7 de este documento.",
            "1. Primer numeral con continuación en una segunda línea.",
            "2. Segundo numeral.",
            "PARÁGRAFO 1: regla que sigue en otra página sin alterarse.",
        ])
        self.assertEqual(result["sha256"], hashlib.sha256(self.pdf.read_bytes()).hexdigest())
        self.assertEqual(result["format"], "oe-normativa/2")
        self.assertNotIn("body", article)
        self.assertNotIn("antiguo", str(result["units"]))

    def test_table_preserves_cells_without_duplicating_flat_text(self):
        self.line("Artículo 1: de los recursos.", 60, "Helvetica-BoldOblique")
        self.line("Los recursos siguen esta tabla:", 100)
        table = Table([["Recurso", "Tiempo"], ["Ejemplo A", "Tres horas"], ["Ejemplo B", "Seis horas"]], colWidths=[150, 150], rowHeights=22)
        table.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), .5, "black")]))
        table.wrapOn(self.canvas, 300, 100)
        table.drawOn(self.canvas, 72, 580)
        self.line("PARÁGRAFO 1: condición posterior.", 250)
        result = self.finish()
        blocks = result["units"][0]["blocks"]
        self.assertEqual([b["type"] for b in blocks], ["text", "table", "text"])
        self.assertEqual(blocks[1], {"type": "table", "headers": ["Recurso", "Tiempo"], "rows": [["Ejemplo A", "Tres horas"], ["Ejemplo B", "Seis horas"]]})

    def test_closing_columns_and_annex_are_sections_without_article_numbers(self):
        self.line("Artículo 1: disposición final.", 60, "Helvetica-Bold")
        self.line("Contenido de la disposición.", 100)
        self.line("Firmante Alfa", 170, "Helvetica-Bold", 72)
        self.line("Firmante Beta", 170, "Helvetica-Bold", 320)
        self.line("Cargo Alfa", 200, x=72)
        self.line("Cargo Beta", 200, x=320)
        self.line("Fecha de la última reforma: fecha sintética.", 250)
        self.canvas.showPage()
        self.line("ANEXO 1: MATERIAL COMPLEMENTARIO", 60, "Helvetica-Bold")
        self.line("a. Primera categoría.", 100)
        self.line("b. Segunda categoría.", 125)
        self.line("b. Letra repetida en el original.", 150)
        self.line("Parágrafo 1. Excusa y plazo.", 190)
        result = self.finish(profile={"closing": {"page": 1, "top": 160, "columnsBottom": 230, "columnBreaks": [300]}})
        self.assertEqual([u["key"] for u in result["units"]], ["art-1", "cierre", "anexo-1"])
        closing, annex = result["units"][1:]
        self.assertEqual(closing["blocks"][0]["text"], "Firmante Alfa\nCargo Alfa")
        self.assertEqual(closing["blocks"][1]["text"], "Firmante Beta\nCargo Beta")
        self.assertTrue(all(u["number"] is None and u["unitType"] == "SECTION" for u in [closing, annex]))
        self.assertTrue(all(u["chapterKey"] == u["key"] and u["chapterTitle"] == "" for u in [closing, annex]))
        self.assertEqual(annex["title"], "ANEXO 1: MATERIAL COMPLEMENTARIO")
        self.assertIn("b. Letra repetida en el original.", str(annex))
        self.assertNotIn("Firmante", str(result["units"][0]))

    def test_image_exports_original_object_and_keeps_reading_order(self):
        self.line("Artículo 1: del gráfico.", 60, "Helvetica-Bold")
        source = Image.new("RGB", (13, 7), (17, 80, 120))
        self.canvas.drawImage(ImageReader(source), 72, 570, width=130, height=70)
        self.line("Texto posterior al gráfico.", 260)
        self.canvas.save()
        with pdfplumber.open(self.pdf) as pdf:
            image = pdf.pages[0].images[0]
            bbox = [image[k] for k in ("x0", "top", "x1", "bottom")]
        profile = {"images": [{"page": 1, "bbox": bbox, "assetId": "grafico", "alt": "Rectángulo sintético de color uniforme."}]}
        result = extractor.extract("ESTATUTOS", self.pdf, profile=profile, assets_dir=self.directory / "medios")
        original = PdfReader(self.pdf).pages[0].images[0]
        extracted = self.directory / "medios" / f"grafico{Path(original.name).suffix}"
        self.assertEqual(extracted.read_bytes(), original.data)
        self.assertEqual(Image.open(io.BytesIO(extracted.read_bytes())).tobytes(), source.tobytes())
        self.assertEqual([b["type"] for b in result["units"][0]["blocks"]], ["image", "text"])
        self.assertEqual(result["units"][0]["blocks"][0]["assetId"], "grafico")
        with self.assertRaisesRegex(ValueError, "assets-dir"):
            extractor.extract("ESTATUTOS", self.pdf, profile=profile)

    def test_repeated_headers_do_not_remove_identical_body_text_or_bare_numbers(self):
        for number in range(1, 4):
            self.line("Etiqueta repetida", 12)
            self.line(f"Artículo {number}: unidad de prueba.", 60, "Helvetica-Bold")
            self.line("Etiqueta repetida", 100)
            self.line("17", 125)
            self.line(str(number), 755)
            if number < 3:
                self.canvas.showPage()
        result = self.finish()
        self.assertEqual(len(result["units"]), 3)
        self.assertEqual([b["text"] for b in result["units"][0]["blocks"]], ["Etiqueta repetida", "17"])

    def test_duplicate_article_is_rejected_without_inventing_anchor(self):
        self.line("Artículo 1: primero.", 60, "Helvetica-Bold")
        self.line("Contenido.", 90)
        self.line("Artículo 1: duplicado.", 120, "Helvetica-Bold")
        self.line("Otro contenido.", 150)
        with self.assertRaisesRegex(ValueError, "Unidad repetida: art-1"):
            self.finish()

    def test_number_gap_is_rejected_without_repair(self):
        self.line("Artículo 1: primero.", 60, "Helvetica-Bold")
        self.line("Contenido.", 90)
        self.line("Artículo 3: tercero.", 120, "Helvetica-Bold")
        self.line("Otro contenido.", 150)
        with self.assertRaisesRegex(ValueError, "Salto de numeración"):
            self.finish()

    def test_ambiguous_index_requires_reviewed_body_start(self):
        self.line("Introducción sintética.", 60)
        self.line("CONTENIDO", 100, "Helvetica-Bold")
        self.line("Artículo 1: título de índice ........ 2", 130)
        self.canvas.showPage()
        self.line("Artículo 1: disposición.", 60, "Helvetica-Bold")
        self.line("Contenido real de la unidad sintética.", 100)
        self.canvas.save()
        with self.assertRaisesRegex(ValueError, "bodyStartPage"):
            extractor.extract("ESTATUTOS", self.pdf)
        result = extractor.extract("ESTATUTOS", self.pdf, profile={"bodyStartPage": 2})
        self.assertEqual([u["key"] for u in result["units"]], ["introduccion", "art-1"])

    def test_invalid_profile_page_and_missing_body_are_rejected(self):
        self.line("Documento sin artículos.", 60)
        self.canvas.save()
        with self.assertRaisesRegex(ValueError, "fuera del PDF"):
            extractor.extract("ESTATUTOS", self.pdf, profile={"bodyStartPage": 3})
        with self.assertRaisesRegex(ValueError, "ningún artículo"):
            extractor.extract("ESTATUTOS", self.pdf)

    def test_ordinal_numeric_and_roman_chapters(self):
        for ordinal, expected in [("DÉCIMO", 10), ("DECIMOPRIMERO", 11), ("DECIMOSEGUNDO", 12), ("VII", 7), ("14", 14)]:
            self.assertEqual(extractor.chapter_number(ordinal), expected)
        with self.assertRaisesRegex(ValueError, "desconocido"):
            extractor.chapter_number("INDETERMINADO")

    def test_profile_hash_must_match_the_reviewed_pdf(self):
        self.line("Artículo 1: prueba de integridad.", 60, "Helvetica-Bold")
        self.line("Texto sintético.", 100)
        self.canvas.save()
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            extractor.extract("ESTATUTOS", self.pdf, profile={"sha256": "0" * 64})
        digest = hashlib.sha256(self.pdf.read_bytes()).hexdigest()
        self.assertEqual(extractor.extract("ESTATUTOS", self.pdf, profile={"sha256": digest})["sha256"], digest)


if __name__ == "__main__":
    unittest.main()
