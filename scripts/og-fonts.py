"""Instancias estáticas TTF de las fuentes de marca para next/og (ADR-033, 07-marca.md).

next/og (Satori) solo acepta TTF, OTF o WOFF y no interpreta ejes variables, así que de los WOFF2
variables del repositorio se generan dos instancias fijas, subseteadas a latín:
Sofia Sans Extra Condensed 900 (títulos) y Plus Jakarta Sans 600 (contenido).

Uso: uv run --with fonttools --with brotli scripts/og-fonts.py
"""

from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

FONTS = Path("src/shared/brand/fonts")
OUT = FONTS / "og"
LATIN = "U+0020-007E,U+00A0-00FF,U+0100-017F,U+2010-2027,U+2030-205E,U+20AC,U+2122"

INSTANCES = [
    ("sofia-sans-extra-condensed-latin-wght-normal.woff2", 900, "sofia-sans-extra-condensed-900.ttf"),
    ("plus-jakarta-sans-latin-wght-normal.woff2", 600, "plus-jakarta-sans-600.ttf"),
]


def build(source: str, weight: int, target: str) -> None:
    font = TTFont(FONTS / source)
    font.flavor = None  # WOFF2 → TTF
    instance = instancer.instantiateVariableFont(font, {"wght": weight}, inplace=False)
    options = subset.Options()
    options.unicodes = subset.parse_unicodes(LATIN)
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.notdef_outline = True
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=options.unicodes)
    subsetter.subset(instance)
    OUT.mkdir(parents=True, exist_ok=True)
    instance.save(OUT / target)
    print(f"{target}: {(OUT / target).stat().st_size // 1024} KB")


if __name__ == "__main__":
    for source, weight, target in INSTANCES:
        build(source, weight, target)
